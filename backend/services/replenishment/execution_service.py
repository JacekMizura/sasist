"""Scanner-driven replenishment execution steps on operational tasks."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.wms_operational_task import (
    ORCH_ACTIVE,
    ORCH_BLOCKED,
    ORCH_COMPLETED,
    ORCH_WAITING,
    WmsOperationalTask,
)
from ..orchestration.lifecycle_service import transition_task_state

logger = logging.getLogger(__name__)

VALID_STEPS = frozenset({"scan_source", "scan_product", "scan_target", "complete", "block", "escalate"})


def _load_payload(task: WmsOperationalTask) -> dict:
    try:
        data = json.loads(task.payload_json or "{}")
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_payload(task: WmsOperationalTask, payload: dict) -> None:
    task.payload_json = json.dumps(payload, ensure_ascii=False)
    task.updated_at = datetime.utcnow()


def advance_replenishment_execution(
    db: Session,
    task: WmsOperationalTask,
    *,
    step: str,
    scan_code: str | None = None,
    note: str | None = None,
) -> WmsOperationalTask:
    st = str(step or "").strip().lower()
    if st not in VALID_STEPS:
        raise ValueError(f"unsupported step: {st}")

    payload = _load_payload(task)
    code = str(scan_code or "").strip() or None

    if st == "scan_source":
        payload["source_scanned_at"] = datetime.utcnow().isoformat()
        if code:
            payload["source_scan_code"] = code
        _save_payload(task, payload)
        if str(task.orchestration_state or "").upper() in ("QUEUED", "ASSIGNED"):
            transition_task_state(db, task, new_state=ORCH_ACTIVE)
        return task

    if st == "scan_product":
        if code:
            payload["product_scan_code"] = code
        _save_payload(task, payload)
        return task

    if st == "scan_target":
        payload["target_scanned_at"] = datetime.utcnow().isoformat()
        if code:
            payload["target_scan_code"] = code
        _save_payload(task, payload)
        transition_task_state(db, task, new_state=ORCH_WAITING)
        return task

    if st == "complete":
        task.quantity_done = float(task.quantity_required or 0)
        payload["completed_at"] = datetime.utcnow().isoformat()
        if note:
            payload["completion_note"] = str(note)[:256]
        _save_payload(task, payload)
        transition_task_state(db, task, new_state=ORCH_COMPLETED)
        logger.info("[replenishment.engine] completed task_id=%s", task.id)
        return task

    if st == "block":
        payload["blocked_at"] = datetime.utcnow().isoformat()
        if note:
            payload["block_note"] = str(note)[:256]
        _save_payload(task, payload)
        transition_task_state(db, task, new_state=ORCH_BLOCKED, blocked_reason=note or "blocked")
        return task

    if st == "escalate":
        payload["escalated_at"] = datetime.utcnow().isoformat()
        payload["escalation_note"] = str(note or "escalated")[:256]
        _save_payload(task, payload)
        transition_task_state(db, task, new_state=ORCH_BLOCKED, blocked_reason="escalated")
        return task

    return task
