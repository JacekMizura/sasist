"""change_status effect — ORDER / RETURN / COMPLAINT panel UI status via domain SSOT."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ....models.automation import StatusTransitionEvent
from ....models.complaint import Complaint
from ....models.complaint_ui_status import ComplaintUiStatus
from ....models.order import Order
from ....models.order_ui_status import OrderUiStatus
from ....models.return_ui_status import ReturnUiStatus
from ....models.wms_order_return import WmsOrderReturn
from ..constants import ENTITY_COMPLAINT, ENTITY_ORDER, ENTITY_RETURN
from . import EffectResult


def _target_status_id(config: dict[str, Any]) -> int:
    raw = config.get("status_id")
    if raw is None:
        raw = config.get("order_ui_status_id")
    if raw is None:
        raw = config.get("return_ui_status_id")
    if raw is None:
        raw = config.get("complaint_ui_status_id")
    try:
        return int(raw) if raw is not None else 0
    except (TypeError, ValueError):
        return 0


def execute_change_status(
    db: Session,
    *,
    config: dict[str, Any],
    event: StatusTransitionEvent,
    actor_user_id: Optional[int],
) -> EffectResult:
    entity_type = str(event.entity_type or "").upper()
    status_id = _target_status_id(config)
    if status_id <= 0:
        return EffectResult(ok=False, message="change_status requires status_id")

    if entity_type == ENTITY_ORDER:
        return _change_order(db, event=event, status_id=status_id, actor_user_id=actor_user_id)
    if entity_type == ENTITY_RETURN:
        return _change_return(db, event=event, status_id=status_id, actor_user_id=actor_user_id)
    if entity_type == ENTITY_COMPLAINT:
        return _change_complaint(db, event=event, status_id=status_id, actor_user_id=actor_user_id)
    return EffectResult(ok=False, message=f"change_status for entity_type={entity_type} is not wired")


def _change_order(
    db: Session,
    *,
    event: StatusTransitionEvent,
    status_id: int,
    actor_user_id: Optional[int],
) -> EffectResult:
    order = (
        db.query(Order)
        .filter(Order.id == int(event.entity_id), Order.tenant_id == int(event.tenant_id))
        .first()
    )
    if order is None:
        return EffectResult(ok=False, message="Order not found")
    us = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == status_id,
            OrderUiStatus.tenant_id == int(event.tenant_id),
            OrderUiStatus.warehouse_id == int(order.warehouse_id),
        )
        .first()
    )
    if us is None:
        return EffectResult(ok=False, message=f"order_ui_status_id={status_id} not found")
    if not bool(getattr(us, "is_active", True)):
        return EffectResult(ok=False, message=f"order_ui_status_id={status_id} is inactive")

    from ...order_panel_ui_status_service import apply_order_panel_ui_status

    result = apply_order_panel_ui_status(
        db, order=order, sub_status_id=status_id, operator_user_id=actor_user_id
    )
    return EffectResult(
        ok=True,
        message="status_updated",
        data={"status_id": status_id, "order_ui_status_id": status_id, "apply": result},
    )


def _change_return(
    db: Session,
    *,
    event: StatusTransitionEvent,
    status_id: int,
    actor_user_id: Optional[int],
) -> EffectResult:
    row = (
        db.query(WmsOrderReturn)
        .filter(
            WmsOrderReturn.id == int(event.entity_id),
            WmsOrderReturn.tenant_id == int(event.tenant_id),
        )
        .first()
    )
    if row is None:
        return EffectResult(ok=False, message="Return not found")
    wid = int(row.warehouse_id)
    us = (
        db.query(ReturnUiStatus)
        .filter(
            ReturnUiStatus.id == status_id,
            ReturnUiStatus.tenant_id == int(event.tenant_id),
            ReturnUiStatus.warehouse_id == wid,
        )
        .first()
    )
    if us is None:
        return EffectResult(ok=False, message=f"return_ui_status_id={status_id} not found")
    if not bool(getattr(us, "is_active", True)):
        return EffectResult(ok=False, message=f"return_ui_status_id={status_id} is inactive")

    from ..return_ui_status import apply_return_panel_ui_status

    try:
        result = apply_return_panel_ui_status(
            db,
            row=row,
            sub_status_id=status_id,
            tenant_id=int(event.tenant_id),
            warehouse_id=wid,
            actor_user_id=actor_user_id,
        )
    except ValueError as e:
        return EffectResult(ok=False, message=str(e))
    return EffectResult(ok=True, message="status_updated", data={"status_id": status_id, "apply": result})


def _change_complaint(
    db: Session,
    *,
    event: StatusTransitionEvent,
    status_id: int,
    actor_user_id: Optional[int],
) -> EffectResult:
    row = (
        db.query(Complaint)
        .filter(Complaint.id == int(event.entity_id), Complaint.tenant_id == int(event.tenant_id))
        .first()
    )
    if row is None:
        return EffectResult(ok=False, message="Complaint not found")
    us = (
        db.query(ComplaintUiStatus)
        .filter(ComplaintUiStatus.id == status_id, ComplaintUiStatus.tenant_id == int(event.tenant_id))
        .first()
    )
    if us is None:
        return EffectResult(ok=False, message=f"complaint_ui_status_id={status_id} not found")

    from ..complaint_ui_status import apply_complaint_panel_ui_status

    try:
        result = apply_complaint_panel_ui_status(
            db,
            row=row,
            sub_status_id=status_id,
            tenant_id=int(event.tenant_id),
            actor_user_id=actor_user_id,
        )
    except ValueError as e:
        return EffectResult(ok=False, message=str(e))
    return EffectResult(ok=True, message="status_updated", data={"status_id": status_id, "apply": result})
