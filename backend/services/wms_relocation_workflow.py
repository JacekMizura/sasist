"""RELOCATION workflow: sessions, carrier validation, audit history, concurrency."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.order import Order
from ..models.wms_operational_task import (
    ACTIVE_STATUSES,
    STATUS_DONE,
    STATUS_IN_PROGRESS,
    STATUS_OPEN,
    TASK_RELOCATION,
    WmsOperationalTask,
)
from .wms_carrier_service import scan_carrier_by_barcode
from .order_issue_task_service import find_order_by_scan
from .wms_operational_task_service import (
    TASK_SHORTAGE_RECOLLECT,
    TASK_WAITING_SUPPLY,
    _allocation_row_status,
    _json_dumps,
    _json_loads,
    _now,
    _task_type_scan_priority,
)

logger = logging.getLogger(__name__)

SESSION_TIMEOUT_SECONDS = 12 * 60
HISTORY_MAX_ENTRIES = 150

# Carrier lifecycle — assign allowed unless blocked
CARRIER_BLOCKED_STATUSES = frozenset(
    {
        "ARCHIVED",
        "SHIPPED",
        "CLOSED",
        "LOCKED",
        "INACTIVE",
        "DELETED",
        "RETIRED",
    }
)
CARRIER_ALLOWED_STATUSES = frozenset(
    {
        "ACTIVE",
        "EMPTY",
        "ASSIGNED",
        "PACKED",
        "AVAILABLE",
        "OPEN",
    }
)


class RelocationSessionLockedError(ValueError):
    """Another operator holds an active session."""

    def __init__(self, *, holder_name: str, holder_id: int, can_takeover: bool = True):
        self.holder_name = holder_name
        self.holder_id = int(holder_id)
        self.can_takeover = can_takeover
        super().__init__(f"Zadanie obsługuje: {holder_name}")


@dataclass
class RelocationSessionView:
    operator_id: int
    operator_name: str
    device_id: Optional[str]
    started_at: str
    last_activity_at: str
    active_carrier_id: Optional[int]
    active_carrier_label: Optional[str]
    is_holder: bool
    is_expired: bool
    can_edit: bool
    can_takeover: bool


def _parse_dt(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw
    s = str(raw).strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _session_from_payload(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    raw = payload.get("session")
    return raw if isinstance(raw, dict) else None


def _is_session_expired(session: dict[str, Any], *, now: Optional[datetime] = None) -> bool:
    ref = _parse_dt(session.get("last_activity_at")) or _parse_dt(session.get("started_at"))
    if ref is None:
        return True
    now = now or _now()
    return (now - ref).total_seconds() > SESSION_TIMEOUT_SECONDS


def session_view_from_payload(
    payload: dict[str, Any],
    *,
    requesting_operator_id: Optional[int] = None,
) -> Optional[RelocationSessionView]:
    session = _session_from_payload(payload)
    if not session:
        return None
    expired = _is_session_expired(session)
    holder_id = int(session.get("operator_id") or 0)
    holder_name = str(session.get("operator_name") or f"Operator #{holder_id}")
    is_holder = requesting_operator_id is not None and int(requesting_operator_id) == holder_id
    can_edit = is_holder and not expired
    can_takeover = not expired and holder_id > 0 and not is_holder
    if expired:
        can_takeover = True
        can_edit = False
    cid = session.get("active_carrier_id")
    return RelocationSessionView(
        operator_id=holder_id,
        operator_name=holder_name,
        device_id=(str(session.get("device_id") or "").strip() or None),
        started_at=str(session.get("started_at") or ""),
        last_activity_at=str(session.get("last_activity_at") or ""),
        active_carrier_id=int(cid) if cid is not None and int(cid) > 0 else None,
        active_carrier_label=(str(session.get("active_carrier_label") or "").strip() or None),
        is_holder=is_holder,
        is_expired=expired,
        can_edit=can_edit,
        can_takeover=can_takeover and not is_holder,
    )


def _append_relocation_history(
    payload: dict[str, Any],
    *,
    action: str,
    operator_id: int,
    operator_name: str,
    qty: float | None = None,
    carrier_id: int | None = None,
    carrier_label: str | None = None,
    order_id: int | None = None,
    order_item_id: int | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    hist = payload.get("history")
    if not isinstance(hist, list):
        hist = []
    entry: dict[str, Any] = {
        "at": _now().isoformat(),
        "action": str(action)[:64],
        "operator_id": int(operator_id),
        "operator_name": str(operator_name)[:128],
    }
    if qty is not None:
        entry["qty"] = round(float(qty), 6)
    if carrier_id is not None:
        entry["carrier_id"] = int(carrier_id)
    if carrier_label:
        entry["carrier_label"] = str(carrier_label)[:128]
    if order_id is not None:
        entry["order_id"] = int(order_id)
    if order_item_id is not None:
        entry["order_item_id"] = int(order_item_id)
    if extra:
        entry.update(extra)
    hist.append(entry)
    payload["history"] = hist[-HISTORY_MAX_ENTRIES:]


def _check_payload_version(payload: dict[str, Any], expected_version: int | None) -> int:
    current = int(payload.get("lock_version") or 0)
    if expected_version is not None and int(expected_version) != current:
        raise ValueError("Konflikt wersji zadania — odśwież ekran i spróbuj ponownie.")
    return current


def _bump_payload_version(payload: dict[str, Any], expected_version: int | None) -> int:
    current = _check_payload_version(payload, expected_version)
    new_v = current + 1
    payload["lock_version"] = new_v
    return new_v


def validate_carrier_for_relocation(
    db: Session,
    *,
    tenant_id: int,
    carrier_id: int,
) -> tuple[str, str]:
    """Return (label, lifecycle_status). Raises ValueError if blocked."""
    from ..models.warehouse_carrier import WarehouseCarrier

    c = (
        db.query(WarehouseCarrier)
        .filter(
            WarehouseCarrier.id == int(carrier_id),
            WarehouseCarrier.tenant_id == int(tenant_id),
            WarehouseCarrier.deleted_at.is_(None),
        )
        .first()
    )
    if not c:
        raise ValueError("Nośnik nie istnieje.")
    if getattr(c, "deleted_at", None) is not None:
        raise ValueError("Nośnik jest zarchiwizowany.")
    status = str(getattr(c, "status", "") or "").strip().upper()
    if status in CARRIER_BLOCKED_STATUSES:
        raise ValueError(f"Nośnik w statusie „{status}” — nie można przypisać towaru.")
    if status and status not in CARRIER_ALLOWED_STATUSES and status not in ("", "ACTIVE"):
        logger.info("carrier status %s allowed loosely for relocation", status)
    label = (c.barcode or c.code or c.name or "").strip() or f"Nośnik #{c.id}"
    lifecycle = status or "ACTIVE"
    if getattr(c, "locked_by_user_id", None):
        raise ValueError("Nośnik jest zablokowany przez innego użytkownika.")
    return label, lifecycle


def carrier_relocation_stats(
    db: Session,
    *,
    tenant_id: int,
    carrier_id: int,
) -> dict[str, Any]:
    from sqlalchemy import func

    from ..models.warehouse_carrier import WarehouseCarrierItem

    rows = (
        db.query(
            WarehouseCarrierItem.product_id,
            func.sum(WarehouseCarrierItem.quantity),
        )
        .filter(
            WarehouseCarrierItem.tenant_id == int(tenant_id),
            WarehouseCarrierItem.carrier_id == int(carrier_id),
        )
        .group_by(WarehouseCarrierItem.product_id)
        .all()
    )
    total_qty = round(sum(float(r[1] or 0) for r in rows), 6)
    return {
        "product_count": len(rows),
        "total_qty": total_qty,
        "order_count": 0,
    }


def _lock_relocation_task(
    db: Session,
    task_id: int,
    *,
    tenant_id: int,
) -> WmsOperationalTask | None:
    return (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.id == int(task_id),
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.task_type == TASK_RELOCATION,
            WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
        )
        .with_for_update(of=WmsOperationalTask)
        .first()
    )


def acquire_relocation_session(
    db: Session,
    task_id: int,
    *,
    tenant_id: int,
    operator_id: int,
    operator_name: str,
    device_id: str | None = None,
    takeover: bool = False,
) -> tuple[WmsOperationalTask, RelocationSessionView]:
    task = _lock_relocation_task(db, task_id, tenant_id=tenant_id)
    if not task:
        raise ValueError("Brak aktywnego zadania rozlokowania.")

    payload = _json_loads(task.payload_json, {})
    if not isinstance(payload, dict):
        payload = {}

    existing = _session_from_payload(payload)
    if existing and not _is_session_expired(existing):
        holder_id = int(existing.get("operator_id") or 0)
        if holder_id != int(operator_id):
            if not takeover:
                raise RelocationSessionLockedError(
                    holder_name=str(existing.get("operator_name") or f"Operator #{holder_id}"),
                    holder_id=holder_id,
                )
            _append_relocation_history(
                payload,
                action="session_takeover",
                operator_id=int(operator_id),
                operator_name=operator_name,
                extra={"from_operator_id": holder_id},
            )

    now = _now()
    prev = existing or {}
    session = {
        "operator_id": int(operator_id),
        "operator_name": str(operator_name)[:128],
        "device_id": (str(device_id or prev.get("device_id") or "").strip() or None),
        "started_at": (prev.get("started_at") if takeover and prev.get("started_at") else now.isoformat()),
        "last_activity_at": now.isoformat(),
        "active_carrier_id": prev.get("active_carrier_id"),
        "active_carrier_label": prev.get("active_carrier_label"),
    }
    payload["session"] = session
    _bump_payload_version(payload, None)
    task.payload_json = _json_dumps(payload)
    if task.status == STATUS_OPEN:
        task.status = STATUS_IN_PROGRESS
    task.updated_at = now

    if takeover or not existing:
        _append_relocation_history(
            payload,
            action="session_start" if not takeover else "session_resume",
            operator_id=int(operator_id),
            operator_name=operator_name,
        )
        task.payload_json = _json_dumps(payload)

    view = session_view_from_payload(payload, requesting_operator_id=int(operator_id))
    assert view is not None
    return task, view


def touch_relocation_session(
    db: Session,
    task: WmsOperationalTask,
    *,
    operator_id: int,
    active_carrier_id: int | None = None,
    active_carrier_label: str | None = None,
    expected_version: int | None = None,
) -> int:
    payload = _json_loads(task.payload_json, {})
    if not isinstance(payload, dict):
        payload = {}
    session = _session_from_payload(payload)
    if not session or _is_session_expired(session):
        raise ValueError("Sesja wygasła — przejmij zadanie ponownie.")
    if int(session.get("operator_id") or 0) != int(operator_id):
        raise ValueError("Brak uprawnień do edycji tego zadania.")

    session["last_activity_at"] = _now().isoformat()
    if active_carrier_id is not None:
        session["active_carrier_id"] = int(active_carrier_id) if int(active_carrier_id) > 0 else None
    if active_carrier_label is not None:
        session["active_carrier_label"] = (active_carrier_label or "").strip() or None
    payload["session"] = session
    new_v = _bump_payload_version(payload, expected_version)
    task.payload_json = _json_dumps(payload)
    task.updated_at = _now()
    return new_v


def release_relocation_session(
    db: Session,
    task_id: int,
    *,
    tenant_id: int,
    operator_id: int,
    operator_name: str,
) -> WmsOperationalTask | None:
    task = _lock_relocation_task(db, task_id, tenant_id=tenant_id)
    if not task:
        return None
    payload = _json_loads(task.payload_json, {})
    if not isinstance(payload, dict):
        return task
    session = _session_from_payload(payload)
    if session and int(session.get("operator_id") or 0) == int(operator_id):
        _append_relocation_history(
            payload,
            action="session_release",
            operator_id=int(operator_id),
            operator_name=operator_name,
        )
        payload["session"] = None
        _bump_payload_version(payload, None)
        task.payload_json = _json_dumps(payload)
        task.updated_at = _now()
    return task


def require_session_can_assign(
    payload: dict[str, Any],
    *,
    operator_id: int,
) -> RelocationSessionView:
    session = _session_from_payload(payload)
    if not session:
        raise ValueError("Brak aktywnej sesji operatora — otwórz zadanie ponownie.")
    if _is_session_expired(session):
        raise ValueError("Sesja wygasła — przejmij zadanie ponownie.")
    view = session_view_from_payload(payload, requesting_operator_id=int(operator_id))
    if not view or not view.can_edit:
        holder = str(session.get("operator_name") or "inny operator")
        raise ValueError(f"Zadanie obsługuje: {holder}")
    return view


def paginate_relocation_allocations(
    payload: dict[str, Any],
    *,
    offset: int = 0,
    limit: int = 40,
    status_filter: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    from .wms_operational_task_service import _normalize_payload_allocations

    allocs = _normalize_payload_allocations(list(payload.get("allocations") or []))
    if status_filter:
        sf = str(status_filter).strip().lower()
        allocs = [a for a in allocs if _allocation_row_status(a) == sf]
    pending_first = sorted(
        allocs,
        key=lambda a: (
            0 if _allocation_row_status(a) == "pending" else 1 if _allocation_row_status(a) == "partial" else 2,
            int(a.get("order_id") or 0),
            int(a.get("order_item_id") or 0),
        ),
    )
    total = len(pending_first)
    page = pending_first[max(0, int(offset)) : max(0, int(offset)) + max(1, min(200, int(limit)))]
    return page, total


def relocation_alloc_counts_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    task: WmsOperationalTask | None = None,
    log_checks: bool = False,
) -> tuple[int, int, int]:
    """
    Liczy tylko **aktywne** alokacje rozlokowania (pending / partial, qty > 0).

    Alokacje ``done`` lub z qty=0 nie blokują ``ready_pack``.
    """
    from ..models.order_item import OrderItem
    from .relocation_reason import infer_relocation_reason, relocation_reason_is_actionable
    from .wms_operational_task_service import (
        _allocation_row_status,
        _normalize_relocation_allocation_row,
        _try_auto_complete_relocation_task,
        prune_invalid_relocation_allocations,
    )

    oid = int(order_id)
    if task is None:
        task = _find_relocation_task_with_any_alloc_for_order(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=oid,
        )
    if task is None:
        return 0, 0, 0

    if prune_invalid_relocation_allocations(db, task):
        db.flush()

    payload = _json_loads(getattr(task, "payload_json", None), {})
    if not isinstance(payload, dict):
        return 0, 0, 0

    task_status = str(getattr(task, "status", "") or "")
    is_cancelled = task_status.lower() == "cancelled"
    pending = partial = done = 0
    for raw in payload.get("allocations") or []:
        if not isinstance(raw, dict) or int(raw.get("order_id") or 0) != oid:
            continue
        row = _normalize_relocation_allocation_row(raw)
        qty = float(row.get("qty") or 0)
        oiid = int(row.get("order_item_id") or 0)
        reason = infer_relocation_reason(row)
        source_workflow = (str(row.get("source_event_id") or "")).strip() or None

        if not relocation_reason_is_actionable(reason):
            if log_checks:
                logger.info(
                    "[braki.relocation.debug] order_id=%s relocation_task_id=%s "
                    "order_item_id=%s relocation_status=%s created_reason=%s "
                    "created_from=%s is_completed=%s is_cancelled=%s relocation_qty=%s "
                    "source_workflow=%s action=skip_invalid_reason",
                    oid,
                    int(task.id),
                    oiid,
                    task_status,
                    reason,
                    str(row.get("source_event_id") or ""),
                    bool(row.get("done")),
                    is_cancelled,
                    qty,
                    source_workflow,
                )
            continue

        if qty <= 1e-9:
            if log_checks:
                logger.info(
                    "[braki.relocation.debug] order_id=%s relocation_task_id=%s "
                    "order_item_id=%s relocation_status=%s created_reason=%s "
                    "created_from=%s is_completed=%s is_cancelled=%s relocation_qty=0 "
                    "source_workflow=%s action=skip_zero_qty",
                    oid,
                    int(task.id),
                    oiid,
                    task_status,
                    reason,
                    str(row.get("source_event_id") or ""),
                    bool(row.get("done")),
                    is_cancelled,
                    source_workflow,
                )
            continue

        st = _allocation_row_status(row)
        relocated = float(row.get("relocated_qty") or 0)
        is_done_flag = bool(row.get("done"))
        if log_checks:
            logger.info(
                "[braki.relocation.debug] order_id=%s relocation_task_id=%s "
                "order_item_id=%s relocation_status=%s created_reason=%s "
                "created_from=%s is_completed=%s is_cancelled=%s relocation_qty=%s "
                "relocated_qty=%s source_workflow=%s allocation_status=%s",
                oid,
                int(task.id),
                oiid,
                task_status,
                reason,
                str(row.get("source_event_id") or ""),
                is_done_flag or st == "done",
                is_cancelled,
                qty,
                relocated,
                source_workflow,
                st,
            )
        if st == "pending":
            pending += 1
        elif st == "partial":
            partial += 1
        else:
            done += 1

    if pending == 0 and partial == 0:
        _try_auto_complete_relocation_task(db, task)

    return pending, partial, done


def _find_relocation_task_with_any_alloc_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> WmsOperationalTask | None:
    """Zadanie RELOCATION z dowolną alokacją dla zamówienia (do inspekcji / auto-close)."""
    rows = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.warehouse_id == int(warehouse_id),
            WmsOperationalTask.task_type == TASK_RELOCATION,
            WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
        )
        .order_by(WmsOperationalTask.updated_at.desc())
        .limit(100)
        .all()
    )
    oid = int(order_id)
    for t in rows:
        payload = _json_loads(t.payload_json, {})
        if not isinstance(payload, dict):
            continue
        for a in payload.get("allocations") or []:
            if isinstance(a, dict) and int(a.get("order_id") or 0) == oid:
                return t
    return None


def order_has_active_relocation_work(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    log_checks: bool = False,
) -> bool:
    pending, partial, _ = relocation_alloc_counts_for_order(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        log_checks=log_checks,
    )
    return pending > 0 or partial > 0


def find_relocation_task_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> WmsOperationalTask | None:
    """Zwraca zadanie tylko gdy istnieje co najmniej jedna aktywna alokacja (pending/partial)."""
    task = _find_relocation_task_with_any_alloc_for_order(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
    )
    if task is None:
        return None
    pending, partial, _ = relocation_alloc_counts_for_order(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        task=task,
        log_checks=True,
    )
    if pending > 0 or partial > 0:
        return task
    return None


def resolve_relocation_scan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    scan: str,
) -> WmsOperationalTask | None:
    """Resolve carrier / order / product scan to best operational task."""
    raw = (scan or "").strip()
    if not raw:
        return None

    carrier_out = scan_carrier_by_barcode(db, int(tenant_id), raw)
    if carrier_out.found and carrier_out.carrier:
        cid = int(carrier_out.carrier.id)
        rows = (
            db.query(WmsOperationalTask)
            .filter(
                WmsOperationalTask.tenant_id == int(tenant_id),
                WmsOperationalTask.warehouse_id == int(warehouse_id),
                WmsOperationalTask.task_type == TASK_RELOCATION,
                WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
            )
            .order_by(WmsOperationalTask.updated_at.desc())
            .limit(80)
            .all()
        )
        for t in rows:
            payload = _json_loads(t.payload_json, {})
            if not isinstance(payload, dict):
                continue
            for a in payload.get("allocations") or []:
                if not isinstance(a, dict):
                    continue
                if int(a.get("carrier_id") or 0) == cid and not a.get("done"):
                    return t
            session = _session_from_payload(payload)
            if session and int(session.get("active_carrier_id") or 0) == cid:
                return t

    order = find_order_by_scan(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), scan=raw)
    if order:
        hit = find_relocation_task_for_order(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order.id),
        )
        if hit:
            return hit

    from ..models.product import Product

    pr = (
        db.query(Product)
        .filter(
            Product.tenant_id == int(tenant_id),
            Product.deleted_at.is_(None),
        )
        .filter(
            (Product.ean == raw)
            | (Product.sku == raw)
            | (Product.symbol == raw)
            | (Product.barcode == raw)
        )
        .first()
    )
    if pr:
        hits = (
            db.query(WmsOperationalTask)
            .filter(
                WmsOperationalTask.tenant_id == int(tenant_id),
                WmsOperationalTask.warehouse_id == int(warehouse_id),
                WmsOperationalTask.product_id == int(pr.id),
                WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
                WmsOperationalTask.task_type.in_(
                    (TASK_RELOCATION, TASK_SHORTAGE_RECOLLECT, TASK_WAITING_SUPPLY)
                ),
            )
            .all()
        )
        if hits:
            hits.sort(
                key=lambda t: (
                    _task_type_scan_priority(str(t.task_type)),
                    -int(t.priority or 0),
                    -int(t.id),
                )
            )
            return hits[0]
    return None


def enrich_relocation_detail_extras(
    db: Session,
    payload: dict[str, Any],
    *,
    tenant_id: int,
    requesting_operator_id: int | None = None,
    allocations_limit: int = 40,
) -> dict[str, Any]:
    """Session, history, lock_version, paginated allocations slice, carrier stats."""
    from ..schemas.wms_operational_task import (
        WmsOperationalRelocationAllocation,
        WmsRelocationCarrierStats,
        WmsRelocationHistoryEntry,
        WmsRelocationSessionState,
    )
    from .wms_operational_task_service import _normalize_payload_allocations

    lock_version = int(payload.get("lock_version") or 0)
    session_view = session_view_from_payload(payload, requesting_operator_id=requesting_operator_id)
    session_schema = None
    can_edit = False
    if session_view:
        session_schema = WmsRelocationSessionState(
            operator_id=session_view.operator_id,
            operator_name=session_view.operator_name,
            device_id=session_view.device_id,
            started_at=session_view.started_at or None,
            last_activity_at=session_view.last_activity_at or None,
            active_carrier_id=session_view.active_carrier_id,
            active_carrier_label=session_view.active_carrier_label,
            is_holder=session_view.is_holder,
            is_expired=session_view.is_expired,
            can_edit=session_view.can_edit,
            can_takeover=session_view.can_takeover,
        )
        can_edit = session_view.can_edit

    hist_raw = payload.get("history") if isinstance(payload.get("history"), list) else []
    history = [
        WmsRelocationHistoryEntry(
            at=str(h.get("at") or ""),
            action=str(h.get("action") or ""),
            operator_id=int(h.get("operator_id") or 0),
            operator_name=str(h.get("operator_name") or ""),
            qty=h.get("qty"),
            carrier_id=h.get("carrier_id"),
            carrier_label=h.get("carrier_label"),
            order_id=h.get("order_id"),
            order_item_id=h.get("order_item_id"),
        )
        for h in hist_raw[-30:]
        if isinstance(h, dict)
    ]

    page_rows, total = paginate_relocation_allocations(
        payload, offset=0, limit=allocations_limit
    )
    norm_allocs = _normalize_payload_allocations(page_rows)
    reloc_allocs: list[WmsOperationalRelocationAllocation] = []
    for a in norm_allocs:
        oid = int(a["order_id"])
        oiid = int(a["order_item_id"])
        o = db.query(Order).filter(Order.id == oid).first()
        onum = (o.number if o else None) or None
        req = float(a.get("qty") or 0)
        rel = float(a.get("relocated_qty") or 0)
        reloc_allocs.append(
            WmsOperationalRelocationAllocation(
                order_id=oid,
                order_item_id=oiid,
                qty=req,
                target_zone=a.get("target_zone"),
                order_number=(str(onum).strip() if onum else None),
                carrier_id=a.get("carrier_id"),
                carrier_label=a.get("carrier_label"),
                relocated_qty=rel,
                remaining_qty=round(max(0.0, req - rel), 6),
                relocated_by=a.get("relocated_by"),
                done=bool(a.get("done")),
                status=_allocation_row_status(a),
            )
        )

    carrier_stats = None
    if session_view and session_view.active_carrier_id:
        stats = carrier_relocation_stats(
            db, tenant_id=int(tenant_id), carrier_id=int(session_view.active_carrier_id)
        )
        carrier_stats = WmsRelocationCarrierStats(
            product_count=int(stats.get("product_count") or 0),
            order_count=int(stats.get("order_count") or 0),
            total_qty=float(stats.get("total_qty") or 0),
        )

    return {
        "lock_version": lock_version,
        "relocation_session": session_schema,
        "relocation_history": history,
        "can_edit_relocation": can_edit,
        "active_carrier_stats": carrier_stats,
        "relocation_allocations": reloc_allocs,
        "relocation_allocations_total": total,
    }


def operator_display_name(user: AppUser | None) -> str:
    if user is None:
        return "Operator"
    for attr in ("full_name", "name", "username", "email"):
        val = getattr(user, attr, None)
        if val and str(val).strip():
            return str(val).strip()
    return f"Operator #{getattr(user, 'id', 0)}"
