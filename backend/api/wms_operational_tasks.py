"""WMS operational task queues — product-centric work (v2)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from fastapi import Depends
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.wms_operational_task import (
    WmsOperationalRelocationAssignBody,
    WmsOperationalRelocationBulkAssignBody,
    WmsOperationalRelocationCompleteBody,
    WmsRelocationAllocationsPage,
    WmsRelocationSessionAcquireBody,
    WmsRelocationSessionReleaseBody,
    WmsOperationalTaskActionResponse,
    WmsOperationalTaskDetail,
    WmsOperationalTaskListResponse,
)
from ..services.wms_operational_task_service import (
    assign_relocation_allocation,
    bulk_assign_relocation_to_carrier,
    complete_operational_task,
    complete_relocation_by_group_key,
    get_operational_task_detail,
    list_operational_tasks,
    queue_summary,
    resolve_operational_task_scan,
    start_operational_task,
)
from ..services.wms_audit_service import (
    complete_wms_operation_session,
    ensure_wms_operation_session,
)
from ..services.wms_relocation_workflow import (
    RelocationSessionLockedError,
    acquire_relocation_session,
    operator_display_name,
    paginate_relocation_allocations,
    release_relocation_session,
)
from ..models.wms_operational_task import TASK_RELOCATION, WmsOperationalTask
from ..services.wms_operational_task_service import (
    _allocation_row_status,
    _json_loads,
    _normalize_payload_allocations,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wms/operational-tasks", tags=["WMS operational tasks"])


def _operator_id(user: AppUser | None) -> int | None:
    if user is None or user.id is None:
        return None
    return int(user.id)


def _session_kind_for_task(t: WmsOperationalTask) -> str:
    task_type = str(getattr(t, "task_type", "") or "").upper()
    if task_type in {"SHORTAGE_DECISION", "SHORTAGE_RECOLLECT", "WAITING_SUPPLY"}:
        return "shortage_active"
    if task_type == TASK_RELOCATION:
        return "relocation_active"
    return "warehouse_operation_active"


def _task_session_metadata(t: WmsOperationalTask) -> dict:
    total = float(getattr(t, "quantity_required", 0) or 0)
    done = float(getattr(t, "quantity_done", 0) or 0)
    return {
        "task_id": int(t.id),
        "task_type": str(t.task_type or ""),
        "queue": str(t.queue or ""),
        "status": str(t.status or ""),
        "progress_done": done,
        "progress_total": total,
        "progress_percent": int(round((done / total) * 100)) if total > 0 else 0,
        "location": getattr(t, "location_hint", None),
    }


@router.get("", response_model=WmsOperationalTaskListResponse)
def get_operational_tasks(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    queue: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(200, ge=1, le=500),
    sync: bool = Query(True, description="Pre-sync tasks from order state"),
    db: Session = Depends(get_db),
):
    try:
        return list_operational_tasks(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            queue=queue,
            status=status,
            limit=limit,
            sync_first=sync,
        )
    except Exception as exc:
        logger.exception("list operational tasks failed queue=%s", queue)
        raise HTTPException(
            status_code=500,
            detail={"message": "Nie udało się załadować kolejki operacyjnej."},
        ) from exc


@router.get("/queues/summary")
def get_operational_queues_summary(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    return queue_summary(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.get("/resolve-scan", response_model=WmsOperationalTaskDetail)
def get_operational_task_resolve_scan(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    scan: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    t = resolve_operational_task_scan(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, scan=scan.strip()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Brak aktywnego zadania dla skanu.")
    detail = get_operational_task_detail(
        db, int(t.id), tenant_id=tenant_id, requesting_operator_id=_operator_id(current_user)
    )
    if not detail:
        raise HTTPException(status_code=404, detail="Zadanie nie istnieje.")
    ensure_wms_operation_session(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        session_kind=_session_kind_for_task(t),
        operator_user_id=_operator_id(current_user),
        order_id=int(t.order_id) if getattr(t, "order_id", None) else None,
        metadata={"screen": "operational_task_resolve", **_task_session_metadata(t)},
    )
    db.commit()
    return detail


@router.get("/{task_id}", response_model=WmsOperationalTaskDetail)
def get_operational_task(
    task_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    detail = get_operational_task_detail(
        db,
        int(task_id),
        tenant_id=tenant_id,
        requesting_operator_id=_operator_id(current_user),
    )
    if not detail:
        raise HTTPException(status_code=404, detail="Zadanie nie istnieje.")
    t = (
        db.query(WmsOperationalTask)
        .filter(WmsOperationalTask.id == int(task_id), WmsOperationalTask.tenant_id == int(tenant_id))
        .first()
    )
    if t is not None:
        ensure_wms_operation_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(t.warehouse_id),
            session_kind=_session_kind_for_task(t),
            operator_user_id=_operator_id(current_user),
            order_id=int(t.order_id) if getattr(t, "order_id", None) else None,
            metadata={"screen": "operational_task_detail", **_task_session_metadata(t)},
        )
        db.commit()
    return detail


@router.post("/{task_id}/start", response_model=WmsOperationalTaskActionResponse)
def post_operational_task_start(
    task_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    t = start_operational_task(db, int(task_id), tenant_id=tenant_id)
    if not t:
        raise HTTPException(status_code=404, detail="Nie można rozpocząć zadania.")
    ensure_wms_operation_session(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(t.warehouse_id),
        session_kind=_session_kind_for_task(t),
        operator_user_id=_operator_id(current_user),
        order_id=int(t.order_id) if getattr(t, "order_id", None) else None,
        metadata={"screen": "operational_task_start", **_task_session_metadata(t)},
    )
    db.commit()
    return WmsOperationalTaskActionResponse(task_id=int(t.id), status=str(t.status))


@router.post("/{task_id}/complete", response_model=WmsOperationalTaskActionResponse)
def post_operational_task_complete(
    task_id: int,
    tenant_id: int = Query(..., ge=1),
    quantity_done: float | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    t = complete_operational_task(
        db, int(task_id), tenant_id=tenant_id, quantity_done=quantity_done
    )
    if not t:
        raise HTTPException(status_code=404, detail="Nie można zamknąć zadania.")
    complete_wms_operation_session(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(t.warehouse_id),
        session_kind=_session_kind_for_task(t),
        operator_user_id=_operator_id(current_user),
        order_id=int(t.order_id) if getattr(t, "order_id", None) else None,
        completed_reason="finished",
        metadata={"screen": "operational_task_complete", **_task_session_metadata(t)},
    )
    db.commit()
    return WmsOperationalTaskActionResponse(task_id=int(t.id), status=str(t.status))


@router.post("/{task_id}/relocation/session", response_model=WmsOperationalTaskDetail)
def post_relocation_session_acquire(
    task_id: int,
    body: WmsRelocationSessionAcquireBody,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    if not current_user.id:
        raise HTTPException(status_code=401, detail="Wymagane logowanie operatora.")
    try:
        acquire_relocation_session(
            db,
            int(task_id),
            tenant_id=int(body.tenant_id),
            operator_id=int(current_user.id),
            operator_name=operator_display_name(current_user),
            device_id=body.device_id,
            takeover=bool(body.takeover),
        )
        db.commit()
        detail = get_operational_task_detail(
            db,
            int(task_id),
            tenant_id=int(body.tenant_id),
            requesting_operator_id=int(current_user.id),
        )
        if not detail:
            raise HTTPException(status_code=404, detail="Zadanie nie istnieje.")
        return detail
    except RelocationSessionLockedError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(exc),
                "holder_name": exc.holder_name,
                "holder_id": exc.holder_id,
                "can_takeover": exc.can_takeover,
            },
        ) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail={"message": str(exc).strip() or "Operacja niedozwolona."},
        ) from exc


@router.post("/{task_id}/relocation/session/release", response_model=WmsOperationalTaskActionResponse)
def post_relocation_session_release(
    task_id: int,
    body: WmsRelocationSessionReleaseBody,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    if not current_user.id:
        raise HTTPException(status_code=401, detail="Wymagane logowanie operatora.")
    try:
        release_relocation_session(
            db,
            int(task_id),
            tenant_id=int(body.tenant_id),
            operator_id=int(current_user.id),
            operator_name=operator_display_name(current_user),
        )
        db.commit()
        return WmsOperationalTaskActionResponse(task_id=int(task_id), status="released")
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail={"message": str(exc).strip() or "Operacja niedozwolona."},
        ) from exc


@router.get("/{task_id}/relocation/allocations", response_model=WmsRelocationAllocationsPage)
def get_relocation_allocations_page(
    task_id: int,
    tenant_id: int = Query(..., ge=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(40, ge=1, le=200),
    status_filter: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    from ..schemas.wms_operational_task import WmsOperationalRelocationAllocation
    from ..services.wms_operational_task_service import _allocation_row_status

    t = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.id == int(task_id),
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.task_type == TASK_RELOCATION,
        )
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Zadanie nie istnieje.")
    payload = _json_loads(t.payload_json, {})
    if not isinstance(payload, dict):
        payload = {}
    page_rows, total = paginate_relocation_allocations(
        payload, offset=offset, limit=limit, status_filter=status_filter
    )
    norm = _normalize_payload_allocations(page_rows)
    items: list[WmsOperationalRelocationAllocation] = []
    for a in norm:
        oid = int(a["order_id"])
        oiid = int(a["order_item_id"])
        req = float(a.get("qty") or 0)
        rel = float(a.get("relocated_qty") or 0)
        items.append(
            WmsOperationalRelocationAllocation(
                order_id=oid,
                order_item_id=oiid,
                qty=req,
                target_zone=a.get("target_zone"),
                carrier_id=a.get("carrier_id"),
                carrier_label=a.get("carrier_label"),
                relocated_qty=rel,
                remaining_qty=round(max(0.0, req - rel), 6),
                relocated_by=a.get("relocated_by"),
                done=bool(a.get("done")),
                status=_allocation_row_status(a),
            )
        )
    return WmsRelocationAllocationsPage(items=items, total=total, offset=offset, limit=limit)


@router.post("/{task_id}/relocation/assign", response_model=WmsOperationalTaskDetail)
def post_relocation_assign(
    task_id: int,
    body: WmsOperationalRelocationAssignBody,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        assign_relocation_allocation(
            db,
            int(task_id),
            tenant_id=int(body.tenant_id),
            order_id=int(body.order_id),
            order_item_id=int(body.order_item_id),
            carrier_id=int(body.carrier_id),
            qty=body.qty,
            performed_by_user_id=int(current_user.id) if current_user.id else None,
            user=current_user,
            expected_version=body.lock_version,
        )
        db.commit()
        detail = get_operational_task_detail(
            db,
            int(task_id),
            tenant_id=int(body.tenant_id),
            requesting_operator_id=_operator_id(current_user),
        )
        if not detail:
            raise HTTPException(status_code=404, detail="Zadanie nie istnieje.")
        return detail
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail={"message": str(exc).strip() or "Operacja niedozwolona."},
        ) from exc


@router.post("/{task_id}/relocation/bulk-assign", response_model=WmsOperationalTaskDetail)
def post_relocation_bulk_assign(
    task_id: int,
    body: WmsOperationalRelocationBulkAssignBody,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        bulk_assign_relocation_to_carrier(
            db,
            int(task_id),
            tenant_id=int(body.tenant_id),
            carrier_id=int(body.carrier_id),
            order_item_ids=body.order_item_ids,
            performed_by_user_id=int(current_user.id) if current_user.id else None,
            user=current_user,
            expected_version=body.lock_version,
        )
        db.commit()
        detail = get_operational_task_detail(
            db,
            int(task_id),
            tenant_id=int(body.tenant_id),
            requesting_operator_id=_operator_id(current_user),
        )
        if not detail:
            raise HTTPException(status_code=404, detail="Zadanie nie istnieje.")
        return detail
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail={"message": str(exc).strip() or "Operacja niedozwolona."},
        ) from exc


@router.post("/relocation/{group_key}/complete", response_model=WmsOperationalTaskActionResponse)
def post_relocation_complete(
    group_key: str,
    body: WmsOperationalRelocationCompleteBody,
    db: Session = Depends(get_db),
):
    try:
        t = complete_relocation_by_group_key(
            db,
            tenant_id=int(body.tenant_id),
            warehouse_id=int(body.warehouse_id),
            group_key=group_key,
            quantity_done=body.quantity_done,
        )
        if not t:
            raise HTTPException(status_code=404, detail="Brak aktywnego zadania rozlokowania.")
        db.commit()
        return WmsOperationalTaskActionResponse(task_id=int(t.id), status=str(t.status))
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail={"message": str(exc).strip() or "Operacja niedozwolona."},
        ) from exc
