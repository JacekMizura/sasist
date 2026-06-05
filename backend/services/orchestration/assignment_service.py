"""Assign / reassign operational tasks to operators."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.wms_operational_task import ORCH_ACTIVE, ORCH_ASSIGNED, WmsOperationalTask
from ..live.constants import EVENT_TASK_ASSIGNED
from ..live.publisher import publish_live_event
from .lifecycle_service import transition_task_state

logger = logging.getLogger(__name__)


def assign_task_to_operator(
    db: Session,
    task: WmsOperationalTask,
    *,
    operator_user_id: int,
    activate: bool = False,
) -> WmsOperationalTask:
    task.assigned_user_id = int(operator_user_id)
    target = ORCH_ACTIVE if activate else ORCH_ASSIGNED
    transition_task_state(db, task, new_state=target, tenant_id=int(task.tenant_id))
    publish_live_event(
        db,
        tenant_id=int(task.tenant_id),
        warehouse_id=int(task.warehouse_id),
        event_type=EVENT_TASK_ASSIGNED,
        payload={
            "task_id": task.id,
            "operator_user_id": int(operator_user_id),
            "orchestration_state": task.orchestration_state,
        },
    )
    logger.info(
        "[task.orchestrator] assigned task_id=%s operator_user_id=%s",
        task.id,
        operator_user_id,
    )
    return task


def reassign_task(
    db: Session,
    task: WmsOperationalTask,
    *,
    operator_user_id: int,
) -> WmsOperationalTask:
    task.assigned_user_id = int(operator_user_id)
    task.updated_at = datetime.utcnow()
    db.flush()
    publish_live_event(
        db,
        tenant_id=int(task.tenant_id),
        warehouse_id=int(task.warehouse_id),
        event_type=EVENT_TASK_ASSIGNED,
        payload={
            "task_id": task.id,
            "operator_user_id": int(operator_user_id),
            "reassigned": True,
        },
    )
    return task
