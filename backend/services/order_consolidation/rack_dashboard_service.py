"""P5.6 — consolidation rack occupancy dashboard (read-only projection)."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from ...models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from ...models.order import Order
from ...models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from .constants import (
    ITEM_STATUS_EXCEPTION,
    PLAN_STATUS_CANCELLED,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_EXCEPTION,
    PLAN_STATUS_MANUAL_REVIEW_REQUIRED,
    PLAN_STATUS_STAGING,
)
from .progress_helpers import format_segment_label, is_cross_warehouse_transfer, segment_slot_label
from .segment_capacity_service import build_segment_capacity_context

SEGMENT_STATE_FREE = "FREE"
SEGMENT_STATE_STAGING = "STAGING"
SEGMENT_STATE_READY_TO_PACK = "READY_TO_PACK"
SEGMENT_STATE_EXCEPTION = "EXCEPTION"


def _short_slot_label(level: ConsolidationRackLevel, segment: RackSegment) -> str:
    return segment_slot_label(level, segment)


def _progress_from_items(items: list[OrderConsolidationPlanItem]) -> dict:
    active = [it for it in items if str(it.status).upper() != "CANCELLED"]
    mm_items = [it for it in active if is_cross_warehouse_transfer(it)]
    local_items = [it for it in active if not is_cross_warehouse_transfer(it)]

    def _staged(rows: list[OrderConsolidationPlanItem]) -> int:
        return sum(1 for it in rows if str(it.status).upper() == "STAGED")

    mm_staged = _staged(mm_items)
    local_staged = _staged(local_items)
    staged_total = _staged(active)
    total = len(active)
    completion_percent = round(100.0 * staged_total / total, 1) if total > 0 else 0.0
    return {
        "mm_staged_count": mm_staged,
        "mm_staging_total": len(mm_items),
        "mm_staging_label": f"{mm_staged}/{len(mm_items)}" if mm_items else "—",
        "local_staged_count": local_staged,
        "local_staging_total": len(local_items),
        "local_staging_label": f"{local_staged}/{len(local_items)}" if local_items else "—",
        "staged_count": staged_total,
        "staging_total": total,
        "completion_percent": completion_percent,
    }


def _resolve_segment_state(
    order: Order | None,
    plan: OrderConsolidationPlan | None,
    items: list[OrderConsolidationPlanItem],
) -> str:
    if order is None:
        return SEGMENT_STATE_FREE
    plan_st = str(plan.status).upper() if plan else ""
    if plan_st in (PLAN_STATUS_EXCEPTION, PLAN_STATUS_MANUAL_REVIEW_REQUIRED):
        return SEGMENT_STATE_EXCEPTION
    if any(str(it.status).upper() in ITEM_STATUS_EXCEPTION for it in items):
        return SEGMENT_STATE_EXCEPTION
    fs = (getattr(order, "fulfillment_state", None) or "").strip().upper()
    if fs == "READY_TO_PACK" or plan_st == PLAN_STATUS_COMPLETED:
        return SEGMENT_STATE_READY_TO_PACK
    if plan_st == PLAN_STATUS_STAGING or plan is not None:
        return SEGMENT_STATE_STAGING
    return SEGMENT_STATE_STAGING


def _customer_name(order: Order | None) -> str | None:
    if order is None:
        return None
    from ..wms_packing_service import _packing_customer_name_from_order

    name = _packing_customer_name_from_order(order)
    return name if name and name != "—" else None


def _segment_payload(
    db: Session,
    *,
    segment: RackSegment,
    level: ConsolidationRackLevel,
    rack: ConsolidationRack,
    order: Order | None,
    plan: OrderConsolidationPlan | None,
    items: list[OrderConsolidationPlanItem],
) -> dict:
    state = _resolve_segment_state(order, plan, items)
    progress = _progress_from_items(items) if plan and items else None
    shelf_label = format_segment_label(str(rack.name), level, segment)
    slot_label = _short_slot_label(level, segment)
    packing_ready = state == SEGMENT_STATE_READY_TO_PACK
    payload = {
        "segment_id": int(segment.id),
        "slot_label": slot_label,
        "shelf_label": shelf_label,
        "state": state,
        "fill_percent": float(segment.fill_percent or 0),
        "order_id": int(order.id) if order else None,
        "order_number": str(order.number) if order and order.number else None,
        "customer_name": _customer_name(order),
        "order_status": str(order.status) if order and order.status else None,
        "plan_id": int(plan.id) if plan else None,
        "plan_status": str(plan.status) if plan else None,
        "fulfillment_state": str(order.fulfillment_state) if order and order.fulfillment_state else None,
        "packing_ready": packing_ready,
        "packing_ready_label": "READY_TO_PACK" if packing_ready else None,
        "completion_percent": progress["completion_percent"] if progress else 0.0,
        "mm_staging_label": progress["mm_staging_label"] if progress else None,
        "local_staging_label": progress["local_staging_label"] if progress else None,
        "length_mm": segment.length_mm,
        "width_mm": segment.width_mm,
        "height_mm": segment.height_mm,
        "capacity_dm3": segment.capacity_dm3,
    }
    if order is not None:
        ctx = build_segment_capacity_context(db, segment, level, rack, int(order.id))
        payload.update({
            "order_volume_dm3": ctx.get("order_volume_dm3"),
            "utilization_percent": ctx.get("utilization_percent"),
            "capacity_overflow": ctx.get("capacity_overflow"),
            "capacity_unknown": ctx.get("capacity_unknown"),
            "dimension_estimated": ctx.get("dimension_estimated"),
            "estimated_items_count": ctx.get("estimated_items_count"),
        })
    return payload


def build_consolidation_rack_dashboard(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> dict:
    """Single bulk load: racks → orders → plans → plan items (no per-segment queries)."""
    racks = (
        db.query(ConsolidationRack)
        .options(
            joinedload(ConsolidationRack.levels).joinedload(ConsolidationRackLevel.segments),
        )
        .filter(
            ConsolidationRack.tenant_id == int(tenant_id),
            ConsolidationRack.warehouse_id == int(warehouse_id),
        )
        .order_by(ConsolidationRack.id.asc())
        .all()
    )

    order_ids: set[int] = set()
    for rack in racks:
        for level in sorted(rack.levels or [], key=lambda x: (int(x.level_index), int(x.id))):
            for seg in sorted(level.segments or [], key=lambda x: int(x.segment_index)):
                if seg.order_id is not None:
                    order_ids.add(int(seg.order_id))

    orders_by_id: dict[int, Order] = {}
    if order_ids:
        rows = (
            db.query(Order)
            .filter(Order.tenant_id == int(tenant_id), Order.id.in_(order_ids))
            .all()
        )
        orders_by_id = {int(o.id): o for o in rows}

    plans_by_order: dict[int, OrderConsolidationPlan] = {}
    if order_ids:
        plan_rows = (
            db.query(OrderConsolidationPlan)
            .filter(
                OrderConsolidationPlan.order_id.in_(order_ids),
                OrderConsolidationPlan.status != PLAN_STATUS_CANCELLED,
            )
            .order_by(OrderConsolidationPlan.id.desc())
            .all()
        )
        for plan in plan_rows:
            oid = int(plan.order_id)
            if oid not in plans_by_order:
                plans_by_order[oid] = plan

    items_by_plan: dict[int, list[OrderConsolidationPlanItem]] = {}
    if plans_by_order:
        plan_ids = [int(p.id) for p in plans_by_order.values()]
        item_rows = (
            db.query(OrderConsolidationPlanItem)
            .filter(OrderConsolidationPlanItem.plan_id.in_(plan_ids))
            .all()
        )
        for it in item_rows:
            items_by_plan.setdefault(int(it.plan_id), []).append(it)

    summary = {
        "total_segments": 0,
        "free_count": 0,
        "occupied_count": 0,
        "ready_to_pack_count": 0,
        "exception_count": 0,
    }
    rack_payloads: list[dict] = []

    for rack in racks:
        level_payloads: list[dict] = []
        for level in sorted(rack.levels or [], key=lambda x: (int(x.level_index), int(x.id))):
            segment_payloads: list[dict] = []
            for seg in sorted(level.segments or [], key=lambda x: int(x.segment_index)):
                order = orders_by_id.get(int(seg.order_id)) if seg.order_id else None
                plan = plans_by_order.get(int(seg.order_id)) if seg.order_id else None
                items = items_by_plan.get(int(plan.id), []) if plan else []
                seg_data = _segment_payload(
                    db,
                    segment=seg,
                    level=level,
                    rack=rack,
                    order=order,
                    plan=plan,
                    items=items,
                )
                segment_payloads.append(seg_data)
                summary["total_segments"] += 1
                st = seg_data["state"]
                if st == SEGMENT_STATE_FREE:
                    summary["free_count"] += 1
                else:
                    summary["occupied_count"] += 1
                if st == SEGMENT_STATE_READY_TO_PACK:
                    summary["ready_to_pack_count"] += 1
                if st == SEGMENT_STATE_EXCEPTION:
                    summary["exception_count"] += 1
            level_payloads.append(
                {
                    "level_id": int(level.id),
                    "level_index": int(level.level_index),
                    "level_name": level.name,
                    "is_segmented": bool(level.is_segmented),
                    "segments": segment_payloads,
                }
            )
        rack_payloads.append(
            {
                "rack_id": int(rack.id),
                "rack_name": str(rack.name),
                "levels": level_payloads,
            }
        )

    total = int(summary["total_segments"])
    free = int(summary["free_count"])
    summary["remaining_percent"] = round(100.0 * free / total, 0) if total > 0 else 0.0

    return {
        "warehouse_id": int(warehouse_id),
        "racks": rack_payloads,
        "summary": summary,
    }
