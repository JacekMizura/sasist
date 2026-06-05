"""Task orchestration state machine — enhancement over classic task status."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.wms_operational_task import (
    ORCH_CREATED,
    ORCH_QUEUED,
    WmsOperationalTask,
)
from ..live.constants import EVENT_TASK_UPDATED
from ..live.publisher import publish_live_event
from .constants import ORCH_TO_STATUS, VALID_TRANSITIONS

logger = logging.getLogger(__name__)


def init_orchestration_state(task: WmsOperationalTask, state: str = ORCH_QUEUED) -> WmsOperationalTask:
    task.orchestration_state = str(state).strip().upper()
    mapped = ORCH_TO_STATUS.get(task.orchestration_state)
    if mapped and not task.status:
        task.status = mapped
    return task


def transition_task_state(
    db: Session,
    task: WmsOperationalTask,
    *,
    new_state: str,
    blocked_reason: str | None = None,
    tenant_id: int | None = None,
) -> WmsOperationalTask:
    cur = str(task.orchestration_state or ORCH_CREATED).strip().upper()
    nxt = str(new_state).strip().upper()
    allowed = VALID_TRANSITIONS.get(cur, set())
    if nxt not in allowed and cur != nxt:
        raise ValueError(f"invalid orchestration transition {cur} -> {nxt}")

    task.orchestration_state = nxt
    mapped = ORCH_TO_STATUS.get(nxt)
    if mapped:
        task.status = mapped
    if nxt == "BLOCKED":
        task.blocked_reason = str(blocked_reason or "")[:128] or None
    elif blocked_reason is None:
        task.blocked_reason = None
    if nxt in ("COMPLETED", "CANCELLED", "FAILED"):
        if nxt == "COMPLETED":
            task.completed_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()
    db.flush()

    tid = int(tenant_id or task.tenant_id)
    publish_live_event(
        db,
        tenant_id=tid,
        warehouse_id=int(task.warehouse_id),
        event_type=EVENT_TASK_UPDATED,
        payload={
            "task_id": task.id,
            "orchestration_state": nxt,
            "status": task.status,
            "blocked_reason": task.blocked_reason,
        },
    )
    logger.info(
        "[task.orchestrator] transition task_id=%s %s -> %s",
        task.id,
        cur,
        nxt,
    )
    return task
