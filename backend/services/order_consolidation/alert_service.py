"""P5.2 — consolidation alerts and exception helpers."""

from __future__ import annotations

from datetime import datetime
from typing import Sequence

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_consolidation_alert import OrderConsolidationAlert
from ...models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from ...models.tenant_warehouse import TenantWarehouse
from .constants import (
    ALERT_CODE_ADDITIONAL_MM_REQUESTED,
    ALERT_CODE_CONSOLIDATION_CANCELLED,
    ALERT_CODE_DAMAGED_ITEM,
    ALERT_CODE_LOST_ESCALATION,
    ALERT_CODE_OPERATOR_DECISION_REQUIRED,
    ALERT_CODE_SHORTAGE,
    ALERT_CODE_TARGET_WAREHOUSE_CHANGED,
    ALERT_SEVERITY_CRITICAL,
    ALERT_SEVERITY_INFO,
    ALERT_SEVERITY_WARNING,
    ITEM_STATUS_BLOCKED,
    ITEM_STATUS_CANCELLED,
    ITEM_STATUS_DAMAGED,
    ITEM_STATUS_LOST,
    ITEM_STATUS_RECEIVED,
    ITEM_STATUS_SHORTAGE,
    PLAN_STATUS_CANCELLED,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_EXCEPTION,
    PLAN_STATUS_MANUAL_REVIEW_REQUIRED,
)


class ConsolidationAlertError(ValueError):
    """Invalid alert or consolidation exception operation."""


def create_consolidation_alert(
    db: Session,
    *,
    plan_id: int,
    code: str,
    message: str,
    severity: str = ALERT_SEVERITY_INFO,
    plan_item_id: int | None = None,
    dedupe_unresolved: bool = False,
) -> OrderConsolidationAlert:
    if dedupe_unresolved:
        existing = (
            db.query(OrderConsolidationAlert)
            .filter(
                OrderConsolidationAlert.plan_id == int(plan_id),
                OrderConsolidationAlert.code == str(code),
                OrderConsolidationAlert.resolved.is_(False),
                OrderConsolidationAlert.plan_item_id == plan_item_id,
            )
            .first()
        )
        if existing is not None:
            return existing
    row = OrderConsolidationAlert(
        plan_id=int(plan_id),
        plan_item_id=int(plan_item_id) if plan_item_id else None,
        severity=str(severity).upper(),
        code=str(code).upper(),
        message=str(message).strip(),
        resolved=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def _load_plan_for_tenant(db: Session, plan_id: int, tenant_id: int) -> tuple[OrderConsolidationPlan, Order]:
    row = (
        db.query(OrderConsolidationPlan, Order)
        .join(Order, Order.id == OrderConsolidationPlan.order_id)
        .filter(OrderConsolidationPlan.id == int(plan_id), Order.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise ConsolidationAlertError("Plan konsolidacji nie istnieje.")
    return row[0], row[1]


def list_consolidation_alerts(
    db: Session,
    *,
    tenant_id: int,
    target_warehouse_id: int | None = None,
    unresolved_only: bool = True,
) -> list[dict]:
    q = (
        db.query(OrderConsolidationAlert, OrderConsolidationPlan, Order)
        .join(OrderConsolidationPlan, OrderConsolidationPlan.id == OrderConsolidationAlert.plan_id)
        .join(Order, Order.id == OrderConsolidationPlan.order_id)
        .filter(Order.tenant_id == int(tenant_id))
    )
    if target_warehouse_id is not None and int(target_warehouse_id) > 0:
        q = q.filter(OrderConsolidationPlan.target_warehouse_id == int(target_warehouse_id))
    if unresolved_only:
        q = q.filter(OrderConsolidationAlert.resolved.is_(False))
    rows = q.order_by(OrderConsolidationAlert.created_at.desc(), OrderConsolidationAlert.id.desc()).all()
    out: list[dict] = []
    for alert, plan, order in rows:
        out.append(
            {
                "id": int(alert.id),
                "plan_id": int(plan.id),
                "plan_item_id": int(alert.plan_item_id) if alert.plan_item_id else None,
                "order_id": int(order.id),
                "order_number": str(order.number or f"#{order.id}"),
                "plan_status": str(plan.status),
                "severity": str(alert.severity),
                "code": str(alert.code),
                "message": str(alert.message),
                "resolved": bool(alert.resolved),
                "created_at": alert.created_at.isoformat() if alert.created_at else None,
            }
        )
    return out


def count_alert_summary(
    db: Session,
    *,
    tenant_id: int,
    target_warehouse_id: int | None = None,
) -> dict:
    plans_q = (
        db.query(OrderConsolidationPlan)
        .join(Order, Order.id == OrderConsolidationPlan.order_id)
        .filter(Order.tenant_id == int(tenant_id))
    )
    if target_warehouse_id is not None and int(target_warehouse_id) > 0:
        plans_q = plans_q.filter(OrderConsolidationPlan.target_warehouse_id == int(target_warehouse_id))
    plans = plans_q.all()
    exception_count = sum(1 for p in plans if str(p.status).upper() == PLAN_STATUS_EXCEPTION)
    manual_review_count = sum(1 for p in plans if str(p.status).upper() == PLAN_STATUS_MANUAL_REVIEW_REQUIRED)

    alerts = list_consolidation_alerts(
        db,
        tenant_id=int(tenant_id),
        target_warehouse_id=target_warehouse_id,
        unresolved_only=True,
    )
    critical_alert_count = sum(1 for a in alerts if str(a["severity"]).upper() == ALERT_SEVERITY_CRITICAL)
    return {
        "exception_count": exception_count,
        "manual_review_count": manual_review_count,
        "problem_plan_count": exception_count + manual_review_count,
        "critical_alert_count": critical_alert_count,
        "unresolved_alert_count": len(alerts),
    }


def change_consolidation_target_warehouse(
    db: Session,
    *,
    plan_id: int,
    tenant_id: int,
    warehouse_id: int,
    reason: str,
) -> OrderConsolidationPlan:
    reason = (reason or "").strip()
    if not reason:
        raise ConsolidationAlertError("Powód zmiany magazynu docelowego jest wymagany.")
    plan, order = _load_plan_for_tenant(db, plan_id, tenant_id)
    st = str(plan.status).upper()
    if st in (PLAN_STATUS_CANCELLED, PLAN_STATUS_COMPLETED):
        raise ConsolidationAlertError(f"Nie można zmienić magazynu — plan w statusie {st}.")

    tw = (
        db.query(TenantWarehouse)
        .filter(
            TenantWarehouse.tenant_id == int(tenant_id),
            TenantWarehouse.warehouse_id == int(warehouse_id),
            TenantWarehouse.fulfillment_eligible.is_(True),
        )
        .first()
    )
    if tw is None:
        raise ConsolidationAlertError("Magazyn docelowy musi być fulfillment_eligible dla tenanta.")

    old_wid = int(plan.target_warehouse_id)
    new_wid = int(warehouse_id)
    plan.target_warehouse_id = new_wid
    db.add(plan)
    items = db.query(OrderConsolidationPlanItem).filter(OrderConsolidationPlanItem.plan_id == int(plan.id)).all()
    for it in items:
        it.target_warehouse_id = new_wid
        db.add(it)
    order.warehouse_id = new_wid
    db.add(order)
    create_consolidation_alert(
        db,
        plan_id=int(plan.id),
        code=ALERT_CODE_TARGET_WAREHOUSE_CHANGED,
        message=f"Zmiana magazynu docelowego {old_wid} → {new_wid}. Powód: {reason}",
        severity=ALERT_SEVERITY_WARNING,
    )
    db.flush()
    return plan


def cancel_consolidation_plan(
    db: Session,
    *,
    plan_id: int,
    tenant_id: int,
    reason: str,
) -> OrderConsolidationPlan:
    from ..fulfillment_assignment.phase_constants import PHASE_MANUAL_REVIEW_REQUIRED

    reason = (reason or "").strip()
    if not reason:
        raise ConsolidationAlertError("Powód anulowania jest wymagany.")
    plan, order = _load_plan_for_tenant(db, plan_id, tenant_id)
    st = str(plan.status).upper()
    if st == PLAN_STATUS_CANCELLED:
        raise ConsolidationAlertError("Plan jest już anulowany.")
    if st == PLAN_STATUS_COMPLETED:
        raise ConsolidationAlertError("Nie można anulować zakończonego planu.")

    plan.status = PLAN_STATUS_CANCELLED
    db.add(plan)
    items = db.query(OrderConsolidationPlanItem).filter(OrderConsolidationPlanItem.plan_id == int(plan.id)).all()
    for it in items:
        if str(it.status).upper() not in (ITEM_STATUS_RECEIVED, ITEM_STATUS_CANCELLED):
            it.status = ITEM_STATUS_CANCELLED
            db.add(it)
    order.fulfillment_assignment_phase = PHASE_MANUAL_REVIEW_REQUIRED
    db.add(order)
    create_consolidation_alert(
        db,
        plan_id=int(plan.id),
        code=ALERT_CODE_CONSOLIDATION_CANCELLED,
        message=f"Anulowano konsolidację. Powód: {reason}",
        severity=ALERT_SEVERITY_CRITICAL,
    )
    db.flush()
    return plan


def apply_recovery_action(
    db: Session,
    *,
    plan_id: int,
    plan_item_id: int,
    tenant_id: int,
    action: str,
    note: str | None = None,
) -> OrderConsolidationAlert:
    plan, _order = _load_plan_for_tenant(db, plan_id, tenant_id)
    item = (
        db.query(OrderConsolidationPlanItem)
        .filter(
            OrderConsolidationPlanItem.id == int(plan_item_id),
            OrderConsolidationPlanItem.plan_id == int(plan.id),
        )
        .first()
    )
    if item is None:
        raise ConsolidationAlertError("Pozycja planu nie istnieje.")

    act = (action or "").strip().upper()
    note_txt = (note or "").strip()
    st = str(item.status).upper()

    if act == "ADDITIONAL_MM":
        if st != ITEM_STATUS_SHORTAGE:
            raise ConsolidationAlertError("Dodatkowe MM dotyczy tylko pozycji ze statusem SHORTAGE.")
        return create_consolidation_alert(
            db,
            plan_id=int(plan.id),
            plan_item_id=int(item.id),
            code=ALERT_CODE_ADDITIONAL_MM_REQUESTED,
            message=note_txt or f"Operator zlecił utworzenie dodatkowego MM dla produktu #{item.product_id}.",
            severity=ALERT_SEVERITY_INFO,
        )
    if act == "OPERATOR_DECISION":
        if st != ITEM_STATUS_DAMAGED:
            raise ConsolidationAlertError("Decyzja operatora dotyczy pozycji DAMAGED.")
        item.status = ITEM_STATUS_BLOCKED
        plan.status = PLAN_STATUS_MANUAL_REVIEW_REQUIRED
        db.add(item)
        db.add(plan)
        return create_consolidation_alert(
            db,
            plan_id=int(plan.id),
            plan_item_id=int(item.id),
            code=ALERT_CODE_OPERATOR_DECISION_REQUIRED,
            message=note_txt or f"Towar uszkodzony — oczekuje decyzji operatora (produkt #{item.product_id}).",
            severity=ALERT_SEVERITY_CRITICAL,
        )
    if act == "LOST_ESCALATION":
        if st != ITEM_STATUS_LOST:
            item.status = ITEM_STATUS_LOST
            db.add(item)
            recompute_plan_exception_status(db, plan)
        return create_consolidation_alert(
            db,
            plan_id=int(plan.id),
            plan_item_id=int(item.id),
            code=ALERT_CODE_LOST_ESCALATION,
            message=note_txt or f"Przekazano do wyjaśnienia — produkt #{item.product_id}.",
            severity=ALERT_SEVERITY_CRITICAL,
        )
    raise ConsolidationAlertError(f"Nieobsługiwana akcja recovery: {action}")


def recompute_plan_exception_status(db: Session, plan: OrderConsolidationPlan) -> None:
    if str(plan.status).upper() in (PLAN_STATUS_CANCELLED, PLAN_STATUS_COMPLETED):
        return
    items: Sequence[OrderConsolidationPlanItem] = (
        db.query(OrderConsolidationPlanItem).filter(OrderConsolidationPlanItem.plan_id == int(plan.id)).all()
    )
    from .constants import ITEM_STATUS_EXCEPTION as EXC_SET

    has_exception = any(str(it.status).upper() in EXC_SET for it in items)
    has_blocked = any(str(it.status).upper() == ITEM_STATUS_BLOCKED for it in items)
    if has_blocked and str(plan.status).upper() != PLAN_STATUS_MANUAL_REVIEW_REQUIRED:
        plan.status = PLAN_STATUS_MANUAL_REVIEW_REQUIRED
        db.add(plan)
    elif has_exception and str(plan.status).upper() not in (
        PLAN_STATUS_MANUAL_REVIEW_REQUIRED,
        PLAN_STATUS_CANCELLED,
    ):
        plan.status = PLAN_STATUS_EXCEPTION
        db.add(plan)
