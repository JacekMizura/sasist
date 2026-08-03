"""Publisher — sole API for WMS modules to emit Supply Flow events."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from . import buffer as event_buffer
from .dispatcher import SupplyFlowEventDispatcher
from .types import SUPPLY_FLOW_EVENT_TYPES, SupplyFlowEvent

logger = logging.getLogger(__name__)

_dispatcher = SupplyFlowEventDispatcher()


class SupplyFlowPublishError(ValueError):
    pass


def publish_supply_flow_event(
    db: Session,
    *,
    event_type: str,
    tenant_id: int,
    warehouse_id: int,
    delivery_id: int | None = None,
    order_id: int | None = None,
    pz_id: int | None = None,
    source: str = "wms",
    payload: dict[str, Any] | None = None,
    dispatch: bool = True,
) -> SupplyFlowEvent:
    """
    Publish a domain event. WMS modules must use only this entrypoint.

    Never imports / calls SupplyFlowEngine. When ``dispatch=True`` (default),
    the Event Dispatcher drains the buffer (dedupe → group → debounce → recompute).
    """
    et = (event_type or "").strip().upper()
    if et not in SUPPLY_FLOW_EVENT_TYPES:
        raise SupplyFlowPublishError(f"Nieznany typ zdarzenia Supply Flow: {event_type!r}")
    if warehouse_id is None or int(warehouse_id) < 1:
        raise SupplyFlowPublishError("warehouse_id jest wymagany do publikacji zdarzenia SF")

    event = SupplyFlowEvent(
        event_type=et,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        delivery_id=int(delivery_id) if delivery_id is not None else None,
        order_id=int(order_id) if order_id is not None else None,
        pz_id=int(pz_id) if pz_id is not None else None,
        source=(source or "wms").strip()[:64],
        occurred_at=datetime.utcnow(),
        payload=dict(payload or {}),
    )
    event_buffer.enqueue(event)
    logger.info(
        "supply_flow.event published type=%s tenant=%s warehouse=%s delivery=%s pz=%s order=%s",
        event.event_type,
        event.tenant_id,
        event.warehouse_id,
        event.delivery_id,
        event.pz_id,
        event.order_id,
    )
    if dispatch:
        try:
            _dispatcher.dispatch_pending(db)
        except Exception:
            # Never break WMS write path.
            logger.exception("supply_flow.dispatcher failed after publish type=%s", et)
    return event


def publish_many(
    db: Session,
    events: list[SupplyFlowEvent],
    *,
    dispatch: bool = True,
) -> None:
    """Enqueue several pre-built events, then optionally flush via Dispatcher."""
    for ev in events:
        if ev.event_type not in SUPPLY_FLOW_EVENT_TYPES:
            raise SupplyFlowPublishError(f"Nieznany typ zdarzenia Supply Flow: {ev.event_type!r}")
        event_buffer.enqueue(ev)
    if dispatch:
        try:
            _dispatcher.dispatch_pending(db)
        except Exception:
            logger.exception("supply_flow.dispatcher failed after publish_many")
