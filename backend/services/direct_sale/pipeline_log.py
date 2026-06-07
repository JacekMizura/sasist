"""Structured [direct_sales.pipeline] logging."""

from __future__ import annotations

import json
import logging
import time
import uuid
from contextlib import contextmanager
from typing import Any, Generator

logger = logging.getLogger(__name__)


def new_transaction_id() -> str:
    return str(uuid.uuid4())


def log_pipeline_event(
    *,
    session_id: int,
    stage: str,
    transaction_id: str,
    status: str,
    entity_ids: dict[str, Any] | None = None,
    duration_ms: float | None = None,
    error: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "session_id": int(session_id),
        "stage": str(stage),
        "transaction_id": str(transaction_id),
        "status": str(status),
    }
    if entity_ids:
        payload["entity_ids"] = entity_ids
    if duration_ms is not None:
        payload["duration_ms"] = round(float(duration_ms), 2)
    if error:
        payload["error"] = error
    if extra:
        payload.update(extra)
    logger.info("[direct_sales.pipeline] %s", json.dumps(payload, ensure_ascii=False, default=str))


@contextmanager
def pipeline_stage_span(
    *,
    session_id: int,
    stage: str,
    transaction_id: str,
    entity_ids: dict[str, Any] | None = None,
) -> Generator[None, None, None]:
    started = time.perf_counter()
    log_pipeline_event(
        session_id=session_id,
        stage=stage,
        transaction_id=transaction_id,
        status="start",
        entity_ids=entity_ids,
    )
    try:
        yield
    except Exception as exc:
        from .complete_debug_log import root_complete_exception, safe_exception_str

        elapsed_ms = (time.perf_counter() - started) * 1000
        root = root_complete_exception(exc)
        log_pipeline_event(
            session_id=session_id,
            stage=stage,
            transaction_id=transaction_id,
            status="error",
            entity_ids=entity_ids,
            duration_ms=elapsed_ms,
            error=f"{type(root).__name__}: {safe_exception_str(root)}",
        )
        raise
    else:
        elapsed_ms = (time.perf_counter() - started) * 1000
        log_pipeline_event(
            session_id=session_id,
            stage=stage,
            transaction_id=transaction_id,
            status="ok",
            entity_ids=entity_ids,
            duration_ms=elapsed_ms,
        )
