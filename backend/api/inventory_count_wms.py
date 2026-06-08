"""WMS inventory count execution API — scanner-first operator flows."""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_optional_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.inventory_count import (
    InventoryAuditQueuesRead,
    InventoryCountLineRead,
    InventoryCountScanBody,
    InventoryLocationConfirmBody,
    InventoryLocationExecutionSummaryRead,
    InventorySessionOpenBody,
    InventorySessionRead,
    InventoryTaskPageRead,
    InventoryTaskRead,
    InventoryUniversalSearchRead,
    InventoryUnknownProductCreateBody,
    InventoryUnknownProductRead,
)
from ..services.inventory_count import (
    InventoryCountError,
    close_session,
    confirm_location_scan,
    get_line_for_operator,
    get_task,
    list_open_tasks,
    open_session,
    record_count_scan,
)
from ..services.inventory_count.unknown_product_service import (
    create_unknown_product_draft,
    list_unknown_products,
)
from ..services.inventory_count.wms_search_service import (
    resolve_product_for_task_location,
    search_inventory_execution,
)
from ..services.inventory_count.wms_task_queue_service import list_tasks_paginated
from ..services.inventory_count.wms_variance_service import get_audit_queues, get_location_execution_summary
from ..api.inventory_count_deps import require_inventory_permission_optional
from ..services.inventory_count.permissions import PERM_EXECUTE
from ..services.inventory_count.count_entry_service import resolve_barcode_to_line
from ..services.inventory_count.session_service import heartbeat_session
from ..services.inventory_count.task_generation_service import get_task_lines

router = APIRouter(prefix="/wms/inventory-count", tags=["WMS Inventory Count"])
logger = logging.getLogger(__name__)


def _map_error(exc: InventoryCountError) -> HTTPException:
    if exc.code == "blind_count_violation":
        return HTTPException(status_code=403, detail={"code": exc.code, "message": str(exc)})
    if exc.code in ("concurrent_update", "duplicate_post", "posting_in_progress"):
        return HTTPException(status_code=409, detail={"code": exc.code, "message": str(exc)})
    if exc.code == "line_locked":
        return HTTPException(status_code=423, detail={"code": exc.code, "message": str(exc)})
    status = 404 if "not_found" in exc.code else 400
    return HTTPException(status_code=status, detail={"code": exc.code, "message": str(exc)})


@router.get("/tasks", response_model=List[InventoryTaskRead])
def wms_inventory_tasks_legacy(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    document_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    return list_open_tasks(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        document_id=document_id,
        user_id=user.id if user else None,
        limit=50,
    )


@router.get("/tasks/queue", response_model=InventoryTaskPageRead)
def wms_inventory_task_queue(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    document_id: Optional[int] = Query(None, ge=1),
    zone: Optional[str] = Query(None),
    assigned_user_id: Optional[int] = Query(None, ge=1),
    status: Optional[str] = Query(None),
    recount_only: bool = Query(False),
    unresolved_only: bool = Query(False),
    variance_only: bool = Query(False),
    completed_only: bool = Query(False),
    search: Optional[str] = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    return list_tasks_paginated(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        document_id=document_id,
        user_id=user.id if user else None,
        zone=zone,
        assigned_user_id=assigned_user_id,
        status=status,
        recount_only=recount_only,
        unresolved_only=unresolved_only,
        variance_only=variance_only,
        completed_only=completed_only,
        search=search,
        offset=offset,
        limit=limit,
    )


@router.get("/search", response_model=InventoryUniversalSearchRead)
def wms_inventory_universal_search(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    q: str = Query(..., min_length=1),
    document_id: Optional[int] = Query(None, ge=1),
    limit: int = Query(25, ge=1, le=50),
    db: Session = Depends(get_db),
):
    return search_inventory_execution(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        query=q,
        document_id=document_id,
        limit=limit,
    )


@router.get("/tasks/{task_id}/search-products")
def wms_inventory_task_product_search(
    task_id: int,
    tenant_id: int = Query(..., ge=1),
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    try:
        return resolve_product_for_task_location(db, tenant_id=tenant_id, task_id=task_id, query=q)
    except InventoryCountError as exc:
        raise _map_error(exc) from exc


@router.get("/tasks/{task_id}/execution-summary", response_model=InventoryLocationExecutionSummaryRead)
def wms_inventory_execution_summary(
    task_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return get_location_execution_summary(db, tenant_id=tenant_id, task_id=task_id)
    except InventoryCountError as exc:
        raise _map_error(exc) from exc


@router.get("/audit-queues", response_model=InventoryAuditQueuesRead)
def wms_inventory_audit_queues(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    document_id: Optional[int] = Query(None, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return get_audit_queues(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        document_id=document_id,
        limit=limit,
    )


@router.post("/unknown-products", response_model=InventoryUnknownProductRead)
def wms_inventory_create_unknown_product(
    body: InventoryUnknownProductCreateBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    session_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(require_inventory_permission_optional(PERM_EXECUTE)),
):
    try:
        return create_unknown_product_draft(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            document_id=body.document_id,
            task_id=body.task_id,
            location_id=body.location_id,
            temporary_name=body.temporary_name,
            quantity=body.quantity,
            barcode_value=body.barcode_value,
            notes=body.notes,
            photo_url=body.photo_url,
            user_id=user.id if user else None,
            session_id=session_id,
        )
    except InventoryCountError as exc:
        raise _map_error(exc) from exc


@router.get("/unknown-products", response_model=List[InventoryUnknownProductRead])
def wms_inventory_list_unknown_products(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    document_id: Optional[int] = Query(None, ge=1),
    status: str = Query("draft"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return list_unknown_products(
        db,
        tenant_id=tenant_id,
        document_id=document_id,
        warehouse_id=warehouse_id,
        status=status,
        limit=limit,
    )


@router.get("/tasks/{task_id}", response_model=InventoryTaskRead)
def wms_inventory_task_detail(
    task_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return get_task(db, tenant_id=tenant_id, task_id=task_id)
    except InventoryCountError as exc:
        raise _map_error(exc) from exc


@router.get("/tasks/{task_id}/lines")
def wms_inventory_task_lines(
    task_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return get_task_lines(db, tenant_id=tenant_id, task_id=task_id, blind=True)
    except InventoryCountError as exc:
        raise _map_error(exc) from exc


@router.post("/tasks/{task_id}/resolve-barcode")
def wms_inventory_resolve_barcode(
    task_id: int,
    barcode_value: str = Query(..., min_length=1),
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return resolve_barcode_to_line(
            db,
            tenant_id=tenant_id,
            task_id=task_id,
            barcode_value=barcode_value,
        )
    except InventoryCountError as exc:
        raise _map_error(exc) from exc


@router.post("/sessions", response_model=InventorySessionRead)
def wms_inventory_open_session(
    body: InventorySessionOpenBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return open_session(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            document_id=body.document_id,
            task_id=body.task_id,
            user_id=user.id if user else None,
            device_id=body.device_id,
        )
    except InventoryCountError as exc:
        raise _map_error(exc) from exc


@router.post("/sessions/{session_id}/close", response_model=InventorySessionRead)
def wms_inventory_close_session(
    session_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return close_session(
            db,
            tenant_id=tenant_id,
            session_id=session_id,
            user_id=user.id if user else None,
        )
    except InventoryCountError as exc:
        raise _map_error(exc) from exc


@router.post("/tasks/{task_id}/confirm-location")
def wms_inventory_confirm_location(
    task_id: int,
    body: InventoryLocationConfirmBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return confirm_location_scan(
            db,
            tenant_id=tenant_id,
            task_id=task_id,
            location_id=body.location_id,
            scanned_code=body.scanned_code,
        )
    except InventoryCountError as exc:
        raise _map_error(exc) from exc


@router.get("/lines/{line_id}", response_model=InventoryCountLineRead)
def wms_inventory_line(
    line_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return get_line_for_operator(db, tenant_id=tenant_id, line_id=line_id, include_expected=False)
    except InventoryCountError as exc:
        raise _map_error(exc) from exc


@router.post("/documents/{document_id}/scan")
def wms_inventory_record_scan(
    document_id: int,
    body: InventoryCountScanBody,
    tenant_id: int = Query(..., ge=1),
    session_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(require_inventory_permission_optional(PERM_EXECUTE)),
):
    try:
        return record_count_scan(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            line_id=body.line_id,
            quantity=float(body.quantity or 0),
            user_id=user.id if user else None,
            session_id=session_id,
            barcode_value=body.barcode_value,
            source=body.source,
            delta=body.delta,
        )
    except InventoryCountError as exc:
        raise _map_error(exc) from exc


@router.post("/sessions/{session_id}/heartbeat", response_model=InventorySessionRead)
def wms_inventory_session_heartbeat(
    session_id: int,
    tenant_id: int = Query(..., ge=1),
    device_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(require_inventory_permission_optional(PERM_EXECUTE)),
):
    try:
        return heartbeat_session(
            db,
            tenant_id=tenant_id,
            session_id=session_id,
            user_id=user.id if user else None,
            device_id=device_id,
        )
    except InventoryCountError as exc:
        raise _map_error(exc) from exc
