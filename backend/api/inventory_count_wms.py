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
    InventoryCountLineRead,
    InventoryCountScanBody,
    InventoryLocationConfirmBody,
    InventorySessionOpenBody,
    InventorySessionRead,
    InventoryTaskRead,
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

router = APIRouter(prefix="/wms/inventory-count", tags=["WMS Inventory Count"])
logger = logging.getLogger(__name__)


def _map_error(exc: InventoryCountError) -> HTTPException:
    if exc.code == "blind_count_violation":
        return HTTPException(status_code=403, detail={"code": exc.code, "message": str(exc)})
    status = 404 if "not_found" in exc.code else 400
    return HTTPException(status_code=status, detail={"code": exc.code, "message": str(exc)})


@router.get("/tasks", response_model=List[InventoryTaskRead])
def wms_inventory_tasks(
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
    user: AppUser | None = Depends(get_optional_current_user),
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
