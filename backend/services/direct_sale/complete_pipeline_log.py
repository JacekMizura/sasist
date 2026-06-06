"""Structured step logging for direct-sale completion pipeline."""

from __future__ import annotations

import logging
import time
import traceback
from contextlib import contextmanager
from typing import Generator

logger = logging.getLogger(__name__)

STEPS = (
    "create_order",
    "plan_allocations",
    "reserve_stock",
    "issue_stock",
    "create_payment",
    "generate_documents",
    "complete_session",
)


_STEP_TAG = {
    "create_order": "validation",
    "plan_allocations": "inventory",
    "reserve_stock": "inventory",
    "issue_stock": "inventory",
    "create_payment": "payment",
    "generate_documents": "document",
    "complete_session": "commit",
}


@contextmanager
def log_complete_step(*, session_id: int, step: str) -> Generator[None, None, None]:
    tag = _STEP_TAG.get(step, step)
    started = time.perf_counter()
    try:
        yield
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.exception(
            "[direct-sales.complete.error] session_id=%s step=%s tag=%s elapsed_ms=%s exception=%s",
            session_id,
            step,
            tag,
            elapsed_ms,
            f"{type(exc).__name__}: {exc}",
        )
        raise
    else:
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.info(
            "[direct-sales.complete.%s] session_id=%s step=%s elapsed_ms=%s status=ok",
            tag,
            session_id,
            step,
            elapsed_ms,
        )
