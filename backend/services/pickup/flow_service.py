"""Pickup fulfillment flow — prepare → ready → handoff (isolated from classic WMS)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.order import Order
from ..direct_sale.errors import DirectSaleError
from .task_service import complete_pickup_task, upsert_pickup_task
from ..operational_observability import log_pickup_flow
from ..operational_sales_events import emit_operational_sales_event
from ..order_operational_mode import resolve_order_operational_mode

logger = logging.getLogger(__name__)


@dataclass
class PickupPrepareResult:
    order_id: int
    task_id: int
    pickup_zone_id: int | None


def _require_pickup_order(order: Order) -> None:
    mode = resolve_order_operational_mode(order)
    if mode.fulfillment_mode != "PICKUP":
        raise DirectSaleError(
            "Zamówienie nie jest w trybie odbioru osobistego.",
            code="not_pickup_order",
        )


def _find_pickup_zone(db: Session, *, tenant_id: int, warehouse_id: int) -> Location | None:
    return (
        db.query(Location)
        .filter(
            Location.tenant_id == int(tenant_id),
            Location.warehouse_id == int(warehouse_id),
            Location.operational_zone_type == "PICKUP",
        )
        .order_by(Location.id.asc())
        .first()
    )


def start_pickup_prepare(
    db: Session,
    *,
    order: Order,
    performed_by_user_id: int | None = None,
) -> PickupPrepareResult:
    _require_pickup_order(order)
    zone = _find_pickup_zone(db, tenant_id=int(order.tenant_id), warehouse_id=int(order.warehouse_id))
    task = upsert_pickup_task(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
        task_type="PICKUP_PREP",
        zone_id=int(zone.id) if zone else None,
        priority=60,
        payload={"stage": "prepare"},
    )
    emit_operational_sales_event(
        db,
        "pickup.prepare_started",
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
        source="pickup_flow",
        performed_by_user_id=performed_by_user_id,
        extra={"task_id": int(task.id), "zone_id": int(zone.id) if zone else None},
    )
    log_pickup_flow(
        action="prepare_started",
        order_id=int(order.id),
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        task_id=int(task.id),
        zone_id=int(zone.id) if zone else None,
        operator_id=performed_by_user_id,
    )
    return PickupPrepareResult(int(order.id), int(task.id), int(zone.id) if zone else None)


def mark_pickup_ready(
    db: Session,
    *,
    order: Order,
    pickup_zone_id: int | None = None,
    performed_by_user_id: int | None = None,
) -> int:
    _require_pickup_order(order)
    zone_id = pickup_zone_id
    if zone_id is None:
        zone = _find_pickup_zone(db, tenant_id=int(order.tenant_id), warehouse_id=int(order.warehouse_id))
        zone_id = int(zone.id) if zone else None

    from ...models.wms_operational_task import TASK_PICKUP_PREP, WmsOperationalTask

    open_prep = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.order_id == int(order.id),
            WmsOperationalTask.task_type == TASK_PICKUP_PREP,
            WmsOperationalTask.status.in_(("open", "in_progress")),
        )
        .all()
    )
    for t in open_prep:
        complete_pickup_task(db, t)

    task = upsert_pickup_task(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
        task_type="PICKUP_READY",
        zone_id=zone_id,
        priority=70,
        payload={"stage": "ready", "pickup_zone_id": zone_id},
    )
    emit_operational_sales_event(
        db,
        "pickup.ready",
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
        source="pickup_flow",
        performed_by_user_id=performed_by_user_id,
        extra={"task_id": int(task.id), "pickup_zone_id": zone_id},
    )
    log_pickup_flow(
        action="ready",
        order_id=int(order.id),
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        task_id=int(task.id),
        zone_id=zone_id,
        operator_id=performed_by_user_id,
    )
    return int(task.id)


def complete_pickup_handoff(
    db: Session,
    *,
    order: Order,
    performed_by_user_id: int | None = None,
) -> int:
    _require_pickup_order(order)
    from ...models.wms_operational_task import TASK_PICKUP_READY, WmsOperationalTask

    ready_tasks = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.order_id == int(order.id),
            WmsOperationalTask.task_type == TASK_PICKUP_READY,
            WmsOperationalTask.status.in_(("open", "in_progress")),
        )
        .all()
    )
    for t in ready_tasks:
        complete_pickup_task(db, t)

    task = upsert_pickup_task(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
        task_type="PICKUP_HANDOFF",
        priority=80,
        payload={"stage": "handoff", "completed_at": datetime.utcnow().isoformat()},
    )
    complete_pickup_task(db, task)

    emit_operational_sales_event(
        db,
        "pickup.handoff_completed",
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
        source="pickup_flow",
        performed_by_user_id=performed_by_user_id,
        extra={"task_id": int(task.id)},
    )
    log_pickup_flow(
        action="handoff_completed",
        order_id=int(order.id),
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        task_id=int(task.id),
        operator_id=performed_by_user_id,
    )
    return int(task.id)
