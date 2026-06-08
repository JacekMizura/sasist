"""Structured logging for inventory module observability."""

from __future__ import annotations

import json
import logging
import time
from contextlib import contextmanager
from typing import Any, Iterator

logger = logging.getLogger("inventory_count")

_METRICS: dict[str, float | int] = {
    "active_counts": 0,
    "approval_queue": 0,
    "posting_duration_ms_total": 0,
    "posting_count": 0,
    "export_duration_ms_total": 0,
    "export_count": 0,
    "recount_count": 0,
    "lock_conflicts": 0,
    "concurrent_update_conflicts": 0,
}


def inventory_metrics_snapshot() -> dict[str, float | int]:
    return dict(_METRICS)


def bump_metric(key: str, delta: float | int = 1) -> None:
    _METRICS[key] = float(_METRICS.get(key, 0)) + float(delta)


def log_inventory_structured(event: str, **fields: Any) -> None:
    payload = {"event": event, **fields}
    logger.info("[inventory] %s", json.dumps(payload, ensure_ascii=False, default=str))


@contextmanager
def observe_duration(metric_key: str, *, event: str, **fields: Any) -> Iterator[None]:
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        bump_metric(metric_key, elapsed_ms if metric_key.endswith("_ms_total") else 1)
        if metric_key == "posting_duration_ms_total":
            bump_metric("posting_count", 1)
        if metric_key == "export_duration_ms_total":
            bump_metric("export_count", 1)
        log_inventory_structured(event, duration_ms=elapsed_ms, **fields)
