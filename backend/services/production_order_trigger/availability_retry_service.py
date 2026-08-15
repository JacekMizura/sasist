"""Phase 8 — automatic ORDERS shortage retry when component availability increases.

Not a second demand engine: narrows candidates by BOM snapshot, then calls the same
``retry_order_driven_production_shortages`` core used by manual retry.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Re-entrancy: retry → reservations refresh → release → must not recurse into retry.
_in_availability_retry: ContextVar[bool] = ContextVar("prod_shortage_av_retry", default=False)

# Hard suppress (e.g. MO cancel: release first, notify once after status=cancelled).
_availability_notify_suppressed: ContextVar[bool] = ContextVar(
    "prod_shortage_av_suppress", default=False
)

# Coalesce product ids across a multi-row release (e.g. release_production_reservations loop).
_coalesce_buffer: ContextVar[dict[tuple[int, int], set[int]] | None] = ContextVar(
    "prod_shortage_av_coalesce", default=None
)

# Reasons that release materials without a *net* availability gain for other consumers
# (temporary release before re-reserve on the same MO).
_SKIP_RELEASE_REASONS = frozenset(
    {
        "orders_mo_material_refresh",
        "planning_qty_sync",
    }
)


def is_in_production_shortage_availability_retry() -> bool:
    return bool(_in_availability_retry.get())


@contextmanager
def suppress_component_availability_notify():
    """Block notify/coalesce emission (domain ops that will fire a single notify later)."""
    token = _availability_notify_suppressed.set(True)
    try:
        yield
    finally:
        _availability_notify_suppressed.reset(token)


@contextmanager
def coalesce_component_availability_events(db: Session, *, reason: str = "batched_release"):
    """
    Defer ``notify_component_availability_increased`` until the block exits,
    then fire once per (tenant, warehouse) with the union of component ids.
    """
    prev = _coalesce_buffer.get()
    buf: dict[tuple[int, int], set[int]] = {}
    token = _coalesce_buffer.set(buf)
    try:
        yield
    finally:
        _coalesce_buffer.reset(token)
    if prev is not None:
        for key, pids in buf.items():
            prev.setdefault(key, set()).update(pids)
        return
    for (tid, wid), pids in buf.items():
        if not pids:
            continue
        notify_component_availability_increased(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            component_product_ids=pids,
            reason=reason,
        )


@contextmanager
def _availability_retry_guard():
    if _in_availability_retry.get():
        yield False
        return
    token = _in_availability_retry.set(True)
    try:
        yield True
    finally:
        _in_availability_retry.reset(token)


def _advisory_lock(db: Session, *, tenant_id: int, warehouse_id: int) -> None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "postgresql":
        return
    from ..pg_advisory_lock import stable_advisory_lock_key

    key = stable_advisory_lock_key("prod_shortage_av_retry", int(tenant_id), int(warehouse_id))
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": key})
    except Exception:
        logger.exception(
            "pg_advisory_xact_lock failed tenant_id=%s warehouse_id=%s", tenant_id, warehouse_id
        )


def on_component_availability_increased(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    component_product_ids: Iterable[int],
    reason: str = "availability_increased",
    operator_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Domain hook: component net availability may have increased in this warehouse.

    Retries only ORDERS shortage sources whose MO BOM snapshot uses any of the
    given component product ids. Partial cover + priority live in the shared retry core.
    """
    empty = {
        "result": "SKIPPED",
        "reason": "empty_or_reentrant",
        "tenant_id": int(tenant_id),
        "warehouse_id": int(warehouse_id),
        "component_product_ids": [],
        "processed": 0,
        "restored": 0,
    }
    pids = sorted({int(x) for x in component_product_ids if x is not None and int(x) > 0})
    if not pids:
        return empty

    with _availability_retry_guard() as entered:
        if not entered:
            return {**empty, "reason": "reentrant"}

        _advisory_lock(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))

        from .material_validation_service import retry_order_driven_production_shortages

        out = retry_order_driven_production_shortages(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            component_product_ids=pids,
            operator_user_id=operator_user_id,
            trigger_reason=str(reason or "availability_increased"),
        )
        logger.info(
            "PRODUCTION_SHORTAGE_RETRY reason=%s tenant_id=%s warehouse_id=%s "
            "component_ids=%s candidate_sources=%s resumed=%s remaining_shortage=%s",
            reason,
            tenant_id,
            warehouse_id,
            pids,
            out.get("processed", 0),
            out.get("restored", 0),
            max(0, int(out.get("processed", 0)) - int(out.get("restored", 0))),
        )

        # Phase 3: same notify also revalidates picking-entry awaiting orders for FG.
        fg_out: dict[str, Any] = {}
        try:
            from ..picking_entry_availability_retry_service import on_fg_availability_increased

            fg_out = on_fg_availability_increased(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_ids=pids,
                reason=str(reason or "availability_increased"),
                operator_user_id=operator_user_id,
            ) or {}
        except Exception:
            logger.exception(
                "on_fg_availability_increased failed reason=%s tenant_id=%s warehouse_id=%s",
                reason,
                tenant_id,
                warehouse_id,
            )
            fg_out = {"result": "ERROR"}

        return {
            "result": out.get("result", "OK"),
            "reason": reason,
            "tenant_id": int(tenant_id),
            "warehouse_id": int(warehouse_id),
            "component_product_ids": pids,
            "processed": int(out.get("processed", 0)),
            "restored": int(out.get("restored", 0)),
            "items": out.get("items") or [],
            "fg_retry": fg_out,
        }


def notify_component_availability_increased(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None,
    component_product_ids: Iterable[int],
    reason: str,
    operator_user_id: Optional[int] = None,
) -> dict[str, Any] | None:
    """Safe wrapper for domain call sites — swallows errors so stock ops never fail on retry."""
    if warehouse_id is None or int(warehouse_id) <= 0:
        return None
    if _availability_notify_suppressed.get():
        return None
    if is_in_production_shortage_availability_retry():
        return None
    if reason in _SKIP_RELEASE_REASONS or reason.startswith("orders_mo_material_refresh"):
        return None
    # Strip reservation_release: prefix for skip check
    bare = reason.split(":", 1)[-1] if reason.startswith("reservation_release:") else reason
    if bare in _SKIP_RELEASE_REASONS:
        return None

    pids = {int(x) for x in component_product_ids if x is not None and int(x) > 0}
    if not pids:
        return None

    buf = _coalesce_buffer.get()
    if buf is not None:
        key = (int(tenant_id), int(warehouse_id))
        buf.setdefault(key, set()).update(pids)
        return None

    try:
        return on_component_availability_increased(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            component_product_ids=pids,
            reason=reason,
            operator_user_id=operator_user_id,
        )
    except Exception:
        logger.exception(
            "on_component_availability_increased failed reason=%s tenant_id=%s warehouse_id=%s",
            reason,
            tenant_id,
            warehouse_id,
        )
        return None


def should_emit_availability_on_reservation_release(reason: str | None) -> bool:
    return str(reason or "") not in _SKIP_RELEASE_REASONS
