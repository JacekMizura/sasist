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


@contextmanager
def log_complete_step(*, session_id: int, step: str) -> Generator[None, None, None]:
    started = time.perf_counter()
    try:
        yield
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.exception(
            "[direct-sales.complete] session_id=%s step=%s elapsed_ms=%s exception=%s traceback=%s",
            session_id,
            step,
            elapsed_ms,
            f"{type(exc).__name__}: {exc}",
            traceback.format_exc(),
        )
        raise
    else:
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.info(
            "[direct-sales.complete] session_id=%s step=%s elapsed_ms=%s status=ok",
            session_id,
            step,
            elapsed_ms,
        )
