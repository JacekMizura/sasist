"""
Location stock projection — reads ``Inventory`` (+ reservations / active picks).

Long-term SSOT: ``warehouse_inventory_movements`` ledger; ``Inventory`` is operational cache.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.pick import Pick
from ..models.product import Product
from ..models.stock_reservation import StockReservation
from ..schemas.commerce_enums import OPERATIONAL_ZONE_TYPES
from .location_priority_service import suggest_sales_locations


def resolve_product_id(
    db: Session,
    *,
    tenant_id: int,
    product_id: int | None = None,
    ean: str | None = None,
    sku: str | None = None,
) -> int | None:
    if product_id is not None and int(product_id) > 0:
        row = (
            db.query(Product.id)
            .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id))
            .first()
        )
        return int(row[0]) if row else None
    if ean and str(ean).strip():
        needle = str(ean).strip().lower()
        row = (
            db.query(Product.id)
            .filter(
                Product.tenant_id == int(tenant_id),
                Product.ean.isnot(None),
                func.lower(func.trim(Product.ean)) == needle,
            )
            .first()
        )
        return int(row[0]) if row else None
    if sku and str(sku).strip():
        needle = str(sku).strip().lower()
        row = (
            db.query(Product.id)
            .filter(
                Product.tenant_id == int(tenant_id),
                or_(
                    func.lower(func.trim(Product.sku)) == needle,
                    func.lower(func.trim(Product.symbol)) == needle,
                ),
            )
            .first()
        )
        return int(row[0]) if row else None
    return None


def build_location_stock(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    operational_zone_type: str | None = None,
    available_only: bool = False,
) -> dict:
    pid = int(product_id)
    wid = int(warehouse_id)
    tid = int(tenant_id)

    inv_rows = (
        db.query(
            Inventory.location_id,
            func.sum(Inventory.quantity).label("qty"),
        )
        .filter(
            Inventory.tenant_id == tid,
            Inventory.warehouse_id == wid,
            Inventory.product_id == pid,
            Inventory.stock_disposition == "SALEABLE",
            Inventory.quantity > 0,
        )
        .group_by(Inventory.location_id)
        .all()
    )

    loc_ids = [int(r[0]) for r in inv_rows if r[0] is not None]
    loc_map: dict[int, Location] = {}
    if loc_ids:
        locs = db.query(Location).filter(Location.id.in_(loc_ids)).all()
        loc_map = {int(l.id): l for l in locs}

    zone_filter = (operational_zone_type or "").strip().upper() or None
    if zone_filter and zone_filter not in OPERATIONAL_ZONE_TYPES:
        zone_filter = None

    reserved_by_loc: dict[int, float] = defaultdict(float)
    res_rows = (
        db.query(StockReservation.location_id, func.sum(StockReservation.quantity))
        .filter(
            StockReservation.tenant_id == tid,
            StockReservation.product_id == pid,
            StockReservation.status == "reserved",
        )
        .group_by(StockReservation.location_id)
        .all()
    )
    for lid, qty in res_rows:
        if lid is not None:
            reserved_by_loc[int(lid)] = float(qty or 0)

    picking_by_loc: dict[int, float] = defaultdict(float)
    pick_rows = (
        db.query(Pick.location_id, func.sum(Pick.quantity))
        .filter(
            Pick.tenant_id == tid,
            Pick.warehouse_id == wid,
            Pick.product_id == pid,
            Pick.picked_at.is_(None),
            Pick.status.in_(("picking", "open", "assigned")),
        )
        .group_by(Pick.location_id)
        .all()
    )
    for lid, qty in pick_rows:
        if lid is not None:
            picking_by_loc[int(lid)] = float(qty or 0)

    locations_out: list[dict] = []
    total_available = 0.0
    total_reserved = 0.0
    total_picking = 0.0

    for lid, qty_raw in inv_rows:
        lid_i = int(lid)
        loc = loc_map.get(lid_i)
        if loc is None:
            continue
        zone = (getattr(loc, "operational_zone_type", None) or "").strip().upper() or None
        if zone_filter and zone != zone_filter:
            continue
        on_hand = float(qty_raw or 0)
        reserved = float(reserved_by_loc.get(lid_i, 0.0))
        picking = float(picking_by_loc.get(lid_i, 0.0))
        available = max(0.0, on_hand - reserved - picking)
        if available_only and available <= 1e-9:
            continue
        total_available += available
        total_reserved += reserved
        total_picking += picking
        locations_out.append(
            {
                "location_id": lid_i,
                "code": str(loc.name or f"#{lid_i}"),
                "type": str(getattr(loc, "location_type", None) or "NORMAL"),
                "operational_zone_type": zone,
                "sales_priority": int(getattr(loc, "sales_priority", None) or 100),
                "picking_priority": int(getattr(loc, "picking_priority", None) or 100),
                "available": round(available, 6),
                "on_hand": round(on_hand, 6),
                "reserved": round(reserved, 6),
                "picking": round(picking, 6),
            }
        )

    locations_out.sort(
        key=lambda r: (
            r.get("operational_zone_type") or "ZZZ",
            int(r.get("sales_priority") or 100),
            str(r.get("code") or ""),
        )
    )

    return {
        "product_id": pid,
        "warehouse_id": wid,
        "summary": {
            "available": round(total_available, 6),
            "reserved": round(total_reserved, 6),
            "picking": round(total_picking, 6),
        },
        "locations": locations_out,
    }


def suggest_issue_locations_for_sales(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: float,
) -> list[dict]:
    snap = build_location_stock(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        available_only=True,
    )
    return suggest_sales_locations(list(snap.get("locations") or []), quantity=float(quantity))
