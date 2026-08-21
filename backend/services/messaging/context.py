"""Safe template context for email rendering (plain dict, no ORM)."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.complaint import Complaint
from ...models.complaint_ui_status import ComplaintUiStatus
from ...models.order import Order
from ...models.order_ui_status import OrderUiStatus
from ...models.return_ui_status import ReturnUiStatus
from ...models.wms_order_return import WmsOrderReturn
from ..automation.constants import ENTITY_COMPLAINT, ENTITY_ORDER, ENTITY_RETURN
from .recipients import resolve_customer_email


def build_entity_email_context(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    entity_id: int,
) -> dict[str, Any]:
    et = str(entity_type).upper()
    recipient = resolve_customer_email(db, tenant_id=tenant_id, entity_type=et, entity_id=entity_id)
    base: dict[str, Any] = {
        "entity_type": et,
        "entity_id": int(entity_id),
        "tenant_id": int(tenant_id),
        "customer_email": recipient.email or "",
    }

    if et == ENTITY_ORDER:
        order = (
            db.query(Order)
            .filter(Order.id == int(entity_id), Order.tenant_id == int(tenant_id))
            .first()
        )
        if order is None:
            return base
        status_name = ""
        if getattr(order, "order_ui_status_id", None):
            us = db.query(OrderUiStatus).filter(OrderUiStatus.id == int(order.order_ui_status_id)).first()
            status_name = str(getattr(us, "name", "") or "") if us else ""
        base.update(
            {
                "order_id": int(order.id),
                "order_number": str(getattr(order, "number", "") or ""),
                "status_id": int(order.order_ui_status_id) if order.order_ui_status_id else None,
                "status_name": status_name,
                "warehouse_id": int(order.warehouse_id) if order.warehouse_id else None,
            }
        )
        return base

    if et == ENTITY_RETURN:
        row = (
            db.query(WmsOrderReturn)
            .filter(WmsOrderReturn.id == int(entity_id), WmsOrderReturn.tenant_id == int(tenant_id))
            .first()
        )
        if row is None:
            return base
        status_name = ""
        if getattr(row, "ui_status_id", None):
            us = db.query(ReturnUiStatus).filter(ReturnUiStatus.id == int(row.ui_status_id)).first()
            status_name = str(getattr(us, "name", "") or "") if us else ""
        order_number = ""
        if getattr(row, "order_id", None):
            order = db.query(Order).filter(Order.id == int(row.order_id)).first()
            order_number = str(getattr(order, "number", "") or "") if order else ""
        base.update(
            {
                "return_id": int(row.id),
                "rmz_number": str(getattr(row, "rmz_number", "") or ""),
                "order_id": int(row.order_id) if row.order_id else None,
                "order_number": order_number,
                "status_id": int(row.ui_status_id) if row.ui_status_id else None,
                "status_name": status_name,
                "warehouse_id": int(row.warehouse_id) if row.warehouse_id else None,
            }
        )
        return base

    if et == ENTITY_COMPLAINT:
        c = (
            db.query(Complaint)
            .filter(Complaint.id == int(entity_id), Complaint.tenant_id == int(tenant_id))
            .first()
        )
        if c is None:
            return base
        status_name = ""
        if getattr(c, "complaint_ui_status_id", None):
            us = (
                db.query(ComplaintUiStatus)
                .filter(ComplaintUiStatus.id == int(c.complaint_ui_status_id))
                .first()
            )
            status_name = str(getattr(us, "name", "") or "") if us else ""
        base.update(
            {
                "complaint_id": int(c.id),
                "complaint_number": str(getattr(c, "reference_code", None) or c.id),
                "order_id": int(c.order_id) if getattr(c, "order_id", None) else None,
                "status_id": int(c.complaint_ui_status_id) if c.complaint_ui_status_id else None,
                "status_name": status_name,
                "warehouse_id": int(c.warehouse_id) if getattr(c, "warehouse_id", None) else None,
                "customer_name": str(getattr(c, "customer_name", "") or ""),
            }
        )
        return base

    return base
