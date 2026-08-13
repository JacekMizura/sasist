"""Shared operational background loop — one scheduler for all in-process workers.

Railway runs a single web process (``python3 run_server.py``). There is no Celery/RQ.
Workers historically ran once at startup; this daemon thread keeps them ticking without a
second production-only cron service.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

_DEFAULT_TICK_SEC = 60
_thread: threading.Thread | None = None
_stop = threading.Event()


def operational_worker_tick_seconds() -> int:
    raw = os.environ.get("OPERATIONAL_WORKER_TICK_SEC", str(_DEFAULT_TICK_SEC))
    try:
        return max(15, int(raw))
    except (TypeError, ValueError):
        return _DEFAULT_TICK_SEC


def tick_operational_workers_once() -> dict[str, Any]:
    """One pass of shared workers (reservation TTL, cart, docs, scans, production replenishment)."""
    from ..database import SessionLocal
    from ..platform_state import is_production_schema_valid
    from .cart_lifecycle_worker import run_cart_lifecycle_worker
    from .document_generation_worker import process_pending_document_jobs
    from .production_stock_replenishment_worker import run_production_stock_replenishment_worker
    from .replenishment_scan_worker import run_replenishment_scan_worker
    from .reservation_expiration_worker import run_reservation_lifecycle_worker
    from .schema_guard import require_production_schema_valid

    require_production_schema_valid(context="tick_operational_workers_once")
    if not is_production_schema_valid():
        return {"skipped": "production_schema_invalid"}

    db = SessionLocal()
    out: dict[str, Any] = {}
    try:
        out["reservations"] = run_reservation_lifecycle_worker(db)
        out["cart"] = run_cart_lifecycle_worker(db)
        out["documents"] = process_pending_document_jobs(db, limit=20)
        out["shelf_replenishment"] = run_replenishment_scan_worker(db)
        out["production_stock_replenishment"] = run_production_stock_replenishment_worker(db)
        db.commit()
    except Exception:
        logger.exception("operational_workers tick failed")
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        db.close()
    return out


def _thread_main() -> None:
    tick = operational_worker_tick_seconds()
    logger.info("operational_workers_loop started tick_sec=%s", tick)
    # Allow HTTP / schema settle before first heavy tick.
    if _stop.wait(timeout=min(5.0, float(tick))):
        return
    while not _stop.is_set():
        try:
            tick_operational_workers_once()
        except Exception:
            logger.exception("operational_workers_loop iteration error")
        if _stop.wait(timeout=float(tick)):
            break


def start_operational_workers_loop() -> threading.Thread | None:
    """Idempotent: start the shared daemon loop once per process."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return _thread
    _stop.clear()
    _thread = threading.Thread(
        target=_thread_main,
        name="operational_workers_loop",
        daemon=True,
    )
    _thread.start()
    return _thread
