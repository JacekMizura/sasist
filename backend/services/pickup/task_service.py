"""Operational commerce tasks — pickup/direct-sale on unified wms_operational_tasks."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.wms_operational_task import (
    ACTIVE_STATUSES,
    STATUS_DONE,
    STATUS_OPEN,
    TASK_GROUP_PICKUP,
    TASK_PICKUP_HANDOFF,
    TASK_PICKUP_PREP,
    TASK_PICKUP_READY,
    WmsOperationalTask,
    queue_projection_for_task_type,
)

logger = logging.getLogger(__name__)


def _group_key(task_type: str, order_id: int, warehouse_id: int) -> str:
    return f"pickup:{warehouse_id}:{order_id}:{task_type}"


def upsert_pickup_task(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    task_type: str,
    zone_id: int | None = None,
    related_session_id: int | None = None,
    related_reservation_id: int | None = None,
    priority: int = 50,
    payload: dict | None = None,
) -> WmsOperationalTask:
    tt = str(task_type or "").strip().upper()
    if tt not in (TASK_PICKUP_PREP, TASK_PICKUP_READY, TASK_PICKUP_HANDOFF):
        raise ValueError(f"unsupported pickup task type: {tt}")
    gk = _group_key(tt, int(order_id), int(warehouse_id))
    existing = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.group_key == gk,
            WmsOperationalTask.status.in_(ACTIVE_STATUSES),
        )
        .first()
    )
    if existing is not None:
        return existing

    task = WmsOperationalTask(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        task_type=tt,
        task_group=TASK_GROUP_PICKUP,
        status=STATUS_OPEN,
        queue=queue_projection_for_task_type(tt),
        order_id=int(order_id),
        group_key=gk,
        source_event_id=f"pickup:{order_id}:{tt}",
        priority=int(priority),
        related_session_id=int(related_session_id) if related_session_id else None,
        related_reservation_id=int(related_reservation_id) if related_reservation_id else None,
        zone_id=int(zone_id) if zone_id else None,
        payload_json=json.dumps(payload or {}, ensure_ascii=False),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(task)
    db.flush()
    return task


def complete_pickup_task(db: Session, task: WmsOperationalTask) -> WmsOperationalTask:
    task.status = STATUS_DONE
    task.completed_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()
    return task
