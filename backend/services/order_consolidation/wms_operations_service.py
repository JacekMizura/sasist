"""P5.1 — WMS operational views for order consolidation (target warehouse)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_consolidation_plan import OrderConsolidationPlan
from .constants import (
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_DRAFT,
    PLAN_STATUS_EXCEPTION,
    PLAN_STATUS_IN_PROGRESS,
    PLAN_STATUS_MANUAL_REVIEW_REQUIRED,
    PLAN_STATUS_READY,
)
from .alert_service import count_alert_summary
from .plan_service import _build_plan_payload, refresh_consolidation_plan_progress
from .progress_helpers import progress_fields_for_items


class WmsConsolidationAccessError(ValueError):
    """Plan not found or tenant/warehouse mismatch."""


def _plans_for_target_warehouse(
    db: Session,
    *,
    tenant_id: int,
    target_warehouse_id: int | None = None,
    include_completed: bool = True,
):
    q = (
        db.query(OrderConsolidationPlan, Order)
        .join(Order, Order.id == OrderConsolidationPlan.order_id)
        .filter(Order.tenant_id == int(tenant_id))
    )
    if target_warehouse_id is not None and int(target_warehouse_id) > 0:
        q = q.filter(OrderConsolidationPlan.target_warehouse_id == int(target_warehouse_id))
    if not include_completed:
        q = q.filter(OrderConsolidationPlan.status != PLAN_STATUS_COMPLETED)
    return q.order_by(OrderConsolidationPlan.updated_at.desc(), OrderConsolidationPlan.id.desc())


def list_wms_consolidation_plans(
    db: Session,
    *,
    tenant_id: int,
    target_warehouse_id: int | None = None,
    include_completed: bool = False,
) -> list[dict]:
    rows = _plans_for_target_warehouse(
        db,
        tenant_id=int(tenant_id),
        target_warehouse_id=target_warehouse_id,
        include_completed=include_completed,
    ).all()

    out: list[dict] = []
    for plan, order in rows:
        refresh_consolidation_plan_progress(db, int(plan.id))
        db.refresh(plan)
        from .plan_service import _warehouse_name_map

        items = list(plan.items or [])
        names = _warehouse_name_map(
            db,
            list({int(plan.target_warehouse_id)} | {int(it.source_warehouse_id) for it in items}),
        )
        progress = progress_fields_for_items(items, names)
        out.append(
            {
                "id": int(plan.id),
                "order_id": int(plan.order_id),
                "order_number": str(order.number or f"#{order.id}"),
                "target_warehouse_id": int(plan.target_warehouse_id),
                "target_warehouse_name": names.get(int(plan.target_warehouse_id)),
                "status": str(plan.status),
                "created_at": plan.created_at.isoformat() if plan.created_at else None,
                **progress,
            }
        )
    return out


def get_wms_consolidation_plan_detail(
    db: Session,
    *,
    plan_id: int,
    tenant_id: int,
) -> dict:
    row = (
        db.query(OrderConsolidationPlan, Order)
        .join(Order, Order.id == OrderConsolidationPlan.order_id)
        .filter(
            OrderConsolidationPlan.id == int(plan_id),
            Order.tenant_id == int(tenant_id),
        )
        .first()
    )
    if row is None:
        raise WmsConsolidationAccessError("Plan konsolidacji nie istnieje.")
    plan, order = row
    refresh_consolidation_plan_progress(db, int(plan.id))
    db.refresh(plan)
    return _build_plan_payload(
        db,
        plan,
        order_number=str(order.number or f"#{order.id}"),
    )


def build_wms_consolidation_summary(
    db: Session,
    *,
    tenant_id: int,
    target_warehouse_id: int | None = None,
) -> dict:
    rows = _plans_for_target_warehouse(
        db,
        tenant_id=int(tenant_id),
        target_warehouse_id=target_warehouse_id,
        include_completed=True,
    ).all()

    pending = 0
    in_progress = 0
    completed = 0
    exception_count = 0
    manual_review_count = 0
    for plan, _order in rows:
        st = str(plan.status).upper()
        if st in (PLAN_STATUS_DRAFT, PLAN_STATUS_READY):
            pending += 1
        elif st == PLAN_STATUS_IN_PROGRESS:
            in_progress += 1
        elif st == PLAN_STATUS_COMPLETED:
            completed += 1
        elif st == PLAN_STATUS_EXCEPTION:
            exception_count += 1
        elif st == PLAN_STATUS_MANUAL_REVIEW_REQUIRED:
            manual_review_count += 1

    active = pending + in_progress + exception_count + manual_review_count
    alert_stats = count_alert_summary(
        db,
        tenant_id=int(tenant_id),
        target_warehouse_id=target_warehouse_id,
    )
    return {
        "pending_count": pending,
        "in_progress_count": in_progress,
        "completed_count": completed,
        "active_count": active,
        "exception_count": exception_count,
        "manual_review_count": manual_review_count,
        "problem_plan_count": exception_count + manual_review_count,
        "critical_alert_count": alert_stats["critical_alert_count"],
        "unresolved_alert_count": alert_stats["unresolved_alert_count"],
    }
