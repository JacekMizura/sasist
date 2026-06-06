"""Structured step logging for direct-sale completion pipeline."""

from __future__ import annotations

import json
import logging
import time
import traceback
from contextlib import contextmanager
from typing import Any, Generator

logger = logging.getLogger(__name__)

def log_session_state_transition(
    *,
    session_id: int,
    from_status: str | None,
    to_status: str,
    stage: str,
) -> None:
    logger.info(
        "[direct_sales.session_state] %s",
        json.dumps(
            {
                "session_id": int(session_id),
                "from": str(from_status or ""),
                "to": str(to_status),
                "stage": str(stage),
            },
            ensure_ascii=False,
        ),
    )


STEPS = (
    "create_order",
    "plan_allocations",
    "create_payment",
    "generate_documents",
    "create_wz",
    "complete_session",
)


_STEP_TAG = {
    "create_order": "validation",
    "plan_allocations": "inventory",
    "create_payment": "payment",
    "generate_documents": "document",
    "create_wz": "inventory",
    "complete_session": "commit",
}


def log_complete_stage(
    *,
    session_id: int,
    stage: str,
    payment_method: str | None = None,
    totals: float | None = None,
    order_status: int | None = None,
    issue_strategy: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "session_id": int(session_id),
        "stage": str(stage),
        "payment_method": payment_method,
        "totals": round(float(totals), 2) if totals is not None else None,
        "order_status": order_status,
        "issue_strategy": issue_strategy,
    }
    if extra:
        payload.update(extra)
    logger.info("[direct_sales.complete] %s", json.dumps(payload, ensure_ascii=False, default=str))


@contextmanager
def log_complete_step(
    *,
    session_id: int,
    step: str,
    context: dict[str, Any] | None = None,
) -> Generator[None, None, None]:
    tag = _STEP_TAG.get(step, step)
    ctx = dict(context or {})
    log_complete_stage(
        session_id=session_id,
        stage=step,
        payment_method=ctx.get("payment_method"),
        totals=ctx.get("totals"),
        order_status=ctx.get("order_status"),
        issue_strategy=ctx.get("issue_strategy"),
        extra={k: v for k, v in ctx.items() if k not in {"payment_method", "totals", "order_status", "issue_strategy"}},
    )
    started = time.perf_counter()
    try:
        yield
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.error(
            "[direct_sales.complete] %s",
            json.dumps(
                {
                    "session_id": int(session_id),
                    "stage": step,
                    "status": "error",
                    "error": error_msg,
                },
                ensure_ascii=False,
                default=str,
            ),
        )
        logger.debug(
            "[direct_sales.complete] stage=%s traceback=%s",
            step,
            traceback.format_exc(),
        )
        raise
    else:
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.info(
            "[direct_sales.complete] %s",
            json.dumps(
                {
                    "session_id": int(session_id),
                    "stage": step,
                    "status": "ok",
                    "tag": tag,
                    "elapsed_ms": elapsed_ms,
                },
                ensure_ascii=False,
                default=str,
            ),
        )
