"""Warehouse operations control center API."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.order import Order
from ..models.wms_operational_task import (
    ACTIVE_STATUSES,
    STATUS_CANCELLED,
    STATUS_DONE,
    STATUS_IN_PROGRESS,
    STATUS_OPEN,
    TASK_RELOCATION,
    WmsOperationalTask,
    queue_projection_for_task_type,
)
from ..schemas.warehouse_operations import (
    WarehouseOperationsSnapshotOut,
    WarehousePriorityTaskActionIn,
    WarehousePriorityTaskCreateIn,
    WarehousePriorityTaskOut,
    WarehouseReplenishmentRelocationCreateIn,
    WarehouseReplenishmentRelocationCreateOut,
)
from ..services.warehouse_operations_service import (
    build_warehouse_operations_snapshot,
    warehouse_operations_export_rows,
)

router = APIRouter(prefix="/wms/warehouse-operations", tags=["WMS warehouse operations"])

PRIORITY_TASK_TYPES = {
    "replenishment": "REPLENISHMENT",
    "priority_picking": "PRIORITY_PICKING",
    "priority_packing": "PRIORITY_PACKING",
    "putaway": "PUTAWAY",
    "stock_movement": "STOCK_MOVEMENT",
    "shortage_resolution": "SHORTAGE_RESOLUTION",
    "inventory_verification": "INVENTORY_VERIFICATION",
    "quality_check": "QUALITY_CHECK",
}
PRIORITY_TASK_SOURCE = "manager_priority_task"

EXPORT_HEADERS = [
    ("operator", "Operator"),
    ("user_id", "ID operatora"),
    ("main_mode", "Tryb główny"),
    ("submode", "Podtryb"),
    ("last_activity_at", "Ostatnia aktywność"),
    ("status", "Status aktywności"),
    ("status_color", "Kolor"),
    ("idle_total", "Bezczynność łącznie"),
    ("idle_total_minutes", "Bezczynność min"),
    ("short_idle_periods", "Krótkie przerwy"),
    ("long_idle_periods", "Długie przerwy"),
    ("cart", "Wózek"),
    ("document", "Dokument"),
    ("carrier", "Nośnik / przewoźnik"),
    ("location", "Lokalizacja"),
    ("progress_percent", "Postęp %"),
    ("orders_picked", "Zamówienia"),
    ("products_picked", "Produkty"),
    ("packed_orders_per_hour", "Spakowane zam./h"),
    ("operation_count", "Liczba operacji"),
]


def _user_name(user: AppUser | None, fallback: str = "") -> str:
    if user is None:
        return fallback
    name = " ".join([p for p in [user.first_name, user.last_name] if p]).strip()
    return name or user.login or fallback or f"Użytkownik #{user.id}"


def _parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def _payload(task: WmsOperationalTask) -> dict:
    try:
        parsed = json.loads(task.payload_json or "{}")
    except (json.JSONDecodeError, TypeError, ValueError):
        parsed = {}
    return parsed if isinstance(parsed, dict) else {}


def _dump_payload(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _priority_status_from_task(task: WmsOperationalTask, payload: dict, now: datetime) -> str:
    status = str(payload.get("priority_status") or "NOWE").upper()
    if task.status == STATUS_DONE:
        return "WYKONANE"
    if task.status == STATUS_CANCELLED:
        return "ODRZUCONE"
    accepted_at = _parse_dt(payload.get("accepted_at"))
    started_at = _parse_dt(payload.get("started_at"))
    assigned_at = _parse_dt(payload.get("assigned_at")) or task.created_at
    if status not in {"WYKONANE", "ODRZUCONE", "ESKALOWANE"}:
        if not accepted_at and assigned_at and (now - assigned_at).total_seconds() >= 3 * 60:
            return "ESKALOWANE"
        if accepted_at and not started_at and (now - accepted_at).total_seconds() >= 5 * 60:
            return "ESKALOWANE"
    if task.status == STATUS_IN_PROGRESS:
        return "W_TRAKCIE"
    return status if status in {"NOWE", "PRZYJĘTE", "W_TRAKCIE", "WYKONANE", "ODRZUCONE", "ESKALOWANE"} else "NOWE"


def _priority_task_out(task: WmsOperationalTask, now: datetime) -> WarehousePriorityTaskOut:
    payload = _payload(task)
    assigned_at = _parse_dt(payload.get("assigned_at")) or task.created_at
    deadline_at = _parse_dt(payload.get("deadline_at"))
    status = _priority_status_from_task(task, payload, now)
    countdown = None
    if deadline_at is not None and status not in {"WYKONANE", "ODRZUCONE"}:
        countdown = int((deadline_at - now).total_seconds() // 60)
    return WarehousePriorityTaskOut(
        id=int(task.id),
        alert_id=payload.get("alert_id"),
        task_type=payload.get("manager_task_type") or str(task.task_type).lower(),
        title=str(payload.get("title") or task.location_hint or "Zadanie kierownika"),
        description=payload.get("description"),
        status=status,  # type: ignore[arg-type]
        priority=payload.get("priority") or "high",
        assigned_operator_id=payload.get("assigned_operator_id"),
        assigned_operator_name=payload.get("assigned_operator_name"),
        assigned_by_user_id=payload.get("assigned_by_user_id"),
        assigned_by_name=payload.get("assigned_by_name"),
        assigned_at=assigned_at.isoformat(timespec="seconds") if assigned_at else None,
        accepted_at=payload.get("accepted_at"),
        started_at=payload.get("started_at"),
        completed_at=payload.get("completed_at") or (task.completed_at.isoformat(timespec="seconds") if task.completed_at else None),
        rejected_at=payload.get("rejected_at"),
        rejection_reason=payload.get("rejection_reason"),
        escalated_at=payload.get("escalated_at"),
        deadline_at=payload.get("deadline_at"),
        escalation_state="escalated" if status == "ESKALOWANE" else None,
        sla_countdown_minutes=countdown,
        target_path=payload.get("target_path"),
        recommended_action=payload.get("recommended_action"),
        comment=payload.get("comment"),
        history=payload.get("history") if isinstance(payload.get("history"), list) else [],
        payload=payload.get("task_payload") if isinstance(payload.get("task_payload"), dict) else {},
    )


def _candidate_priority_order_ids(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    task_type: str,
    limit: int,
) -> list[int]:
    q = db.query(Order).filter(
        Order.tenant_id == int(tenant_id),
        Order.warehouse_id == int(warehouse_id),
        Order.deleted_at.is_(None),
    )
    if task_type == "priority_packing":
        q = q.filter(Order.packed_at.is_(None), Order.picking_finished_at.isnot(None))
        q = q.order_by(Order.picking_finished_at.asc(), Order.id.asc())
    elif task_type == "priority_picking":
        q = q.filter(Order.picking_finished_at.is_(None), Order.packed_at.is_(None))
        q = q.order_by(Order.order_date.asc(), Order.id.asc())
    else:
        return []
    return [int(o.id) for o in q.limit(max(1, min(50, int(limit or 5)))).all()]


@router.get("/snapshot", response_model=WarehouseOperationsSnapshotOut)
def get_warehouse_operations_snapshot(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    short_break_minutes: int = Query(5, ge=1, le=120),
    long_break_minutes: int = Query(10, ge=2, le=240),
    db: Session = Depends(get_db),
) -> WarehouseOperationsSnapshotOut:
    return build_warehouse_operations_snapshot(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        short_break_minutes=short_break_minutes,
        long_break_minutes=long_break_minutes,
    )


@router.get("/priority-tasks", response_model=list[WarehousePriorityTaskOut])
def list_priority_tasks(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    scope: Literal["assigned", "all"] = Query("assigned"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
) -> list[WarehousePriorityTaskOut]:
    now = datetime.utcnow()
    rows = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.warehouse_id == int(warehouse_id),
            WmsOperationalTask.source_event_id.like("manager-priority:%"),
        )
        .order_by(WmsOperationalTask.priority.desc(), WmsOperationalTask.updated_at.desc())
        .limit(200)
        .all()
    )
    out: list[WarehousePriorityTaskOut] = []
    changed = False
    for task in rows:
        payload = _payload(task)
        if payload.get("source") != PRIORITY_TASK_SOURCE:
            continue
        assigned_id = payload.get("assigned_operator_id")
        if scope == "assigned" and current_user.id and assigned_id not in {None, int(current_user.id)}:
            continue
        status = _priority_status_from_task(task, payload, now)
        if status == "ESKALOWANE" and payload.get("priority_status") != "ESKALOWANE":
            payload["priority_status"] = "ESKALOWANE"
            payload["escalated_at"] = now.isoformat(timespec="seconds")
            payload.setdefault("history", []).append(
                {"at": now.isoformat(timespec="seconds"), "action": "auto_escalate", "reason": "timeout"}
            )
            task.payload_json = _dump_payload(payload)
            task.updated_at = now
            changed = True
        out.append(_priority_task_out(task, now))
    if changed:
        db.commit()
    return out[:50]


@router.post("/priority-tasks", response_model=WarehousePriorityTaskOut)
def create_priority_task(
    body: WarehousePriorityTaskCreateIn,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
) -> WarehousePriorityTaskOut:
    now = datetime.utcnow()
    assigned_name = (body.assigned_operator_name or "").strip()
    if body.assigned_operator_id and not assigned_name:
        user = db.query(AppUser).filter(AppUser.id == int(body.assigned_operator_id)).first()
        assigned_name = _user_name(user, f"Operator #{body.assigned_operator_id}")
    task_type = PRIORITY_TASK_TYPES.get(body.task_type, "MANAGER_PRIORITY")
    priority_value = {"critical": 120, "high": 90, "normal": 60}.get(body.priority, 90)
    task_payload = dict(body.payload or {})
    order_ids_raw = task_payload.get("order_ids")
    order_ids = [
        int(x)
        for x in (order_ids_raw if isinstance(order_ids_raw, list) else [])
        if str(x).isdigit() and int(x) > 0
    ]
    if body.task_type in {"priority_packing", "priority_picking"} and not order_ids:
        requested = int(task_payload.get("order_count") or 5)
        order_ids = _candidate_priority_order_ids(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            task_type=body.task_type,
            limit=requested,
        )
        task_payload["order_ids"] = order_ids
        task_payload["order_count"] = len(order_ids)
    group_key = f"manager-priority:{int(warehouse_id)}:{body.alert_id}:{body.assigned_operator_id or 'unassigned'}:{body.task_type}"
    existing = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.warehouse_id == int(warehouse_id),
            WmsOperationalTask.group_key == group_key,
            WmsOperationalTask.status.in_([STATUS_OPEN, STATUS_IN_PROGRESS]),
        )
        .first()
    )
    payload = {
        "source": PRIORITY_TASK_SOURCE,
        "alert_id": body.alert_id,
        "manager_task_type": body.task_type,
        "title": body.title.strip(),
        "description": (body.description or "").strip() or None,
        "priority": body.priority,
        "priority_status": "NOWE",
        "assigned_operator_id": int(body.assigned_operator_id) if body.assigned_operator_id else None,
        "assigned_operator_name": assigned_name or None,
        "assigned_by_user_id": int(current_user.id) if current_user.id else None,
        "assigned_by_name": _user_name(current_user, "Kierownik"),
        "assigned_at": now.isoformat(timespec="seconds"),
        "deadline_at": body.deadline_at,
        "comment": (body.comment or "").strip() or None,
        "target_path": body.target_path,
        "recommended_action": body.description,
        "task_payload": task_payload,
        "history": [
            {
                "at": now.isoformat(timespec="seconds"),
                "action": "created",
                "by_user_id": int(current_user.id) if current_user.id else None,
                "by_name": _user_name(current_user, "Kierownik"),
            }
        ],
    }
    if existing:
        existing.task_type = task_type
        existing.priority = priority_value
        existing.location_hint = body.title[:128]
        existing.payload_json = _dump_payload(payload)
        existing.updated_at = now
        db.commit()
        db.refresh(existing)
        return _priority_task_out(existing, now)

    task = WmsOperationalTask(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        task_type=task_type,
        status=STATUS_OPEN,
        queue=queue_projection_for_task_type(task_type),
        product_id=int(task_payload.get("product_id")) if str(task_payload.get("product_id") or "").isdigit() else None,
        order_id=int(task_payload.get("order_id")) if str(task_payload.get("order_id") or "").isdigit() else (order_ids[0] if len(order_ids) == 1 else None),
        quantity_required=float(task_payload.get("quantity") or len(order_ids) or 0),
        quantity_done=0.0,
        location_hint=body.title[:128],
        group_key=group_key,
        source_event_id=f"manager-priority:{body.alert_id}",
        priority=priority_value,
        payload_json=_dump_payload(payload),
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _priority_task_out(task, now)


@router.patch("/priority-tasks/{task_id}", response_model=WarehousePriorityTaskOut)
def update_priority_task(
    task_id: int,
    body: WarehousePriorityTaskActionIn,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
) -> WarehousePriorityTaskOut:
    now = datetime.utcnow()
    task = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.id == int(task_id),
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.source_event_id.like("manager-priority:%"),
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Nie znaleziono zadania kierownika.")
    payload = _payload(task)
    if payload.get("source") != PRIORITY_TASK_SOURCE:
        raise HTTPException(status_code=400, detail="To nie jest zadanie kierownika.")
    history = payload.setdefault("history", [])
    action = body.action
    if action == "accept":
        payload["priority_status"] = "PRZYJĘTE"
        payload["accepted_at"] = now.isoformat(timespec="seconds")
        task.status = STATUS_OPEN
    elif action == "start":
        payload["priority_status"] = "W_TRAKCIE"
        payload["started_at"] = now.isoformat(timespec="seconds")
        task.status = STATUS_IN_PROGRESS
    elif action == "complete":
        payload["priority_status"] = "WYKONANE"
        payload["completed_at"] = now.isoformat(timespec="seconds")
        task.status = STATUS_DONE
        task.completed_at = now
        task.quantity_done = max(float(task.quantity_done or 0), float(task.quantity_required or 0))
    elif action == "reject":
        payload["priority_status"] = "ODRZUCONE"
        payload["rejected_at"] = now.isoformat(timespec="seconds")
        payload["rejection_reason"] = (body.rejection_reason or body.comment or "").strip() or None
        task.status = STATUS_CANCELLED
        task.completed_at = now
    elif action == "escalate":
        payload["priority_status"] = "ESKALOWANE"
        payload["escalated_at"] = now.isoformat(timespec="seconds")
        task.status = STATUS_OPEN
        task.priority = max(int(task.priority or 0), 130)
    history.append(
        {
            "at": now.isoformat(timespec="seconds"),
            "action": action,
            "by_user_id": int(current_user.id) if current_user.id else None,
            "by_name": _user_name(current_user, "Operator"),
            "rejection_reason": payload.get("rejection_reason") if action == "reject" else None,
            "comment": (body.comment or "").strip() or None,
        }
    )
    task.payload_json = _dump_payload(payload)
    task.updated_at = now
    db.commit()
    db.refresh(task)
    return _priority_task_out(task, now)


@router.post("/replenishments/create-relocation", response_model=WarehouseReplenishmentRelocationCreateOut)
def create_replenishment_relocation_task(
    body: WarehouseReplenishmentRelocationCreateIn,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
) -> WarehouseReplenishmentRelocationCreateOut:
    target = (body.target_location or "").strip()
    group_key = f"warehouse-operations:replenishment:{int(warehouse_id)}:{int(body.product_id)}:{target or 'pick-face'}"
    existing = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.warehouse_id == int(warehouse_id),
            WmsOperationalTask.task_type == TASK_RELOCATION,
            WmsOperationalTask.status.in_(ACTIVE_STATUSES),
            WmsOperationalTask.group_key == group_key,
        )
        .first()
    )
    if existing:
        existing.quantity_required = max(float(existing.quantity_required or 0), float(body.quantity_required or 0))
        existing.updated_at = datetime.utcnow()
        db.commit()
        return WarehouseReplenishmentRelocationCreateOut(task_id=int(existing.id), status=str(existing.status), created=False)

    payload = {
        "source": "warehouse_operations_replenishment",
        "source_location": (body.source_location or "").strip() or None,
        "target_location": target or None,
        "priority": body.priority,
        "created_by_user_id": int(current_user.id) if current_user.id else None,
    }
    task = WmsOperationalTask(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        task_type=TASK_RELOCATION,
        status=STATUS_OPEN,
        queue=queue_projection_for_task_type(TASK_RELOCATION),
        product_id=int(body.product_id),
        quantity_required=max(0.0, float(body.quantity_required or 0)),
        quantity_done=0.0,
        location_hint=target or (body.source_location or "").strip() or None,
        group_key=group_key,
        source_event_id=group_key,
        priority=100 if body.priority == "red" else (50 if body.priority == "orange" else 10),
        payload_json=json.dumps(payload, ensure_ascii=False),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return WarehouseReplenishmentRelocationCreateOut(task_id=int(task.id), status=str(task.status), created=True)


@router.get("/export")
def export_warehouse_operations(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    format: Literal["csv", "xlsx"] = Query("csv"),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    operator_id: int | None = Query(None, ge=1),
    mode: str | None = Query(None, max_length=64),
    zone: str | None = Query(None, max_length=64),
    short_break_minutes: int = Query(5, ge=1, le=120),
    long_break_minutes: int = Query(10, ge=2, le=240),
    db: Session = Depends(get_db),
):
    rows = warehouse_operations_export_rows(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        short_break_minutes=short_break_minutes,
        long_break_minutes=long_break_minutes,
        date_from=date_from,
        date_to=date_to,
        operator_id=operator_id,
        mode=mode,
        zone=zone,
    )
    filename = f"warehouse_operations_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{format}"
    if format == "csv":
        stream = io.StringIO()
        stream.write("\ufeff")
        writer = csv.writer(stream, delimiter=";")
        writer.writerow([label for _, label in EXPORT_HEADERS])
        for row in rows:
            writer.writerow([row.get(key, "") if row.get(key, "") is not None else "" for key, _ in EXPORT_HEADERS])
        stream.seek(0)
        return StreamingResponse(
            iter([stream.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    try:
        from openpyxl import Workbook
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Eksport XLSX wymaga pakietu openpyxl.") from exc

    wb = Workbook()
    ws = wb.active
    ws.title = "Centrum operacyjne"
    ws.append([label for _, label in EXPORT_HEADERS])
    for row in rows:
        ws.append([row.get(key, "") if row.get(key, "") is not None else "" for key, _ in EXPORT_HEADERS])
    for column_cells in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in column_cells)
        ws.column_dimensions[column_cells[0].column_letter].width = min(max(max_len + 2, 10), 36)
    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    return Response(
        content=bio.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
