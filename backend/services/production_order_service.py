"""Production orders — create, start, complete, cancel; stock + RW/PW documents."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..db.schema_introspection import get_table_column_names, has_table
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.product_composition import ProductComposition, ProductionBatch, ProductionBatchLine
from ..models.production import ProductionOrder, ProductionOrderLineSnapshot, ProductionRecipe
from ..models.app_user import AppUser
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.warehouse import Warehouse
from ..schemas.production import (
    ComponentAllocationWrite,
    ProductionCompleteResultRead,
    ProductionOrderCompleteBody,
    ProductionOrderCreateBody,
    ProductionOrderLineSnapshotRead,
    ProductionOrderRead,
    ProductionOrderSummaryRead,
    StockShortageRead,
)
from .document_number_service import assign_series_number_to_stock_document, require_warehouse_series
from .inventory_carrier_ops import upsert_dock_inventory_for_loose_receipt
from .inventory_lot_keys import NO_EXPIRY_SENTINEL
from .order_item_pick_allocation_service import consume_inventory_fifo_slices
from .product_cost_service import get_product_current_cost
from .composition_engine_service import calculate_required_components as calculate_composition_components
from .composition_engine_service import resolve_composition_entity
from .production_recipe_service import ProductionRecipeError, calculate_required_components
from .stock_disposition import STOCK_DISPOSITION_SALEABLE
from .stock_operation_issue_service import append_issue_operation
from .stock_operation_receipt_service import append_receipt_operation

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = frozenset({"completed", "cancelled"})

_VALID_SUMMARY_STATUSES = frozenset({"draft", "planned", "in_progress", "completed", "cancelled"})
_BATCH_STATUS_TO_ORDER = {
    "draft": "draft",
    "planned": "planned",
    "collecting": "in_progress",
    "in_progress": "in_progress",
    "putaway": "in_progress",
    "completed": "completed",
    "cancelled": "cancelled",
}


class ProductionOrderError(Exception):
    def __init__(self, message: str, *, code: str = "production_error", shortages: list | None = None) -> None:
        self.message = message
        self.code = code
        self.shortages = shortages or []
        super().__init__(message)


def _next_order_number(db: Session, *, tenant_id: int) -> str:
    year = datetime.utcnow().year
    prefix = f"MO/{year}/"
    last = (
        db.query(ProductionOrder.number)
        .filter(ProductionOrder.tenant_id == int(tenant_id), ProductionOrder.number.like(f"{prefix}%"))
        .order_by(ProductionOrder.id.desc())
        .first()
    )
    seq = 1
    if last and last[0]:
        try:
            seq = int(str(last[0]).split("/")[-1]) + 1
        except ValueError:
            seq = 1
    return f"{prefix}{seq:04d}"


def _warehouse_stock(db: Session, *, tenant_id: int, warehouse_id: int, product_id: int) -> float:
    row = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.quantity > 0,
        )
        .scalar()
    )
    return float(row or 0)


def _location_stock(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    location_id: int,
    product_id: int,
) -> float:
    row = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.location_id == int(location_id),
            Inventory.product_id == int(product_id),
            Inventory.quantity > 0,
        )
        .scalar()
    )
    return float(row or 0)


def validate_stock_shortages(
    db: Session,
    order: ProductionOrder,
    *,
    warehouse_id: int | None = None,
) -> list[StockShortageRead]:
    wh = int(warehouse_id or order.warehouse_id)
    shortages: list[StockShortageRead] = []
    for snap in order.line_snapshots or []:
        req = float(snap.total_required_quantity or 0)
        avail = _warehouse_stock(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=wh,
            product_id=int(snap.component_product_id),
        )
        missing = max(0.0, req - avail)
        if missing > 1e-6:
            shortages.append(
                StockShortageRead(
                    component_product_id=int(snap.component_product_id),
                    product_name=str(snap.product_name_snapshot or ""),
                    required=round(req, 4),
                    available=round(avail, 4),
                    missing=round(missing, 4),
                )
            )
    return shortages


def _document_number(db: Session, doc_id: int | None) -> str | None:
    if doc_id is None:
        return None
    row = db.query(StockDocument.document_number).filter(StockDocument.id == int(doc_id)).first()
    if row is None or not row[0]:
        return None
    return str(row[0]).strip() or None


def _normalize_summary_status(raw: str | None) -> str:
    """Map MO/batch status to ProductionOrderSummaryRead literal."""
    key = str(raw or "draft").strip().lower()
    if key in _VALID_SUMMARY_STATUSES:
        return key
    return _BATCH_STATUS_TO_ORDER.get(key, "planned")


def _production_orders_table_ready(db: Session) -> bool:
    bind = db.get_bind()
    if not has_table(bind, "production_orders"):
        return False
    cols = get_table_column_names(bind, "production_orders")
    required = {
        "id",
        "tenant_id",
        "product_id",
        "number",
        "status",
        "planned_quantity",
        "produced_quantity",
        "created_at",
    }
    return required.issubset(cols)


def _batch_tables_ready(db: Session) -> bool:
    bind = db.get_bind()
    return has_table(bind, "production_batches") and has_table(bind, "production_batch_lines")


def _summary_from_order(db: Session, order: ProductionOrder) -> ProductionOrderSummaryRead:
    unit = order.calculated_unit_cost
    prod_q = float(order.produced_quantity or 0)
    comp_total = round(float(unit or 0) * prod_q, 4) if unit is not None and prod_q > 0 else None
    return ProductionOrderSummaryRead(
        id=int(order.id),
        number=str(order.number or ""),
        status=_normalize_summary_status(order.status),  # type: ignore[arg-type]
        planned_quantity=float(order.planned_quantity or 0),
        produced_quantity=prod_q,
        calculated_unit_cost=unit,
        component_total_cost=comp_total,
        completed_at=order.completed_at,
        created_at=order.created_at,
        operator_name=_operator_name(db, order.created_by_user_id),
    )


def _summaries_from_batches_for_product(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    limit: int,
) -> list[ProductionOrderSummaryRead]:
    if not _batch_tables_ready(db):
        return []
    try:
        pairs = (
            db.query(ProductionBatchLine, ProductionBatch)
            .join(ProductionBatch, ProductionBatchLine.batch_id == ProductionBatch.id)
            .filter(
                ProductionBatch.tenant_id == int(tenant_id),
                ProductionBatchLine.product_id == int(product_id),
            )
            .order_by(ProductionBatch.created_at.desc())
            .limit(limit)
            .all()
        )
    except SQLAlchemyError as exc:
        logger.warning(
            "production_batches history query failed tenant=%s product=%s: %s",
            tenant_id,
            product_id,
            exc,
            exc_info=True,
        )
        return []

    out: list[ProductionOrderSummaryRead] = []
    for line, batch in pairs:
        unit = line.calculated_unit_cost
        prod_q = float(line.completed_quantity or 0)
        planned_q = float(line.planned_quantity or 0)
        comp_total = round(float(unit or 0) * prod_q, 4) if unit is not None and prod_q > 0 else None
        out.append(
            ProductionOrderSummaryRead(
                id=-int(batch.id),
                number=str(batch.number or ""),
                status=_normalize_summary_status(batch.status),  # type: ignore[arg-type]
                planned_quantity=planned_q,
                produced_quantity=prod_q,
                calculated_unit_cost=unit,
                component_total_cost=comp_total,
                completed_at=batch.completed_at,
                created_at=batch.created_at,
                operator_name=_operator_name(db, batch.created_by_user_id),
            )
        )
    return out


def _operator_name(db: Session, user_id: int | None) -> str | None:
    if user_id is None:
        return None
    u = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
    if u is None:
        return None
    parts = [str(getattr(u, "first_name", None) or "").strip(), str(getattr(u, "last_name", None) or "").strip()]
    name = " ".join(p for p in parts if p).strip()
    return name or str(getattr(u, "email", None) or "").strip() or None


def serialize_order(db: Session, order: ProductionOrder, *, with_availability: bool = False) -> ProductionOrderRead:
    p = db.query(Product).filter(Product.id == int(order.product_id)).first()
    wh = db.query(Warehouse).filter(Warehouse.id == int(order.warehouse_id)).first()
    loc = (
        db.query(Location).filter(Location.id == int(order.location_id)).first()
        if order.location_id is not None
        else None
    )
    rec = db.query(ProductionRecipe).filter(ProductionRecipe.id == int(order.recipe_id)).first()
    lines_out: list[ProductionOrderLineSnapshotRead] = []
    for snap in order.line_snapshots or []:
        avail = miss = None
        if with_availability:
            req = float(snap.total_required_quantity or 0)
            av = _warehouse_stock(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                product_id=int(snap.component_product_id),
            )
            avail = av
            miss = max(0.0, req - av)
        lines_out.append(
            ProductionOrderLineSnapshotRead(
                id=int(snap.id),
                component_product_id=int(snap.component_product_id),
                quantity_per_unit=float(snap.quantity_per_unit),
                total_required_quantity=float(snap.total_required_quantity),
                consumed_quantity=float(snap.consumed_quantity or 0),
                product_name_snapshot=str(snap.product_name_snapshot or ""),
                product_sku_snapshot=snap.product_sku_snapshot,
                available=avail,
                missing=miss,
            )
        )
    return ProductionOrderRead(
        id=int(order.id),
        tenant_id=int(order.tenant_id),
        number=str(order.number or ""),
        recipe_id=int(order.recipe_id),
        product_id=int(order.product_id),
        warehouse_id=int(order.warehouse_id),
        location_id=int(order.location_id) if order.location_id else None,
        planned_quantity=float(order.planned_quantity),
        produced_quantity=float(order.produced_quantity or 0),
        status=str(order.status or "draft"),  # type: ignore[arg-type]
        priority=int(order.priority or 0),
        notes=order.notes,
        calculated_unit_cost=order.calculated_unit_cost,
        rw_stock_document_id=order.rw_stock_document_id,
        pw_stock_document_id=order.pw_stock_document_id,
        rw_document_number=_document_number(db, order.rw_stock_document_id),
        pw_document_number=_document_number(db, order.pw_stock_document_id),
        component_total_cost=(
            round(float(order.calculated_unit_cost or 0) * float(order.produced_quantity or 0), 4)
            if order.calculated_unit_cost is not None and float(order.produced_quantity or 0) > 0
            else None
        ),
        operator_name=_operator_name(db, order.created_by_user_id),
        product_name=(p.name if p else None),
        product_sku=((p.sku or p.symbol) if p else None),
        warehouse_name=(wh.name if wh else None),
        location_name=(loc.name if loc else None),
        recipe_name=(rec.name if rec else None),
        lines=lines_out,
        started_at=order.started_at,
        completed_at=order.completed_at,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


def _snapshot_composition_lines(
    db: Session,
    order: ProductionOrder,
    composition: ProductComposition,
    *,
    planned_quantity: float,
) -> None:
    reqs = calculate_composition_components(composition, planned_quantity=planned_quantity)
    prod_ids = [int(r["component_product_id"]) for r in reqs]
    names: dict[int, Product] = {}
    if prod_ids:
        for p in db.query(Product).filter(Product.id.in_(prod_ids)).all():
            names[int(p.id)] = p
    for req in reqs:
        pid = int(req["component_product_id"])
        p = names.get(pid)
        order.line_snapshots.append(
            ProductionOrderLineSnapshot(
                component_product_id=pid,
                quantity_per_unit=float(req["quantity_per_unit"]),
                total_required_quantity=float(req["total_required"]),
                consumed_quantity=0.0,
                product_name_snapshot=str(p.name if p else f"Produkt #{pid}"),
                product_sku_snapshot=((p.sku or p.symbol) if p else None),
            )
        )


def _snapshot_recipe_lines(
    db: Session,
    order: ProductionOrder,
    recipe: ProductionRecipe,
    *,
    planned_quantity: float,
) -> None:
    reqs = calculate_required_components(recipe, planned_quantity=planned_quantity)
    prod_ids = [int(r["component_product_id"]) for r in reqs]
    names: dict[int, Product] = {}
    if prod_ids:
        for p in db.query(Product).filter(Product.id.in_(prod_ids)).all():
            names[int(p.id)] = p
    for req in reqs:
        pid = int(req["component_product_id"])
        p = names.get(pid)
        order.line_snapshots.append(
            ProductionOrderLineSnapshot(
                component_product_id=pid,
                quantity_per_unit=float(req["quantity_per_unit"]),
                total_required_quantity=float(req["total_required"]),
                consumed_quantity=0.0,
                product_name_snapshot=str(p.name if p else f"Produkt #{pid}"),
                product_sku_snapshot=((p.sku or p.symbol) if p else None),
            )
        )


def create_production_order(
    db: Session,
    *,
    tenant_id: int,
    body: ProductionOrderCreateBody,
    created_by_user_id: int | None = None,
) -> ProductionOrderRead:
    recipe = (
        db.query(ProductionRecipe)
        .options(joinedload(ProductionRecipe.lines))
        .filter(ProductionRecipe.id == int(body.recipe_id), ProductionRecipe.tenant_id == int(tenant_id))
        .first()
    )
    if recipe is None:
        raise ProductionOrderError("Receptura nie istnieje.", code="recipe_not_found")
    if not recipe.lines:
        raise ProductionOrderError("Receptura nie ma składników.", code="recipe_empty")
    composition = resolve_composition_entity(db, tenant_id=tenant_id, recipe_id=int(recipe.id))
    order = ProductionOrder(
        tenant_id=int(tenant_id),
        number=_next_order_number(db, tenant_id=tenant_id),
        recipe_id=int(recipe.id),
        composition_id=int(composition.id) if composition is not None else None,
        product_id=int(recipe.product_id),
        warehouse_id=int(body.warehouse_id),
        location_id=int(body.location_id) if body.location_id else None,
        planned_quantity=float(body.planned_quantity),
        status=str(body.status or "planned"),
        priority=int(body.priority or 0),
        notes=(body.notes or "").strip() or None,
        created_by_user_id=int(created_by_user_id) if created_by_user_id else None,
    )
    db.add(order)
    db.flush()
    if composition is not None and composition.lines:
        _snapshot_composition_lines(db, order, composition, planned_quantity=float(body.planned_quantity))
    else:
        _snapshot_recipe_lines(db, order, recipe, planned_quantity=float(body.planned_quantity))
    db.flush()
    return serialize_order(db, order, with_availability=True)


def start_production_order(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
) -> ProductionOrderRead:
    order = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id))
        .first()
    )
    if order is None:
        raise ProductionOrderError("Zlecenie produkcyjne nie istnieje.", code="not_found")
    if str(order.status) in TERMINAL_STATUSES:
        raise ProductionOrderError("Zlecenie jest już zamknięte.", code="terminal_status")
    if str(order.status) == "in_progress":
        return serialize_order(db, order, with_availability=True)
    shortages = validate_stock_shortages(db, order)
    if shortages and str(order.status) != "draft":
        raise ProductionOrderError(
            "Niewystarczający stan magazynowy składników.",
            code="insufficient_stock",
            shortages=[s.model_dump() for s in shortages],
        )
    order.status = "in_progress"
    order.started_at = datetime.utcnow()
    order.updated_at = datetime.utcnow()
    db.flush()
    return serialize_order(db, order, with_availability=True)


def cancel_production_order(db: Session, *, tenant_id: int, order_id: int) -> ProductionOrderRead:
    order = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id))
        .first()
    )
    if order is None:
        raise ProductionOrderError("Zlecenie produkcyjne nie istnieje.", code="not_found")
    if str(order.status) == "completed":
        raise ProductionOrderError("Nie można anulować ukończonego zlecenia.", code="completed")
    order.status = "cancelled"
    order.updated_at = datetime.utcnow()
    db.flush()
    return serialize_order(db, order)


def _auto_allocate_locations(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: float,
) -> list[tuple[int, float]]:
    """FIFO by expiry across warehouse locations — returns [(location_id, qty)]."""
    rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.quantity > 0,
        )
        .order_by(Inventory.expiry_date.asc(), Inventory.id.asc())
        .all()
    )
    remaining = float(quantity)
    alloc: list[tuple[int, float]] = []
    for inv in rows:
        if remaining <= 1e-9:
            break
        loc_id = int(inv.location_id) if inv.location_id is not None else None
        if loc_id is None:
            continue
        take = min(float(inv.quantity or 0), remaining)
        if take <= 1e-9:
            continue
        alloc.append((loc_id, take))
        remaining -= take
    if remaining > 1e-6:
        raise ProductionOrderError(
            f"Brak stanu dla produktu #{product_id} (brakuje {round(remaining, 4)}).",
            code="insufficient_stock",
        )
    return alloc


def _resolve_component_allocations(
    db: Session,
    order: ProductionOrder,
    *,
    component_allocations: list[ComponentAllocationWrite] | None,
) -> dict[int, list[tuple[int, float]]]:
    """Map line_snapshot_id -> [(location_id, qty)]."""
    by_snap: dict[int, list[tuple[int, float]]] = {}
    snap_by_id = {int(s.id): s for s in order.line_snapshots or []}
    if component_allocations:
        for alloc in component_allocations:
            snap = snap_by_id.get(int(alloc.line_snapshot_id))
            if snap is None:
                raise ProductionOrderError(f"Nieznana linia zlecenia #{alloc.line_snapshot_id}.", code="line_not_found")
            by_snap.setdefault(int(snap.id), []).append((int(alloc.location_id), float(alloc.quantity)))
        for snap_id, snap in snap_by_id.items():
            total = sum(q for _, q in by_snap.get(snap_id, []))
            req = float(snap.total_required_quantity or 0)
            if abs(total - req) > 1e-3:
                raise ProductionOrderError(
                    f"Alokacja dla {snap.product_name_snapshot} ({total}) ≠ wymagane ({req}).",
                    code="allocation_mismatch",
                )
        return by_snap
    for snap in order.line_snapshots or []:
        req = float(snap.total_required_quantity or 0)
        if req <= 1e-9:
            continue
        by_snap[int(snap.id)] = _auto_allocate_locations(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            product_id=int(snap.component_product_id),
            quantity=req,
        )
    return by_snap


def _create_production_stock_document(
    db: Session,
    *,
    order: ProductionOrder,
    document_type: str,
    location_id: int | None,
    created_by_user_id: int | None,
) -> StockDocument:
    try:
        series = require_warehouse_series(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            subtype=document_type,
        )
    except Exception:
        series = None
    doc = StockDocument(
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        location_id=location_id,
        document_type=document_type,
        creation_source="PRODUCTION",
        production_order_id=int(order.id),
        status="completed",
        receiving_status="DONE",
        putaway_status="DONE",
        relocation_status="DONE",
        created_by_user_id=created_by_user_id,
    )
    db.add(doc)
    db.flush()
    if series is not None:
        wh = db.query(Warehouse).filter(Warehouse.id == int(order.warehouse_id)).first()
        wh_code = str(getattr(wh, "code", None) or "").strip() or None
        assign_series_number_to_stock_document(db, doc, series, warehouse_code=wh_code)
    return doc


def complete_production_order(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    body: ProductionOrderCompleteBody,
    performed_by_user_id: int | None = None,
) -> ProductionCompleteResultRead:
    order = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id))
        .first()
    )
    if order is None:
        raise ProductionOrderError("Zlecenie produkcyjne nie istnieje.", code="not_found")
    if str(order.status) == "completed":
        return ProductionCompleteResultRead(
            order=serialize_order(db, order),
            rw_stock_document_id=order.rw_stock_document_id,
            pw_stock_document_id=order.pw_stock_document_id,
            calculated_unit_cost=order.calculated_unit_cost,
        )
    if str(order.status) == "cancelled":
        raise ProductionOrderError("Zlecenie anulowane.", code="cancelled")

    produced_qty = float(body.produced_quantity if body.produced_quantity is not None else order.planned_quantity)
    if produced_qty <= 1e-9:
        raise ProductionOrderError("Ilość produkowana musi być > 0.", code="invalid_qty")

    shortages = validate_stock_shortages(db, order)
    if shortages:
        raise ProductionOrderError(
            "Niewystarczający stan magazynowy składników.",
            code="insufficient_stock",
            shortages=[s.model_dump() for s in shortages],
        )

    target_loc = int(body.location_id or order.location_id or 0)
    if target_loc < 1:
        raise ProductionOrderError("Wybierz lokalizację docelową dla wyrobu gotowego.", code="location_required")

    alloc_map = _resolve_component_allocations(db, order, component_allocations=body.component_allocations)

    rw_doc = _create_production_stock_document(
        db,
        order=order,
        document_type="RW",
        location_id=None,
        created_by_user_id=performed_by_user_id,
    )
    total_component_cost = 0.0

    for snap in order.line_snapshots or []:
        snap_id = int(snap.id)
        allocs = alloc_map.get(snap_id, [])
        if not allocs:
            continue
        line = StockDocumentItem(
            document_id=int(rw_doc.id),
            product_id=int(snap.component_product_id),
            ordered_quantity=sum(q for _, q in allocs),
            received_quantity=sum(q for _, q in allocs),
            quantity=sum(q for _, q in allocs),
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
        db.add(line)
        db.flush()

        unit_cost_data = get_product_current_cost(db, int(order.tenant_id), int(snap.component_product_id))
        unit_net = float(unit_cost_data.get("purchase_net") or 0)
        line.purchase_price_net = unit_net
        consumed_total = 0.0

        for loc_id, qty in allocs:
            slices = consume_inventory_fifo_slices(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                product_id=int(snap.component_product_id),
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
                    metadata={"production_order_id": int(order.id), "source_document_type": "RW"},
                )
                consumed_total += float(sl.quantity)

        snap.consumed_quantity = float(consumed_total)
        total_component_cost += unit_net * float(consumed_total)

    pw_doc = _create_production_stock_document(
        db,
        order=order,
        document_type="PW",
        location_id=target_loc,
        created_by_user_id=performed_by_user_id,
    )
    unit_cost = total_component_cost / produced_qty if produced_qty > 1e-9 else 0.0
    fg_line = StockDocumentItem(
        document_id=int(pw_doc.id),
        product_id=int(order.product_id),
        ordered_quantity=produced_qty,
        received_quantity=produced_qty,
        quantity=produced_qty,
        purchase_price_net=unit_cost,
        batch_number="",
        expiry_date=date(9999, 12, 31),
    )
    db.add(fg_line)
    db.flush()

    upsert_dock_inventory_for_loose_receipt(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        location_id=target_loc,
        product_id=int(order.product_id),
        add_qty=float(produced_qty),
        batch_number="",
        expiry_date=NO_EXPIRY_SENTINEL,
        stock_disposition=STOCK_DISPOSITION_SALEABLE,
    )
    append_receipt_operation(db, pw_doc, fg_line, float(produced_qty))

    order.produced_quantity = produced_qty
    order.calculated_unit_cost = round(unit_cost, 4)
    order.rw_stock_document_id = int(rw_doc.id)
    order.pw_stock_document_id = int(pw_doc.id)
    order.status = "completed"
    order.completed_at = datetime.utcnow()
    order.updated_at = datetime.utcnow()
    if order.location_id is None:
        order.location_id = target_loc

    prod = db.query(Product).filter(Product.id == int(order.product_id)).first()
    if prod is not None and unit_cost > 0:
        prod.purchase_price = float(unit_cost)
        prod.updated_at = datetime.utcnow()

    db.flush()
    logger.info(
        "[production.complete] order_id=%s rw=%s pw=%s unit_cost=%s",
        order.id,
        rw_doc.id,
        pw_doc.id,
        unit_cost,
    )
    comp_total = round(total_component_cost, 4)
    return ProductionCompleteResultRead(
        order=serialize_order(db, order, with_availability=False),
        rw_stock_document_id=int(rw_doc.id),
        pw_stock_document_id=int(pw_doc.id),
        rw_document_number=str(getattr(rw_doc, "document_number", None) or "").strip() or None,
        pw_document_number=str(getattr(pw_doc, "document_number", None) or "").strip() or None,
        calculated_unit_cost=round(unit_cost, 4),
        component_total_cost=comp_total,
    )


def list_production_orders(
    db: Session,
    *,
    tenant_id: int,
    status: str | None = None,
    warehouse_id: int | None = None,
) -> list[ProductionOrderRead]:
    q = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(ProductionOrder.tenant_id == int(tenant_id))
    )
    if status:
        q = q.filter(ProductionOrder.status == str(status).strip().lower())
    if warehouse_id:
        q = q.filter(ProductionOrder.warehouse_id == int(warehouse_id))
    rows = q.order_by(ProductionOrder.priority.desc(), ProductionOrder.created_at.desc()).all()
    with_avail = status in (None, "planned", "draft", "in_progress")
    return [serialize_order(db, o, with_availability=with_avail) for o in rows]


def list_production_orders_for_product(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    limit: int = 50,
) -> list[ProductionOrderSummaryRead]:
    """Product manufacturing history — legacy MO rows + production batch lines."""
    lim = max(1, min(int(limit or 50), 200))
    tid = int(tenant_id)
    pid = int(product_id)
    out: list[ProductionOrderSummaryRead] = []

    if _production_orders_table_ready(db):
        try:
            rows = (
                db.query(ProductionOrder)
                .filter(
                    ProductionOrder.tenant_id == tid,
                    ProductionOrder.product_id == pid,
                )
                .order_by(ProductionOrder.created_at.desc())
                .limit(lim)
                .all()
            )
            out.extend(_summary_from_order(db, o) for o in rows)
        except SQLAlchemyError as exc:
            logger.warning(
                "production_orders by-product query failed tenant=%s product=%s: %s",
                tid,
                pid,
                exc,
                exc_info=True,
            )
            try:
                db.rollback()
            except Exception:
                pass
    else:
        logger.info(
            "production_orders table unavailable — skipping MO history tenant=%s product=%s",
            tid,
            pid,
        )

    batch_rows = _summaries_from_batches_for_product(db, tenant_id=tid, product_id=pid, limit=lim)
    out.extend(batch_rows)

    out.sort(
        key=lambda r: (r.created_at is not None, r.created_at or datetime.min),
        reverse=True,
    )
    return out[:lim]


def get_production_order(db: Session, *, tenant_id: int, order_id: int) -> ProductionOrderRead | None:
    order = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id))
        .first()
    )
    if order is None:
        return None
    return serialize_order(db, order, with_availability=str(order.status) not in TERMINAL_STATUSES)
