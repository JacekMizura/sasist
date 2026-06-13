"""P5.4–P5.8 — consolidation plan lifecycle (generate, MM drafts, completion)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Sequence

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from ...models.product import Product
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.tenant_warehouse import TenantWarehouse
from ...models.warehouse import Warehouse
from ..commercial_availability_service import commercially_sellable_qty
from ..document_number_service import assign_series_number_to_stock_document
from ..fulfillment_assignment.phase_constants import (
    PHASE_CONSOLIDATION_REQUIRED,
    PHASE_CONSOLIDATING,
    PHASE_FULFILLMENT_ASSIGNED,
    is_consolidation_wave_blocked,
)
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL
from ..relocation_document_series_service import assert_relocation_document_series_configured
from ..wms_mm_internal_placeholder import get_or_create_mm_placeholder_fks
from .constants import (
    ITEM_STATUS_CANCELLED,
    ITEM_STATUS_EXCEPTION,
    ITEM_STATUS_IN_TRANSIT,
    ITEM_STATUS_MM_CREATED,
    ITEM_STATUS_RECEIVED,
    ITEM_STATUS_STAGED,
    ITEM_STATUS_TO_PICK,
    ITEM_STATUS_PICKED,
    ITEM_STATUS_WAITING,
    MM_CREATION_SOURCE_CONSOLIDATION,
    PLAN_STATUS_CANCELLED,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_DRAFT,
    PLAN_STATUS_EXCEPTION,
    PLAN_STATUS_IN_PROGRESS,
    PLAN_STATUS_MANUAL_REVIEW_REQUIRED,
    PLAN_STATUS_OPEN,
    PLAN_STATUS_READY,
    PLAN_STATUS_READY_FOR_STAGING,
    PLAN_STATUS_STAGING,
    RESULT_CONSOLIDATION_NOT_REQUIRED,
    RESULT_MANUAL_REVIEW_REQUIRED,
    RESULT_PLAN_CREATED,
)
from .mm_receipt_sync import sync_plan_item_from_mm
from .progress_helpers import progress_fields_for_items
from .alert_service import recompute_plan_exception_status
from .staging_service import recompute_plan_staging_readiness, try_complete_staging
from .feasibility_service import (
    OrderLineDemand,
    _avail_at,
    _eligible_warehouses,
    _order_line_demands,
    _warehouse_name_map,
    analyze_order_consolidation_feasibility,
    resolve_preferred_consolidation_target_id,
)


class OrderConsolidationPlanError(ValueError):
    """Blocked or invalid consolidation plan operation."""


@dataclass(frozen=True)
class GenerateConsolidationPlanResult:
    outcome: str
    message: str | None = None
    plan_id: int | None = None
    target_warehouse_id: int | None = None
    target_warehouse_name: str | None = None
    feasibility: dict | None = None


@dataclass(frozen=True)
class GenerateMmDraftsResult:
    plan_id: int
    documents_created: int
    items_updated: int


def _pick_source_warehouse(
    db: Session,
    tenant_id: int,
    product_id: int,
    quantity: float,
    target_id: int,
    warehouse_ids: Sequence[int],
    cache: Dict[tuple[int, int, int], float],
) -> int | None:
    best_wid: int | None = None
    best_avail = -1.0
    for wid in warehouse_ids:
        if int(wid) == int(target_id):
            continue
        avail = _avail_at(db, tenant_id, int(wid), product_id, cache)
        if avail + 1e-9 >= quantity and avail > best_avail:
            best_avail = avail
            best_wid = int(wid)
    if best_wid is not None:
        return best_wid
    for wid in warehouse_ids:
        if int(wid) == int(target_id):
            continue
        avail = _avail_at(db, tenant_id, int(wid), product_id, cache)
        if avail > best_avail:
            best_avail = avail
            best_wid = int(wid)
    return best_wid if best_avail > 1e-9 else None


def _active_plan(db: Session, order_id: int) -> OrderConsolidationPlan | None:
    return (
        db.query(OrderConsolidationPlan)
        .filter(
            OrderConsolidationPlan.order_id == int(order_id),
            OrderConsolidationPlan.status.in_(tuple(PLAN_STATUS_OPEN)),
        )
        .order_by(OrderConsolidationPlan.id.desc())
        .first()
    )


def _visible_plan(db: Session, order_id: int) -> OrderConsolidationPlan | None:
    plan = _active_plan(db, int(order_id))
    if plan is not None:
        return plan
    return (
        db.query(OrderConsolidationPlan)
        .filter(
            OrderConsolidationPlan.order_id == int(order_id),
            OrderConsolidationPlan.status == PLAN_STATUS_COMPLETED,
        )
        .order_by(OrderConsolidationPlan.id.desc())
        .first()
    )


def generate_consolidation_plan(db: Session, order_id: int) -> GenerateConsolidationPlanResult:
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if order is None:
        raise OrderConsolidationPlanError("Zamówienie nie istnieje.")

    if is_consolidation_wave_blocked(getattr(order, "fulfillment_assignment_phase", None)):
        raise OrderConsolidationPlanError("Plan konsolidacji już istnieje lub konsolidacja w toku.")

    existing = _active_plan(db, int(order.id))
    if existing is not None:
        raise OrderConsolidationPlanError("Aktywny plan konsolidacji już istnieje dla tego zamówienia.")

    analysis = analyze_order_consolidation_feasibility(db, int(order.id))
    feasibility_dict = {
        "warehouses": [
            {
                "warehouse_id": r.warehouse_id,
                "warehouse_name": r.warehouse_name,
                "total_lines": r.total_lines,
                "available_lines": r.available_lines,
                "missing_units": r.missing_units,
                "skus_to_pull": r.skus_to_pull,
            }
            for r in analysis.warehouses
        ],
        "best_consolidation_candidate": analysis.best_consolidation_candidate,
        "single_warehouse_fulfillment_id": analysis.single_warehouse_fulfillment_id,
        "manual_review_required": analysis.manual_review_required,
    }

    if analysis.single_warehouse_fulfillment_id is not None:
        wid = int(analysis.single_warehouse_fulfillment_id)
        order.warehouse_id = wid
        order.fulfillment_assignment_phase = PHASE_FULFILLMENT_ASSIGNED
        db.add(order)
        db.flush()
        return GenerateConsolidationPlanResult(
            outcome=RESULT_CONSOLIDATION_NOT_REQUIRED,
            message="Całe zamówienie można zrealizować z jednego magazynu.",
            target_warehouse_id=wid,
            target_warehouse_name=analysis.single_warehouse_fulfillment_name,
            feasibility=feasibility_dict,
        )

    if analysis.manual_review_required or analysis.best_consolidation_candidate is None:
        return GenerateConsolidationPlanResult(
            outcome=RESULT_MANUAL_REVIEW_REQUIRED,
            message=analysis.message or "Wymagana ręczna weryfikacja operatora.",
            feasibility=feasibility_dict,
        )

    target_id = int(analysis.best_consolidation_candidate)
    tid = int(order.tenant_id)
    lines = _order_line_demands(db, int(order.id))
    eligible = _eligible_warehouses(db, tid)
    wh_ids = [int(tw.warehouse_id) for tw in eligible]
    cache: Dict[tuple[int, int, int], float] = {}

    plan = OrderConsolidationPlan(
        order_id=int(order.id),
        target_warehouse_id=target_id,
        status=PLAN_STATUS_DRAFT,
    )
    db.add(plan)
    db.flush()

    for line in lines:
        target_avail = _avail_at(db, tid, target_id, line.product_id, cache)
        if target_avail + 1e-9 >= line.quantity:
            db.add(
                OrderConsolidationPlanItem(
                    plan_id=int(plan.id),
                    product_id=line.product_id,
                    quantity=line.quantity,
                    source_warehouse_id=target_id,
                    target_warehouse_id=target_id,
                    status=ITEM_STATUS_TO_PICK,
                )
            )
            continue

        need = line.quantity - target_avail
        source_id = _pick_source_warehouse(db, tid, line.product_id, need, target_id, wh_ids, cache)
        if source_id is None:
            raise OrderConsolidationPlanError(
                f"Brak magazynu źródłowego dla produktu {line.product_id}."
            )
        db.add(
            OrderConsolidationPlanItem(
                plan_id=int(plan.id),
                product_id=line.product_id,
                quantity=need,
                source_warehouse_id=int(source_id),
                target_warehouse_id=target_id,
                status=ITEM_STATUS_WAITING,
            )
        )

    order.warehouse_id = target_id
    order.fulfillment_assignment_phase = PHASE_CONSOLIDATION_REQUIRED
    db.add(order)
    db.flush()

    names = _warehouse_name_map(db, [target_id])
    return GenerateConsolidationPlanResult(
        outcome=RESULT_PLAN_CREATED,
        message="Utworzono plan konsolidacji.",
        plan_id=int(plan.id),
        target_warehouse_id=target_id,
        target_warehouse_name=names.get(target_id),
        feasibility=feasibility_dict,
    )


def _create_inter_warehouse_mm_draft(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    source_warehouse_id: int,
    target_warehouse_id: int,
) -> StockDocument:
    series = assert_relocation_document_series_configured(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(source_warehouse_id),
    )
    sid, did = get_or_create_mm_placeholder_fks(db, tenant_id)
    now = datetime.utcnow()
    doc = StockDocument(
        tenant_id=int(tenant_id),
        document_type="MM",
        supplier_id=sid,
        delivery_id=did,
        warehouse_id=int(source_warehouse_id),
        source_warehouse_id=int(source_warehouse_id),
        destination_warehouse_id=int(target_warehouse_id),
        order_id=int(order_id),
        status="draft",
        receiving_status="NEW",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        creation_source=MM_CREATION_SOURCE_CONSOLIDATION,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.flush()
    wh_code = str(getattr(series, "code", None) or "").strip() or None
    assign_series_number_to_stock_document(db, doc, series, warehouse_code=wh_code)
    return doc


def generate_mm_drafts_for_plan(db: Session, plan_id: int) -> GenerateMmDraftsResult:
    plan = db.query(OrderConsolidationPlan).filter(OrderConsolidationPlan.id == int(plan_id)).first()
    if plan is None:
        raise OrderConsolidationPlanError("Plan konsolidacji nie istnieje.")
    if plan.status not in (PLAN_STATUS_DRAFT, PLAN_STATUS_READY, PLAN_STATUS_IN_PROGRESS):
        raise OrderConsolidationPlanError(f"Plan w statusie {plan.status} — nie można generować MM.")

    order = db.query(Order).filter(Order.id == int(plan.order_id)).first()
    if order is None:
        raise OrderConsolidationPlanError("Zamówienie powiązane z planem nie istnieje.")

    items = (
        db.query(OrderConsolidationPlanItem)
        .filter(OrderConsolidationPlanItem.plan_id == int(plan.id))
        .order_by(OrderConsolidationPlanItem.id)
        .all()
    )
    pending = [
        it
        for it in items
        if it.status == ITEM_STATUS_WAITING
        and int(it.source_warehouse_id) != int(it.target_warehouse_id)
    ]
    if not pending:
        refresh_consolidation_plan_progress(db, int(plan.id))
        if plan.status == PLAN_STATUS_COMPLETED:
            return GenerateMmDraftsResult(plan_id=int(plan.id), documents_created=0, items_updated=0)
        raise OrderConsolidationPlanError("Brak pozycji oczekujących na MM.")

    grouped: dict[tuple[int, int], list[OrderConsolidationPlanItem]] = defaultdict(list)
    for it in pending:
        key = (int(it.source_warehouse_id), int(it.target_warehouse_id))
        grouped[key].append(it)

    docs_created = 0
    items_updated = 0
    tid = int(order.tenant_id)

    for (source_id, target_id), group_items in grouped.items():
        doc = _create_inter_warehouse_mm_draft(
            db,
            tenant_id=tid,
            order_id=int(order.id),
            source_warehouse_id=source_id,
            target_warehouse_id=target_id,
        )
        docs_created += 1
        for it in group_items:
            db.add(
                StockDocumentItem(
                    document_id=int(doc.id),
                    product_id=int(it.product_id),
                    ordered_quantity=float(it.quantity),
                    received_quantity=0.0,
                    quantity_putaway=0.0,
                    quantity=float(it.quantity),
                    batch_number="",
                    expiry_date=NO_EXPIRY_SENTINEL,
                )
            )
            it.stock_document_id = int(doc.id)
            it.status = ITEM_STATUS_MM_CREATED
            db.add(it)
            items_updated += 1

    plan.status = PLAN_STATUS_IN_PROGRESS
    order.fulfillment_assignment_phase = PHASE_CONSOLIDATING
    db.add(plan)
    db.add(order)
    db.flush()
    refresh_consolidation_plan_progress(db, int(plan.id))
    return GenerateMmDraftsResult(
        plan_id=int(plan.id),
        documents_created=docs_created,
        items_updated=items_updated,
    )


def refresh_consolidation_plan_progress(db: Session, plan_id: int) -> bool:
    """Sync item statuses from linked MM docs; complete plan when all received."""
    plan = db.query(OrderConsolidationPlan).filter(OrderConsolidationPlan.id == int(plan_id)).first()
    if plan is None:
        return False

    if str(plan.status).upper() in (PLAN_STATUS_CANCELLED,):
        return False

    items = db.query(OrderConsolidationPlanItem).filter(OrderConsolidationPlanItem.plan_id == int(plan.id)).all()
    changed = False
    for it in items:
        st = str(it.status).upper()
        if st in (ITEM_STATUS_RECEIVED, ITEM_STATUS_TO_PICK, ITEM_STATUS_PICKED, ITEM_STATUS_STAGED, ITEM_STATUS_CANCELLED) or st in ITEM_STATUS_EXCEPTION:
            continue
        if int(it.source_warehouse_id) == int(it.target_warehouse_id):
            if st != ITEM_STATUS_TO_PICK:
                it.status = ITEM_STATUS_TO_PICK
                changed = True
                db.add(it)
            continue
        if sync_plan_item_from_mm(db, it, plan):
            changed = True

    recompute_plan_exception_status(db, plan)

    active_items = [it for it in items if str(it.status).upper() != ITEM_STATUS_CANCELLED]
    plan_st = str(plan.status).upper()

    if plan_st not in (
        PLAN_STATUS_CANCELLED,
        PLAN_STATUS_COMPLETED,
        PLAN_STATUS_EXCEPTION,
        PLAN_STATUS_MANUAL_REVIEW_REQUIRED,
        PLAN_STATUS_STAGING,
        PLAN_STATUS_READY_FOR_STAGING,
    ):
        if any(str(it.status).upper() in (ITEM_STATUS_MM_CREATED, ITEM_STATUS_IN_TRANSIT) for it in active_items):
            if plan.status != PLAN_STATUS_IN_PROGRESS:
                plan.status = PLAN_STATUS_IN_PROGRESS
                changed = True
                db.add(plan)
        elif plan.status == PLAN_STATUS_DRAFT and any(
            str(it.status).upper() in (ITEM_STATUS_MM_CREATED, ITEM_STATUS_RECEIVED) for it in items
        ):
            plan.status = PLAN_STATUS_READY
            changed = True
            db.add(plan)

    recompute_plan_staging_readiness(db, plan)
    db.refresh(plan)
    plan_st = str(plan.status).upper()

    if plan_st == PLAN_STATUS_STAGING and active_items:
        if all(str(it.status).upper() == ITEM_STATUS_STAGED for it in active_items):
            if not any(str(it.status).upper() in ITEM_STATUS_EXCEPTION for it in active_items):
                order = db.query(Order).filter(Order.id == int(plan.order_id)).first()
                if order is not None:
                    try_complete_staging(db, plan, order)
                    changed = True

    if changed:
        db.flush()
    return changed


def _product_name_map(db: Session, product_ids: Sequence[int]) -> Dict[int, str]:
    if not product_ids:
        return {}
    rows = db.query(Product).filter(Product.id.in_(tuple(int(x) for x in product_ids))).all()
    return {int(p.id): str(p.name or p.sku or f"#{p.id}") for p in rows}


def _build_plan_payload(
    db: Session,
    plan: OrderConsolidationPlan,
    *,
    order_number: str | None = None,
) -> dict:
    items = (
        db.query(OrderConsolidationPlanItem)
        .filter(OrderConsolidationPlanItem.plan_id == int(plan.id))
        .order_by(OrderConsolidationPlanItem.id)
        .all()
    )
    wh_ids = {int(plan.target_warehouse_id)}
    product_ids: set[int] = set()
    for it in items:
        wh_ids.add(int(it.source_warehouse_id))
        wh_ids.add(int(it.target_warehouse_id))
        product_ids.add(int(it.product_id))
    names = _warehouse_name_map(db, list(wh_ids))
    product_names = _product_name_map(db, list(product_ids))
    progress = progress_fields_for_items(items, names)
    from .consolidation_context import deposit_progress_fields

    deposit = deposit_progress_fields(db, plan)
    return {
        "id": int(plan.id),
        "order_id": int(plan.order_id),
        "order_number": order_number,
        "target_warehouse_id": int(plan.target_warehouse_id),
        "target_warehouse_name": names.get(int(plan.target_warehouse_id)),
        "status": str(plan.status),
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        **deposit,
        **progress,
        "items": [
            {
                "id": int(it.id),
                "product_id": int(it.product_id),
                "product_name": product_names.get(int(it.product_id)),
                "quantity": float(it.quantity),
                "source_warehouse_id": int(it.source_warehouse_id),
                "source_warehouse_name": names.get(int(it.source_warehouse_id)),
                "target_warehouse_id": int(it.target_warehouse_id),
                "target_warehouse_name": names.get(int(it.target_warehouse_id)),
                "status": str(it.status),
                "stock_document_id": int(it.stock_document_id) if it.stock_document_id else None,
            }
            for it in items
        ],
    }


def get_order_consolidation_plan_read(db: Session, order_id: int) -> dict | None:
    plan = _visible_plan(db, int(order_id))
    if plan is None:
        return None

    refresh_consolidation_plan_progress(db, int(plan.id))
    db.refresh(plan)
    order = db.query(Order).filter(Order.id == int(plan.order_id)).first()
    order_number = str(order.number) if order and order.number else None
    return _build_plan_payload(db, plan, order_number=order_number)


def assert_order_eligible_for_wave(db: Session, order: Order) -> None:
    from .constants import PLAN_STATUS_BLOCKS_FULFILLMENT

    if is_consolidation_wave_blocked(getattr(order, "fulfillment_assignment_phase", None)):
        raise OrderConsolidationPlanError(
            "Zamówienie oczekuje na konsolidację — nie można utworzyć fali kompletacji."
        )
    blocking = (
        db.query(OrderConsolidationPlan)
        .filter(
            OrderConsolidationPlan.order_id == int(order.id),
            OrderConsolidationPlan.status.in_(tuple(PLAN_STATUS_BLOCKS_FULFILLMENT)),
        )
        .first()
    )
    if blocking is not None:
        raise OrderConsolidationPlanError(
            f"Plan konsolidacji w statusie {blocking.status} — fala kompletacji zablokowana."
        )
