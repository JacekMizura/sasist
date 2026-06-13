"""P5.9 — consolidation control tower (read-only operational monitoring for supervisors)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from ...models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from ...models.order import Order
from ...models.order_consolidation_alert import OrderConsolidationAlert
from ...models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from .constants import (
    ITEM_STATUS_CANCELLED,
    ITEM_STATUS_STAGED,
    PLAN_STATUS_CANCELLED,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_EXCEPTION,
    PLAN_STATUS_MANUAL_REVIEW_REQUIRED,
    PLAN_STATUS_READY_FOR_STAGING,
    PLAN_STATUS_STAGING,
)
from .feasibility_service import _warehouse_name_map
from .progress_helpers import (
    compute_staging_progress,
    format_segment_label,
    progress_fields_for_items,
)
from .rack_dashboard_service import _resolve_segment_state

# SLA thresholds (minutes)
SLA_READY_FOR_STAGING_WARN = 30
SLA_READY_FOR_STAGING_CRIT = 60
SLA_STAGING_WARN = 240
SLA_STAGING_CRIT = 480
SLA_READY_TO_PACK_WARN = 30
SLA_READY_TO_PACK_CRIT = 60

ALERT_READY_FOR_STAGING_30 = "READY_FOR_STAGING_SLA_30"
ALERT_READY_FOR_STAGING_60 = "READY_FOR_STAGING_SLA_60"
ALERT_STAGING_240 = "STAGING_SLA_240"
ALERT_STAGING_480 = "STAGING_SLA_480"
ALERT_READY_TO_PACK_30 = "READY_TO_PACK_SLA_30"
ALERT_READY_TO_PACK_60 = "READY_TO_PACK_SLA_60"
ALERT_EXCEPTION = "EXCEPTION"
ALERT_MANUAL_REVIEW = "MANUAL_REVIEW_REQUIRED"


def _minutes_since(dt: datetime | None) -> int | None:
    if dt is None:
        return None
    delta = datetime.utcnow() - dt.replace(tzinfo=None)
    return max(0, int(delta.total_seconds() // 60))


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _avg(values: list[int]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 1)


@dataclass
class _TowerData:
    warehouse_id: int
    plans: list[tuple[OrderConsolidationPlan, Order]] = field(default_factory=list)
    items_by_plan: dict[int, list[OrderConsolidationPlanItem]] = field(default_factory=dict)
    warehouse_names: dict[int, str] = field(default_factory=dict)
    segment_by_order: dict[int, tuple[RackSegment, ConsolidationRackLevel, ConsolidationRack]] = field(
        default_factory=dict
    )
    racks: list[ConsolidationRack] = field(default_factory=list)
    alerts_by_plan: dict[int, list[OrderConsolidationAlert]] = field(default_factory=dict)


def _load_tower_data(db: Session, *, tenant_id: int, warehouse_id: int) -> _TowerData:
    plans_q = (
        db.query(OrderConsolidationPlan, Order)
        .join(Order, Order.id == OrderConsolidationPlan.order_id)
        .filter(
            Order.tenant_id == int(tenant_id),
            OrderConsolidationPlan.target_warehouse_id == int(warehouse_id),
            OrderConsolidationPlan.status != PLAN_STATUS_CANCELLED,
        )
        .order_by(OrderConsolidationPlan.updated_at.asc())
    )
    plans = list(plans_q.all())

    plan_ids = [int(p.id) for p, _ in plans]
    items_by_plan: dict[int, list[OrderConsolidationPlanItem]] = {}
    warehouse_ids: set[int] = {int(warehouse_id)}
    if plan_ids:
        for it in db.query(OrderConsolidationPlanItem).filter(OrderConsolidationPlanItem.plan_id.in_(plan_ids)).all():
            items_by_plan.setdefault(int(it.plan_id), []).append(it)
            warehouse_ids.add(int(it.source_warehouse_id))
            warehouse_ids.add(int(it.target_warehouse_id))

    racks = (
        db.query(ConsolidationRack)
        .options(joinedload(ConsolidationRack.levels).joinedload(ConsolidationRackLevel.segments))
        .filter(
            ConsolidationRack.tenant_id == int(tenant_id),
            ConsolidationRack.warehouse_id == int(warehouse_id),
        )
        .order_by(ConsolidationRack.id.asc())
        .all()
    )

    segment_by_order: dict[int, tuple[RackSegment, ConsolidationRackLevel, ConsolidationRack]] = {}
    for rack in racks:
        for level in rack.levels or []:
            for seg in level.segments or []:
                if seg.order_id is not None:
                    segment_by_order[int(seg.order_id)] = (seg, level, rack)

    alerts_by_plan: dict[int, list[OrderConsolidationAlert]] = {}
    if plan_ids:
        for alert in (
            db.query(OrderConsolidationAlert)
            .filter(
                OrderConsolidationAlert.plan_id.in_(plan_ids),
                OrderConsolidationAlert.resolved.is_(False),
            )
            .all()
        ):
            alerts_by_plan.setdefault(int(alert.plan_id), []).append(alert)

    return _TowerData(
        warehouse_id=int(warehouse_id),
        plans=plans,
        items_by_plan=items_by_plan,
        warehouse_names=_warehouse_name_map(db, list(warehouse_ids)),
        segment_by_order=segment_by_order,
        racks=racks,
        alerts_by_plan=alerts_by_plan,
    )


def _active_items(items: list[OrderConsolidationPlanItem]) -> list[OrderConsolidationPlanItem]:
    return [it for it in items if str(it.status).upper() != ITEM_STATUS_CANCELLED]


def _pending_count(items: list[OrderConsolidationPlanItem]) -> int:
    active = _active_items(items)
    return sum(1 for it in active if str(it.status).upper() != ITEM_STATUS_STAGED)


def _last_activity(items: list[OrderConsolidationPlanItem], plan: OrderConsolidationPlan) -> datetime | None:
    stamps = [plan.updated_at, plan.created_at]
    for it in items:
        stamps.append(it.updated_at)
    stamps = [s for s in stamps if s is not None]
    return max(stamps) if stamps else None


def _shelf_label(data: _TowerData, order_id: int) -> str | None:
    row = data.segment_by_order.get(int(order_id))
    if row is None:
        return None
    seg, level, rack = row
    return format_segment_label(str(rack.name), level, seg)


def _sla_alerts(
    *,
    queue_status: str,
    wait_minutes: int | None,
    plan_status: str,
) -> list[dict]:
    alerts: list[dict] = []
    plan_st = plan_status.upper()
    if plan_st == PLAN_STATUS_MANUAL_REVIEW_REQUIRED:
        alerts.append({"code": ALERT_MANUAL_REVIEW, "severity": "CRITICAL", "label": "MANUAL_REVIEW_REQUIRED"})
    elif plan_st == PLAN_STATUS_EXCEPTION:
        alerts.append({"code": ALERT_EXCEPTION, "severity": "CRITICAL", "label": "EXCEPTION"})

    if wait_minutes is None:
        return alerts

    if queue_status == "READY_FOR_STAGING":
        if wait_minutes >= SLA_READY_FOR_STAGING_CRIT:
            alerts.append(
                {"code": ALERT_READY_FOR_STAGING_60, "severity": "CRITICAL", "label": "Do rozłożenia > 60 min"}
            )
        elif wait_minutes >= SLA_READY_FOR_STAGING_WARN:
            alerts.append(
                {"code": ALERT_READY_FOR_STAGING_30, "severity": "WARNING", "label": "Do rozłożenia > 30 min"}
            )
    elif queue_status == "STAGING":
        if wait_minutes >= SLA_STAGING_CRIT:
            alerts.append({"code": ALERT_STAGING_480, "severity": "CRITICAL", "label": "Rozkładanie > 8 h"})
        elif wait_minutes >= SLA_STAGING_WARN:
            alerts.append({"code": ALERT_STAGING_240, "severity": "WARNING", "label": "Rozkładanie > 4 h"})
    elif queue_status == "READY_TO_PACK":
        if wait_minutes >= SLA_READY_TO_PACK_CRIT:
            alerts.append(
                {"code": ALERT_READY_TO_PACK_60, "severity": "CRITICAL", "label": "Gotowe do pakowania > 60 min"}
            )
        elif wait_minutes >= SLA_READY_TO_PACK_WARN:
            alerts.append(
                {"code": ALERT_READY_TO_PACK_30, "severity": "WARNING", "label": "Gotowe do pakowania > 30 min"}
            )
    return alerts


def _ready_for_staging_row(data: _TowerData, plan: OrderConsolidationPlan, order: Order) -> dict:
    items = _active_items(data.items_by_plan.get(int(plan.id), []))
    progress = progress_fields_for_items(items, data.warehouse_names)
    wait = _minutes_since(plan.updated_at)
    return {
        "plan_id": int(plan.id),
        "order_id": int(order.id),
        "order_number": str(order.number or f"#{order.id}"),
        "target_warehouse_id": int(plan.target_warehouse_id),
        "target_warehouse_name": data.warehouse_names.get(int(plan.target_warehouse_id)),
        "item_count": len(items),
        "waiting_minutes": wait,
        "waiting_label": f"{wait} min" if wait is not None else None,
        "pending_source_warehouses": progress.get("pending_source_warehouses") or [],
        "plan_status": str(plan.status),
        "queue_status": "READY_FOR_STAGING",
        "alerts": _sla_alerts(queue_status="READY_FOR_STAGING", wait_minutes=wait, plan_status=str(plan.status)),
    }


def _staging_row(data: _TowerData, plan: OrderConsolidationPlan, order: Order) -> dict:
    items = _active_items(data.items_by_plan.get(int(plan.id), []))
    staged, total = compute_staging_progress(items)
    progress = _progress_from_items(items)
    wait = _minutes_since(plan.updated_at)
    fill = round(100.0 * staged / total, 1) if total else 0.0
    seg_row = data.segment_by_order.get(int(order.id))
    if seg_row is not None:
        fill = float(seg_row[0].fill_percent or fill)
    last_at = _last_activity(items, plan)
    return {
        "plan_id": int(plan.id),
        "order_id": int(order.id),
        "order_number": str(order.number or f"#{order.id}"),
        "shelf_label": _shelf_label(data, int(order.id)),
        "progress_percent": fill,
        "staged_count": staged,
        "pending_count": _pending_count(items),
        "item_count": total,
        "waiting_minutes": wait,
        "waiting_label": f"{wait} min" if wait is not None else None,
        "mm_progress_label": progress.get("mm_staging_label"),
        "local_progress_label": progress.get("local_staging_label"),
        "last_activity_at": _iso(last_at),
        "last_operator_name": None,
        "plan_status": str(plan.status),
        "queue_status": "STAGING",
        "alerts": _sla_alerts(queue_status="STAGING", wait_minutes=wait, plan_status=str(plan.status)),
    }


def _progress_from_items(items: list[OrderConsolidationPlanItem]) -> dict:
    from .rack_dashboard_service import _progress_from_items as _rack_progress

    return _rack_progress(items)


def _ready_to_pack_row(data: _TowerData, plan: OrderConsolidationPlan, order: Order) -> dict:
    wait = _minutes_since(plan.updated_at)
    items = _active_items(data.items_by_plan.get(int(plan.id), []))
    last_at = _last_activity(items, plan)
    return {
        "plan_id": int(plan.id),
        "order_id": int(order.id),
        "order_number": str(order.number or f"#{order.id}"),
        "shelf_label": _shelf_label(data, int(order.id)),
        "waiting_minutes": wait,
        "waiting_label": f"{wait} min" if wait is not None else None,
        "last_activity_at": _iso(last_at),
        "last_operator_name": None,
        "plan_status": str(plan.status),
        "fulfillment_state": str(order.fulfillment_state or ""),
        "queue_status": "READY_TO_PACK",
        "alerts": _sla_alerts(queue_status="READY_TO_PACK", wait_minutes=wait, plan_status=str(plan.status)),
    }


def build_consolidation_tower_summary(db: Session, *, tenant_id: int, warehouse_id: int) -> dict:
    data = _load_tower_data(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))

    counts = {
        "READY_FOR_STAGING": 0,
        "STAGING": 0,
        "READY_TO_PACK": 0,
        "EXCEPTION": 0,
        "MANUAL_REVIEW_REQUIRED": 0,
    }
    rfs_waits: list[int] = []
    staging_waits: list[int] = []
    rtp_waits: list[int] = []

    for plan, order in data.plans:
        st = str(plan.status).upper()
        if st == PLAN_STATUS_READY_FOR_STAGING:
            counts["READY_FOR_STAGING"] += 1
            m = _minutes_since(plan.updated_at)
            if m is not None:
                rfs_waits.append(m)
        elif st == PLAN_STATUS_STAGING:
            counts["STAGING"] += 1
            m = _minutes_since(plan.updated_at)
            if m is not None:
                staging_waits.append(m)
        elif st == PLAN_STATUS_COMPLETED and str(order.fulfillment_state or "").upper() == "READY_TO_PACK":
            counts["READY_TO_PACK"] += 1
            m = _minutes_since(plan.updated_at)
            if m is not None:
                rtp_waits.append(m)
        elif st == PLAN_STATUS_EXCEPTION:
            counts["EXCEPTION"] += 1
        elif st == PLAN_STATUS_MANUAL_REVIEW_REQUIRED:
            counts["MANUAL_REVIEW_REQUIRED"] += 1

    total_segments = 0
    occupied = 0
    for rack in data.racks:
        for level in rack.levels or []:
            for seg in level.segments or []:
                total_segments += 1
                if seg.order_id is not None:
                    occupied += 1

    alert_warning = 0
    alert_critical = 0
    for plan, order in data.plans:
        st = str(plan.status).upper()
        wait = _minutes_since(plan.updated_at)
        qs = None
        if st == PLAN_STATUS_READY_FOR_STAGING:
            qs = "READY_FOR_STAGING"
        elif st == PLAN_STATUS_STAGING:
            qs = "STAGING"
        elif st == PLAN_STATUS_COMPLETED and str(order.fulfillment_state or "").upper() == "READY_TO_PACK":
            qs = "READY_TO_PACK"
        if qs:
            for alert in _sla_alerts(queue_status=qs, wait_minutes=wait, plan_status=st):
                sev = str(alert.get("severity", "")).upper()
                if sev == "WARNING":
                    alert_warning += 1
                elif sev == "CRITICAL":
                    alert_critical += 1

    free = max(0, total_segments - occupied)
    occ_pct = round(100.0 * occupied / total_segments, 1) if total_segments > 0 else 0.0

    return {
        "warehouse_id": int(warehouse_id),
        "counts": counts,
        "avg_minutes": {
            "ready_for_staging_to_staging": _avg(rfs_waits),
            "staging_to_completed": _avg(staging_waits),
            "completed_to_packing": _avg(rtp_waits),
        },
        "rack_summary": {
            "total_segments": total_segments,
            "occupied_segments": occupied,
            "free_segments": free,
            "occupancy_percent": occ_pct,
        },
        "alert_counts": {"warning": alert_warning, "critical": alert_critical},
    }


def build_consolidation_tower_queues(db: Session, *, tenant_id: int, warehouse_id: int) -> dict:
    data = _load_tower_data(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))

    ready_for_staging: list[dict] = []
    staging: list[dict] = []
    ready_to_pack: list[dict] = []

    for plan, order in data.plans:
        st = str(plan.status).upper()
        if st == PLAN_STATUS_READY_FOR_STAGING:
            ready_for_staging.append(_ready_for_staging_row(data, plan, order))
        elif st == PLAN_STATUS_STAGING:
            staging.append(_staging_row(data, plan, order))
        elif st == PLAN_STATUS_COMPLETED and str(order.fulfillment_state or "").upper() == "READY_TO_PACK":
            ready_to_pack.append(_ready_to_pack_row(data, plan, order))

    ready_for_staging.sort(key=lambda r: -(int(r.get("waiting_minutes") or 0)))
    staging.sort(key=lambda r: -(int(r.get("waiting_minutes") or 0)))
    ready_to_pack.sort(key=lambda r: -(int(r.get("waiting_minutes") or 0)))

    bottlenecks: list[dict] = []
    for row in ready_for_staging + staging + ready_to_pack:
        bottlenecks.append(
            {
                "plan_id": row["plan_id"],
                "order_id": row["order_id"],
                "order_number": row["order_number"],
                "queue_status": row["queue_status"],
                "waiting_minutes": row.get("waiting_minutes"),
                "waiting_label": row.get("waiting_label"),
                "shelf_label": row.get("shelf_label"),
                "alerts": row.get("alerts") or [],
            }
        )
    bottlenecks.sort(key=lambda r: -(int(r.get("waiting_minutes") or 0)))
    bottlenecks = bottlenecks[:20]

    return {
        "warehouse_id": int(warehouse_id),
        "ready_for_staging": ready_for_staging,
        "staging": staging,
        "ready_to_pack": ready_to_pack,
        "bottlenecks": bottlenecks,
    }


def build_consolidation_tower_racks(db: Session, *, tenant_id: int, warehouse_id: int) -> dict:
    data = _load_tower_data(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    plans_by_order = {int(o.id): (p, o) for p, o in data.plans}

    racks_out: list[dict] = []
    for rack in data.racks:
        segments_out: list[dict] = []
        total = 0
        occupied = 0
        for level in sorted(rack.levels or [], key=lambda x: (int(x.level_index), int(x.id))):
            for seg in sorted(level.segments or [], key=lambda x: int(x.segment_index)):
                total += 1
                seg_row: dict = {
                    "segment_id": int(seg.id),
                    "shelf_label": format_segment_label(str(rack.name), level, seg),
                    "order_id": int(seg.order_id) if seg.order_id else None,
                    "order_number": None,
                    "plan_status": None,
                    "occupied_minutes": None,
                    "occupied_label": None,
                    "state": "FREE",
                }
                if seg.order_id is not None:
                    occupied += 1
                    order = plans_by_order.get(int(seg.order_id), (None, None))[1]
                    plan = plans_by_order.get(int(seg.order_id), (None, None))[0]
                    if order is None:
                        order = db.query(Order).filter(Order.id == int(seg.order_id)).first()
                    if plan is None:
                        plan = (
                            db.query(OrderConsolidationPlan)
                            .filter(
                                OrderConsolidationPlan.order_id == int(seg.order_id),
                                OrderConsolidationPlan.status != PLAN_STATUS_CANCELLED,
                            )
                            .order_by(OrderConsolidationPlan.id.desc())
                            .first()
                        )
                    items = data.items_by_plan.get(int(plan.id), []) if plan else []
                    occ = _minutes_since(plan.updated_at if plan else None)
                    seg_row.update(
                        {
                            "order_number": str(order.number) if order and order.number else None,
                            "plan_status": str(plan.status) if plan else None,
                            "occupied_minutes": occ,
                            "occupied_label": f"{occ} min" if occ is not None else None,
                            "state": _resolve_segment_state(order, plan, items),
                        }
                    )
                segments_out.append(seg_row)

        free = max(0, total - occupied)
        occ_pct = round(100.0 * occupied / total, 1) if total > 0 else 0.0
        racks_out.append(
            {
                "rack_id": int(rack.id),
                "rack_name": str(rack.name),
                "total_segments": total,
                "occupied_segments": occupied,
                "free_segments": free,
                "occupancy_percent": occ_pct,
                "segments": segments_out,
            }
        )

    return {"warehouse_id": int(warehouse_id), "racks": racks_out}


def build_consolidation_tower_alerts(db: Session, *, tenant_id: int, warehouse_id: int) -> dict:
    queues = build_consolidation_tower_queues(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    alerts: list[dict] = []
    seen: set[tuple] = set()

    for bucket in ("ready_for_staging", "staging", "ready_to_pack"):
        for row in queues.get(bucket) or []:
            for alert in row.get("alerts") or []:
                key = (int(row["plan_id"]), str(alert.get("code")))
                if key in seen:
                    continue
                seen.add(key)
                alerts.append(
                    {
                        "plan_id": int(row["plan_id"]),
                        "order_id": int(row["order_id"]),
                        "order_number": row.get("order_number"),
                        "queue_status": row.get("queue_status"),
                        "shelf_label": row.get("shelf_label"),
                        "waiting_minutes": row.get("waiting_minutes"),
                        **alert,
                    }
                )

    data = _load_tower_data(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    for plan, order in data.plans:
        for alert in data.alerts_by_plan.get(int(plan.id), []):
            key = (int(plan.id), f"db-{alert.id}")
            if key in seen:
                continue
            seen.add(key)
            alerts.append(
                {
                    "plan_id": int(plan.id),
                    "order_id": int(order.id),
                    "order_number": str(order.number or f"#{order.id}"),
                    "queue_status": str(plan.status),
                    "shelf_label": _shelf_label(data, int(order.id)),
                    "waiting_minutes": _minutes_since(plan.updated_at),
                    "code": str(alert.code),
                    "severity": str(alert.severity or "INFO").upper(),
                    "label": str(alert.message),
                    "alert_id": int(alert.id),
                }
            )

    sev_rank = {"CRITICAL": 0, "WARNING": 1, "INFO": 2}
    alerts.sort(key=lambda a: (sev_rank.get(str(a.get("severity", "")).upper(), 9), -(int(a.get("waiting_minutes") or 0))))
    return {"warehouse_id": int(warehouse_id), "alerts": alerts}
