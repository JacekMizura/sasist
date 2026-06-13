"""P5.3 — consolidation rack staging (Sellasist-style, no staging inventory)."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from ...models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from ...models.order import Order
from ...models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from ..fulfillment_assignment.phase_constants import PHASE_FULFILLMENT_ASSIGNED
from .constants import (
    ITEM_STATUS_CANCELLED,
    ITEM_STATUS_EXCEPTION,
    ITEM_STATUS_RECEIVED,
    ITEM_STATUS_STAGED,
    PLAN_STATUS_CANCELLED,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_EXCEPTION,
    PLAN_STATUS_IN_PROGRESS,
    PLAN_STATUS_MANUAL_REVIEW_REQUIRED,
    PLAN_STATUS_READY_FOR_STAGING,
    PLAN_STATUS_STAGING,
)
from .progress_helpers import (
    compute_staging_progress,
    format_segment_label,
    is_cross_warehouse_transfer,
    progress_fields_for_items,
    segment_label_for_row,
)


class ConsolidationStagingError(ValueError):
    """Invalid staging or rack segment operation."""


def release_rack_segments_for_order(db: Session, order_id: int) -> int:
    """Clear all consolidation shelf slots for an order. Returns count cleared."""
    rows = db.query(RackSegment).filter(RackSegment.order_id == int(order_id)).all()
    for seg in rows:
        seg.order_id = None
        seg.fill_percent = 0.0
        db.add(seg)
    if rows:
        db.flush()
    return len(rows)


def _load_plan(db: Session, plan_id: int, tenant_id: int) -> tuple[OrderConsolidationPlan, Order]:
    row = (
        db.query(OrderConsolidationPlan, Order)
        .join(Order, Order.id == OrderConsolidationPlan.order_id)
        .filter(OrderConsolidationPlan.id == int(plan_id), Order.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise ConsolidationStagingError("Plan konsolidacji nie istnieje.")
    return row[0], row[1]


def _plan_items(db: Session, plan_id: int) -> list[OrderConsolidationPlanItem]:
    return (
        db.query(OrderConsolidationPlanItem)
        .filter(OrderConsolidationPlanItem.plan_id == int(plan_id))
        .order_by(OrderConsolidationPlanItem.id)
        .all()
    )


def _active_items(items: list[OrderConsolidationPlanItem]) -> list[OrderConsolidationPlanItem]:
    return [it for it in items if str(it.status).upper() != ITEM_STATUS_CANCELLED]


def _segment_for_order(db: Session, order_id: int) -> RackSegment | None:
    return db.query(RackSegment).filter(RackSegment.order_id == int(order_id)).first()


def _segment_with_context(db: Session, segment_id: int) -> tuple[RackSegment, ConsolidationRackLevel, ConsolidationRack] | None:
    row = (
        db.query(RackSegment, ConsolidationRackLevel, ConsolidationRack)
        .join(ConsolidationRackLevel, ConsolidationRackLevel.id == RackSegment.level_id)
        .join(ConsolidationRack, ConsolidationRack.id == ConsolidationRackLevel.rack_id)
        .filter(RackSegment.id == int(segment_id))
        .first()
    )
    if row is None:
        return None
    return row[0], row[1], row[2]


def find_free_segment(db: Session, *, tenant_id: int, warehouse_id: int) -> RackSegment | None:
    return (
        db.query(RackSegment)
        .join(ConsolidationRackLevel, ConsolidationRackLevel.id == RackSegment.level_id)
        .join(ConsolidationRack, ConsolidationRack.id == ConsolidationRackLevel.rack_id)
        .filter(
            ConsolidationRack.tenant_id == int(tenant_id),
            ConsolidationRack.warehouse_id == int(warehouse_id),
            RackSegment.order_id.is_(None),
        )
        .order_by(ConsolidationRack.id, ConsolidationRackLevel.level_index, RackSegment.segment_index)
        .first()
    )


def update_segment_fill_from_plan(db: Session, plan_id: int, order_id: int) -> None:
    seg = _segment_for_order(db, int(order_id))
    if seg is None:
        return
    items = _active_items(_plan_items(db, int(plan_id)))
    staged, total = compute_staging_progress(items)
    seg.fill_percent = round(100.0 * staged / total, 1) if total > 0 else 0.0
    db.add(seg)
    db.flush()


def try_complete_staging(db: Session, plan: OrderConsolidationPlan, order: Order) -> bool:
    if str(plan.status).upper() != PLAN_STATUS_STAGING:
        return False
    items = _active_items(_plan_items(db, int(plan.id)))
    if not items:
        return False
    if any(str(it.status).upper() in ITEM_STATUS_EXCEPTION for it in items):
        return False
    if not all(str(it.status).upper() == ITEM_STATUS_STAGED for it in items):
        return False
    plan.status = PLAN_STATUS_COMPLETED
    order.fulfillment_assignment_phase = PHASE_FULFILLMENT_ASSIGNED
    order.warehouse_id = int(plan.target_warehouse_id)
    db.add(plan)
    db.add(order)
    db.flush()
    return True


def recompute_plan_staging_readiness(db: Session, plan: OrderConsolidationPlan) -> None:
    """After MM sync: IN_PROGRESS → READY_FOR_STAGING when transfers received; never auto-assign shelf."""
    st = str(plan.status).upper()
    if st in (PLAN_STATUS_CANCELLED, PLAN_STATUS_COMPLETED, PLAN_STATUS_STAGING, PLAN_STATUS_EXCEPTION, PLAN_STATUS_MANUAL_REVIEW_REQUIRED):
        return
    items = _active_items(_plan_items(db, int(plan.id)))
    if not items:
        return
    if any(str(it.status).upper() in ITEM_STATUS_EXCEPTION for it in items):
        return
    transfers = [it for it in items if is_cross_warehouse_transfer(it)]
    transfers_ready = (
        not transfers
        or all(str(it.status).upper() in (ITEM_STATUS_RECEIVED, ITEM_STATUS_STAGED) for it in transfers)
    )
    all_received = all(str(it.status).upper() in (ITEM_STATUS_RECEIVED, ITEM_STATUS_STAGED) for it in items)
    if transfers_ready and all_received and st not in (PLAN_STATUS_READY_FOR_STAGING, PLAN_STATUS_STAGING):
        plan.status = PLAN_STATUS_READY_FOR_STAGING
        db.add(plan)
        db.flush()


def start_consolidation_staging(db: Session, *, plan_id: int, tenant_id: int) -> dict:
    plan, order = _load_plan(db, plan_id, tenant_id)
    st = str(plan.status).upper()
    if st not in (PLAN_STATUS_READY_FOR_STAGING, PLAN_STATUS_STAGING):
        raise ConsolidationStagingError(
            f"Rozkładanie można rozpocząć tylko gdy plan jest READY_FOR_STAGING (obecnie: {st})."
        )
    if st == PLAN_STATUS_EXCEPTION:
        raise ConsolidationStagingError("Plan ma wyjątki — rozkładanie zablokowane.")

    existing = _segment_for_order(db, int(order.id))
    if existing is not None:
        ctx = _segment_with_context(db, int(existing.id))
        label = segment_label_for_row(ctx[0], ctx[1], ctx[2]) if ctx else f"#{existing.id}"
        if st != PLAN_STATUS_STAGING:
            plan.status = PLAN_STATUS_STAGING
            db.add(plan)
            db.flush()
        return {
            "plan_id": int(plan.id),
            "status": str(plan.status),
            "segment_id": int(existing.id),
            "shelf_label": label,
            "message": "Półka już przypisana do tego zamówienia.",
        }

    seg = find_free_segment(db, tenant_id=int(tenant_id), warehouse_id=int(plan.target_warehouse_id))
    if seg is None:
        raise ConsolidationStagingError("Brak wolnych półek kompletacyjnych w magazynie docelowym.")

    seg.order_id = int(order.id)
    seg.fill_percent = 0.0
    db.add(seg)
    plan.status = PLAN_STATUS_STAGING
    db.add(plan)
    db.flush()

    ctx = _segment_with_context(db, int(seg.id))
    label = segment_label_for_row(ctx[0], ctx[1], ctx[2]) if ctx else f"#{seg.id}"
    return {
        "plan_id": int(plan.id),
        "status": PLAN_STATUS_STAGING,
        "segment_id": int(seg.id),
        "shelf_label": label,
        "message": "Przypisano półkę kompletacyjną.",
    }


def stage_plan_item(db: Session, *, plan_id: int, plan_item_id: int, tenant_id: int) -> dict:
    plan, order = _load_plan(db, plan_id, tenant_id)
    if str(plan.status).upper() != PLAN_STATUS_STAGING:
        raise ConsolidationStagingError("Odkładanie produktów wymaga statusu STAGING i przypisanej półki.")
    if _segment_for_order(db, int(order.id)) is None:
        raise ConsolidationStagingError("Brak przypisanej półki — rozpocznij rozkładanie.")

    item = (
        db.query(OrderConsolidationPlanItem)
        .filter(
            OrderConsolidationPlanItem.id == int(plan_item_id),
            OrderConsolidationPlanItem.plan_id == int(plan.id),
        )
        .first()
    )
    if item is None:
        raise ConsolidationStagingError("Pozycja planu nie istnieje.")
    st = str(item.status).upper()
    if st in ITEM_STATUS_EXCEPTION:
        raise ConsolidationStagingError(f"Pozycja w statusie {st} — nie można odłożyć na półkę.")
    if st == ITEM_STATUS_STAGED:
        return {"plan_id": int(plan.id), "plan_item_id": int(item.id), "status": ITEM_STATUS_STAGED, "completed": False}
    if st != ITEM_STATUS_RECEIVED:
        raise ConsolidationStagingError(f"Pozycja musi być RECEIVED przed odłożeniem (obecnie: {st}).")

    item.status = ITEM_STATUS_STAGED
    db.add(item)
    update_segment_fill_from_plan(db, int(plan.id), int(order.id))
    completed = try_complete_staging(db, plan, order)
    return {
        "plan_id": int(plan.id),
        "plan_item_id": int(item.id),
        "status": ITEM_STATUS_STAGED,
        "completed": completed,
        "plan_status": str(plan.status),
    }


def resolve_segment_by_label(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    code: str,
) -> dict:
    """Resolve scan like RK-01/A2 to order for packing."""
    needle = (code or "").strip().upper().replace(" ", "")
    if not needle:
        raise ConsolidationStagingError("Kod półki jest wymagany.")

    segments = (
        db.query(RackSegment, ConsolidationRackLevel, ConsolidationRack)
        .join(ConsolidationRackLevel, ConsolidationRackLevel.id == RackSegment.level_id)
        .join(ConsolidationRack, ConsolidationRack.id == ConsolidationRackLevel.rack_id)
        .filter(
            ConsolidationRack.tenant_id == int(tenant_id),
            ConsolidationRack.warehouse_id == int(warehouse_id),
            RackSegment.order_id.isnot(None),
        )
        .all()
    )
    for seg, level, rack in segments:
        label = format_segment_label(rack.name, level, seg).upper().replace(" ", "")
        if label == needle or label.endswith(needle) or needle.endswith(label):
            order = db.query(Order).filter(Order.id == int(seg.order_id)).first()
            return {
                "segment_id": int(seg.id),
                "shelf_label": format_segment_label(rack.name, level, seg),
                "order_id": int(seg.order_id),
                "order_number": str(order.number) if order and order.number else None,
            }
    raise ConsolidationStagingError("Nie znaleziono zamówienia dla podanej półki kompletacyjnej.")


def _shelf_info_for_order(db: Session, order_id: int) -> dict | None:
    seg = _segment_for_order(db, int(order_id))
    if seg is None:
        return None
    ctx = _segment_with_context(db, int(seg.id))
    if ctx is None:
        return {"segment_id": int(seg.id), "shelf_label": f"#{seg.id}", "fill_percent": float(seg.fill_percent or 0)}
    s, level, rack = ctx
    return {
        "segment_id": int(s.id),
        "shelf_label": format_segment_label(rack.name, level, s),
        "fill_percent": float(s.fill_percent or 0),
    }


def list_staging_queue(
    db: Session,
    *,
    tenant_id: int,
    target_warehouse_id: int,
) -> list[dict]:
    from .plan_service import _warehouse_name_map, refresh_consolidation_plan_progress

    q = (
        db.query(OrderConsolidationPlan, Order)
        .join(Order, Order.id == OrderConsolidationPlan.order_id)
        .filter(
            Order.tenant_id == int(tenant_id),
            OrderConsolidationPlan.target_warehouse_id == int(target_warehouse_id),
            OrderConsolidationPlan.status.in_(
                (PLAN_STATUS_READY_FOR_STAGING, PLAN_STATUS_STAGING, PLAN_STATUS_IN_PROGRESS)
            ),
        )
        .order_by(OrderConsolidationPlan.updated_at.desc())
    )
    out: list[dict] = []
    for plan, order in q.all():
        refresh_consolidation_plan_progress(db, int(plan.id))
        db.refresh(plan)
        items = _plan_items(db, int(plan.id))
        wh_ids = {int(plan.target_warehouse_id)} | {int(it.source_warehouse_id) for it in items}
        names = _warehouse_name_map(db, list(wh_ids))
        progress = progress_fields_for_items(items, names)
        staged, stage_total = compute_staging_progress(_active_items(items))
        shelf = _shelf_info_for_order(db, int(order.id))
        out.append(
            {
                "id": int(plan.id),
                "order_id": int(order.id),
                "order_number": str(order.number or f"#{order.id}"),
                "status": str(plan.status),
                "transfers_received": progress["transfers_received"],
                "transfers_total": progress["transfers_total"],
                "progress_label": progress["progress_label"],
                "staged_count": staged,
                "staging_total": stage_total,
                "staging_label": f"{staged} / {stage_total} na półce" if stage_total else "—",
                "shelf_label": shelf["shelf_label"] if shelf else None,
                "segment_id": shelf["segment_id"] if shelf else None,
                "can_start_staging": str(plan.status).upper() == PLAN_STATUS_READY_FOR_STAGING,
            }
        )
    return out
