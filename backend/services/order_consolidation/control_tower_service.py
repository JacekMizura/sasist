"""P5.8 — consolidation rack control tower (read-only operational monitoring)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from ...models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from ...models.order import Order
from ...models.order_consolidation_alert import OrderConsolidationAlert
from ...models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from ...models.product import Product
from .constants import (
    ITEM_STATUS_CANCELLED,
    ITEM_STATUS_STAGED,
    PLAN_STATUS_CANCELLED,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_EXCEPTION,
    PLAN_STATUS_MANUAL_REVIEW_REQUIRED,
)
from .feasibility_service import _warehouse_name_map
from .progress_helpers import format_segment_label, is_cross_warehouse_transfer
from .rack_dashboard_service import (
    SEGMENT_STATE_EXCEPTION,
    SEGMENT_STATE_FREE,
    SEGMENT_STATE_READY_TO_PACK,
    SEGMENT_STATE_STAGING,
    _customer_name,
    _progress_from_items,
    _resolve_segment_state,
)

ALERT_READY_TO_PACK_30 = "READY_TO_PACK_SLA_30"
ALERT_READY_TO_PACK_60 = "READY_TO_PACK_SLA_60"
ALERT_EXCEPTION = "EXCEPTION"
ALERT_MANUAL_REVIEW = "MANUAL_REVIEW_REQUIRED"

_SORT_TIER = {
    SEGMENT_STATE_EXCEPTION: 0,
    SEGMENT_STATE_READY_TO_PACK: 1,
    SEGMENT_STATE_STAGING: 2,
}


def _minutes_since(dt: datetime | None) -> int | None:
    if dt is None:
        return None
    delta = datetime.utcnow() - dt.replace(tzinfo=None)
    return max(0, int(delta.total_seconds() // 60))


def _missing_items(
    items: list[OrderConsolidationPlanItem],
    *,
    product_names: dict[int, str],
    warehouse_names: dict[int, str],
) -> list[dict]:
    out: list[dict] = []
    for it in items:
        st = str(it.status).upper()
        if st in (ITEM_STATUS_CANCELLED, ITEM_STATUS_STAGED):
            continue
        pid = int(it.product_id)
        wid = int(it.source_warehouse_id)
        out.append(
            {
                "plan_item_id": int(it.id),
                "product_id": pid,
                "product_name": product_names.get(pid, f"#{pid}"),
                "source_warehouse_id": wid,
                "source_warehouse_name": warehouse_names.get(wid, f"#{wid}"),
                "status": st,
            }
        )
    return out


def _build_alerts(
    *,
    state: str,
    plan_status: str,
    ready_to_pack_minutes: int | None,
    unresolved: list[OrderConsolidationAlert],
) -> list[dict]:
    alerts: list[dict] = []
    plan_st = plan_status.upper()

    if plan_st == PLAN_STATUS_MANUAL_REVIEW_REQUIRED:
        alerts.append(
            {
                "code": ALERT_MANUAL_REVIEW,
                "severity": "CRITICAL",
                "label": "MANUAL_REVIEW_REQUIRED",
            }
        )
    elif state == SEGMENT_STATE_EXCEPTION or plan_st == PLAN_STATUS_EXCEPTION:
        alerts.append(
            {
                "code": ALERT_EXCEPTION,
                "severity": "CRITICAL",
                "label": "EXCEPTION",
            }
        )

    if state == SEGMENT_STATE_READY_TO_PACK and ready_to_pack_minutes is not None:
        if ready_to_pack_minutes >= 60:
            alerts.append(
                {
                    "code": ALERT_READY_TO_PACK_60,
                    "severity": "CRITICAL",
                    "label": "READY_TO_PACK > 60 min",
                }
            )
        elif ready_to_pack_minutes >= 30:
            alerts.append(
                {
                    "code": ALERT_READY_TO_PACK_30,
                    "severity": "WARNING",
                    "label": "READY_TO_PACK > 30 min",
                }
            )

    for alert in unresolved:
        alerts.append(
            {
                "code": str(alert.code),
                "severity": str(alert.severity or "INFO").upper(),
                "label": str(alert.message),
                "alert_id": int(alert.id),
            }
        )
    return alerts


def _sort_key(row: dict) -> tuple:
    return (
        int(row["sort_tier"]),
        -(int(row.get("ready_to_pack_minutes") or 0)),
        -(int(row.get("occupied_minutes") or 0)),
        str(row.get("shelf_label") or ""),
    )


def build_consolidation_control_tower(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> dict:
    """Operational projection for supervisors — occupied shelves only, bulk-loaded."""
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
    total_segments = 0
    for rack in racks:
        for level in rack.levels or []:
            for seg in level.segments or []:
                total_segments += 1
                if seg.order_id is not None:
                    order_ids.add(int(seg.order_id))

    orders_by_id: dict[int, Order] = {}
    if order_ids:
        rows = db.query(Order).filter(Order.tenant_id == int(tenant_id), Order.id.in_(order_ids)).all()
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
    product_ids: set[int] = set()
    warehouse_ids: set[int] = {int(warehouse_id)}
    if plans_by_order:
        plan_ids = [int(p.id) for p in plans_by_order.values()]
        item_rows = db.query(OrderConsolidationPlanItem).filter(OrderConsolidationPlanItem.plan_id.in_(plan_ids)).all()
        for it in item_rows:
            items_by_plan.setdefault(int(it.plan_id), []).append(it)
            product_ids.add(int(it.product_id))
            warehouse_ids.add(int(it.source_warehouse_id))
            warehouse_ids.add(int(it.target_warehouse_id))

    product_names: dict[int, str] = {}
    if product_ids:
        for prod in db.query(Product).filter(Product.tenant_id == int(tenant_id), Product.id.in_(product_ids)).all():
            product_names[int(prod.id)] = str(prod.name or prod.sku or f"#{prod.id}")

    warehouse_names = _warehouse_name_map(db, list(warehouse_ids))

    alerts_by_plan: dict[int, list[OrderConsolidationAlert]] = {}
    if plans_by_order:
        alert_rows = (
            db.query(OrderConsolidationAlert)
            .filter(
                OrderConsolidationAlert.plan_id.in_([int(p.id) for p in plans_by_order.values()]),
                OrderConsolidationAlert.resolved.is_(False),
            )
            .all()
        )
        for alert in alert_rows:
            alerts_by_plan.setdefault(int(alert.plan_id), []).append(alert)

    shelves: list[dict] = []
    kpi = {
        "free_count": 0,
        "occupied_count": 0,
        "ready_to_pack_count": 0,
        "exception_count": 0,
        "avg_occupation_minutes": 0.0,
    }
    occupation_samples: list[int] = []

    for rack in racks:
        for level in sorted(rack.levels or [], key=lambda x: (int(x.level_index), int(x.id))):
            for seg in sorted(level.segments or [], key=lambda x: int(x.segment_index)):
                if seg.order_id is None:
                    kpi["free_count"] += 1
                    continue

                order = orders_by_id.get(int(seg.order_id))
                plan = plans_by_order.get(int(seg.order_id))
                items = items_by_plan.get(int(plan.id), []) if plan else []
                state = _resolve_segment_state(order, plan, items)
                progress = _progress_from_items(items) if plan and items else {}

                plan_status = str(plan.status) if plan else ""
                plan_st = plan_status.upper()
                occupied_since = plan.updated_at if plan else None
                occupied_minutes = _minutes_since(occupied_since)

                ready_since = plan.updated_at if plan and plan_st == PLAN_STATUS_COMPLETED else None
                ready_to_pack_minutes = _minutes_since(ready_since) if state == SEGMENT_STATE_READY_TO_PACK else None

                if occupied_minutes is not None:
                    occupation_samples.append(int(occupied_minutes))

                kpi["occupied_count"] += 1
                if state == SEGMENT_STATE_READY_TO_PACK:
                    kpi["ready_to_pack_count"] += 1
                if state == SEGMENT_STATE_EXCEPTION:
                    kpi["exception_count"] += 1

                unresolved = alerts_by_plan.get(int(plan.id), []) if plan else []
                row_alerts = _build_alerts(
                    state=state,
                    plan_status=plan_status,
                    ready_to_pack_minutes=ready_to_pack_minutes,
                    unresolved=unresolved,
                )

                sort_tier = _SORT_TIER.get(state, 3)
                if plan_st == PLAN_STATUS_MANUAL_REVIEW_REQUIRED:
                    sort_tier = 0

                target_wh_id = int(plan.target_warehouse_id) if plan else int(warehouse_id)
                shelves.append(
                    {
                        "segment_id": int(seg.id),
                        "shelf_label": format_segment_label(str(rack.name), level, seg),
                        "order_id": int(order.id) if order else int(seg.order_id),
                        "order_number": str(order.number) if order and order.number else None,
                        "customer_name": _customer_name(order),
                        "plan_id": int(plan.id) if plan else None,
                        "plan_status": plan_status or None,
                        "order_status": str(order.status) if order and order.status else None,
                        "target_warehouse_id": target_wh_id,
                        "target_warehouse_name": warehouse_names.get(target_wh_id),
                        "state": state,
                        "sort_tier": sort_tier,
                        "occupied_since": occupied_since.isoformat() if occupied_since else None,
                        "occupied_minutes": occupied_minutes,
                        "occupied_label": f"{occupied_minutes} min" if occupied_minutes is not None else None,
                        "ready_to_pack_since": ready_since.isoformat() if ready_since else None,
                        "ready_to_pack_minutes": ready_to_pack_minutes,
                        "ready_to_pack_label": f"{ready_to_pack_minutes} min" if ready_to_pack_minutes is not None else None,
                        "mm_progress_label": progress.get("mm_staging_label"),
                        "local_progress_label": progress.get("local_staging_label"),
                        "total_progress_label": (
                            f"{progress.get('staged_count', 0)}/{progress.get('staging_total', 0)}"
                            if progress.get("staging_total")
                            else "—"
                        ),
                        "missing_items": _missing_items(items, product_names=product_names, warehouse_names=warehouse_names)
                        if state != SEGMENT_STATE_READY_TO_PACK
                        else [],
                        "alerts": row_alerts,
                        "unresolved_alert_count": len(unresolved),
                    }
                )

    shelves.sort(key=_sort_key)
    if occupation_samples:
        kpi["avg_occupation_minutes"] = round(sum(occupation_samples) / len(occupation_samples), 1)
    kpi["total_segments"] = total_segments

    return {
        "warehouse_id": int(warehouse_id),
        "kpi": kpi,
        "shelves": shelves,
    }
