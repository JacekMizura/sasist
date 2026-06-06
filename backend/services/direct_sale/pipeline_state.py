"""Explicit direct-sale completion pipeline state — never infer from side effects."""

from __future__ import annotations

import json
import traceback
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession

PIPELINE_OPEN = "OPEN"
PIPELINE_PAYMENT_STARTED = "PAYMENT_STARTED"
PIPELINE_PAYMENT_CONFIRMED = "PAYMENT_CONFIRMED"
PIPELINE_DOCUMENTS_CREATED = "DOCUMENTS_CREATED"
PIPELINE_WAREHOUSE_ISSUED = "WAREHOUSE_ISSUED"
PIPELINE_COMPLETED = "COMPLETED"
PIPELINE_FAILED = "FAILED"

PIPELINE_RANK: dict[str, int] = {
    PIPELINE_OPEN: 0,
    PIPELINE_PAYMENT_STARTED: 10,
    PIPELINE_PAYMENT_CONFIRMED: 20,
    PIPELINE_DOCUMENTS_CREATED: 30,
    PIPELINE_WAREHOUSE_ISSUED: 40,
    PIPELINE_COMPLETED: 50,
    PIPELINE_FAILED: -1,
}

STAGE_LOCK_AND_VALIDATE = "lock_and_validate"
STAGE_CREATE_ORDER_AND_PAYMENT = "create_order_and_payment"
STAGE_GENERATE_DOCUMENTS = "generate_documents"
STAGE_CREATE_WZ = "create_wz"
STAGE_COMPLETE_SESSION = "complete_session"

STAGE_TO_PIPELINE_STATUS: dict[str, str] = {
    STAGE_CREATE_ORDER_AND_PAYMENT: PIPELINE_PAYMENT_CONFIRMED,
    STAGE_GENERATE_DOCUMENTS: PIPELINE_DOCUMENTS_CREATED,
    STAGE_CREATE_WZ: PIPELINE_WAREHOUSE_ISSUED,
    STAGE_COMPLETE_SESSION: PIPELINE_COMPLETED,
}

STAGE_ORDER: tuple[str, ...] = (
    STAGE_LOCK_AND_VALIDATE,
    STAGE_CREATE_ORDER_AND_PAYMENT,
    STAGE_GENERATE_DOCUMENTS,
    STAGE_CREATE_WZ,
    STAGE_COMPLETE_SESSION,
)


def normalize_pipeline_status(value: str | None) -> str:
    raw = str(value or "").strip().upper()
    if raw in PIPELINE_RANK and raw != PIPELINE_FAILED:
        return raw
    return PIPELINE_OPEN


def pipeline_rank(status: str | None) -> int:
    return PIPELINE_RANK.get(normalize_pipeline_status(status), 0)


def load_pipeline_entities(sess: DirectSaleSession) -> dict[str, Any]:
    raw = getattr(sess, "pipeline_state_json", None) or ""
    if not str(raw).strip():
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def save_pipeline_entities(sess: DirectSaleSession, entities: dict[str, Any]) -> None:
    sess.pipeline_state_json = json.dumps(entities, ensure_ascii=False, default=str)


def merge_pipeline_entities(sess: DirectSaleSession, patch: dict[str, Any]) -> dict[str, Any]:
    data = load_pipeline_entities(sess)
    data.update(patch)
    save_pipeline_entities(sess, data)
    return data


def infer_pipeline_status_from_session(sess: DirectSaleSession) -> str:
    explicit = normalize_pipeline_status(getattr(sess, "pipeline_status", None))
    if explicit != PIPELINE_OPEN:
        return explicit
    ui = str(sess.status or "").strip().upper()
    if ui == "CHECKOUT":
        return PIPELINE_PAYMENT_STARTED
    if ui == "COMPLETED":
        return PIPELINE_COMPLETED
    return PIPELINE_OPEN


def stage_target_status(stage: str) -> str | None:
    return STAGE_TO_PIPELINE_STATUS.get(stage)


def should_run_stage(sess: DirectSaleSession, stage: str) -> bool:
    entities = load_pipeline_entities(sess)
    current = infer_pipeline_status_from_session(sess)
    if current == PIPELINE_COMPLETED:
        return False
    if stage == STAGE_LOCK_AND_VALIDATE:
        return not bool(entities.get("validated"))
    target = stage_target_status(stage)
    if target is None:
        return True
    return pipeline_rank(current) < pipeline_rank(target)


def resume_stage_index(sess: DirectSaleSession) -> int:
    """First stage index to execute (0 = lock_and_validate)."""
    current = infer_pipeline_status_from_session(sess)
    if current == PIPELINE_FAILED:
        failed = str(getattr(sess, "pipeline_failed_stage", None) or "").strip()
        if failed in STAGE_ORDER:
            return STAGE_ORDER.index(failed)
        last = str(load_pipeline_entities(sess).get("last_pipeline_status") or PIPELINE_PAYMENT_STARTED)
        for idx, stage in enumerate(STAGE_ORDER):
            target = stage_target_status(stage)
            if target and pipeline_rank(last) < pipeline_rank(target):
                return idx
        return 0
    for idx, stage in enumerate(STAGE_ORDER):
        if should_run_stage(sess, stage):
            return idx
    return len(STAGE_ORDER)


def mark_pipeline_success(
    sess: DirectSaleSession,
    *,
    stage: str,
    entity_patch: dict[str, Any] | None = None,
) -> None:
    entities = load_pipeline_entities(sess)
    entities["last_successful_stage"] = stage
    entities["last_success_at"] = datetime.utcnow().isoformat()
    if entity_patch:
        entities.update(entity_patch)
    if stage == STAGE_LOCK_AND_VALIDATE:
        entities["validated"] = True
    target = stage_target_status(stage)
    if target:
        sess.pipeline_status = target
    elif not getattr(sess, "pipeline_status", None):
        sess.pipeline_status = infer_pipeline_status_from_session(sess)
    sess.pipeline_failed_stage = None
    save_pipeline_entities(sess, entities)


def mark_pipeline_failed(
    sess: DirectSaleSession,
    *,
    stage: str,
    exc: Exception,
    entity_patch: dict[str, Any] | None = None,
) -> None:
    entities = load_pipeline_entities(sess)
    prev = infer_pipeline_status_from_session(sess)
    if prev != PIPELINE_FAILED:
        entities["last_pipeline_status"] = prev
    entities["failed_at"] = datetime.utcnow().isoformat()
    entities["last_operation"] = stage
    entities["error"] = f"{type(exc).__name__}: {exc}"
    entities["traceback"] = traceback.format_exc()
    if entity_patch:
        entities.update(entity_patch)
    save_pipeline_entities(sess, entities)
    sess.pipeline_status = PIPELINE_FAILED
    sess.pipeline_failed_stage = stage
    sess.status = "FAILED"
    sess.last_activity_at = datetime.utcnow()


def reload_session_for_stage(
    db: Session,
    *,
    session_id: int,
    tenant_id: int,
) -> DirectSaleSession | None:
    from .session_service import get_session_for_complete

    return get_session_for_complete(db, session_id=session_id, tenant_id=tenant_id)
