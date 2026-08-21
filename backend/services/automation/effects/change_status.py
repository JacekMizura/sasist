"""change_status effect — ORDER panel UI status via domain SSOT."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ....models.automation import StatusTransitionEvent
from ....models.order import Order
from ....models.order_ui_status import OrderUiStatus
from ..constants import ENTITY_ORDER
from . import EffectResult


def execute_change_status(
    db: Session,
    *,
    config: dict[str, Any],
    event: StatusTransitionEvent,
    actor_user_id: Optional[int],
) -> EffectResult:
    entity_type = str(event.entity_type or "").upper()
    if entity_type != ENTITY_ORDER:
        return EffectResult(
            ok=False,
            message=f"change_status for entity_type={entity_type} is not wired in v1",
        )

    raw_id = config.get("order_ui_status_id", config.get("status_id"))
    try:
        status_id = int(raw_id) if raw_id is not None else 0
    except (TypeError, ValueError):
        status_id = 0
    if status_id <= 0:
        return EffectResult(ok=False, message="change_status requires order_ui_status_id")

    order = (
        db.query(Order)
        .filter(
            Order.id == int(event.entity_id),
            Order.tenant_id == int(event.tenant_id),
        )
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
        db,
        order=order,
        sub_status_id=status_id,
        operator_user_id=actor_user_id,
    )
    return EffectResult(
        ok=True,
        message="status_updated",
        data={"order_ui_status_id": status_id, "apply": result},
    )
