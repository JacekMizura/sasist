"""Bezpieczne usuwanie linii zamówienia (OMS) — zamienniki, recovery, zależności WMS."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from ..models.fulfillment_event import FulfillmentEvent
from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from ..models.pick import Pick
from ..models.wms_operational_task import TASK_RELOCATION, WmsOperationalTask
from .fulfillment_event_service import delete_pick_events_for_pick_ids
from .order_item_removal_service import (
    REMOVAL_TYPE_MANUAL_OMS,
    REMOVAL_TYPE_SHORTAGE,
    normalize_removal_type,
    order_item_meta_dict,
)

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
        WmsOperationalTask.task_type != TASK_RELOCATION,
    ).delete(synchronize_session=False)
    db.flush()


def soft_remove_order_item(
    db: Session,
    item: OrderItem,
    *,
    reason: str = "",
    removal_type: str | None = None,
) -> None:
    """
    Oznacza linię jako usuniętą (bez hard-delete) — zachowuje FK w ``wms_order_events`` i historię.
    """
    qty_before = int(item.quantity or 0)
    meta = order_item_meta_dict(item)
    meta["oms_line_removed"] = True
    meta["removed_at"] = datetime.utcnow().isoformat() + "Z"
    rt = normalize_removal_type(removal_type or REMOVAL_TYPE_MANUAL_OMS)
    meta["removal_type"] = rt
    if reason:
        meta["removed_reason"] = str(reason)[:256]
    elif rt == REMOVAL_TYPE_SHORTAGE:
        meta["removed_reason"] = "brak magazynowy"
    else:
        meta["removed_reason"] = "usunięto z zamówienia (OMS)"
    item.metadata_json = json.dumps(meta, ensure_ascii=False)
    item.quantity = 0
    item.oms_removed_qty = float(qty_before)
    item.wms_picking_line_missing_qty = 0.0
    item.wms_shortage_declared_qty = 0.0
    item.wms_picking_line_status = None
    if getattr(item, "total_price", None) is not None:
        item.total_price = 0.0
    db.flush()
    logger.info(
        "[wms.order_item.removed] order_item_id=%s order_id=%s qty_before=%s "
        "removal_type=%s reason=%s",
        int(item.id),
        int(item.order_id),
        qty_before,
        rt,
        reason or meta.get("removed_reason") or "—",
    )


def order_item_delete_audit_context(item: OrderItem) -> dict:
    rep_from = int(getattr(item, "replaced_from_order_item_id", 0) or 0)
    is_replacement = rep_from > 0 and not order_item_is_replaced_line(item)
    return {
        "is_replacement": is_replacement,
        "replacement_parent_id": rep_from if rep_from > 0 else None,
        "source_line_id": rep_from if rep_from > 0 else None,
    }
