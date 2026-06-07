"""Production pick plan — location suggestions, auto-allocation, shortages."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from ..models.location import Location
from ..models.production import ProductionOrder
from ..schemas.production import (
    ProductionAllocationRead,
    ProductionLocationSuggestionRead,
    ProductionPickLinePlanRead,
    ProductionPickPlanRead,
    StockShortageRead,
)
from .location_priority_service import suggest_picking_locations
from .location_stock_service import build_location_stock
from .production_order_service import (
    ProductionOrderError,
    _auto_allocate_locations,
    validate_stock_shortages,
)


def _location_codes(db: Session, loc_ids: set[int]) -> dict[int, str]:
    if not loc_ids:
        return {}
    rows = db.query(Location).filter(Location.id.in_(loc_ids)).all()
    return {int(l.id): str(l.name or f"#{l.id}") for l in rows}


def build_production_pick_plan(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
) -> ProductionPickPlanRead:
    order = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id))
        .first()
    )
    if order is None:
        raise ProductionOrderError("Zlecenie produkcyjne nie istnieje.", code="not_found")

    shortages = validate_stock_shortages(db, order)
    lines_out: list[ProductionPickLinePlanRead] = []
    all_loc_ids: set[int] = set()
    line_auto_pairs: list[tuple] = []

    for snap in order.line_snapshots or []:
        req = float(snap.total_required_quantity or 0)
        if req <= 1e-9:
            continue
        pid = int(snap.component_product_id)
        snap_stock = build_location_stock(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            product_id=pid,
            available_only=True,
        )
        loc_rows = list(snap_stock.get("locations") or [])
        suggested = suggest_picking_locations(loc_rows, quantity=req)

        try:
            auto_pairs = _auto_allocate_locations(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                product_id=pid,
                quantity=req,
            )
        except ProductionOrderError:
            auto_pairs = []

        for lid, _ in auto_pairs:
            all_loc_ids.add(int(lid))
        for s in suggested:
            all_loc_ids.add(int(s.get("location_id") or 0))
        for s in loc_rows:
            all_loc_ids.add(int(s.get("location_id") or 0))

        line_auto_pairs.append((snap, auto_pairs, loc_rows, suggested, snap_stock))

    codes = _location_codes(db, all_loc_ids)

    for snap, auto_pairs, loc_rows, suggested, snap_stock in line_auto_pairs:
        pid = int(snap.component_product_id)
        req = float(snap.total_required_quantity or 0)
        auto_by_loc: dict[int, float] = {}
        for lid, qty in auto_pairs:
            auto_by_loc[int(lid)] = auto_by_loc.get(int(lid), 0.0) + float(qty)

        suggested_reads: list[ProductionLocationSuggestionRead] = []
        for s in loc_rows:
            lid = int(s.get("location_id") or 0)
            if lid < 1:
                continue
            suggested_reads.append(
                ProductionLocationSuggestionRead(
                    location_id=lid,
                    code=str(s.get("code") or codes.get(lid, f"#{lid}")),
                    available=round(float(s.get("available") or 0), 4),
                    operational_zone_type=s.get("operational_zone_type"),
                    auto_pick_qty=round(float(auto_by_loc.get(lid, 0)), 4),
                    is_suggested=any(int(x.get("location_id") or 0) == lid for x in suggested),
                )
            )
        suggested_reads.sort(
            key=lambda r: (
                0 if r.is_suggested else 1,
                -float(r.auto_pick_qty or 0),
                str(r.code),
            )
        )

        auto_reads = [
            ProductionAllocationRead(
                location_id=int(lid),
                location_code=codes.get(int(lid), f"#{lid}"),
                quantity=round(float(qty), 4),
            )
            for lid, qty in auto_pairs
        ]

        avail = float(snap_stock.get("summary", {}).get("available") or 0)
        missing = max(0.0, req - avail)
        lines_out.append(
            ProductionPickLinePlanRead(
                line_snapshot_id=int(snap.id),
                component_product_id=pid,
                product_name=str(snap.product_name_snapshot or ""),
                product_sku=snap.product_sku_snapshot,
                required=round(req, 4),
                available=round(avail, 4),
                missing=round(missing, 4),
                suggested_locations=suggested_reads,
                auto_allocation=auto_reads,
            )
        )

    return ProductionPickPlanRead(
        order_id=int(order.id),
        warehouse_id=int(order.warehouse_id),
        shortages=shortages,
        lines=lines_out,
        has_shortages=bool(shortages),
    )


def search_warehouse_locations(
    db: Session,
    *,
    warehouse_id: int,
    query: str,
    limit: int = 20,
) -> list[dict]:
    q = (query or "").strip()
    lim = max(1, min(int(limit or 20), 50))
    base = db.query(Location).filter(Location.warehouse_id == int(warehouse_id))
    if q:
        needle = f"%{q}%"
        base = base.filter(Location.name.ilike(needle))
    rows = base.order_by(Location.name.asc()).limit(lim).all()
    return [
        {
            "id": int(l.id),
            "code": str(l.name or f"#{l.id}"),
            "operational_zone_type": getattr(l, "operational_zone_type", None),
        }
        for l in rows
    ]
