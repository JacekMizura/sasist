"""
Central task engine for WMS operational work (product-first, event-driven).

All task mutations go through this module — API routes must not write tasks directly.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.wms_operational_task import (
    ACTIVE_STATUSES,
    STATUS_CANCELLED,
    STATUS_DONE,
    STATUS_IN_PROGRESS,
    STATUS_OPEN,
    TASK_RELOCATION,
    TASK_SHORTAGE_DECISION,
    TASK_SHORTAGE_RECOLLECT,
    TASK_WAITING_SUPPLY,
    WmsOperationalTask,
    queue_projection_for_task_type,
)
from ..schemas.wms_operational_task import (
    WmsOperationalQueueSummary,
    WmsOperationalTaskDetail,
    WmsOperationalTaskListItem,
    WmsOperationalTaskListResponse,
    WmsOperationalTaskRef,
)
from .order_fulfillment_recompute import (
    _oms_waiting_for_stock,
    _oms_waiting_missing_cover_qty,
    compute_line_missing_qty,
    order_item_needs_substitute_pick_completion,
)
from .order_issue_task_service import _location_label_for_product, find_order_by_scan

logger = logging.getLogger(__name__)

EPS = 1e-6


def dual_write_enabled() -> bool:
    return os.environ.get("WMS_OPERATIONAL_TASK_DUAL_WRITE", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _now() -> datetime:
    return datetime.utcnow()


def _json_loads(raw: str | None, default: Any) -> Any:
    if not raw or not str(raw).strip():
        return default
    try:
        return json.loads(str(raw))
    except json.JSONDecodeError:
        return default


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def group_key_decision(warehouse_id: int, order_item_id: int) -> str:
    return f"decision:wh:{int(warehouse_id)}:oi:{int(order_item_id)}"


def group_key_recollect(warehouse_id: int, order_item_id: int) -> str:
    return f"recollect:wh:{int(warehouse_id)}:oi:{int(order_item_id)}"


def group_key_waiting(warehouse_id: int, product_id: int) -> str:
    return f"waiting:wh:{int(warehouse_id)}:prod:{int(product_id)}"


def group_key_relocation(warehouse_id: int, product_id: int) -> str:
    return f"relocation:{int(warehouse_id)}:{int(product_id)}"


def allocation_key(order_id: int, order_item_id: int) -> str:
    return f"{int(order_id)}:{int(order_item_id)}"


def _task_type_scan_priority(task_type: str) -> int:
    """Lower = higher priority for resolve-scan."""
    from ..models.wms_operational_task import (
        TASK_RELOCATION,
        TASK_SHORTAGE_RECOLLECT,
        TASK_WAITING_SUPPLY,
    )

    return {
        TASK_RELOCATION: 0,
        TASK_SHORTAGE_RECOLLECT: 1,
        TASK_WAITING_SUPPLY: 2,
    }.get(str(task_type), 9)


def _target_zone_for_order(order: Order | None) -> str:
    if order is None:
        return ""
    zones = getattr(order, "picking_zones", None) or []
    names = sorted({(z.name or "").strip() for z in zones if (z.name or "").strip()})
    if names:
        return names[0]
    num = (order.number or "").strip()
    return f"ORD-{num}" if num else ""


def rebuild_relocation_payload(
    allocations: list[dict[str, Any]],
    *,
    product_id: int,
    picked_from_location: str | None,
) -> dict[str, Any]:
    total = round(sum(float(a.get("qty") or 0) for a in allocations), 6)
    order_ids = {int(a["order_id"]) for a in allocations if int(a.get("order_id") or 0) > 0}
    zones = sorted({str(a.get("target_zone") or "").strip() for a in allocations if str(a.get("target_zone") or "").strip()})
    return {
        "product_id": int(product_id),
        "total_qty": total,
        "picked_from_location": (picked_from_location or "").strip() or None,
        "allocations": allocations,
        "order_count": len(order_ids),
        "target_zones": zones,
    }


def append_relocation_allocations(
    existing: list[dict[str, Any]],
    new: list[dict[str, Any]],
    *,
    source_event_id: str,
) -> list[dict[str, Any]]:
    """
    Merge allocation lines idempotently.
    Removes prior lines from the same ``source_event_id``, then upserts by order+line key.
    """
    kept = [a for a in existing if str(a.get("source_event_id") or "") != str(source_event_id)]
    by_key: dict[str, dict[str, Any]] = {
        allocation_key(int(a["order_id"]), int(a["order_item_id"])): dict(a) for a in kept
    }
    for raw in new:
        oid = int(raw.get("order_id") or 0)
        oiid = int(raw.get("order_item_id") or 0)
        if oid < 1 or oiid < 1:
            continue
        qty = round(max(0.0, float(raw.get("qty") or 0)), 6)
        if qty < EPS:
            continue
        key = allocation_key(oid, oiid)
        row = {
            "order_id": oid,
            "order_item_id": oiid,
            "qty": qty,
            "target_zone": (str(raw.get("target_zone") or "").strip() or None),
            "source_event_id": str(source_event_id),
            "relocated_qty": 0.0,
            "carrier_id": None,
            "carrier_label": None,
            "done": False,
        }
        if key in by_key:
            by_key[key]["qty"] = round(float(by_key[key].get("qty") or 0) + qty, 6)
            if row["target_zone"]:
                by_key[key]["target_zone"] = row["target_zone"]
            by_key[key]["source_event_id"] = source_event_id
        else:
            by_key[key] = row
    return [_normalize_relocation_allocation_row(a) for a in by_key.values()]


def merge_relocation_task(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    allocations: list[dict[str, Any]],
    picked_from_location: str | None,
    source_event_id: str,
) -> WmsOperationalTask | None:
    """Create or update one aggregated RELOCATION task per warehouse+product."""
    if not allocations:
        return None
    tid = int(tenant_id)
    wid = int(warehouse_id)
    pid = int(product_id)
    gk = group_key_relocation(wid, pid)
    existing = _find_active_by_group_key(db, gk)
    prior: list[dict[str, Any]] = []
    picked_from = (picked_from_location or "").strip() or None
    if existing:
        payload_old = _json_loads(existing.payload_json, {})
        if isinstance(payload_old, dict):
            prior = list(payload_old.get("allocations") or [])
            if not picked_from:
                picked_from = (payload_old.get("picked_from_location") or "").strip() or None

    merged_alloc = append_relocation_allocations(prior, allocations, source_event_id=str(source_event_id))
    payload = rebuild_relocation_payload(
        merged_alloc,
        product_id=pid,
        picked_from_location=picked_from,
    )
    total_qty = float(payload.get("total_qty") or 0)
    if total_qty < EPS:
        return None

    loc = picked_from or _location_label_for_product(db, tenant_id=tid, warehouse_id=wid, product_id=pid)
    return _upsert_task(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        task_type=TASK_RELOCATION,
        group_key=gk,
        source_event_id=str(source_event_id),
        product_id=pid,
        order_id=None,
        order_item_id=None,
        quantity_required=total_qty,
        location_hint=loc,
        payload=payload,
        priority=40,
    )


def merge_relocation_from_picks(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    picks: list[Any],
    picked_from_location: str | None,
    source_event_id: str,
    close_recollect_for_items: bool = True,
) -> list[WmsOperationalTask]:
    """Group finalized picks by product → one RELOCATION task per product."""
    from ..models.pick import Pick

    if not picks:
        return []

    by_product: dict[int, list[dict[str, Any]]] = {}
    order_cache: dict[int, Order] = {}
    wid = int(warehouse_id)

    for p in picks:
        if not isinstance(p, Pick):
            continue
        qty = float(getattr(p, "quantity", 0) or 0)
        if qty < EPS:
            continue
        oid = int(getattr(p, "order_id", 0) or 0)
        oiid = int(getattr(p, "order_item_id", 0) or 0)
        pid = int(getattr(p, "product_id", 0) or 0)
        if oid < 1 or oiid < 1 or pid < 1:
            continue
        if oid not in order_cache:
            order_cache[oid] = (
                db.query(Order)
                .options(joinedload(Order.picking_zones))
                .filter(Order.id == oid)
                .first()
            )
        zone = _target_zone_for_order(order_cache.get(oid))
        by_product.setdefault(pid, []).append(
            {
                "order_id": oid,
                "order_item_id": oiid,
                "qty": round(qty, 6),
                "target_zone": zone or None,
            }
        )

    tasks: list[WmsOperationalTask] = []
    for pid, raw_allocs in by_product.items():
        consolidated: dict[str, dict[str, Any]] = {}
        for a in raw_allocs:
            k = allocation_key(int(a["order_id"]), int(a["order_item_id"]))
            if k in consolidated:
                consolidated[k]["qty"] = round(float(consolidated[k]["qty"]) + float(a["qty"]), 6)
            else:
                consolidated[k] = dict(a)
        allocs = list(consolidated.values())
        task = merge_relocation_task(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=wid,
            product_id=int(pid),
            allocations=allocs,
            picked_from_location=picked_from_location,
            source_event_id=str(source_event_id),
        )
        if task:
            tasks.append(task)

    if close_recollect_for_items:
        seen_oi: set[int] = set()
        for p in picks:
            oiid = int(getattr(p, "order_item_id", 0) or 0)
            if oiid < 1 or oiid in seen_oi:
                continue
            seen_oi.add(oiid)
            rk = group_key_recollect(wid, oiid)
            rec = _find_active_by_group_key(db, rk)
            if rec:
                _close_task(db, rec, reason="merged_to_relocation")

    return tasks


def _normalize_relocation_allocation_row(raw: dict[str, Any]) -> dict[str, Any]:
    qty = round(max(0.0, float(raw.get("qty") or 0)), 6)
    relocated = round(min(qty, max(0.0, float(raw.get("relocated_qty") or 0))), 6)
    done = bool(raw.get("done")) or relocated + EPS >= qty
    if done:
        relocated = qty
    cid = raw.get("carrier_id")
    carrier_id = int(cid) if cid is not None and int(cid) > 0 else None
    relocated_by = raw.get("relocated_by")
    rb = int(relocated_by) if relocated_by is not None and int(relocated_by) > 0 else None
    return {
        "order_id": int(raw.get("order_id") or 0),
        "order_item_id": int(raw.get("order_item_id") or 0),
        "qty": qty,
        "target_zone": (str(raw.get("target_zone") or "").strip() or None),
        "source_event_id": (str(raw.get("source_event_id") or "").strip() or None),
        "carrier_id": carrier_id,
        "carrier_label": (str(raw.get("carrier_label") or "").strip() or None),
        "relocated_qty": relocated,
        "relocated_at": raw.get("relocated_at"),
        "relocated_by": rb,
        "done": done,
    }


def _allocation_row_status(row: dict[str, Any]) -> str:
    qty = float(row.get("qty") or 0)
    relocated = float(row.get("relocated_qty") or 0)
    if relocated + EPS >= qty:
        return "done"
    if relocated > EPS:
        return "partial"
    return "pending"


def _normalize_payload_allocations(allocs: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for raw in allocs:
        if not isinstance(raw, dict):
            continue
        row = _normalize_relocation_allocation_row(raw)
        if int(row["order_id"]) < 1 or int(row["order_item_id"]) < 1:
            continue
        if float(row["qty"]) < EPS:
            continue
        out.append(row)
    return out


def _all_allocations_relocated(allocs: list[dict[str, Any]]) -> bool:
    if not allocs:
        return False
    return all(_allocation_row_status(a) == "done" for a in allocs)


def _sum_relocated_qty(allocs: list[dict[str, Any]]) -> float:
    return round(sum(float(a.get("relocated_qty") or 0) for a in allocs), 6)


def _recompute_relocation_task_progress(task: WmsOperationalTask) -> None:
    payload = _json_loads(task.payload_json, {})
    if not isinstance(payload, dict):
        payload = {}
    allocs = _normalize_payload_allocations(list(payload.get("allocations") or []))
    relocated_total = _sum_relocated_qty(allocs)
    payload["allocations"] = allocs
    payload["relocated_total_qty"] = relocated_total
    payload["total_qty"] = round(sum(float(a.get("qty") or 0) for a in allocs), 6)
    task.payload_json = _json_dumps(payload)
    task.quantity_done = relocated_total
    task.quantity_required = max(float(task.quantity_required or 0), float(payload["total_qty"] or 0))
    task.updated_at = _now()
    if task.status in (STATUS_DONE, STATUS_CANCELLED):
        return
    if _all_allocations_relocated(allocs):
        task.status = STATUS_DONE
        task.completed_at = _now()
        task.updated_at = _now()
        return
    if relocated_total > EPS:
        task.status = STATUS_IN_PROGRESS
    elif task.status == STATUS_IN_PROGRESS:
        pass
    else:
        task.status = STATUS_OPEN


def _get_relocation_task_for_update(
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


def _carrier_label_for_id(db: Session, tenant_id: int, carrier_id: int) -> str:
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
        return f"Nośnik #{carrier_id}"
    return (c.barcode or c.code or c.name or "").strip() or f"Nośnik #{carrier_id}"


def _record_carrier_manifest_for_relocation(
    db: Session,
    *,
    tenant_id: int,
    carrier_id: int,
    product_id: int,
    qty: float,
) -> None:
    """Lightweight carrier manifest row (no inventory move — same as manual carrier add)."""
    if qty < EPS:
        return
    try:
        from ..models.warehouse_carrier import WarehouseCarrier, WarehouseCarrierItem

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
            return
        db.add(
            WarehouseCarrierItem(
                tenant_id=int(tenant_id),
                carrier_id=int(carrier_id),
                product_id=int(product_id),
                quantity=float(qty),
                reserved_quantity=0.0,
                source_document_type="RELOCATION",
                source_document_id=None,
                created_at=_now(),
            )
        )
        db.flush()
    except Exception:
        logger.warning(
            "relocation carrier manifest skipped carrier_id=%s product_id=%s",
            carrier_id,
            product_id,
            exc_info=True,
        )


def _find_allocation_row(
    allocs: list[dict[str, Any]],
    *,
    order_id: int,
    order_item_id: int,
) -> dict[str, Any] | None:
    key = allocation_key(order_id, order_item_id)
    for a in allocs:
        if allocation_key(int(a["order_id"]), int(a["order_item_id"])) == key:
            return a
    return None


def assign_relocation_allocation(
    db: Session,
    task_id: int,
    *,
    tenant_id: int,
    order_id: int,
    order_item_id: int,
    carrier_id: int,
    qty: float | None = None,
    performed_by_user_id: int | None = None,
    user: Any | None = None,
    record_carrier_manifest: bool = True,
    expected_version: int | None = None,
) -> WmsOperationalTask:
    from .wms_relocation_workflow import (
        _append_relocation_history,
        _bump_payload_version,
        _check_payload_version,
        operator_display_name,
        require_session_can_assign,
        validate_carrier_for_relocation,
    )

    task = _get_relocation_task_for_update(db, task_id, tenant_id=tenant_id)
    if not task:
        raise ValueError("Brak aktywnego zadania rozlokowania.")

    payload = _json_loads(task.payload_json, {})
    if not isinstance(payload, dict):
        payload = {}
    if performed_by_user_id is not None and int(performed_by_user_id) > 0:
        require_session_can_assign(payload, operator_id=int(performed_by_user_id))
    _check_payload_version(payload, expected_version)

    label, _lifecycle = validate_carrier_for_relocation(
        db, tenant_id=int(tenant_id), carrier_id=int(carrier_id)
    )

    allocs = _normalize_payload_allocations(list(payload.get("allocations") or []))
    row = _find_allocation_row(allocs, order_id=int(order_id), order_item_id=int(order_item_id))
    if not row:
        raise ValueError("Nie znaleziono alokacji dla tej linii zamówienia.")

    required = float(row.get("qty") or 0)
    already = float(row.get("relocated_qty") or 0)
    remaining = round(max(0.0, required - already), 6)
    if remaining < EPS:
        _recompute_relocation_task_progress(task)
        return _try_auto_complete_relocation(db, task) or task

    delta = remaining if qty is None else round(min(remaining, max(0.0, float(qty))), 6)
    if delta < EPS:
        _recompute_relocation_task_progress(task)
        return task

    now = _now()
    row["relocated_qty"] = round(already + delta, 6)
    row["carrier_id"] = int(carrier_id)
    row["carrier_label"] = label
    row["relocated_at"] = now.isoformat()
    op_id = int(performed_by_user_id) if performed_by_user_id is not None and int(performed_by_user_id) > 0 else 0
    op_name = operator_display_name(user) if user is not None else (f"Operator #{op_id}" if op_id else "Operator")
    if op_id > 0:
        row["relocated_by"] = op_id
    if float(row["relocated_qty"]) + EPS >= required:
        row["relocated_qty"] = required
        row["done"] = True

    payload["allocations"] = allocs
    session = payload.get("session")
    if isinstance(session, dict) and op_id > 0:
        session["last_activity_at"] = now.isoformat()
        session["active_carrier_id"] = int(carrier_id)
        session["active_carrier_label"] = label
        payload["session"] = session
    if op_id > 0:
        _append_relocation_history(
            payload,
            action="assign",
            operator_id=op_id,
            operator_name=op_name,
            qty=delta,
            carrier_id=int(carrier_id),
            carrier_label=label,
            order_id=int(order_id),
            order_item_id=int(order_item_id),
        )
    _bump_payload_version(payload, None)
    task.payload_json = _json_dumps(payload)
    if task.status == STATUS_OPEN:
        task.status = STATUS_IN_PROGRESS
    _recompute_relocation_task_progress(task)

    if record_carrier_manifest and task.product_id:
        _record_carrier_manifest_for_relocation(
            db,
            tenant_id=int(tenant_id),
            carrier_id=int(carrier_id),
            product_id=int(task.product_id),
            qty=delta,
        )

    completed = _try_auto_complete_relocation(db, task)
    return completed or task


def bulk_assign_relocation_to_carrier(
    db: Session,
    task_id: int,
    *,
    tenant_id: int,
    carrier_id: int,
    order_item_ids: list[int] | None = None,
    performed_by_user_id: int | None = None,
    user: Any | None = None,
    expected_version: int | None = None,
) -> WmsOperationalTask:
    from .wms_relocation_workflow import (
        _append_relocation_history,
        operator_display_name,
        require_session_can_assign,
        validate_carrier_for_relocation,
    )

    task = _get_relocation_task_for_update(db, task_id, tenant_id=tenant_id)
    if not task:
        raise ValueError("Brak aktywnego zadania rozlokowania.")

    payload = _json_loads(task.payload_json, {})
    if not isinstance(payload, dict):
        payload = {}
    if performed_by_user_id is not None and int(performed_by_user_id) > 0:
        require_session_can_assign(payload, operator_id=int(performed_by_user_id))
    validate_carrier_for_relocation(db, tenant_id=int(tenant_id), carrier_id=int(carrier_id))

    allocs = _normalize_payload_allocations(list(payload.get("allocations") or []))
    want = {int(x) for x in (order_item_ids or []) if int(x) > 0}
    last = task
    version = expected_version
    for row in allocs:
        if _allocation_row_status(row) == "done":
            continue
        oiid = int(row["order_item_id"])
        if want and oiid not in want:
            continue
        last = assign_relocation_allocation(
            db,
            int(task_id),
            tenant_id=int(tenant_id),
            order_id=int(row["order_id"]),
            order_item_id=oiid,
            carrier_id=int(carrier_id),
            qty=None,
            performed_by_user_id=performed_by_user_id,
            user=user,
            record_carrier_manifest=True,
            expected_version=version,
        )
        body = _json_loads(last.payload_json, {})
        version = int(body.get("lock_version") or 0) if isinstance(body, dict) else version

    op_id = int(performed_by_user_id) if performed_by_user_id is not None and int(performed_by_user_id) > 0 else 0
    if op_id > 0:
        body = _json_loads(last.payload_json, {})
        if isinstance(body, dict):
            _append_relocation_history(
                body,
                action="bulk_assign",
                operator_id=op_id,
                operator_name=operator_display_name(user),
                carrier_id=int(carrier_id),
                extra={"order_item_ids": list(want) if want else "all_pending"},
            )
            from .wms_relocation_workflow import _bump_payload_version

            _bump_payload_version(body, None)
            last.payload_json = _json_dumps(body)
    return last


def _try_auto_complete_relocation(db: Session, task: WmsOperationalTask) -> WmsOperationalTask | None:
    payload = _json_loads(task.payload_json, {})
    if not isinstance(payload, dict):
        return None
    allocs = _normalize_payload_allocations(list(payload.get("allocations") or []))
    if not _all_allocations_relocated(allocs):
        return None
    return complete_relocation_task(db, task)


def complete_relocation_task(
    db: Session,
    task: WmsOperationalTask,
    *,
    quantity_done: float | None = None,
    force: bool = False,
) -> WmsOperationalTask:
    """Close RELOCATION only when every allocation is fully relocated (unless force)."""
    if task.status in (STATUS_DONE, STATUS_CANCELLED):
        return task
    payload = _json_loads(task.payload_json, {})
    if not isinstance(payload, dict):
        payload = {}
    allocs = _normalize_payload_allocations(list(payload.get("allocations") or []))
    if not force and not _all_allocations_relocated(allocs):
        raise ValueError("Nie wszystkie alokacje zostały rozłożone do nośników.")

    for a in allocs:
        a["done"] = True
        a["relocated_qty"] = float(a.get("qty") or 0)
    payload["allocations"] = allocs
    payload["relocation_completed_at"] = _now().isoformat()
    payload["relocated_total_qty"] = _sum_relocated_qty(allocs)
    payload["session"] = None
    task.payload_json = _json_dumps(payload)

    total = float(payload.get("total_qty") or task.quantity_required or 0)
    done_qty = float(quantity_done) if quantity_done is not None else _sum_relocated_qty(allocs)
    task.quantity_done = round(max(0.0, done_qty), 6)
    task.quantity_required = max(float(task.quantity_required or 0), task.quantity_done)
    task.status = STATUS_DONE
    task.completed_at = _now()
    task.updated_at = _now()
    return task


def _find_active_by_group_key(db: Session, group_key: str) -> WmsOperationalTask | None:
    return (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.group_key == str(group_key),
            WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
        )
        .order_by(WmsOperationalTask.id.desc())
        .with_for_update(of=WmsOperationalTask)
        .first()
    )


def _try_auto_complete_relocation_task(db: Session, task: WmsOperationalTask) -> None:
    """Domknij zadanie RELOCATION gdy wszystkie alokacje są już przeniesione."""
    if task.task_type != TASK_RELOCATION:
        return
    if task.status in (STATUS_DONE, STATUS_CANCELLED):
        return
    payload = _json_loads(task.payload_json, {})
    if not isinstance(payload, dict):
        return
    allocs = _normalize_payload_allocations(list(payload.get("allocations") or []))
    if not allocs:
        return
    if not _all_allocations_relocated(allocs):
        return
    _recompute_relocation_task_progress(task)
    if task.status == STATUS_DONE:
        logger.info(
            "[braki.relocation.check] relocation_task_id=%s auto_completed reason=all_allocations_done",
            int(task.id),
        )


def _close_task(db: Session, task: WmsOperationalTask, *, reason: str = "") -> None:
    if task.status in (STATUS_DONE, STATUS_CANCELLED):
        return
    task.status = STATUS_DONE
    task.completed_at = _now()
    task.updated_at = _now()
    if reason:
        payload = _json_loads(task.payload_json, {})
        if isinstance(payload, dict):
            payload["close_reason"] = reason[:512]
            task.payload_json = _json_dumps(payload)


def _upsert_task(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    task_type: str,
    group_key: str,
    source_event_id: str,
    product_id: int | None,
    order_id: int | None,
    order_item_id: int | None,
    quantity_required: float,
    location_hint: str | None = None,
    substitute_product_id: int | None = None,
    payload: dict[str, Any] | None = None,
    priority: int = 0,
) -> WmsOperationalTask:
    now = _now()
    existing = _find_active_by_group_key(db, group_key)
    queue = queue_projection_for_task_type(task_type)
    payload_s = _json_dumps(payload if isinstance(payload, dict) else {})

    if existing:
        existing.task_type = task_type
        existing.queue = queue
        existing.product_id = product_id
        existing.order_id = order_id
        existing.order_item_id = order_item_id
        existing.quantity_required = round(max(0.0, float(quantity_required)), 6)
        existing.location_hint = (location_hint or "").strip() or None
        existing.substitute_product_id = substitute_product_id
        existing.source_event_id = source_event_id
        existing.priority = int(priority)
        existing.payload_json = payload_s
        existing.updated_at = now
        return existing

    task = WmsOperationalTask(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        task_type=task_type,
        status=STATUS_OPEN,
        queue=queue,
        product_id=product_id,
        order_id=order_id,
        order_item_id=order_item_id,
        quantity_required=round(max(0.0, float(quantity_required)), 6),
        quantity_done=0.0,
        location_hint=(location_hint or "").strip() or None,
        substitute_product_id=substitute_product_id,
        group_key=str(group_key),
        source_event_id=source_event_id,
        priority=int(priority),
        payload_json=payload_s,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.flush()
    return task


def _product_brief(db: Session, product_id: int | None) -> tuple[str, str | None, str | None, str | None]:
    if product_id is None or int(product_id) < 1:
        return "", None, None, None
    pr = db.query(Product).filter(Product.id == int(product_id)).first()
    if not pr:
        return f"Produkt #{product_id}", None, None, None
    name = (pr.name or "").strip() or f"Produkt #{product_id}"
    sku = (getattr(pr, "sku", None) or getattr(pr, "symbol", None) or "")
    sku_s = str(sku).strip() or None
    ean = (pr.ean or "").strip() or None
    img = (getattr(pr, "image_url", None) or "")
    return name, sku_s, ean, (str(img).strip() or None)


def _line_remaining_qty(db: Session, order: Order, oi: OrderItem) -> float:
    from ..services.fulfillment_event_service import line_picked_sum_for_order

    ordered = float(oi.quantity or 0)
    picked = float(line_picked_sum_for_order(db, int(oi.id), order))
    return max(0.0, round(ordered - picked, 6))


def recompute_waiting_supply_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> None:
    """Aggregate WAITING_SUPPLY for one product across warehouse orders."""
    pid = int(product_id)
    wid = int(warehouse_id)
    tid = int(tenant_id)
    gk = group_key_waiting(wid, pid)

    refs: list[dict[str, Any]] = []
    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(
            Order.tenant_id == tid,
            Order.warehouse_id == wid,
            Order.deleted_at.is_(None),
        )
        .all()
    )
    for order in orders:
        for oi in order.items or []:
            if int(oi.product_id) != pid:
                continue
            if getattr(oi, "parent_bundle_order_item_id", None) is not None:
                continue
            if not _oms_waiting_for_stock(oi):
                continue
            cover = _oms_waiting_missing_cover_qty(oi)
            if cover < EPS:
                missing = float(compute_line_missing_qty(db, order, oi))
                cover = missing
            qty = max(0.0, float(cover))
            if qty < EPS:
                continue
            refs.append(
                {
                    "order_id": int(order.id),
                    "order_item_id": int(oi.id),
                    "qty": round(qty, 6),
                }
            )

    if not refs:
        existing = _find_active_by_group_key(db, gk)
        if existing:
            _close_task(db, existing, reason="waiting_resolved")
        return

    total_qty = round(sum(float(r["qty"]) for r in refs), 6)
    loc = _location_label_for_product(db, tenant_id=tid, warehouse_id=wid, product_id=pid)
    _upsert_task(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        task_type=TASK_WAITING_SUPPLY,
        group_key=gk,
        source_event_id=gk,
        product_id=pid,
        order_id=None,
        order_item_id=None,
        quantity_required=total_qty,
        location_hint=loc,
        payload={"refs": refs},
        priority=10,
    )


def sync_operational_tasks_for_order(db: Session, order: Order) -> set[str]:
    """
    Recompute open operational tasks for one order.
    Returns set of active group_keys touched for this order (line-level).
    """
    if order is None or getattr(order, "deleted_at", None) is not None:
        return set()
    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    oid = int(order.id)
    desired_line_keys: set[str] = set()
    waiting_products: set[int] = set()

    for oi in sorted(order.items or [], key=lambda x: int(x.id)):
        if getattr(oi, "parent_bundle_order_item_id", None) is not None:
            continue
        oi_id = int(oi.id)
        pid = int(oi.product_id)
        missing = float(compute_line_missing_qty(db, order, oi))
        waiting = _oms_waiting_for_stock(oi)
        needs_recollect = order_item_needs_substitute_pick_completion(db, order, oi)
        remaining = _line_remaining_qty(db, order, oi)
        loc = _location_label_for_product(
            db, tenant_id=tid, warehouse_id=wid, product_id=pid
        )

        if waiting and missing <= EPS:
            waiting_products.add(pid)
            continue

        if missing > EPS and not waiting:
            gk = group_key_decision(wid, oi_id)
            desired_line_keys.add(gk)
            _upsert_task(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                task_type=TASK_SHORTAGE_DECISION,
                group_key=gk,
                source_event_id=f"shortage:{oid}:{oi_id}",
                product_id=pid,
                order_id=oid,
                order_item_id=oi_id,
                quantity_required=missing,
                location_hint=loc,
                payload={"order_number": (order.number or "").strip()},
                priority=20,
            )
            continue

        if needs_recollect and remaining > EPS:
            gk = group_key_recollect(wid, oi_id)
            desired_line_keys.add(gk)
            rep_name = (getattr(oi, "replaced_from_product_name", None) or "").strip()
            sub_pid = None
            rep_oid = getattr(oi, "replaced_from_order_item_id", None)
            if rep_oid is not None and int(rep_oid) > 0:
                old_oi = next((x for x in (order.items or []) if int(x.id) == int(rep_oid)), None)
                if old_oi:
                    sub_pid = int(old_oi.product_id)
            _upsert_task(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                task_type=TASK_SHORTAGE_RECOLLECT,
                group_key=gk,
                source_event_id=f"recollect:{oid}:{oi_id}",
                product_id=pid,
                order_id=oid,
                order_item_id=oi_id,
                quantity_required=remaining,
                location_hint=loc,
                substitute_product_id=sub_pid,
                payload={
                    "order_number": (order.number or "").strip(),
                    "substitute_for_product_name": rep_name or None,
                },
                priority=30,
            )

    for pid in waiting_products:
        recompute_waiting_supply_for_product(db, tenant_id=tid, warehouse_id=wid, product_id=pid)

    stale = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.tenant_id == tid,
            WmsOperationalTask.warehouse_id == wid,
            WmsOperationalTask.order_id == oid,
            WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
            WmsOperationalTask.task_type.in_((TASK_SHORTAGE_DECISION, TASK_SHORTAGE_RECOLLECT)),
        )
        .all()
    )
    for task in stale:
        if task.group_key not in desired_line_keys:
            _close_task(db, task, reason="order_sync_stale")

    return desired_line_keys


def close_operational_tasks_for_order(db: Session, order: Order) -> None:
    """Close all active line tasks when order no longer needs shortage handling."""
    if order is None:
        return
    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    oid = int(order.id)
    active = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.tenant_id == tid,
            WmsOperationalTask.warehouse_id == wid,
            WmsOperationalTask.order_id == oid,
            WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
        )
        .all()
    )
    for t in active:
        _close_task(db, t, reason="shortage_cleared")

    product_ids = {int(oi.product_id) for oi in (order.items or [])}
    for pid in product_ids:
        recompute_waiting_supply_for_product(db, tenant_id=tid, warehouse_id=wid, product_id=pid)


def sync_operational_tasks_for_warehouse(db: Session, *, tenant_id: int, warehouse_id: int) -> None:
    """Full warehouse resync — used by list endpoint pre-hook."""
    from .order_fulfillment_recompute import order_requires_shortage_handling

    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.deleted_at.is_(None),
        )
        .all()
    )
    for order in orders:
        try:
            if order_requires_shortage_handling(db, order):
                sync_operational_tasks_for_order(db, order)
            else:
                close_operational_tasks_for_order(db, order)
        except Exception:
            logger.warning(
                "operational task sync failed order_id=%s",
                getattr(order, "id", None),
                exc_info=True,
            )


def _summary_line(task: WmsOperationalTask, product_name: str) -> str:
    rem = max(0.0, float(task.quantity_required or 0) - float(task.quantity_done or 0))
    if task.task_type == TASK_SHORTAGE_RECOLLECT:
        return f"Do zebrania: {rem:g} szt."
    if task.task_type == TASK_WAITING_SUPPLY:
        return f"Oczekuje na dostawę: {rem:g} szt."
    if task.task_type == TASK_RELOCATION:
        return f"Do rozlokowania: {rem:g} szt."
    if task.task_type == TASK_SHORTAGE_DECISION:
        return f"Brak do decyzji: {rem:g} szt."
    return f"Pozostało: {rem:g} szt."


def serialize_task_list_item(db: Session, task: WmsOperationalTask) -> WmsOperationalTaskListItem:
    from ..schemas.wms_operational_task import WmsOperationalTaskListItem

    name, sku, ean, img = _product_brief(db, task.product_id)
    order_number = None
    if task.order_id:
        o = db.query(Order).filter(Order.id == int(task.order_id)).first()
        order_number = (o.number if o else None) or None
    payload = _json_loads(task.payload_json, {})
    sub_name = ""
    picked_from = None
    reloc_order_count = 0
    reloc_alloc_count = 0
    target_zones: list[str] = []
    waiting_order_count = 0
    waiting_oldest_at = task.created_at
    if isinstance(payload, dict):
        sub_name = str(payload.get("substitute_for_product_name") or "").strip()
        if task.task_type == TASK_WAITING_SUPPLY:
            refs = payload.get("refs") or []
            if isinstance(refs, list):
                waiting_order_count = len(
                    {int(r.get("order_id") or 0) for r in refs if isinstance(r, dict) and int(r.get("order_id") or 0) > 0}
                )
            waiting_oldest_at = task.created_at
        if task.task_type == TASK_RELOCATION:
            picked_from = (payload.get("picked_from_location") or task.location_hint or "").strip() or None
            allocs = payload.get("allocations") or []
            if isinstance(allocs, list):
                reloc_alloc_count = len(allocs)
                reloc_order_count = int(payload.get("order_count") or 0)
                if reloc_order_count < 1 and allocs:
                    reloc_order_count = len(
                        {int(a.get("order_id") or 0) for a in allocs if isinstance(a, dict) and int(a.get("order_id") or 0) > 0}
                    )
            tz = payload.get("target_zones")
            if isinstance(tz, list):
                target_zones = [str(z).strip() for z in tz if str(z).strip()]
    rem = max(0.0, float(task.quantity_required or 0) - float(task.quantity_done or 0))
    return WmsOperationalTaskListItem(
        id=int(task.id),
        task_type=str(task.task_type),
        status=str(task.status),
        queue=str(task.queue),
        product_id=int(task.product_id) if task.product_id else None,
        product_name=name,
        product_sku=sku,
        product_ean=ean,
        image_url=img,
        order_id=int(task.order_id) if task.order_id else None,
        order_number=order_number,
        order_item_id=int(task.order_item_id) if task.order_item_id else None,
        quantity_required=float(task.quantity_required or 0),
        quantity_done=float(task.quantity_done or 0),
        quantity_remaining=rem,
        location_hint=(task.location_hint or "").strip() or None,
        substitute_product_id=int(task.substitute_product_id) if task.substitute_product_id else None,
        substitute_for_product_name=sub_name or None,
        group_key=str(task.group_key),
        priority=int(task.priority or 0),
        summary_line=_summary_line(task, name),
        created_at=task.created_at,
        updated_at=task.updated_at,
        picked_from_location=picked_from,
        relocation_order_count=reloc_order_count,
        relocation_allocation_count=reloc_alloc_count,
        target_zones=target_zones,
        waiting_order_count=waiting_order_count,
        waiting_oldest_at=waiting_oldest_at,
    )


def list_operational_tasks(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    queue: str | None = None,
    status: str | None = None,
    limit: int = 200,
    sync_first: bool = True,
) -> WmsOperationalTaskListResponse:
    if sync_first:
        sync_operational_tasks_for_warehouse(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))

    q = db.query(WmsOperationalTask).filter(
        WmsOperationalTask.tenant_id == int(tenant_id),
        WmsOperationalTask.warehouse_id == int(warehouse_id),
    )
    if queue:
        q = q.filter(WmsOperationalTask.queue == str(queue).strip().upper())
    if status:
        q = q.filter(WmsOperationalTask.status == str(status).strip().lower())
    else:
        q = q.filter(WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)))

    rows = q.order_by(WmsOperationalTask.priority.desc(), WmsOperationalTask.updated_at.desc()).limit(
        max(1, min(500, int(limit)))
    ).all()

    items: list[WmsOperationalTaskListItem] = []
    for t in rows:
        try:
            items.append(serialize_task_list_item(db, t))
        except Exception:
            logger.warning("skip serialize operational task id=%s", t.id, exc_info=True)

    summaries = queue_summary(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    return WmsOperationalTaskListResponse(items=items, total=len(items), queue_summaries=summaries)


def queue_summary(db: Session, *, tenant_id: int, warehouse_id: int) -> list[WmsOperationalQueueSummary]:
    from ..models.wms_operational_task import (
        QUEUE_DO_DECYZJI,
        QUEUE_DO_DOGRYWKI,
        QUEUE_DO_ROZLOKOWANIA,
        QUEUE_OCZEKUJE_NA_DOSTAWE,
    )

    labels = {
        QUEUE_DO_DECYZJI: "Do decyzji",
        QUEUE_DO_DOGRYWKI: "Do dogrywki",
        QUEUE_OCZEKUJE_NA_DOSTAWE: "Oczekuje na dostawę",
        QUEUE_DO_ROZLOKOWANIA: "Do rozlokowania",
    }
    rows = (
        db.query(WmsOperationalTask.queue, func.count(WmsOperationalTask.id))
        .filter(
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.warehouse_id == int(warehouse_id),
            WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
        )
        .group_by(WmsOperationalTask.queue)
        .all()
    )
    counts = {str(r[0]): int(r[1]) for r in rows}
    out: list[WmsOperationalQueueSummary] = []
    for qk, label in labels.items():
        out.append(WmsOperationalQueueSummary(queue=qk, label=label, count=counts.get(qk, 0)))
    return out


def get_operational_task_detail(
    db: Session,
    task_id: int,
    *,
    tenant_id: int,
    requesting_operator_id: int | None = None,
) -> WmsOperationalTaskDetail | None:
    from ..schemas.wms_operational_task import WmsOperationalRelocationAllocation, WmsOperationalTaskDetail
    from .wms_relocation_workflow import enrich_relocation_detail_extras

    t = (
        db.query(WmsOperationalTask)
        .filter(WmsOperationalTask.id == int(task_id), WmsOperationalTask.tenant_id == int(tenant_id))
        .first()
    )
    if not t:
        return None
    base = serialize_task_list_item(db, t)
    payload = _json_loads(t.payload_json, {})
    refs: list[WmsOperationalTaskRef] = []
    order_numbers: list[str] = []
    reloc_allocs: list[WmsOperationalRelocationAllocation] = []
    reloc_total = 0.0
    if isinstance(payload, dict) and t.task_type == TASK_WAITING_SUPPLY:
        for r in payload.get("refs") or []:
            if not isinstance(r, dict):
                continue
            refs.append(
                WmsOperationalTaskRef(
                    order_id=int(r.get("order_id") or 0),
                    order_item_id=int(r.get("order_item_id") or 0),
                    qty=float(r.get("qty") or 0),
                )
            )
            oid = int(r.get("order_id") or 0)
            if oid > 0:
                o = db.query(Order).filter(Order.id == oid).first()
                if o and (o.number or "").strip():
                    order_numbers.append(str(o.number).strip())
    reloc_extras: dict[str, Any] = {}
    reloc_total = 0.0
    reloc_total_count = 0
    if isinstance(payload, dict) and t.task_type == TASK_RELOCATION:
        norm_allocs = _normalize_payload_allocations(list(payload.get("allocations") or []))
        reloc_total = round(sum(float(a.get("qty") or 0) for a in norm_allocs), 6)
        reloc_total_count = len(norm_allocs)
        for a in norm_allocs:
            oid = int(a["order_id"])
            o = db.query(Order).filter(Order.id == oid).first()
            onum = (o.number if o else None) or None
            if onum and str(onum).strip():
                order_numbers.append(str(onum).strip())
        reloc_extras = enrich_relocation_detail_extras(
            db,
            payload,
            tenant_id=int(tenant_id),
            requesting_operator_id=requesting_operator_id,
        )
        reloc_allocs = reloc_extras.pop("relocation_allocations", [])
        reloc_total_count = int(reloc_extras.pop("relocation_allocations_total", reloc_total_count))

    operational_events: list = []
    if isinstance(payload, dict):
        from ..schemas.wms_operational_task import WmsRelocationHistoryEntry

        raw_events = (
            list(payload.get("audit") or [])
            if t.task_type == TASK_WAITING_SUPPLY
            else list(payload.get("history") or [])
        )
        for h in raw_events[-30:]:
            if not isinstance(h, dict):
                continue
            operational_events.append(
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
            )
    if reloc_extras.get("relocation_history"):
        operational_events = reloc_extras.get("relocation_history") or operational_events

    return WmsOperationalTaskDetail(
        **base.model_dump(),
        payload_refs=refs,
        related_order_numbers=sorted(set(order_numbers)),
        relocation_allocations=reloc_allocs,
        relocation_allocations_total=reloc_total_count,
        relocation_total_qty=reloc_total,
        operational_events=operational_events,
        **reloc_extras,
    )


def start_operational_task(db: Session, task_id: int, *, tenant_id: int) -> WmsOperationalTask | None:
    t = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.id == int(task_id),
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.status == STATUS_OPEN,
        )
        .with_for_update(of=WmsOperationalTask)
        .first()
    )
    if not t:
        return None
    t.status = STATUS_IN_PROGRESS
    t.updated_at = _now()
    return t


def complete_operational_task(
    db: Session,
    task_id: int,
    *,
    tenant_id: int,
    quantity_done: float | None = None,
) -> WmsOperationalTask | None:
    t = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.id == int(task_id),
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
        )
        .with_for_update(of=WmsOperationalTask)
        .first()
    )
    if not t:
        return None
    if quantity_done is not None:
        t.quantity_done = round(max(0.0, float(quantity_done)), 6)
    else:
        t.quantity_done = float(t.quantity_required or 0)
    t.status = STATUS_DONE
    t.completed_at = _now()
    t.updated_at = _now()
    return t


def complete_relocation_by_group_key(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    group_key: str,
    quantity_done: float | None = None,
) -> WmsOperationalTask | None:
    t = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.warehouse_id == int(warehouse_id),
            WmsOperationalTask.group_key == str(group_key),
            WmsOperationalTask.task_type == TASK_RELOCATION,
            WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
        )
        .with_for_update(of=WmsOperationalTask)
        .first()
    )
    if not t:
        return None
    return complete_relocation_task(db, t, quantity_done=quantity_done)


def resolve_operational_task_scan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    scan: str,
) -> WmsOperationalTask | None:
    """Resolve scan: relocation (carrier/order/product) then legacy product/order."""
    raw = (scan or "").strip()
    if not raw:
        return None

    from .wms_relocation_workflow import resolve_relocation_scan

    hit = resolve_relocation_scan(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), scan=raw
    )
    if hit:
        return hit

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

    order = find_order_by_scan(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), scan=raw)
    if order:
        return (
            db.query(WmsOperationalTask)
            .filter(
                WmsOperationalTask.tenant_id == int(tenant_id),
                WmsOperationalTask.warehouse_id == int(warehouse_id),
                WmsOperationalTask.order_id == int(order.id),
                WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
            )
            .order_by(WmsOperationalTask.priority.desc(), WmsOperationalTask.id.desc())
            .first()
        )
    return None
