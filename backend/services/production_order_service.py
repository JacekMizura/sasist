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
from ..models.production import (
    PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES,
    PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED,
    PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE,
    PRODUCTION_ORDER_SOURCE_MANUAL,
    ProductionOrder,
    ProductionOrderLineSnapshot,
)
from ..models.app_user import AppUser
from ..models.order import Order
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.warehouse import Warehouse
from ..schemas.production import (
    ComponentAllocationWrite,
    ProductionCompleteResultRead,
    ProductionOrderCompleteBody,
    ProductionOrderCreateBody,
    ProductionOrderLineSnapshotRead,
    ProductionOrderRead,
    ProductionOrderSourceItemRead,
    ProductionOrderSummaryRead,
    StockShortageRead,
)
from .document_number_service import assign_series_number_to_stock_document, require_warehouse_series
from .production_execution.execution_interface import (
    is_erp_interface,
    is_print_interface,
    normalized_execution_interface,
)
from .inventory_carrier_ops import upsert_dock_inventory_for_loose_receipt
from .inventory_lot_keys import NO_EXPIRY_SENTINEL
from .order_item_pick_allocation_service import consume_inventory_fifo_slices
from .product_cost_service import get_product_current_cost
from .composition_engine_service import calculate_required_components as calculate_composition_components
from .composition_engine_service import resolve_composition_entity
from .production_order_source_service import aggregate_order_source_quantities
from .stock_disposition import STOCK_DISPOSITION_SALEABLE
from .stock_operation_issue_service import append_issue_operation
from .stock_operation_receipt_service import append_receipt_operation
from .reservations.availability_service import warehouse_net_available

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = frozenset({"completed", "cancelled"})

_VALID_SUMMARY_STATUSES = frozenset(
    {"draft", "planned", "collecting", "in_progress", "awaiting_putaway", "putaway", "completed", "cancelled"}
)
_BATCH_STATUS_TO_ORDER = {
    "draft": "draft",
    "planned": "planned",
    "collecting": "collecting",
    "in_progress": "in_progress",
    "awaiting_putaway": "awaiting_putaway",
    "putaway": "putaway",
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
        avail = warehouse_net_available(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=wh,
            product_id=int(snap.component_product_id),
            exclude_order_id=int(order.id),
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


def _pw_putaway_status(db: Session, doc_id: int | None) -> str | None:
    if doc_id is None:
        return None
    pw_doc = db.query(StockDocument).filter(StockDocument.id == int(doc_id)).first()
    if pw_doc is None:
        return None
    ps = str(getattr(pw_doc, "putaway_status", "") or "").strip().upper()
    rs = str(getattr(pw_doc, "relocation_status", "") or "").strip().upper()
    if ps == "DONE" or rs == "DONE":
        return "DONE"
    return ps or rs or "OPEN"


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


def _order_collection_progress_percent(order: ProductionOrder) -> float:
    raw = getattr(order, "collection_state_json", None)
    if not raw:
        return 0.0
    try:
        data = json.loads(str(raw))
    except json.JSONDecodeError:
        return 0.0
    tasks = data.get("tasks") or []
    if not tasks:
        return 0.0
    done = 0
    for t in tasks:
        req = float(t.get("required_qty") or 0)
        col = float(t.get("collected_qty") or 0)
        if req <= 1e-9 or col >= req - 1e-6:
            done += 1
    return round(100.0 * done / len(tasks), 1)


def serialize_order(
    db: Session,
    order: ProductionOrder,
    *,
    with_availability: bool = False,
    with_order_sources: bool = False,
) -> ProductionOrderRead:
    p = db.query(Product).filter(Product.id == int(order.product_id)).first()
    wh = db.query(Warehouse).filter(Warehouse.id == int(order.warehouse_id)).first()
    loc = (
        db.query(Location).filter(Location.id == int(order.location_id)).first()
        if order.location_id is not None
        else None
    )
    comp = None
    if order.composition_id is not None:
        comp = db.query(ProductComposition).filter(ProductComposition.id == int(order.composition_id)).first()
    elif order.recipe_id is not None:
        comp = resolve_composition_entity(db, tenant_id=int(order.tenant_id), recipe_id=int(order.recipe_id))
    recipe_name = comp.name if comp is not None else None
    lines_out: list[ProductionOrderLineSnapshotRead] = []
    comp_pids = {int(snap.component_product_id) for snap in order.line_snapshots or []}
    comp_products = (
        {p.id: p for p in db.query(Product).filter(Product.id.in_(comp_pids)).all()} if comp_pids else {}
    )
    for snap in order.line_snapshots or []:
        avail = miss = None
        cp = comp_products.get(int(snap.component_product_id))
        if with_availability:
            req = float(snap.total_required_quantity or 0)
            av = warehouse_net_available(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                product_id=int(snap.component_product_id),
                exclude_order_id=int(order.id),
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
                product_image_url=((cp.image_url or "").strip() or None if cp else None),
                available=avail,
                missing=miss,
            )
        )
    shortages = validate_stock_shortages(db, order) if str(order.status) not in TERMINAL_STATUSES else []
    has_shortages = len(shortages) > 0
    status = str(order.status or "draft")
    coll_pct = _order_collection_progress_percent(order)
    planned_q = float(order.planned_quantity or 0)
    produced_q = float(order.produced_quantity or 0)
    if status == "collecting":
        progress = coll_pct
    elif status in ("in_progress", "awaiting_putaway", "putaway"):
        progress = round(100.0 * produced_q / planned_q, 1) if planned_q > 0 else 0.0
    elif status == "completed":
        progress = 100.0
    else:
        progress = 0.0

    source_rows = list(getattr(order, "order_sources", None) or [])
    if not source_rows and getattr(order, "id", None) is not None:
        from ..models.production import ProductionOrderSourceItem

        source_rows = (
            db.query(ProductionOrderSourceItem)
            .filter(ProductionOrderSourceItem.production_order_id == int(order.id))
            .order_by(ProductionOrderSourceItem.id.asc())
            .all()
        )
    src_order_count, src_req_total, src_ful_total = aggregate_order_source_quantities(source_rows)
    src_reserved_count = sum(
        1 for s in source_rows if str(s.status or "") in ("reserved", "open", "partial")
    )
    src_shortage_count = sum(1 for s in source_rows if str(s.status or "") == "shortage")
    src_reserved_qty_total = sum(
        float(s.requested_quantity or 0)
        for s in source_rows
        if str(s.status or "") in ("reserved", "open", "partial")
    )
    src_shortage_qty_total = sum(
        float(s.requested_quantity or 0)
        for s in source_rows
        if str(s.status or "") == "shortage"
    )
    fulfilled_order_ids = {
        int(s.order_id)
        for s in source_rows
        if str(s.status or "") == "fulfilled"
    }
    pending_order_ids = {
        int(s.order_id)
        for s in source_rows
        if str(s.status or "") in ("reserved", "open", "partial")
    }
    src_fulfilled_order_count = len(fulfilled_order_ids)
    src_pending_order_count = len(pending_order_ids)

    # Distinct sales orders still awaiting packing after ORDERS FG fulfillment.
    src_awaiting_packing_order_count = 0
    if fulfilled_order_ids:
        from .production_execution.production_packing_handoff_service import (
            order_awaits_packing_after_orders_production,
        )

        fulfilled_orders = (
            db.query(Order)
            .options(joinedload(Order.order_ui_status))
            .filter(Order.id.in_(list(fulfilled_order_ids)))
            .all()
        )
        src_awaiting_packing_order_count = sum(
            1 for o in fulfilled_orders if order_awaits_packing_after_orders_production(o)
        )

    order_sources_out: list[ProductionOrderSourceItemRead] = []
    if with_order_sources and source_rows:
        order_ids = {int(s.order_id) for s in source_rows}
        product_ids = {int(s.product_id) for s in source_rows}
        orders_by_id = {
            int(o.id): o
            for o in db.query(Order)
            .options(joinedload(Order.order_ui_status))
            .filter(Order.id.in_(order_ids))
            .all()
        } if order_ids else {}
        products_by_id = {
            int(pr.id): pr
            for pr in db.query(Product).filter(Product.id.in_(product_ids)).all()
        } if product_ids else {}
        for s in source_rows:
            ord_row = orders_by_id.get(int(s.order_id))
            prod_row = products_by_id.get(int(s.product_id))
            order_sources_out.append(
                ProductionOrderSourceItemRead(
                    id=int(s.id),
                    order_id=int(s.order_id),
                    order_item_id=int(s.order_item_id),
                    order_number=(str(ord_row.number) if ord_row and ord_row.number else None),
                    product_id=int(s.product_id),
                    product_name=(str(prod_row.name) if prod_row else None),
                    product_sku=((prod_row.sku or prod_row.symbol) if prod_row else None),
                    requested_quantity=float(s.requested_quantity or 0),
                    fulfilled_quantity=float(s.fulfilled_quantity or 0),
                    status=str(s.status or "open"),
                )
            )

    raw_source = str(getattr(order, "source_type", None) or PRODUCTION_ORDER_SOURCE_MANUAL).strip().upper()
    if raw_source not in ("MANUAL", "PLANNING", "ORDERS"):
        raw_source = PRODUCTION_ORDER_SOURCE_MANUAL

    production_execution_method = None
    if raw_source == "ORDERS" and getattr(order, "picking_config_id", None) is not None:
        from .production_execution.print_execution_service import resolve_configured_execution_method

        production_execution_method = resolve_configured_execution_method(db, order)

    return ProductionOrderRead(
        id=int(order.id),
        tenant_id=int(order.tenant_id),
        number=str(order.number or ""),
        composition_id=int(order.composition_id) if order.composition_id is not None else None,
        recipe_id=int(order.recipe_id) if order.recipe_id is not None else None,
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
        pw_putaway_status=_pw_putaway_status(db, order.pw_stock_document_id),
        component_total_cost=(
            round(float(order.calculated_unit_cost or 0) * float(order.produced_quantity or 0), 4)
            if order.calculated_unit_cost is not None and float(order.produced_quantity or 0) > 0
            else None
        ),
        operator_name=_operator_name(db, order.created_by_user_id),
        product_name=(p.name if p else None),
        product_sku=((p.sku or p.symbol) if p else None),
        product_image_url=((p.image_url or "").strip() or None if p else None),
        warehouse_name=(wh.name if wh else None),
        location_name=(loc.name if loc else None),
        recipe_name=recipe_name,
        lines=lines_out,
        source_type=raw_source,  # type: ignore[arg-type]
        picking_config_id=(
            int(order.picking_config_id) if getattr(order, "picking_config_id", None) is not None else None
        ),
        production_source_status_id=(
            int(order.production_source_status_id)
            if getattr(order, "production_source_status_id", None) is not None
            else None
        ),
        source_order_count=int(src_order_count),
        source_requested_quantity_total=float(src_req_total),
        source_fulfilled_quantity_total=float(src_ful_total),
        source_reserved_count=int(src_reserved_count),
        source_shortage_count=int(src_shortage_count),
        source_reserved_quantity_total=float(src_reserved_qty_total),
        source_shortage_quantity_total=float(src_shortage_qty_total),
        source_fulfilled_order_count=int(src_fulfilled_order_count),
        source_pending_order_count=int(src_pending_order_count),
        source_awaiting_packing_order_count=int(src_awaiting_packing_order_count),
        order_sources=order_sources_out,
        started_at=order.started_at,
        collecting_completed_at=getattr(order, "collecting_completed_at", None),
        production_completed_at=getattr(order, "production_completed_at", None),
        completed_at=order.completed_at,
        released_to_wms_at=getattr(order, "released_to_wms_at", None),
        is_released_to_wms=getattr(order, "released_to_wms_at", None) is not None,
        execution_interface=normalized_execution_interface(order),  # type: ignore[arg-type]
        is_erp_interface=is_erp_interface(order),
        is_print_interface=is_print_interface(order),
        production_execution_method=production_execution_method,  # type: ignore[arg-type]
        materials_reserved=bool(getattr(order, "materials_reserved", False)),
        reservations_locked=getattr(order, "reservations_locked_at", None) is not None,
        collection_progress_percent=coll_pct,
        progress_percent=progress,
        has_shortages=has_shortages,
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
    composition: ProductComposition,
    *,
    planned_quantity: float,
) -> None:
    _snapshot_composition_lines(db, order, composition, planned_quantity=planned_quantity)


def create_production_order(
    db: Session,
    *,
    tenant_id: int,
    body: ProductionOrderCreateBody,
    created_by_user_id: int | None = None,
) -> ProductionOrderRead:
    composition = resolve_composition_entity(
        db,
        tenant_id=tenant_id,
        composition_id=int(body.composition_id) if body.composition_id else None,
        recipe_id=int(body.recipe_id) if body.recipe_id and not body.composition_id else None,
    )
    if composition is None:
        raise ProductionOrderError("Receptura (kompozycja) nie istnieje.", code="recipe_not_found")
    if str(composition.composition_mode) != "manufacturing":
        raise ProductionOrderError("Wybrana kompozycja nie jest recepturą produkcyjną.", code="invalid_mode")
    if not composition.lines:
        raise ProductionOrderError("Receptura nie ma składników.", code="recipe_empty")
    legacy_recipe_id = int(composition.source_recipe_id) if composition.source_recipe_id else None
    order = ProductionOrder(
        tenant_id=int(tenant_id),
        number=_next_order_number(db, tenant_id=tenant_id),
        recipe_id=legacy_recipe_id,
        composition_id=int(composition.id),
        product_id=int(composition.product_id),
        warehouse_id=int(body.warehouse_id),
        location_id=int(body.location_id) if body.location_id else None,
        planned_quantity=float(body.planned_quantity),
        status=str(body.status or "planned"),
        priority=int(body.priority or 0),
        notes=(body.notes or "").strip() or None,
        created_by_user_id=int(created_by_user_id) if created_by_user_id else None,
        source_type=PRODUCTION_ORDER_SOURCE_MANUAL,
    )
    db.add(order)
    db.flush()
    _snapshot_composition_lines(db, order, composition, planned_quantity=float(body.planned_quantity))
    db.flush()
    if getattr(body, "reserve_materials", False):
        from .reservations.reservation_service import ReservationError, create_production_order_reservations

        totals = {
            int(s.component_product_id): float(s.total_required_quantity or 0)
            for s in order.line_snapshots or []
        }
        try:
            create_production_order_reservations(
                db,
                tenant_id=int(tenant_id),
                order_id=int(order.id),
                component_totals=totals,
                created_by_user_id=created_by_user_id,
            )
        except ReservationError as exc:
            raise ProductionOrderError(str(exc), code=getattr(exc, "code", "reservation_failed")) from exc
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

    from .production_shortages.analysis_service import analyze_composition_quantity, can_start_with_material_status
    from .composition_engine_service import resolve_composition_entity

    comp = resolve_composition_entity(
        db,
        tenant_id=int(order.tenant_id),
        composition_id=int(order.composition_id) if order.composition_id else None,
        recipe_id=int(order.recipe_id) if order.recipe_id else None,
    )
    if comp is not None:
        analysis = analyze_composition_quantity(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            composition=comp,
            planned_quantity=float(order.planned_quantity or 0),
            exclude_order_id=int(order.id),
        )
        if not can_start_with_material_status(str(analysis.get("material_status"))):
            block = analysis.get("block_message") or {}
            raise ProductionOrderError(
                str(block.get("summary") or "Niewystarczający stan magazynowy składników."),
                code="insufficient_stock",
                shortages=[c for c in analysis.get("components") or [] if float(c.get("missing_qty") or 0) > 1e-6],
            )
    else:
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


def cancel_production_order(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    emit_availability: bool = True,
) -> ProductionOrderRead:
    order = (
        db.query(ProductionOrder)
        .options(
            joinedload(ProductionOrder.line_snapshots),
            joinedload(ProductionOrder.order_sources),
        )
        .filter(ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id))
        .first()
    )
    if order is None:
        raise ProductionOrderError("Zlecenie produkcyjne nie istnieje.", code="not_found")
    if str(order.status) == "completed":
        raise ProductionOrderError("Nie można anulować ukończonego zlecenia.", code="completed")
    from .reservations.reservation_service import release_production_reservations
    from .production_order_trigger.availability_retry_service import (
        notify_component_availability_increased,
    )

    # Collect component ids from snapshots before release (availability after cancel).
    component_ids = {
        int(s.component_product_id)
        for s in (order.line_snapshots or [])
        if getattr(s, "component_product_id", None)
    }
    wid = int(order.warehouse_id)

    # Defer shortage retry until MO is cancelled — otherwise sibling reserved sources
    # on the same open MO still consume materials during re-analysis.
    # suppress_component_availability_notify inside emit_availability=False.
    release_production_reservations(
        db,
        tenant_id=int(tenant_id),
        production_order_id=int(order_id),
        reason="cancelled",
        emit_availability=False,
    )
    order.status = "cancelled"
    order.updated_at = datetime.utcnow()

    # Drop active demand on this MO (keep shortage rows for Phase-8 auto-retry).
    now = datetime.utcnow()
    for src in list(order.order_sources or []):
        st = str(src.status or "")
        if st in PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES:
            src.status = PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED
            src.updated_at = now
            db.add(src)
        elif st == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE:
            # Keep shortage; MO link preserved for BOM → component candidate index.
            pass
    db.flush()

    if emit_availability and component_ids:
        notify_component_availability_increased(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=wid,
            component_product_ids=component_ids,
            reason="mo_cancelled",
        )
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
    del db, tenant_id, order_id, body, performed_by_user_id
    raise ProductionOrderError(
        "Użyj przepływu WMS: zbieranie → produkcja → finish-production → rozlokowanie PW.",
        code="deprecated_path",
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
        .options(
            joinedload(ProductionOrder.line_snapshots),
            joinedload(ProductionOrder.order_sources),
        )
        .filter(ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id))
        .first()
    )
    if order is None:
        return None
    return serialize_order(
        db,
        order,
        with_availability=str(order.status) not in TERMINAL_STATUSES,
        with_order_sources=True,
    )
