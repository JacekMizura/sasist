"""Production batches — wave execution with aggregated component demand."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, joinedload, selectinload

from ..db.schema_introspection import get_table_column_names, has_table
from ..models.app_user import AppUser
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.product_composition import (
    ProductionBatch,
    ProductionBatchLine,
    ProductComposition,
)
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.warehouse import Warehouse
from ..schemas.production import ComponentAllocationWrite, StockShortageRead
from ..schemas.production_batch import (
    BatchAggregatedPickLineRead,
    BatchCollectionStateRead,
    BatchCollectionUpdateBody,
    BatchPutawayBody,
    BatchProductionProgressBody,
    BatchProductionFinishBody,
    CollectionTaskRead,
    ProductionBatchCompleteBody,
    ProductionBatchCompleteResultRead,
    ProductionBatchCreateBody,
    ProductionBatchLineRead,
    ProductionBatchPickPlanRead,
    ProductionBatchRead,
)
from .production_execution.execution_interface import (
    ERP_INTERFACE,
    WMS_INTERFACE,
    is_erp_interface,
    normalized_execution_interface,
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
from .production_execution.material_consume_service import consume_production_material_slices
from .product_cost_service import get_product_current_cost
from .production_order_service import _auto_allocate_locations
from .stock_disposition import STOCK_DISPOSITION_SALEABLE
from .stock_operation_issue_service import append_issue_operation
from .stock_operation_receipt_service import append_receipt_operation
from .tenant_default_warehouse import list_tenant_warehouse_ids

logger = logging.getLogger(__name__)

TERMINAL = frozenset({"completed", "cancelled"})
_VALID_BATCH_STATUSES = frozenset(
    {"draft", "planned", "collecting", "in_progress", "awaiting_putaway", "putaway", "completed", "cancelled"}
)


def _normalize_batch_status(raw: str | None) -> str:
    key = str(raw or "draft").strip().lower()
    return key if key in _VALID_BATCH_STATUSES else "planned"


def _batch_schema_ready(db: Session) -> bool:
    bind = db.get_bind()
    if not has_table(bind, "production_batches") or not has_table(bind, "production_batch_lines"):
        return False
    cols = get_table_column_names(bind, "production_batches")
    required = {"id", "tenant_id", "number", "warehouse_id", "status", "created_at"}
    return required.issubset(cols)


def _require_batch_schema(db: Session) -> None:
    if not _batch_schema_ready(db):
        raise ProductionBatchError(
            "Production batch tables are not available. Run database migration.",
            code="schema_unavailable",
        )


class ProductionBatchError(Exception):
    def __init__(self, message: str, *, code: str = "batch_error", shortages: list | None = None) -> None:
        self.message = message
        self.code = code
        self.shortages = shortages or []
        super().__init__(message)


def _next_batch_number(db: Session, *, tenant_id: int) -> str:
    year = datetime.utcnow().year
    prefix = f"BAT/{year}/"
    try:
        last = (
            db.query(ProductionBatch.number)
            .filter(ProductionBatch.tenant_id == int(tenant_id), ProductionBatch.number.like(f"{prefix}%"))
            .order_by(ProductionBatch.id.desc())
            .first()
        )
    except SQLAlchemyError as exc:
        logger.warning("batch number sequence query failed tenant=%s: %s", tenant_id, exc)
        last = None
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
    full = " ".join(p for p in parts if p).strip()
    if full:
        return full
    login = str(getattr(u, "login", None) or "").strip()
    return login or None


def _resolve_assigned_user_id(
    db: Session, *, tenant_id: int, assigned_user_id: int | None
) -> int | None:
    if assigned_user_id is None:
        return None
    uid = int(assigned_user_id)
    if uid < 1:
        return None
    u = db.query(AppUser).filter(AppUser.id == uid).first()
    if u is None or not bool(getattr(u, "is_active", True)):
        raise ProductionBatchError("Wybrany operator nie istnieje lub jest nieaktywny.", code="invalid_operator")
    return uid


def _doc_number(db: Session, doc_id: int | None) -> str | None:
    if doc_id is None:
        return None
    row = db.query(StockDocument.document_number).filter(StockDocument.id == int(doc_id)).first()
    return str(row[0]).strip() if row and row[0] else None


def _append_rw_issue_with_product_audit(
    db: Session,
    *,
    rw_doc: StockDocument,
    line: StockDocumentItem,
    slice_qty: float,
    from_location_id: int,
    batch_number: str,
    expiry_date,
    serial_number: str | None,
    performed_by_user_id: int | None,
    production_batch_id: int,
    product_id: int,
    unit_price_net: float | None = None,
    cost_source: str | None = None,
    source_document_id: int | None = None,
    source_document_line_id: int | None = None,
) -> None:
    append_issue_operation(
        db,
        rw_doc,
        line,
        float(slice_qty),
        from_location_id=int(from_location_id),
        batch_number=batch_number,
        expiry_date=expiry_date,
        serial_number=serial_number,
        operator_admin_id=performed_by_user_id,
        unit_price_net=unit_price_net,
        metadata={
            "production_batch_id": int(production_batch_id),
            "source_document_type": "RW",
            "cost_source": cost_source,
            "source_receipt_document_id": source_document_id,
            "source_receipt_line_id": source_document_line_id,
        },
    )
    from .production_execution.production_warehouse_audit import record_production_rw_issue_audit

    record_production_rw_issue_audit(
        db,
        rw_doc=rw_doc,
        product_id=int(product_id),
        quantity=float(slice_qty),
        from_location_id=int(from_location_id),
        performed_by_user_id=performed_by_user_id,
        batch_number=batch_number or None,
        expiry_date=expiry_date,
    )


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
    pw_putaway_status = None
    if getattr(line, "pw_stock_document_id", None):
        pw_doc = db.query(StockDocument).filter(StockDocument.id == int(line.pw_stock_document_id)).first()
        if pw_doc is not None:
            ps = str(getattr(pw_doc, "putaway_status", "") or "").strip().upper()
            rs = str(getattr(pw_doc, "relocation_status", "") or "").strip().upper()
            # Per-product status on multi-line PW (quantity_putaway vs received).
            item = (
                db.query(StockDocumentItem)
                .filter(
                    StockDocumentItem.document_id == int(pw_doc.id),
                    StockDocumentItem.product_id == int(line.product_id),
                )
                .order_by(StockDocumentItem.id.asc())
                .first()
            )
            if item is not None:
                from .stock_document_service import effective_putaway_quantity_for_line

                received = float(item.received_quantity or 0)
                put = float(effective_putaway_quantity_for_line(db, item) or 0)
                if received > 1e-6 and put + 1e-5 >= received:
                    pw_putaway_status = "DONE"
                elif put > 1e-6:
                    pw_putaway_status = "IN_PROGRESS"
                elif ps == "DONE" or rs == "DONE":
                    pw_putaway_status = "DONE"
                else:
                    pw_putaway_status = ps or rs or "NOT_STARTED"
            elif ps == "DONE" or rs == "DONE":
                pw_putaway_status = "DONE"
            else:
                pw_putaway_status = ps or rs or "OPEN"
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
        pw_document_number=_doc_number(db, line.pw_stock_document_id),
        pw_putaway_status=pw_putaway_status,
        product_name=(p.name if p else None),
        product_sku=((p.sku or p.symbol) if p else None),
        product_ean=((p.ean or "").strip() or None if p else None),
        product_catalog_number=((p.symbol or "").strip() or None if p else None),
        product_barcode=((getattr(p, "barcode", None) or "").strip() or None if p else None),
        product_unit=((p.unit or "").strip() or None if p else None),
        product_image_url=((p.image_url or "").strip() or None if p else None),
        composition_name=(comp.name if comp else None),
        notes=line.notes,
    )


def _collection_progress_percent(batch: ProductionBatch) -> float:
    raw = getattr(batch, "collection_state_json", None)
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


def _batch_has_shortages(db: Session, batch: ProductionBatch) -> bool:
    try:
        totals = _aggregate_batch_components(batch)
        agg = aggregated_demand_with_availability(
            db,
            tenant_id=int(batch.tenant_id),
            warehouse_id=int(batch.warehouse_id),
            component_totals=totals,
        )
        return any(float(r.missing) > 1e-6 for r in agg)
    except Exception:
        return False


def serialize_batch(db: Session, batch: ProductionBatch, *, check_shortages: bool = True) -> ProductionBatchRead:
    wh = db.query(Warehouse).filter(Warehouse.id == int(batch.warehouse_id)).first()
    lines = batch.lines or []
    total_planned = sum(float(ln.planned_quantity or 0) for ln in lines)
    total_completed = sum(float(ln.completed_quantity or 0) for ln in lines)
    coll_pct = _collection_progress_percent(batch)
    status = str(batch.status or "draft")
    if status == "collecting":
        progress = coll_pct
    elif status in ("in_progress", "awaiting_putaway", "putaway"):
        progress = round(100.0 * total_completed / total_planned, 1) if total_planned > 0 else 0.0
    elif status == "completed":
        progress = 100.0
    else:
        progress = 0.0
    from .production_execution.cost_service import compute_batch_display_unit_cost, material_cost_read_fields

    cost_fields = material_cost_read_fields(batch)
    actual_mat = cost_fields.get("actual_material_cost")

    return ProductionBatchRead(
        id=int(batch.id),
        tenant_id=int(batch.tenant_id),
        number=str(batch.number or ""),
        warehouse_id=int(batch.warehouse_id),
        warehouse_name=(wh.name if wh else None),
        status=_normalize_batch_status(status),  # type: ignore[arg-type]
        notes=batch.notes,
        rw_stock_document_id=batch.rw_stock_document_id,
        rw_document_number=_doc_number(db, batch.rw_stock_document_id),
        assigned_user_id=(
            int(batch.assigned_user_id) if getattr(batch, "assigned_user_id", None) else None
        ),
        operator_name=_operator_name(db, getattr(batch, "assigned_user_id", None)),
        lines=[serialize_batch_line(db, ln) for ln in lines],
        products_count=len(lines),
        total_planned_units=round(total_planned, 4),
        total_completed_units=round(total_completed, 4),
        has_shortages=_batch_has_shortages(db, batch) if check_shortages else False,
        progress_percent=progress,
        collection_progress_percent=coll_pct,
        released_to_wms_at=getattr(batch, "released_to_wms_at", None),
        is_released_to_wms=getattr(batch, "released_to_wms_at", None) is not None,
        execution_interface=normalized_execution_interface(batch),  # type: ignore[arg-type]
        is_erp_interface=is_erp_interface(batch),
        materials_reserved=bool(getattr(batch, "materials_reserved", False)),
        reservations_locked=getattr(batch, "reservations_locked_at", None) is not None,
        started_at=batch.started_at,
        collecting_completed_at=getattr(batch, "collecting_completed_at", None),
        production_completed_at=getattr(batch, "production_completed_at", None),
        completed_at=batch.completed_at,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
        display_unit_cost=compute_batch_display_unit_cost(lines),
        actual_material_cost=float(actual_mat) if actual_mat is not None else None,
        has_product_cost_fallback=bool(cost_fields.get("has_product_fallback")),
    )


def _assert_batch_warehouse_for_tenant(db: Session, *, tenant_id: int, warehouse_id: int) -> Warehouse:
    """Warehouse must exist and be linked via tenant_warehouses (or legacy warehouses.tenant_id)."""
    tid = int(tenant_id)
    wid = int(warehouse_id)
    logger.info(
        "CREATE_BATCH_WAREHOUSE tenant_id=%s warehouse_id=%s",
        tid,
        wid,
    )
    wh = db.query(Warehouse).filter(Warehouse.id == wid).first()
    if wh is None:
        msg = f"warehouse_id {wid} not found"
        logger.warning("CREATE_BATCH_WAREHOUSE_FAIL reason=%s", msg)
        raise ProductionBatchError(msg, code="warehouse_not_found")
    allowed = set(list_tenant_warehouse_ids(db, tid))
    legacy_tid = int(getattr(wh, "tenant_id", 0) or 0)
    if wid not in allowed and legacy_tid != tid:
        msg = (
            f"warehouse_id {wid} is not linked to tenant {tid} "
            f"(tenant_warehouses={sorted(allowed)}, legacy_tenant_id={legacy_tid or None})"
        )
        logger.warning("CREATE_BATCH_WAREHOUSE_FAIL reason=%s", msg)
        raise ProductionBatchError(msg, code="warehouse_invalid")
    logger.info(
        "CREATE_BATCH_WAREHOUSE_OK warehouse_id=%s warehouse_name=%s access=%s",
        wid,
        getattr(wh, "name", None),
        "tenant_warehouses" if wid in allowed else "legacy_tenant_id",
    )
    return wh


def _validate_batch_create_body(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    lines: list,
    require_active_composition: bool = True,
) -> None:
    """Shared validation for preview and create — rejects invalid/orphan/inactive recipes."""
    tid = int(tenant_id)
    wid = int(warehouse_id)
    logger.info(
        "CREATE_BATCH_VALIDATE_START tenant_id=%s warehouse_id=%s line_count=%s",
        tid,
        wid,
        len(lines or []),
    )
    if wid < 1:
        msg = "warehouse_id is required"
        logger.warning("CREATE_BATCH_VALIDATE_FAIL step=warehouse_id reason=%s", msg)
        raise ProductionBatchError(msg, code="warehouse_required")
    if not lines:
        msg = "At least one batch line is required"
        logger.warning("CREATE_BATCH_VALIDATE_FAIL step=lines reason=%s", msg)
        raise ProductionBatchError(msg, code="empty_batch")

    _assert_batch_warehouse_for_tenant(db, tenant_id=tid, warehouse_id=wid)

    line_dump = [
        {
            "composition_id": getattr(ln, "composition_id", None),
            "product_id": getattr(ln, "product_id", None),
            "planned_quantity": getattr(ln, "planned_quantity", None),
        }
        for ln in lines
    ]
    logger.info("CREATE_BATCH_LINES payload=%s", json.dumps(line_dump, default=str))

    for idx, ln in enumerate(lines):
        comp_id = int(getattr(ln, "composition_id", 0) or 0)
        prod_id = int(getattr(ln, "product_id", 0) or 0)
        qty = float(getattr(ln, "planned_quantity", 0) or 0)
        logger.info(
            "CREATE_BATCH_VALIDATE_LINE idx=%s composition_id=%s product_id=%s planned_quantity=%s",
            idx,
            comp_id,
            prod_id,
            qty,
        )
        if comp_id < 1:
            msg = f"lines[{idx}].composition_id is required"
            logger.warning("CREATE_BATCH_VALIDATE_FAIL step=line_%s reason=%s", idx, msg)
            raise ProductionBatchError(msg, code="composition_required")
        if prod_id < 1:
            msg = f"lines[{idx}].product_id is required"
            logger.warning("CREATE_BATCH_VALIDATE_FAIL step=line_%s reason=%s", idx, msg)
            raise ProductionBatchError(msg, code="product_required")
        if qty <= 0:
            msg = f"lines[{idx}].planned_quantity must be > 0"
            logger.warning("CREATE_BATCH_VALIDATE_FAIL step=line_%s reason=%s", idx, msg)
            raise ProductionBatchError(msg, code="invalid_quantity")
        comp = resolve_composition_entity(db, tenant_id=tid, composition_id=comp_id)
        if comp is None:
            msg = f"composition_id {comp_id} not found for tenant {tid}"
            logger.warning("CREATE_BATCH_VALIDATE_FAIL step=composition idx=%s reason=%s", idx, msg)
            raise ProductionBatchError(msg, code="invalid_composition")
        if str(comp.composition_mode) != "manufacturing":
            msg = f"composition_id {comp_id} is not a manufacturing recipe (mode={comp.composition_mode})"
            logger.warning("CREATE_BATCH_VALIDATE_FAIL step=composition_mode idx=%s reason=%s", idx, msg)
            raise ProductionBatchError(msg, code="invalid_composition")
        if require_active_composition and not bool(comp.is_active):
            msg = f"Recipe (composition #{comp_id}) is inactive"
            logger.warning("CREATE_BATCH_VALIDATE_FAIL step=composition_active idx=%s reason=%s", idx, msg)
            raise ProductionBatchError(msg, code="recipe_inactive")
        if int(comp.product_id) != prod_id:
            msg = (
                f"product_id {prod_id} does not match composition #{comp_id} "
                f"(expected product_id={comp.product_id})"
            )
            logger.warning("CREATE_BATCH_VALIDATE_FAIL step=product_match idx=%s reason=%s", idx, msg)
            raise ProductionBatchError(msg, code="product_mismatch")
        if not (comp.lines or []):
            msg = f"composition_id {comp_id} has no material lines"
            logger.warning("CREATE_BATCH_VALIDATE_FAIL step=materials idx=%s reason=%s", idx, msg)
            raise ProductionBatchError(msg, code="no_materials")
        product = db.query(Product).filter(Product.id == prod_id, Product.tenant_id == tid).first()
        if product is None or getattr(product, "deleted_at", None) is not None:
            msg = f"product_id {prod_id} is deleted or missing for tenant {tid}"
            logger.warning("CREATE_BATCH_VALIDATE_FAIL step=product idx=%s reason=%s", idx, msg)
            raise ProductionBatchError(msg, code="product_invalid")
        logger.info(
            "CREATE_BATCH_VALIDATE_LINE_OK idx=%s composition_id=%s product_id=%s material_lines=%s",
            idx,
            comp_id,
            prod_id,
            len(comp.lines or []),
        )

    logger.info("CREATE_BATCH_VALIDATE_OK tenant_id=%s warehouse_id=%s lines=%s", tid, wid, len(lines))


def preview_batch_demand(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    lines: list,
):
    """Aggregate material demand for proposed batch lines (no persist)."""
    from ..schemas.production_batch import ProductionBatchPreviewRead

    tid = int(tenant_id)
    wid = int(warehouse_id)
    logger.info(
        "preview_batch_demand tenant=%s warehouse=%s line_count=%s",
        tid,
        wid,
        len(lines or []),
    )

    _validate_batch_create_body(db, tenant_id=tid, warehouse_id=wid, lines=lines)

    demands: list[list[dict[str, Any]]] = []
    total_units = 0.0
    try:
        for ln in lines:
            comp = resolve_composition_entity(db, tenant_id=tid, composition_id=int(ln.composition_id))
            assert comp is not None
            demands.append(calculate_required_components(comp, planned_quantity=float(ln.planned_quantity)))
            total_units += float(ln.planned_quantity)
        totals = aggregate_component_demand(demands)
        agg_rows = aggregated_demand_with_availability(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            component_totals=totals,
        )
    except ProductionBatchError:
        raise
    except SQLAlchemyError as exc:
        logger.exception(
            "preview_batch_demand SQL failed tenant=%s warehouse=%s lines=%s",
            tid,
            wid,
            len(lines),
        )
        raise ProductionBatchError("Nie udało się policzyć zapotrzebowania materiałów.", code="preview_failed") from exc
    except Exception as exc:
        logger.exception(
            "preview_batch_demand failed tenant=%s warehouse=%s lines=%s",
            tid,
            wid,
            len(lines),
        )
        raise ProductionBatchError("Nie udało się policzyć podglądu partii.", code="preview_failed") from exc
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
    pick_plan_rows: list[BatchAggregatedPickLineRead] = []
    preview_pids = {int(r.component_product_id) for r in agg_rows}
    preview_products = (
        {p.id: p for p in db.query(Product).filter(Product.id.in_(preview_pids)).all()} if preview_pids else {}
    )
    for row in agg_rows:
        pid = int(row.component_product_id)
        p_img = preview_products.get(pid)
        req = float(row.required)
        snap_stock = build_location_stock(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=pid,
            available_only=True,
            pick_eligible_only=True,
        )
        loc_rows = list(snap_stock.get("locations") or [])
        suggested = suggest_picking_locations(loc_rows, quantity=req)
        try:
            auto_pairs = _auto_allocate_locations(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=pid,
                quantity=req,
            )
        except Exception:
            auto_pairs = []
        from ..schemas.production import ProductionAllocationRead, ProductionLocationSuggestionRead

        loc_ids = {int(lid) for lid, _ in auto_pairs}
        codes = {
            int(l.id): str(l.name or f"#{l.id}")
            for l in db.query(Location).filter(Location.id.in_(loc_ids)).all()
        } if loc_ids else {}
        auto_reads = [
            ProductionAllocationRead(
                location_id=int(lid),
                location_code=codes.get(int(lid), f"#{lid}"),
                quantity=round(float(qty), 4),
            )
            for lid, qty in auto_pairs
        ]
        pick_plan_rows.append(
            BatchAggregatedPickLineRead(
                component_product_id=pid,
                product_name=row.product_name,
                product_sku=row.product_sku,
                product_image_url=((p_img.image_url or "").strip() or None if p_img else None),
                required=row.required,
                available=row.available,
                missing=row.missing,
                suggested_locations=[
                    ProductionLocationSuggestionRead(
                        location_id=int(s.get("location_id") or 0),
                        code=str(s.get("code") or ""),
                        available=round(float(s.get("available") or 0), 4),
                        is_suggested=True,
                    )
                    for s in loc_rows[:8]
                ],
                auto_allocation=auto_reads,
            )
        )
    from .composition_engine_service import estimate_composition_cost

    estimated_cost = 0.0
    for ln in lines:
        try:
            cost = estimate_composition_cost(
                db,
                tenant_id=tid,
                composition_id=int(ln.composition_id),
            )
            unit = float(cost.get("unit_cost_net") or 0)
            estimated_cost += unit * float(ln.planned_quantity)
        except Exception as exc:
            logger.warning(
                "preview cost estimate skipped composition_id=%s: %s",
                getattr(ln, "composition_id", None),
                exc,
            )
    duration = int(round(15 + len(lines) * 12 + total_units * 1.5))

    return ProductionBatchPreviewRead(
        has_shortages=bool(shortages),
        total_planned_units=round(total_units, 4),
        products_count=len(lines),
        estimated_cost_net=round(estimated_cost, 2),
        estimated_duration_minutes=max(duration, 5),
        aggregated_components=pick_plan_rows,
        shortages=shortages,
    )


def create_batch(
    db: Session,
    *,
    tenant_id: int,
    body: ProductionBatchCreateBody,
    created_by_user_id: int | None = None,
) -> ProductionBatchRead:
    _require_batch_schema(db)
    logger.info(
        "CREATE_BATCH_STEP schema_ok tenant=%s warehouse=%s line_count=%s status=%s",
        tenant_id,
        body.warehouse_id,
        len(body.lines or []),
        body.status,
    )
    _validate_batch_create_body(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(body.warehouse_id),
        lines=body.lines,
    )
    status = str(body.status or "planned")
    if status not in _VALID_BATCH_STATUSES:
        msg = f"status '{status}' is not allowed (allowed={sorted(_VALID_BATCH_STATUSES)})"
        logger.warning("CREATE_BATCH_STEP_FAIL step=status reason=%s", msg)
        raise ProductionBatchError(msg, code="invalid_status")
    try:
        assignee_id = _resolve_assigned_user_id(
            db, tenant_id=int(tenant_id), assigned_user_id=getattr(body, "assigned_user_id", None)
        )
        batch_number = _next_batch_number(db, tenant_id=tenant_id)
        logger.info("CREATE_BATCH_STEP insert_batch number=%s status=%s", batch_number, status)
        batch = ProductionBatch(
            tenant_id=int(tenant_id),
            number=batch_number,
            warehouse_id=int(body.warehouse_id),
            status=status,
            notes=(body.notes or "").strip() or None,
            created_by_user_id=int(created_by_user_id) if created_by_user_id else None,
            assigned_user_id=assignee_id,
        )
        db.add(batch)
        db.flush()
        logger.info("CREATE_BATCH_STEP insert_batch_ok batch_id=%s", batch.id)

        for idx, ln in enumerate(body.lines):
            comp = resolve_composition_entity(db, tenant_id=tenant_id, composition_id=int(ln.composition_id))
            assert comp is not None
            logger.info(
                "CREATE_BATCH_STEP insert_line idx=%s batch_id=%s composition_id=%s product_id=%s qty=%s",
                idx,
                batch.id,
                comp.id,
                ln.product_id,
                ln.planned_quantity,
            )
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
        logger.info("CREATE_BATCH_STEP insert_lines_ok batch_id=%s line_count=%s", batch.id, len(batch.lines))

        if getattr(body, "reserve_materials", False):
            from .reservations.reservation_service import ReservationError, create_production_batch_reservations

            totals = _aggregate_batch_components(batch)
            try:
                create_production_batch_reservations(
                    db,
                    tenant_id=int(tenant_id),
                    batch_id=int(batch.id),
                    component_totals=totals,
                    created_by_user_id=created_by_user_id,
                )
            except ReservationError as exc:
                raise ProductionBatchError(str(exc), code=getattr(exc, "code", "reservation_failed")) from exc

        logger.info("CREATE_BATCH_STEP serialize_batch batch_id=%s", batch.id)
        try:
            from .production_execution.production_domain_activity import (
                emit_production_batch_created,
                emit_production_materials_reserved,
                emit_production_operator_assigned,
            )

            total_planned = sum(float(ln.planned_quantity or 0) for ln in (batch.lines or []))
            first_pid = int(batch.lines[0].product_id) if batch.lines else None
            emit_production_batch_created(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
                batch_id=int(batch.id),
                product_id=first_pid,
                planned_quantity=total_planned,
                actor_user_id=created_by_user_id,
                label=str(batch.number or "") or None,
            )
            if assignee_id:
                oname = _operator_name(db, assignee_id)
                if oname:
                    emit_production_operator_assigned(
                        db,
                        tenant_id=int(tenant_id),
                        warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
                        batch_id=int(batch.id),
                        operator_name=oname,
                        actor_user_id=created_by_user_id,
                        label=str(batch.number or "") or None,
                    )
            if getattr(body, "reserve_materials", False) and bool(getattr(batch, "materials_reserved", False)):
                emit_production_materials_reserved(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
                    batch_id=int(batch.id),
                    product_id=first_pid,
                    actor_user_id=created_by_user_id,
                    label=str(batch.number or "") or None,
                )
        except Exception:
            logger.exception("batch activity create failed batch_id=%s", getattr(batch, "id", None))
        result = serialize_batch(db, batch)
        logger.info("CREATE_BATCH_STEP serialize_batch_ok batch_id=%s number=%s", batch.id, batch.number)
        return result
    except ProductionBatchError:
        raise
    except IntegrityError as exc:
        detail = str(getattr(exc, "orig", None) or exc)
        logger.exception(
            "CREATE_BATCH_STEP_FAIL step=db_integrity tenant=%s warehouse=%s detail=%s",
            tenant_id,
            body.warehouse_id,
            detail,
        )
        raise ProductionBatchError(f"DB integrity error: {detail}", code="db_integrity") from exc
    except SQLAlchemyError as exc:
        detail = str(exc)
        logger.exception(
            "CREATE_BATCH_STEP_FAIL step=db_sql tenant=%s warehouse=%s detail=%s",
            tenant_id,
            body.warehouse_id,
            detail,
        )
        raise ProductionBatchError(f"DB error: {detail}", code="db_error") from exc
    except Exception as exc:
        logger.exception(
            "CREATE_BATCH_STEP_FAIL step=unexpected tenant=%s warehouse=%s",
            tenant_id,
            body.warehouse_id,
        )
        raise ProductionBatchError(str(exc), code="create_failed") from exc


def list_batches(
    db: Session,
    *,
    tenant_id: int,
    status: str | None = None,
    warehouse_id: int | None = None,
    wms_released: bool | None = None,
) -> list[ProductionBatchRead]:
    tid = int(tenant_id)
    if not _batch_schema_ready(db):
        logger.info("list_batches skipped — schema unavailable tenant=%s", tid)
        return []
    try:
        q = (
            db.query(ProductionBatch)
            .options(joinedload(ProductionBatch.lines).joinedload(ProductionBatchLine.composition))
            .filter(ProductionBatch.tenant_id == tid)
        )
        if status:
            q = q.filter(ProductionBatch.status == str(status).strip().lower())
        if warehouse_id:
            q = q.filter(ProductionBatch.warehouse_id == int(warehouse_id))
        if wms_released is True:
            q = q.filter(ProductionBatch.released_to_wms_at.isnot(None))
        elif wms_released is False:
            q = q.filter(ProductionBatch.released_to_wms_at.is_(None))
        rows = q.order_by(ProductionBatch.created_at.desc()).all()
    except SQLAlchemyError as exc:
        logger.exception(
            "list_batches query failed tenant=%s status=%s warehouse_id=%s",
            tid,
            status,
            warehouse_id,
        )
        try:
            db.rollback()
        except Exception:
            pass
        return []

    out: list[ProductionBatchRead] = []
    for batch in rows:
        try:
            out.append(serialize_batch(db, batch, check_shortages=True))
        except Exception as exc:
            logger.warning("list_batches skip batch_id=%s: %s", getattr(batch, "id", None), exc)
    return out


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
    """Backward-compatible alias — starts collecting phase."""
    return start_collecting(db, tenant_id=tenant_id, batch_id=batch_id)


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
    from .reservations.reservation_service import release_production_reservations

    release_production_reservations(
        db, tenant_id=int(tenant_id), production_batch_id=int(batch_id), reason="cancelled"
    )
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

    plan_pids = {int(r.component_product_id) for r in agg_rows}
    plan_products = (
        {p.id: p for p in db.query(Product).filter(Product.id.in_(plan_pids)).all()} if plan_pids else {}
    )
    for row in agg_rows:
        pid = int(row.component_product_id)
        p_img = plan_products.get(pid)
        req = float(row.required)
        snap_stock = build_location_stock(
            db,
            tenant_id=int(batch.tenant_id),
            warehouse_id=int(batch.warehouse_id),
            product_id=pid,
            available_only=True,
            pick_eligible_only=True,
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
                product_image_url=((p_img.image_url or "").strip() or None if p_img else None),
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
    del db, tenant_id, batch_id, body, performed_by_user_id
    raise ProductionBatchError(
        "Użyj przepływu WMS: zbieranie → produkcja → finish-production → rozlokowanie PW.",
        code="deprecated_path",
    )


def _load_batch_entity(db: Session, *, tenant_id: int, batch_id: int) -> ProductionBatch:
    batch = (
        db.query(ProductionBatch)
        .options(
            joinedload(ProductionBatch.lines)
            .joinedload(ProductionBatchLine.composition)
            .selectinload(ProductComposition.lines)
        )
        .filter(ProductionBatch.id == int(batch_id), ProductionBatch.tenant_id == int(tenant_id))
        .first()
    )
    if batch is None:
        raise ProductionBatchError("Partia nie istnieje.", code="not_found")
    return batch


def _sanitize_lot_token(raw: str | None) -> str | None:
    token = str(raw or "").strip()
    return token or None


def _init_collection_tasks(db: Session, batch: ProductionBatch) -> dict[str, Any]:
    from .production_execution.collection_task_builder import build_collection_task_row
    from .production_shortages.batch_analysis_service import assert_batch_can_start_collection

    assert_batch_can_start_collection(db, batch)
    plan = build_batch_pick_plan(db, tenant_id=int(batch.tenant_id), batch_id=int(batch.id))
    pids = {int(c.component_product_id) for c in plan.aggregated_components}
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()} if pids else {}
    tasks: list[dict[str, Any]] = []
    for comp in plan.aggregated_components:
        pid = int(comp.component_product_id)
        p = products.get(pid)
        tasks.append(
            build_collection_task_row(
                component_product_id=pid,
                product_name=str(comp.product_name),
                product_sku=comp.product_sku,
                product=p,
                required_qty=float(comp.required),
            )
        )
    return {"tasks": tasks}


def get_collection_state(db: Session, *, tenant_id: int, batch_id: int) -> BatchCollectionStateRead:
    from .production_execution.collection_task_builder import hydrate_collection_tasks
    from .production_execution.collection_location_service import preferred_location_ids_from_plan_rows

    batch = _load_batch_entity(db, tenant_id=tenant_id, batch_id=batch_id)
    raw = getattr(batch, "collection_state_json", None)
    tasks_raw: list[dict[str, Any]] = []
    if raw:
        try:
            tasks_raw = (json.loads(str(raw)).get("tasks") or [])
        except json.JSONDecodeError:
            tasks_raw = []
    plan = build_batch_pick_plan(db, tenant_id=int(batch.tenant_id), batch_id=int(batch.id))
    pref_by_product = {
        int(c.component_product_id): preferred_location_ids_from_plan_rows([c])
        for c in plan.aggregated_components
    }
    tasks_raw = hydrate_collection_tasks(
        db,
        tenant_id=int(batch.tenant_id),
        warehouse_id=int(batch.warehouse_id),
        tasks_raw=tasks_raw,
        preferred_by_product=pref_by_product,
    )
    if getattr(batch, "materials_reserved", False):
        from .reservations.reservation_service import reservations_to_collection_hints

        hints = reservations_to_collection_hints(
            db, tenant_id=int(batch.tenant_id), production_batch_id=int(batch.id)
        )
        for t in tasks_raw:
            pid = int(t.get("component_product_id") or 0)
            rows = hints.get(pid) or []
            if not rows:
                continue
            if not t.get("selected_location_id"):
                first = rows[0]
                t["selected_location_id"] = int(first["location_id"])
                t["location_id"] = int(first["location_id"])
                t["location_code"] = str(first.get("location_code") or "")
                t["selected_batch_number"] = first.get("batch_number")
                t["selected_lot"] = first.get("lot")
                t["selected_serial_number"] = first.get("serial_number")
                t["collected_qty"] = float(t.get("collected_qty") or 0)
            pref = pref_by_product.setdefault(pid, set())
            for r in rows:
                pref.add(int(r["location_id"]))
    # WMS: never show GOTOWE for picks that were never inventory-committed (legacy JSON-only).
    if not is_erp_interface(batch):
        from .production_execution.collection_pick_commit_service import (
            sync_collected_from_events,
            parse_picked_slices,
            picked_slices_total_qty,
        )

        healed = False
        for t in tasks_raw:
            sync_collected_from_events(t)
            qty = float(t.get("collected_qty") or 0)
            if qty <= 1e-9:
                continue
            slices = parse_picked_slices(t.get("picked_slices"))
            if abs(picked_slices_total_qty(slices) - qty) > 1e-2 or not slices:
                # Keep pick_events only when slices cover them; otherwise reset inconsistent legacy.
                t["collected_qty"] = 0.0
                t["picked_slices"] = []
                t["pick_events"] = []
                healed = True
            req = float(t.get("required_qty") or 0)
            t["remaining_qty"] = round(max(0.0, req - float(t.get("collected_qty") or 0)), 4)
        if healed:
            batch.collection_state_json = json.dumps({"tasks": tasks_raw}, ensure_ascii=False)
            batch.updated_at = datetime.utcnow()
            db.flush()
    else:
        for t in tasks_raw:
            req = float(t.get("required_qty") or 0)
            t["remaining_qty"] = round(max(0.0, req - float(t.get("collected_qty") or 0)), 4)
    try:
        # Strip internal keys that are not on CollectionTaskRead / nested models
        safe_tasks: list[dict[str, Any]] = []
        for t in tasks_raw:
            row = dict(t)
            # pick_events may include picked_slices — CollectionPickEventRead ignores extras
            events = []
            for ev in row.get("pick_events") or []:
                if not isinstance(ev, dict):
                    continue
                events.append(
                    {
                        "event_id": str(ev.get("event_id") or ""),
                        "location_id": int(ev.get("location_id") or 0),
                        "location_code": str(ev.get("location_code") or ""),
                        "quantity": float(ev.get("quantity") or 0),
                        "system_available_qty": ev.get("system_available_qty"),
                        "suggested_qty": ev.get("suggested_qty"),
                        "discrepancy": float(ev.get("discrepancy") or 0),
                        "picked_at": ev.get("picked_at"),
                    }
                )
            row["pick_events"] = events
            row.pop("picked_slices", None)
            safe_tasks.append(row)
        tasks = [CollectionTaskRead(**t) for t in safe_tasks]
    except Exception as exc:
        logger.exception("get_collection_state task validation failed batch_id=%s", batch_id)
        raise ProductionBatchError(
            f"Niepoprawny stan zbierania: {exc}",
            code="invalid_collection_state",
        ) from exc
    from .production_execution.collection_pick_commit_service import task_is_collection_complete

    done = sum(1 for t in tasks if task_is_collection_complete(t))
    total = len(tasks)
    pct = round(100.0 * done / total, 1) if total else 0.0
    from .production_execution.collection_job_header import build_batch_collection_header

    return BatchCollectionStateRead(
        batch_id=int(batch.id),
        status=str(batch.status),
        header=build_batch_collection_header(db, batch),
        tasks=tasks,
        collected_count=done,
        total_count=total,
        progress_percent=pct,
    )


def release_batch_to_wms(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    released_by_user_id: int | None = None,
) -> ProductionBatchRead:
    batch = _load_batch_entity(db, tenant_id=tenant_id, batch_id=batch_id)
    if str(batch.status) not in ("draft", "planned"):
        raise ProductionBatchError(
            "Wydanie do WMS możliwe tylko dla partii zaplanowanych.",
            code="invalid_status",
        )
    if getattr(batch, "released_to_wms_at", None) is not None:
        return serialize_batch(db, batch)
    if is_erp_interface(batch):
        raise ProductionBatchError(
            "Partia jest w interfejsie ERP. Użyj realizacji w ERP.",
            code="erp_interface",
        )
    from .production_shortages.batch_analysis_service import assert_batch_can_start_collection

    try:
        assert_batch_can_start_collection(db, batch)
    except ProductionBatchError as exc:
        raise ProductionBatchError(
            str(exc.message),
            code="insufficient_stock",
            shortages=getattr(exc, "shortages", None) or [],
        ) from exc
    batch.released_to_wms_at = datetime.utcnow()
    batch.execution_interface = WMS_INTERFACE
    batch.released_by_user_id = int(released_by_user_id) if released_by_user_id else None
    batch.updated_at = datetime.utcnow()
    db.flush()
    try:
        from .production_execution.production_domain_activity import emit_production_released

        num = getattr(batch, "number", None) or getattr(batch, "batch_number", None)
        lbl = str(num).strip() if num else f"BAT-{int(batch.id)}"
        emit_production_released(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
            batch_id=int(batch.id),
            actor_user_id=int(released_by_user_id) if released_by_user_id else None,
            label=lbl,
        )
    except Exception:
        logger.exception("production activity RELEASED failed batch_id=%s", batch.id)
    logger.info(
        "[production.release_wms] batch_id=%s released_by=%s",
        batch.id,
        released_by_user_id,
    )
    return serialize_batch(db, batch)


def start_collecting(db: Session, *, tenant_id: int, batch_id: int) -> ProductionBatchRead:
    batch = _load_batch_entity(db, tenant_id=tenant_id, batch_id=batch_id)
    if str(batch.status) in TERMINAL:
        raise ProductionBatchError("Partia jest zamknięta.", code="terminal_status")
    if str(batch.status) == "collecting":
        return serialize_batch(db, batch)
    if str(batch.status) not in ("draft", "planned"):
        raise ProductionBatchError("Nie można rozpocząć zbierania w tym statusie.", code="invalid_status")
    if not is_erp_interface(batch) and getattr(batch, "released_to_wms_at", None) is None:
        raise ProductionBatchError(
            "Partia nie została wydana do WMS. Użyj akcji „Wydaj do WMS” w ERP.",
            code="not_released",
        )
    state = _init_collection_tasks(db, batch)
    batch.collection_state_json = json.dumps(state, ensure_ascii=False)
    batch.status = "collecting"
    batch.started_at = batch.started_at or datetime.utcnow()
    from .reservations.reservation_service import lock_production_reservations

    lock_production_reservations(db, tenant_id=int(tenant_id), production_batch_id=int(batch_id))
    batch.updated_at = datetime.utcnow()
    db.flush()
    try:
        from .production_execution.production_domain_activity import emit_production_collection_started

        num = getattr(batch, "number", None) or getattr(batch, "batch_number", None)
        lbl = str(num).strip() if num else f"BAT-{int(batch.id)}"
        emit_production_collection_started(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
            batch_id=int(batch.id),
            label=lbl,
        )
    except Exception:
        logger.exception("production activity COLLECTION_STARTED failed batch_id=%s", batch.id)
    return serialize_batch(db, batch)


def update_collection_task(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    body: BatchCollectionUpdateBody,
) -> BatchCollectionStateRead:
    batch = _load_batch_entity(db, tenant_id=tenant_id, batch_id=batch_id)
    if str(batch.status) != "collecting":
        raise ProductionBatchError("Partia nie jest w fazie zbierania.", code="invalid_status")
    raw = getattr(batch, "collection_state_json", None) or "{}"
    try:
        data = json.loads(str(raw))
    except json.JSONDecodeError:
        data = {"tasks": []}
    found = False
    target_task: dict[str, Any] | None = None
    for t in data.get("tasks") or []:
        if str(t.get("task_key")) == str(body.task_key) or str(t.get("component_product_id")) == str(body.task_key):
            target_task = t
            found = True
            break
    if not found or target_task is None:
        raise ProductionBatchError("Zadanie zbierania nie istnieje.", code="task_not_found")

    action = str(getattr(body, "action", None) or "confirm_pick").strip().lower()
    if action == "report_shortage":
        from .production_execution.collection_pick_commit_service import report_collection_shortage

        report_collection_shortage(target_task)
        batch.collection_state_json = json.dumps(data, ensure_ascii=False)
        batch.updated_at = datetime.utcnow()
        db.flush()
        return get_collection_state(db, tenant_id=tenant_id, batch_id=batch_id)

    # WMS: confirm pick = operational fact → consume inventory now; finish only posts RW.
    # ERP paper: keep reservation sync + legacy consume-on-finish (no physical pick commit).
    if not is_erp_interface(batch):
        from .production_execution.collection_pick_commit_service import commit_collection_task_pick

        try:
            commit_collection_task_pick(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(batch.warehouse_id),
                task=target_task,
                collected_qty=float(body.collected_qty),
                location_id=int(body.location_id) if body.location_id else None,
                batch_number=body.batch_number,
                lot=body.lot,
                serial_number=body.serial_number,
                expiry_date=body.expiry_date,
            )
        except ValueError as exc:
            raise ProductionBatchError(str(exc), code="insufficient_stock") from exc
    else:
        # ERP: treat collected_qty as running total (legacy single-location UX)
        target_task["collected_qty"] = round(float(body.collected_qty), 4)
        if body.location_id is not None and int(body.location_id) > 0:
            target_task["selected_location_id"] = int(body.location_id)
            target_task["location_id"] = int(body.location_id)
        if body.batch_number is not None:
            target_task["selected_batch_number"] = str(body.batch_number).strip()
        if body.lot is not None:
            target_task["selected_lot"] = str(body.lot).strip()
        if body.serial_number is not None:
            target_task["selected_serial_number"] = str(body.serial_number).strip()
        if body.expiry_date is not None:
            target_task["selected_expiry_date"] = body.expiry_date.isoformat()

    batch.collection_state_json = json.dumps(data, ensure_ascii=False)
    batch.updated_at = datetime.utcnow()
    if getattr(batch, "materials_reserved", False) and is_erp_interface(batch):
        from .reservations.reservation_service import (
            ReservationError,
            sync_production_reservation_from_collection_task,
        )

        task_pid = int(body.task_key) if str(body.task_key).isdigit() else 0
        task_pid = int(target_task.get("component_product_id") or task_pid)
        try:
            sync_production_reservation_from_collection_task(
                db,
                tenant_id=tenant_id,
                production_batch_id=int(batch_id),
                component_product_id=task_pid,
                location_id=int(body.location_id) if body.location_id else None,
                batch_number=body.batch_number,
                serial_number=body.serial_number,
                quantity=float(body.collected_qty),
                ignore_locked=True,
            )
        except ReservationError as exc:
            raise ProductionBatchError(str(exc), code=getattr(exc, "code", "reservation_error")) from exc
    db.flush()
    return get_collection_state(db, tenant_id=tenant_id, batch_id=batch_id)


def finish_collecting(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    performed_by_user_id: int | None = None,
) -> ProductionBatchRead:
    batch = _load_batch_entity(db, tenant_id=tenant_id, batch_id=batch_id)
    if str(batch.status) != "collecting":
        raise ProductionBatchError("Partia nie jest w fazie zbierania.", code="invalid_status")
    state = get_collection_state(db, tenant_id=tenant_id, batch_id=batch_id)
    if state.collected_count < state.total_count:
        raise ProductionBatchError("Nie zebrano wszystkich materiałów.", code="collection_incomplete")

    raw_state = getattr(batch, "collection_state_json", None) or "{}"
    try:
        raw_data = json.loads(str(raw_state))
    except json.JSONDecodeError:
        raw_data = {"tasks": []}
    raw_tasks = list(raw_data.get("tasks") or [])
    from .production_execution.collection_pick_commit_service import (
        sync_collected_from_events,
        collection_tasks_have_committed_picks,
        parse_pick_events,
        slices_from_committed_tasks,
        task_is_collection_complete,
    )

    for t in raw_tasks:
        sync_collected_from_events(t)

    # Allocations from per-location pick history (not a single selected_location_id).
    totals: dict[int, float] = {}
    allocs: list[ComponentAllocationWrite] = []
    try:
        for t in raw_tasks:
            if not task_is_collection_complete(t):
                continue
            pid = int(t.get("component_product_id") or 0)
            if pid <= 0:
                continue
            events = parse_pick_events(t.get("pick_events"))
            by_loc: dict[int, float] = {}
            if events:
                for ev in events:
                    loc_id = int(ev.get("location_id") or 0)
                    qty = float(ev.get("quantity") or 0)
                    if loc_id > 0 and qty > 1e-9:
                        by_loc[loc_id] = by_loc.get(loc_id, 0.0) + qty
            else:
                # Legacy single-location mark
                loc_id = int(t.get("selected_location_id") or t.get("location_id") or 0)
                qty = float(t.get("collected_qty") or 0)
                if loc_id > 0 and qty > 1e-9:
                    by_loc[loc_id] = qty
            if not by_loc:
                continue
            totals[pid] = round(sum(by_loc.values()), 4)
            for loc_id, qty in by_loc.items():
                allocs.append(
                    ComponentAllocationWrite(
                        line_snapshot_id=pid,
                        location_id=int(loc_id),
                        quantity=float(qty),
                        batch_number=_sanitize_lot_token(t.get("selected_batch_number")),
                        lot=_sanitize_lot_token(t.get("selected_lot")),
                        serial_number=_sanitize_lot_token(t.get("selected_serial_number")),
                    )
                )
    except Exception as exc:
        raise ProductionBatchError(
            f"Niepoprawne dane zbierania komponentów: {exc}",
            code="invalid_collection_allocation",
        ) from exc

    use_committed = collection_tasks_have_committed_picks(raw_tasks)
    if not allocs:
        # All components shortage-reported with zero picks — advance without RW.
        if all(task_is_collection_complete(t) for t in raw_tasks):
            from .reservations.reservation_service import consume_production_reservations

            consume_production_reservations(db, tenant_id=int(tenant_id), production_batch_id=int(batch_id))
            batch.status = "in_progress"
            batch.collecting_completed_at = datetime.utcnow()
            batch.updated_at = datetime.utcnow()
            db.flush()
            return serialize_batch(db, batch)
        raise ProductionBatchError(
            "Brak lokalizacji / ilości do zużycia materiałów — dokończ skan lokalizacji.",
            code="collection_locations_missing",
        )
    try:
        _consume_batch_materials(
            db,
            batch,
            totals=totals,
            component_allocations=allocs,
            performed_by_user_id=performed_by_user_id,
            committed_slices_by_product=(
                slices_from_committed_tasks(raw_tasks) if use_committed else None
            ),
        )
    except ProductionBatchError:
        raise
    except ValueError as exc:
        logger.exception(
            "finish_collecting consume ValueError batch_id=%s tenant_id=%s",
            batch_id,
            tenant_id,
        )
        raise ProductionBatchError(str(exc), code="insufficient_stock") from exc
    except IntegrityError as exc:
        logger.exception(
            "finish_collecting IntegrityError batch_id=%s tenant_id=%s",
            batch_id,
            tenant_id,
        )
        raise ProductionBatchError(
            "Nie udało się utworzyć dokumentu RW — konflikt zapisu.",
            code="rw_integrity_error",
        ) from exc
    from .reservations.reservation_service import consume_production_reservations

    consume_production_reservations(db, tenant_id=int(tenant_id), production_batch_id=int(batch_id))
    batch.status = "in_progress"
    batch.collecting_completed_at = datetime.utcnow()
    batch.updated_at = datetime.utcnow()
    db.flush()
    try:
        from .production_execution.production_domain_activity import (
            emit_production_collection_completed,
            emit_production_rw_created,
            emit_production_started,
        )

        num = getattr(batch, "number", None) or getattr(batch, "batch_number", None)
        lbl = str(num).strip() if num else f"BAT-{int(batch.id)}"
        emit_production_collection_completed(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
            batch_id=int(batch.id),
            actor_user_id=performed_by_user_id,
            label=lbl,
        )
        if batch.rw_stock_document_id:
            rw = db.query(StockDocument).filter(StockDocument.id == int(batch.rw_stock_document_id)).first()
            emit_production_rw_created(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
                stock_document_id=int(batch.rw_stock_document_id),
                document_number=str(getattr(rw, "document_number", None) or "") or None,
                batch_id=int(batch.id),
                actor_user_id=performed_by_user_id,
                label=lbl,
            )
        emit_production_started(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
            batch_id=int(batch.id),
            actor_user_id=performed_by_user_id,
            label=lbl,
        )
    except Exception:
        logger.exception("production activity after collecting failed batch_id=%s", batch.id)
    return serialize_batch(db, batch)


def _consume_batch_materials(
    db: Session,
    batch: ProductionBatch,
    *,
    totals: dict[int, float],
    component_allocations: list[ComponentAllocationWrite],
    performed_by_user_id: int | None,
    committed_slices_by_product: dict[int, list[dict[str, Any]]] | None = None,
) -> StockDocument:
    if batch.rw_stock_document_id:
        doc = db.query(StockDocument).filter(StockDocument.id == int(batch.rw_stock_document_id)).first()
        if doc is not None:
            return doc
    from .production_execution.rw_lot_lines import (
        RwIssueSlice,
        create_rw_lines_for_lot_groups,
        group_slices_by_lot,
        lot_key,
        slices_from_committed_dicts,
    )

    alloc_map = _resolve_batch_allocations(db, batch, totals=totals, component_allocations=component_allocations)
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
    all_cost_slices: list = []
    for pid, allocs in alloc_map.items():
        if not allocs:
            continue
        qty_sum = sum(q for _, q in allocs)
        unit_net = float(get_product_current_cost(db, int(batch.tenant_id), int(pid)).get("purchase_net") or 0)
        alloc_meta = {
            (int(a.line_snapshot_id), int(a.location_id)): a for a in (component_allocations or [])
        }
        committed = (committed_slices_by_product or {}).get(int(pid))
        issue_slices: list[RwIssueSlice] = []
        if committed:
            committed_total = sum(float(s.get("quantity") or 0) for s in committed)
            if abs(committed_total - float(qty_sum)) > 1e-2:
                raise ProductionBatchError(
                    f"Zatwierdzone pobranie składnika #{pid} ({committed_total}) ≠ wymagane ({qty_sum}).",
                    code="allocation_mismatch",
                )
            issue_slices = slices_from_committed_dicts(int(pid), committed)
        else:
            for loc_id, qty in allocs:
                meta = alloc_meta.get((int(pid), int(loc_id)))
                slices = consume_production_material_slices(
                    db,
                    tenant_id=int(batch.tenant_id),
                    warehouse_id=int(batch.warehouse_id),
                    product_id=int(pid),
                    location_id=int(loc_id),
                    quantity=float(qty),
                    batch_number=(meta.batch_number or meta.lot) if meta else None,
                    lot=meta.lot if meta else None,
                    serial_number=meta.serial_number if meta else None,
                )
                for sl in slices:
                    bn, exp = lot_key(sl.batch_number, sl.expiry_date)
                    issue_slices.append(
                        RwIssueSlice(
                            product_id=int(pid),
                            quantity=float(sl.quantity),
                            location_id=int(loc_id),
                            batch_number=bn,
                            expiry_date=exp,
                            serial_number=(meta.serial_number if meta else None),
                            unit_cost_net=sl.unit_cost_net,
                            cost_source=sl.cost_source,
                            source_document_id=sl.source_document_id,
                            source_document_line_id=sl.source_document_line_id,
                        )
                    )
        from .production_execution.material_cost_layers import ensure_rw_issue_slices_costed

        issue_slices = ensure_rw_issue_slices_costed(
            db,
            issue_slices,
            tenant_id=int(batch.tenant_id),
            warehouse_id=int(batch.warehouse_id),
            product_id=int(pid),
        )
        grouped = group_slices_by_lot(issue_slices)
        lines = create_rw_lines_for_lot_groups(
            db,
            rw_doc=rw_doc,
            grouped=grouped,
            unit_net_by_product={int(pid): unit_net},
        )
        for key, group in grouped.items():
            line = lines.get(key)
            if line is None:
                continue
            for s in group:
                exp = s.expiry_date if s.expiry_date < NO_EXPIRY_SENTINEL else None
                _append_rw_issue_with_product_audit(
                    db,
                    rw_doc=rw_doc,
                    line=line,
                    slice_qty=float(s.quantity),
                    from_location_id=int(s.location_id),
                    batch_number=s.batch_number or "",
                    expiry_date=exp,
                    serial_number=s.serial_number,
                    performed_by_user_id=performed_by_user_id,
                    production_batch_id=int(batch.id),
                    product_id=int(pid),
                    unit_price_net=float(s.unit_cost_net) if s.unit_cost_net is not None else None,
                    cost_source=s.cost_source,
                    source_document_id=s.source_document_id,
                    source_document_line_id=s.source_document_line_id,
                )
                all_cost_slices.append(
                    {
                        "product_id": int(pid),
                        "quantity": float(s.quantity),
                        "unit_cost_net": float(s.unit_cost_net or 0),
                        "cost_source": s.cost_source,
                        "batch_number": s.batch_number or None,
                        "location_id": int(s.location_id),
                        "source_document_id": s.source_document_id,
                        "source_document_line_id": s.source_document_line_id,
                    }
                )
    batch.rw_stock_document_id = int(rw_doc.id)
    if all_cost_slices:
        from .production_execution.cost_service import freeze_material_cost_on_entity
        from .production_execution.material_cost_layers import cost_breakdown_from_slices

        freeze_material_cost_on_entity(batch, cost_breakdown_from_slices(all_cost_slices))
    return rw_doc


def update_production_progress(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    body: BatchProductionProgressBody,
    performed_by_user_id: int | None = None,
) -> ProductionBatchRead:
    batch = _load_batch_entity(db, tenant_id=tenant_id, batch_id=batch_id)
    if str(batch.status) != "in_progress":
        raise ProductionBatchError("Partia nie jest w produkcji.", code="invalid_status")
    line = next((ln for ln in batch.lines or [] if int(ln.id) == int(body.line_id)), None)
    if line is None:
        raise ProductionBatchError("Linia partii nie istnieje.", code="line_not_found")
    try:
        from .production_execution.fg_output_register_service import (
            register_produced_quantity_for_batch_line,
        )

        register_produced_quantity_for_batch_line(
            db,
            batch=batch,
            line=line,
            add_quantity=float(body.add_quantity),
            fg_batch_number=body.fg_batch_number,
            fg_expiry_date=body.fg_expiry_date,
            fg_serial_numbers=body.fg_serial_numbers,
            idempotency_key=getattr(body, "idempotency_key", None),
            performed_by_user_id=performed_by_user_id,
            auto_finish=True,
        )
    except ValueError as exc:
        msg = str(exc)
        code = "over_production" if "Przekroczono" in msg else "fg_traceability_invalid"
        if "Przekroczono" in msg:
            code = "over_production"
        elif "PW" in msg or "staging" in msg.lower():
            code = "pw_creation_failed"
        raise ProductionBatchError(msg, code=code) from exc
    db.flush()
    return serialize_batch(db, batch)


def finish_production(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    body: BatchProductionFinishBody | None = None,
) -> ProductionBatchRead:
    batch = _load_batch_entity(db, tenant_id=tenant_id, batch_id=batch_id)
    if str(batch.status) in ("awaiting_putaway", "putaway", "completed"):
        return serialize_batch(db, batch)
    if str(batch.status) != "in_progress":
        raise ProductionBatchError("Partia nie jest w produkcji.", code="invalid_status")
    for ln in batch.lines or []:
        if float(ln.completed_quantity or 0) < float(ln.planned_quantity) - 1e-6:
            raise ProductionBatchError("Nie wszystkie produkty są wyprodukowane.", code="production_incomplete")
    payload = body or BatchProductionFinishBody()
    supplied_identity = bool(
        payload.fg_batch_number or payload.fg_expiry_date or payload.fg_serial_numbers
    )
    if supplied_identity and len(batch.lines or []) != 1:
        raise ProductionBatchError(
            "Tożsamość wyrobów partii wielopozycyjnej podawaj w raportach postępu linii.",
            code="fg_traceability_invalid",
        )
    try:
        from .production_execution.fg_output_register_service import (
            sum_output_qty_for_line,
            transition_batch_after_full_production_idempotent,
        )
        from .production_execution.production_fg_traceability import (
            append_fg_serials,
            assert_fg_traceability_ready,
            lock_fg_traceability_snapshot,
            read_fg_traceability_snapshot,
        )

        # Legacy one-shot finish: lock identity when no progressive outputs yet.
        for ln in batch.lines or []:
            if sum_output_qty_for_line(db, batch_line_id=int(ln.id)) > 1e-9:
                continue
            product = db.query(Product).filter(Product.id == int(ln.product_id)).first()
            if product is None:
                raise ValueError("Produkt wyrobu gotowego nie istnieje.")
            was_missing = read_fg_traceability_snapshot(ln) is None
            lock_fg_traceability_snapshot(
                db,
                entity=ln,
                tenant_id=int(batch.tenant_id),
                warehouse_id=int(batch.warehouse_id),
                product=product,
                batch_number=payload.fg_batch_number if len(batch.lines or []) == 1 else None,
                expiry_date=payload.fg_expiry_date if len(batch.lines or []) == 1 else None,
            )
            if was_missing:
                append_fg_serials(
                    db,
                    entity=ln,
                    tenant_id=int(batch.tenant_id),
                    product_id=int(ln.product_id),
                    delta_quantity=float(ln.completed_quantity or 0),
                    serial_numbers=payload.fg_serial_numbers if len(batch.lines or []) == 1 else [],
                )
            assert_fg_traceability_ready(
                ln, expected_quantity=float(ln.completed_quantity or 0)
            )
        transition_batch_after_full_production_idempotent(db, batch=batch)
    except ValueError as exc:
        msg = str(exc)
        code = "fg_traceability_invalid"
        if "PW" in msg or "staging" in msg.lower():
            code = "pw_creation_failed"
        raise ProductionBatchError(msg, code=code) from exc
    try:
        from .production_execution.production_domain_activity import emit_production_pw_created

        num = getattr(batch, "number", None) or getattr(batch, "batch_number", None)
        lbl = str(num).strip() if num else f"BAT-{int(batch.id)}"
        pw_id = None
        for ln in batch.lines or []:
            if getattr(ln, "pw_stock_document_id", None):
                pw_id = int(ln.pw_stock_document_id)
                break
        if pw_id:
            pw = db.query(StockDocument).filter(StockDocument.id == pw_id).first()
            emit_production_pw_created(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
                stock_document_id=pw_id,
                document_number=str(getattr(pw, "document_number", None) or "") or None,
                batch_id=int(batch.id),
                actor_user_id=None,
                label=lbl,
            )
    except Exception:
        logger.exception("production activity PW_CREATED failed batch_id=%s", batch.id)
    return serialize_batch(db, batch)


def finish_putaway(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    body: BatchPutawayBody,
    performed_by_user_id: int | None = None,
) -> ProductionBatchCompleteResultRead:
    del db, tenant_id, batch_id, body, performed_by_user_id
    raise ProductionBatchError(
        "Użyj modułu Rozlokowanie (WMS) dla dokumentów PW.",
        code="deprecated_path",
    )
