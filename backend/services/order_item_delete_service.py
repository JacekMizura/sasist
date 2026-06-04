"""Bezpieczne usuwanie linii zamówienia (OMS) — zamienniki, recovery, zależności WMS."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..models.fulfillment_event import FulfillmentEvent
from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from ..models.pick import Pick
from ..models.wms_operational_task import WmsOperationalTask
from .fulfillment_event_service import delete_pick_events_for_pick_ids

logger = logging.getLogger(__name__)


def purge_order_item_wms_dependents(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_item_id: int,
) -> None:
    """Usuwa Picki, zdarzenia fulfillment i zadania operacyjne powiązane z linią."""
    pick_ids = [
        int(r[0])
        for r in db.query(Pick.id).filter(Pick.order_item_id == int(order_item_id)).all()
    ]
    if pick_ids:
        delete_pick_events_for_pick_ids(db, pick_ids)
        db.query(Pick).filter(Pick.id.in_(pick_ids)).delete(synchronize_session=False)
    db.query(FulfillmentEvent).filter(FulfillmentEvent.order_item_id == int(order_item_id)).delete(
        synchronize_session=False
    )
    db.query(WmsOperationalTask).filter(
        WmsOperationalTask.tenant_id == int(tenant_id),
        WmsOperationalTask.warehouse_id == int(warehouse_id),
        WmsOperationalTask.order_item_id == int(order_item_id),
    ).delete(synchronize_session=False)
    db.flush()


def order_item_delete_audit_context(item: OrderItem) -> dict:
    rep_from = int(getattr(item, "replaced_from_order_item_id", 0) or 0)
    is_replacement = rep_from > 0 and not order_item_is_replaced_line(item)
    return {
        "is_replacement": is_replacement,
        "replacement_parent_id": rep_from if rep_from > 0 else None,
        "source_line_id": rep_from if rep_from > 0 else None,
    }
