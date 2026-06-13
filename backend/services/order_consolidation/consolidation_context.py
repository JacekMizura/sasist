"""P5.4 — shared consolidation staging / deposit context (no new tables)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.consolidation_rack import RackSegment
from ...models.order import Order
from ...models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from .constants import (
    ITEM_STATUS_PICKED,
    ITEM_STATUS_RECEIVED,
    ITEM_STATUS_STAGED,
    ITEM_STATUS_TO_PICK,
    PLAN_STATUS_CANCELLED,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_STAGING,
)
from .progress_helpers import is_cross_warehouse_transfer
from .staging_service import _shelf_info_for_order


def active_consolidation_plan(db: Session, order_id: int) -> OrderConsolidationPlan | None:
    row = (
        db.query(OrderConsolidationPlan)
        .filter(
            OrderConsolidationPlan.order_id == int(order_id),
            OrderConsolidationPlan.status != PLAN_STATUS_CANCELLED,
        )
        .order_by(OrderConsolidationPlan.id.desc())
        .first()
    )
    return row


def order_in_consolidation_staging_pick(db: Session, order_id: int) -> bool:
    """Local picking allowed: plan STAGING + shelf assigned."""
    plan = active_consolidation_plan(db, int(order_id))
    if plan is None or str(plan.status).upper() != PLAN_STATUS_STAGING:
        return False
    seg = db.query(RackSegment.id).filter(RackSegment.order_id == int(order_id)).first()
    return seg is not None


def consolidation_blocks_ready_to_pack(db: Session, order_id: int) -> bool:
    """True while consolidation plan exists and is not COMPLETED."""
    plan = active_consolidation_plan(db, int(order_id))
    if plan is None:
        return False
    return str(plan.status).upper() != PLAN_STATUS_COMPLETED


def consolidation_packing_ready(db: Session, order_id: int) -> bool:
    plan = active_consolidation_plan(db, int(order_id))
    if plan is None:
        return True
    if str(plan.status).upper() != PLAN_STATUS_COMPLETED:
        return False
    items = (
        db.query(OrderConsolidationPlanItem)
        .filter(OrderConsolidationPlanItem.plan_id == int(plan.id))
        .all()
    )
    active = [it for it in items if str(it.status).upper() != "CANCELLED"]
    if not active:
        return True
    return all(str(it.status).upper() == ITEM_STATUS_STAGED for it in active)


def plan_item_for_product(
    db: Session,
    *,
    plan_id: int,
    product_id: int,
) -> OrderConsolidationPlanItem | None:
    return (
        db.query(OrderConsolidationPlanItem)
        .filter(
            OrderConsolidationPlanItem.plan_id == int(plan_id),
            OrderConsolidationPlanItem.product_id == int(product_id),
        )
        .order_by(OrderConsolidationPlanItem.id.asc())
        .first()
    )


def local_plan_item_for_product(
    db: Session,
    *,
    order_id: int,
    product_id: int,
) -> OrderConsolidationPlanItem | None:
    plan = active_consolidation_plan(db, int(order_id))
    if plan is None:
        return None
    for it in (
        db.query(OrderConsolidationPlanItem)
        .filter(OrderConsolidationPlanItem.plan_id == int(plan.id))
        .all()
    ):
        if int(it.product_id) != int(product_id):
            continue
        if is_cross_warehouse_transfer(it):
            continue
        return it
    return None


def mark_local_plan_item_picked(
    db: Session,
    *,
    order_id: int,
    product_id: int,
) -> OrderConsolidationPlanItem | None:
    """After WMS pick: TO_PICK → PICKED (not STAGED)."""
    item = local_plan_item_for_product(db, order_id=int(order_id), product_id=int(product_id))
    if item is None:
        return None
    st = str(item.status).upper()
    if st == ITEM_STATUS_STAGED:
        return item
    if st not in (ITEM_STATUS_TO_PICK, ITEM_STATUS_RECEIVED):
        return item
    item.status = ITEM_STATUS_PICKED
    db.add(item)
    db.flush()
    return item


def deposit_progress_fields(db: Session, plan: OrderConsolidationPlan) -> dict:
    items = (
        db.query(OrderConsolidationPlanItem)
        .filter(OrderConsolidationPlanItem.plan_id == int(plan.id))
        .all()
    )
    active = [it for it in items if str(it.status).upper() != "CANCELLED"]
    mm_items = [it for it in active if is_cross_warehouse_transfer(it)]
    local_items = [it for it in active if not is_cross_warehouse_transfer(it)]

    def _staged_count(rows: list[OrderConsolidationPlanItem]) -> int:
        return sum(1 for it in rows if str(it.status).upper() == ITEM_STATUS_STAGED)

    mm_staged = _staged_count(mm_items)
    local_staged = _staged_count(local_items)
    staged_total = _staged_count(active)
    all_staged = staged_total == len(active) and len(active) > 0
    plan_st = str(plan.status).upper()
    packing_ready = plan_st == PLAN_STATUS_COMPLETED and all_staged

    shelf = _shelf_info_for_order(db, int(plan.order_id))
    return {
        "mm_staged_count": mm_staged,
        "mm_staging_total": len(mm_items),
        "mm_staging_label": f"{mm_staged} / {len(mm_items)} odłożone" if mm_items else "—",
        "local_staged_count": local_staged,
        "local_staging_total": len(local_items),
        "local_staging_label": f"{local_staged} / {len(local_items)} odłożone" if local_items else "—",
        "staged_count": staged_total,
        "staging_total": len(active),
        "staging_label": f"{staged_total} / {len(active)} na półce" if active else "—",
        "packing_ready": packing_ready,
        "packing_ready_label": "READY_TO_PACK" if packing_ready else "NIEGOTOWE",
        "shelf_label": shelf["shelf_label"] if shelf else None,
        "segment_id": shelf["segment_id"] if shelf else None,
    }


def picking_detail_extras(db: Session, order_id: int) -> dict:
    if not order_in_consolidation_staging_pick(db, int(order_id)):
        return {
            "consolidation_active": False,
            "consolidation_shelf_label": None,
            "consolidation_plan_id": None,
            "pending_shelf_deposit": False,
        }
    plan = active_consolidation_plan(db, int(order_id))
    shelf = _shelf_info_for_order(db, int(order_id))
    return {
        "consolidation_active": True,
        "consolidation_shelf_label": shelf["shelf_label"] if shelf else None,
        "consolidation_plan_id": int(plan.id) if plan else None,
        "pending_shelf_deposit": False,
    }


def item_eligible_for_shelf_deposit(item: OrderConsolidationPlanItem) -> bool:
    return str(item.status).upper() in (ITEM_STATUS_RECEIVED, ITEM_STATUS_PICKED)


def staging_status_label(staged: int, total: int) -> str:
    if total <= 0:
        return "NOT_STAGED"
    if staged <= 0:
        return "NOT_STAGED"
    if staged < total:
        return "PARTIALLY_STAGED"
    return "STAGED"
