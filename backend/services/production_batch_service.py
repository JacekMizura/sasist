"""Production batches — wave execution with aggregated component demand."""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.app_user import AppUser
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.product_composition import ProductionBatch, ProductionBatchLine, ProductComposition
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.warehouse import Warehouse
from ..schemas.production import ComponentAllocationWrite, StockShortageRead
from ..schemas.production_batch import (
    BatchAggregatedPickLineRead,
    ProductionBatchCompleteBody,
    ProductionBatchCompleteResultRead,
    ProductionBatchCreateBody,
    ProductionBatchLineRead,
    ProductionBatchPickPlanRead,
    ProductionBatchRead,
)
from .composition_engine_service import (
    aggregate_component_demand,
    aggregated_demand_with_availability,
    calculate_required_components,
    resolve_composition_entity,
)
from .document_number_service import assign_series_number_to_stock_document, require_warehouse_series
from .inventory_carrier_ops import upsert_dock_inventory_for_loose_receipt
from .inventory_lot_keys import NO_EXPIRY_SENTINEL
from .location_priority_service import suggest_picking_locations
from .location_stock_service import build_location_stock
from .order_item_pick_allocation_service import consume_inventory_fifo_slices
from .product_cost_service import get_product_current_cost
from .production_order_service import _auto_allocate_locations
from .stock_disposition import STOCK_DISPOSITION_SALEABLE
from .stock_operation_issue_service import append_issue_operation
from .stock_operation_receipt_service import append_receipt_operation

logger = logging.getLogger(__name__)

TERMINAL = frozenset({"completed", "cancelled"})


class ProductionBatchError(Exception):
    def __init__(self, message: str, *, code: str = "batch_error", shortages: list | None = None) -> None:
        self.message = message
        self.code = code
        self.shortages = shortages or []
        super().__init__(message)


def _next_batch_number(db: Session, *, tenant_id: int) -> str:
    year = datetime.utcnow().year
    prefix = f"BAT/{year}/"
    last = (
        db.query(ProductionBatch.number)
        .filter(ProductionBatch.tenant_id == int(tenant_id), ProductionBatch.number.like(f"{prefix}%"))
        .order_by(ProductionBatch.id.desc())
        .first()
    )
    seq = 1
    if last and last[0]:
        try:
            seq = int(str(last[0]).split("/")[-1]) + 1
        except ValueError:
            seq = 1
    return f"{prefix}{seq:04d}"


def _operator_name(db: Session, user_id: int | None) -> str | None:
    if user_id is None:
        return None
    u = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
    if u is None:
        return None
    parts = [str(getattr(u, "first_name", None) or "").strip(), str(getattr(u, "last_name", None) or "").strip()]
    return " ".join(p for p in parts if p).strip() or None


def _doc_number(db: Session, doc_id: int | None) -> str | None:
    if doc_id is None:
        return None
    row = db.query(StockDocument.document_number).filter(StockDocument.id == int(doc_id)).first()
    return str(row[0]).strip() if row and row[0] else None


def _aggregate_batch_components(batch: ProductionBatch) -> dict[int, float]:
    demands: list[list[dict[str, Any]]] = []
    for bl in batch.lines or []:
        comp = bl.composition
        if comp is None:
            continue
        demands.append(calculate_required_components(comp, planned_quantity=float(bl.planned_quantity)))
    return aggregate_component_demand(demands)


def serialize_batch_line(db: Session, line: ProductionBatchLine) -> ProductionBatchLineRead:
    p = db.query(Product).filter(Product.id == int(line.product_id)).first()
    comp = db.query(ProductComposition).filter(ProductComposition.id == int(line.composition_id)).first()
    loc = (
        db.query(Location).filter(Location.id == int(line.target_location_id)).first()
        if line.target_location_id
        else None
    )
    return ProductionBatchLineRead(
        id=int(line.id),
        product_id=int(line.product_id),
        composition_id=int(line.composition_id),
        planned_quantity=float(line.planned_quantity),
        completed_quantity=float(line.completed_quantity or 0),
        target_location_id=int(line.target_location_id) if line.target_location_id else None,
        target_location_name=(loc.name if loc else None),
        status=str(line.status or "planned"),
        calculated_unit_cost=line.calculated_unit_cost,
        pw_stock_document_id=line.pw_stock_document_id,
        product_name=(p.name if p else None),
        product_sku=((p.sku or p.symbol) if p else None),
        composition_name=(comp.name if comp else None),
        notes=line.notes,
    )


def serialize_batch(db: Session, batch: ProductionBatch) -> ProductionBatchRead:
    wh = db.query(Warehouse).filter(Warehouse.id == int(batch.warehouse_id)).first()
    return ProductionBatchRead(
        id=int(batch.id),
        tenant_id=int(batch.tenant_id),
        number=str(batch.number or ""),
        warehouse_id=int(batch.warehouse_id),
        warehouse_name=(wh.name if wh else None),
        status=str(batch.status or "draft"),  # type: ignore[arg-type]
        notes=batch.notes,
        rw_stock_document_id=batch.rw_stock_document_id,
        rw_document_number=_doc_number(db, batch.rw_stock_document_id),
        operator_name=_operator_name(db, batch.created_by_user_id),
        lines=[serialize_batch_line(db, ln) for ln in batch.lines or []],
        started_at=batch.started_at,
        completed_at=batch.completed_at,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
    )


def create_batch(
    db: Session,
    *,
    tenant_id: int,
    body: ProductionBatchCreateBody,
    created_by_user_id: int | None = None,
) -> ProductionBatchRead:
    if not body.lines:
        raise ProductionBatchError("Dodaj co najmniej jedną linię produktu.", code="empty_batch")
    batch = ProductionBatch(
        tenant_id=int(tenant_id),
        number=_next_batch_number(db, tenant_id=tenant_id),
        warehouse_id=int(body.warehouse_id),
        status=str(body.status or "planned"),
        notes=(body.notes or "").strip() or None,
        created_by_user_id=int(created_by_user_id) if created_by_user_id else None,
    )
    db.add(batch)
    db.flush()
    for ln in body.lines:
        comp = resolve_composition_entity(db, tenant_id=tenant_id, composition_id=int(ln.composition_id))
        if comp is None or str(comp.composition_mode) != "manufacturing":
            raise ProductionBatchError(f"Kompozycja #{ln.composition_id} nie istnieje lub nie jest produkcyjna.", code="invalid_composition")
        if int(comp.product_id) != int(ln.product_id):
            raise ProductionBatchError("Produkt nie zgadza się z kompozycją.", code="product_mismatch")
        batch.lines.append(
            ProductionBatchLine(
                product_id=int(ln.product_id),
                composition_id=int(comp.id),
                planned_quantity=float(ln.planned_quantity),
                target_location_id=int(ln.target_location_id) if ln.target_location_id else None,
                notes=(ln.notes or "").strip() or None,
            )
        )
    db.flush()
    return serialize_batch(db, batch)


def list_batches(
    db: Session,
    *,
    tenant_id: int,
    status: str | None = None,
    warehouse_id: int | None = None,
) -> list[ProductionBatchRead]:
    q = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines).joinedload(ProductionBatchLine.composition))
        .filter(ProductionBatch.tenant_id == int(tenant_id))
    )
    if status:
        q = q.filter(ProductionBatch.status == str(status).strip().lower())
    if warehouse_id:
        q = q.filter(ProductionBatch.warehouse_id == int(warehouse_id))
    rows = q.order_by(ProductionBatch.created_at.desc()).all()
    return [serialize_batch(db, b) for b in rows]


def get_batch(db: Session, *, tenant_id: int, batch_id: int) -> ProductionBatchRead | None:
    batch = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines).joinedload(ProductionBatchLine.composition))
        .filter(ProductionBatch.id == int(batch_id), ProductionBatch.tenant_id == int(tenant_id))
        .first()
    )
    if batch is None:
        return None
    return serialize_batch(db, batch)


def start_batch(db: Session, *, tenant_id: int, batch_id: int) -> ProductionBatchRead:
    batch = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines).joinedload(ProductionBatchLine.composition))
        .filter(ProductionBatch.id == int(batch_id), ProductionBatch.tenant_id == int(tenant_id))
        .first()
    )
    if batch is None:
        raise ProductionBatchError("Partia nie istnieje.", code="not_found")
    if str(batch.status) in TERMINAL:
        raise ProductionBatchError("Partia jest zamknięta.", code="terminal_status")
    if str(batch.status) == "in_progress":
        return serialize_batch(db, batch)
    plan = build_batch_pick_plan(db, tenant_id=tenant_id, batch_id=batch_id)
    if plan.has_shortages:
        raise ProductionBatchError(
            "Niewystarczający stan magazynowy składników.",
            code="insufficient_stock",
            shortages=[s.model_dump() for s in plan.shortages],
        )
    batch.status = "in_progress"
    batch.started_at = datetime.utcnow()
    batch.updated_at = datetime.utcnow()
    db.flush()
    return serialize_batch(db, batch)


def cancel_batch(db: Session, *, tenant_id: int, batch_id: int) -> ProductionBatchRead:
    batch = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines))
        .filter(ProductionBatch.id == int(batch_id), ProductionBatch.tenant_id == int(tenant_id))
        .first()
    )
    if batch is None:
        raise ProductionBatchError("Partia nie istnieje.", code="not_found")
    if str(batch.status) == "completed":
        raise ProductionBatchError("Nie można anulować ukończonej partii.", code="completed")
    batch.status = "cancelled"
    batch.updated_at = datetime.utcnow()
    db.flush()
    return serialize_batch(db, batch)


def build_batch_pick_plan(db: Session, *, tenant_id: int, batch_id: int) -> ProductionBatchPickPlanRead:
    batch = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines).joinedload(ProductionBatchLine.composition))
        .filter(ProductionBatch.id == int(batch_id), ProductionBatch.tenant_id == int(tenant_id))
        .first()
    )
    if batch is None:
        raise ProductionBatchError("Partia nie istnieje.", code="not_found")

    totals = _aggregate_batch_components(batch)
    agg_rows = aggregated_demand_with_availability(
        db,
        tenant_id=int(batch.tenant_id),
        warehouse_id=int(batch.warehouse_id),
        component_totals=totals,
    )
    shortages = [
        StockShortageRead(
            component_product_id=r.component_product_id,
            product_name=r.product_name,
            required=r.required,
            available=r.available,
            missing=r.missing,
        )
        for r in agg_rows
        if r.missing > 1e-6
    ]

    pick_lines: list[BatchAggregatedPickLineRead] = []
    from ..schemas.production import ProductionAllocationRead, ProductionLocationSuggestionRead

    for row in agg_rows:
        pid = int(row.component_product_id)
        req = float(row.required)
        snap_stock = build_location_stock(
            db,
            tenant_id=int(batch.tenant_id),
            warehouse_id=int(batch.warehouse_id),
            product_id=pid,
            available_only=True,
        )
        loc_rows = list(snap_stock.get("locations") or [])
        suggested = suggest_picking_locations(loc_rows, quantity=req)
        try:
            auto_pairs = _auto_allocate_locations(
                db,
                tenant_id=int(batch.tenant_id),
                warehouse_id=int(batch.warehouse_id),
                product_id=pid,
                quantity=req,
            )
        except Exception:
            auto_pairs = []
        auto_by_loc: dict[int, float] = {}
        for lid, qty in auto_pairs:
            auto_by_loc[int(lid)] = auto_by_loc.get(int(lid), 0.0) + float(qty)
        loc_ids = {int(lid) for lid, _ in auto_pairs}
        codes = {
            int(l.id): str(l.name or f"#{l.id}")
            for l in db.query(Location).filter(Location.id.in_(loc_ids)).all()
        } if loc_ids else {}
        suggested_reads = [
            ProductionLocationSuggestionRead(
                location_id=int(s.get("location_id") or 0),
                code=str(s.get("code") or ""),
                available=round(float(s.get("available") or 0), 4),
                operational_zone_type=s.get("operational_zone_type"),
                auto_pick_qty=round(float(auto_by_loc.get(int(s.get("location_id") or 0), 0)), 4),
                is_suggested=True,
            )
            for s in loc_rows[:15]
        ]
        auto_reads = [
            ProductionAllocationRead(
                location_id=int(lid),
                location_code=codes.get(int(lid), f"#{lid}"),
                quantity=round(float(qty), 4),
            )
            for lid, qty in auto_pairs
        ]
        pick_lines.append(
            BatchAggregatedPickLineRead(
                component_product_id=pid,
                product_name=row.product_name,
                product_sku=row.product_sku,
                required=row.required,
                available=row.available,
                missing=row.missing,
                suggested_locations=suggested_reads,
                auto_allocation=auto_reads,
            )
        )

    return ProductionBatchPickPlanRead(
        batch_id=int(batch.id),
        warehouse_id=int(batch.warehouse_id),
        shortages=shortages,
        has_shortages=bool(shortages),
        aggregated_components=pick_lines,
        product_lines=[serialize_batch_line(db, ln) for ln in batch.lines or []],
    )


def _resolve_batch_allocations(
    db: Session,
    batch: ProductionBatch,
    *,
    totals: dict[int, float],
    component_allocations: list[ComponentAllocationWrite] | None,
) -> dict[int, list[tuple[int, float]]]:
    """component_product_id -> [(location_id, qty)]."""
    if component_allocations:
        by_comp: dict[int, list[tuple[int, float]]] = {}
        for alloc in component_allocations:
            by_comp.setdefault(int(alloc.line_snapshot_id), []).append((int(alloc.location_id), float(alloc.quantity)))
        # line_snapshot_id reused as component_product_id for batch API
        for pid, req in totals.items():
            total = sum(q for _, q in by_comp.get(int(pid), []))
            if abs(total - req) > 1e-2:
                raise ProductionBatchError(
                    f"Alokacja składnika #{pid} ({total}) ≠ wymagane ({req}).",
                    code="allocation_mismatch",
                )
        return by_comp
    out: dict[int, list[tuple[int, float]]] = {}
    for pid, req in totals.items():
        out[int(pid)] = _auto_allocate_locations(
            db,
            tenant_id=int(batch.tenant_id),
            warehouse_id=int(batch.warehouse_id),
            product_id=int(pid),
            quantity=float(req),
        )
    return out


def complete_batch(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    body: ProductionBatchCompleteBody,
    performed_by_user_id: int | None = None,
) -> ProductionBatchCompleteResultRead:
    batch = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines).joinedload(ProductionBatchLine.composition))
        .filter(ProductionBatch.id == int(batch_id), ProductionBatch.tenant_id == int(tenant_id))
        .first()
    )
    if batch is None:
        raise ProductionBatchError("Partia nie istnieje.", code="not_found")
    if str(batch.status) == "completed":
        return ProductionBatchCompleteResultRead(
            batch=serialize_batch(db, batch),
            rw_stock_document_id=batch.rw_stock_document_id,
            rw_document_number=_doc_number(db, batch.rw_stock_document_id),
        )
    if str(batch.status) == "cancelled":
        raise ProductionBatchError("Partia anulowana.", code="cancelled")

    plan = build_batch_pick_plan(db, tenant_id=tenant_id, batch_id=batch_id)
    if plan.has_shortages:
        raise ProductionBatchError(
            "Niewystarczający stan magazynowy.",
            code="insufficient_stock",
            shortages=[s.model_dump() for s in plan.shortages],
        )

    totals = _aggregate_batch_components(batch)
    alloc_map = _resolve_batch_allocations(db, batch, totals=totals, component_allocations=body.component_allocations)

    try:
        series = require_warehouse_series(db, tenant_id=int(batch.tenant_id), warehouse_id=int(batch.warehouse_id), subtype="RW")
    except Exception:
        series = None
    rw_doc = StockDocument(
        tenant_id=int(batch.tenant_id),
        warehouse_id=int(batch.warehouse_id),
        document_type="RW",
        creation_source="PRODUCTION",
        production_batch_id=int(batch.id),
        status="completed",
        receiving_status="DONE",
        putaway_status="DONE",
        relocation_status="DONE",
        created_by_user_id=performed_by_user_id,
    )
    db.add(rw_doc)
    db.flush()
    if series is not None:
        wh = db.query(Warehouse).filter(Warehouse.id == int(batch.warehouse_id)).first()
        assign_series_number_to_stock_document(db, rw_doc, series, warehouse_code=str(getattr(wh, "code", None) or "") or None)

    total_component_cost = 0.0
    for pid, allocs in alloc_map.items():
        if not allocs:
            continue
        qty_sum = sum(q for _, q in allocs)
        line = StockDocumentItem(
            document_id=int(rw_doc.id),
            product_id=int(pid),
            ordered_quantity=qty_sum,
            received_quantity=qty_sum,
            quantity=qty_sum,
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
        db.add(line)
        db.flush()
        unit_net = float(get_product_current_cost(db, int(batch.tenant_id), int(pid)).get("purchase_net") or 0)
        line.purchase_price_net = unit_net
        for loc_id, qty in allocs:
            slices = consume_inventory_fifo_slices(
                db,
                tenant_id=int(batch.tenant_id),
                warehouse_id=int(batch.warehouse_id),
                product_id=int(pid),
                location_id=int(loc_id),
                quantity=float(qty),
            )
            for sl in slices:
                append_issue_operation(
                    db,
                    rw_doc,
                    line,
                    float(sl.quantity),
                    from_location_id=int(loc_id),
                    batch_number=sl.batch_number or "",
                    expiry_date=sl.expiry_date if sl.expiry_date < NO_EXPIRY_SENTINEL else None,
                    operator_admin_id=performed_by_user_id,
                    metadata={"production_batch_id": int(batch.id), "source_document_type": "RW"},
                )
        total_component_cost += unit_net * float(qty_sum)

    line_cost_pool = total_component_cost
    total_planned = sum(float(bl.planned_quantity) for bl in batch.lines or []) or 1.0

    for bl in batch.lines or []:
        if bl.composition is None:
            continue
        produced = float(bl.planned_quantity)
        target_loc = int(bl.target_location_id or 0)
        if target_loc < 1:
            raise ProductionBatchError(
                f"Brak lokalizacji docelowej dla {bl.product_id}.",
                code="location_required",
            )
        line_share = produced / total_planned
        line_comp_cost = total_component_cost * line_share
        unit_cost = line_comp_cost / produced if produced > 1e-9 else 0.0

        try:
            pw_series = require_warehouse_series(db, tenant_id=int(batch.tenant_id), warehouse_id=int(batch.warehouse_id), subtype="PW")
        except Exception:
            pw_series = None
        pw_doc = StockDocument(
            tenant_id=int(batch.tenant_id),
            warehouse_id=int(batch.warehouse_id),
            location_id=target_loc,
            document_type="PW",
            creation_source="PRODUCTION",
            production_batch_id=int(batch.id),
            production_batch_line_id=int(bl.id),
            status="completed",
            receiving_status="DONE",
            putaway_status="DONE",
            relocation_status="DONE",
            created_by_user_id=performed_by_user_id,
        )
        db.add(pw_doc)
        db.flush()
        if pw_series is not None:
            wh = db.query(Warehouse).filter(Warehouse.id == int(batch.warehouse_id)).first()
            assign_series_number_to_stock_document(db, pw_doc, pw_series, warehouse_code=str(getattr(wh, "code", None) or "") or None)

        fg_line = StockDocumentItem(
            document_id=int(pw_doc.id),
            product_id=int(bl.product_id),
            ordered_quantity=produced,
            received_quantity=produced,
            quantity=produced,
            purchase_price_net=unit_cost,
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
        db.add(fg_line)
        db.flush()
        upsert_dock_inventory_for_loose_receipt(
            db,
            tenant_id=int(batch.tenant_id),
            warehouse_id=int(batch.warehouse_id),
            location_id=target_loc,
            product_id=int(bl.product_id),
            add_qty=float(produced),
            batch_number="",
            expiry_date=NO_EXPIRY_SENTINEL,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
        append_receipt_operation(db, pw_doc, fg_line, float(produced))
        bl.completed_quantity = produced
        bl.calculated_unit_cost = round(unit_cost, 4)
        bl.pw_stock_document_id = int(pw_doc.id)
        bl.status = "completed"
        prod = db.query(Product).filter(Product.id == int(bl.product_id)).first()
        if prod is not None and unit_cost > 0:
            prod.purchase_price = float(unit_cost)

    batch.rw_stock_document_id = int(rw_doc.id)
    batch.status = "completed"
    batch.completed_at = datetime.utcnow()
    batch.updated_at = datetime.utcnow()
    db.flush()

    return ProductionBatchCompleteResultRead(
        batch=serialize_batch(db, batch),
        rw_stock_document_id=int(rw_doc.id),
        rw_document_number=str(getattr(rw_doc, "document_number", None) or "").strip() or None,
        component_total_cost=round(total_component_cost, 4),
    )
