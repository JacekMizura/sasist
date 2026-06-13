"""WMS replenishment: pick-face from buffer + operational task queue."""

from __future__ import annotations

from typing import List

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
from ..schemas.wms_replenishment import (
    WmsReplenishmentExecuteBody,
    WmsReplenishmentExecuteResult,
    WmsReplenishmentLineRead,
    WmsReplenishmentTaskExecuteBody,
    WmsReplenishmentTaskGenerateResult,
    WmsReplenishmentTaskRead,
)
from ..services.wms_workforce_activity import MODULE_MOVEMENTS, log_wms_workforce_activity
from ..services.wms_replenishment_service import (
    execute_replenishment_task,
    execute_wms_replenishment,
    generate_replenishment_tasks,
    get_replenishment_task,
    list_replenishment_tasks,
    list_wms_replenishment_lines,
)

router = APIRouter(prefix="/wms", tags=["WMS replenishment"])


@router.get("/replenishment/lines", response_model=List[WmsReplenishmentLineRead])
def get_wms_replenishment_lines(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    try:
        return list_wms_replenishment_lines(db, tenant_id, warehouse_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/replenishment/execute", response_model=WmsReplenishmentExecuteResult)
def post_wms_replenishment_execute(
    body: WmsReplenishmentExecuteBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        res = execute_wms_replenishment(db, tenant_id, body, performed_by=current_user, replenishment_task_id=None)
        log_wms_workforce_activity(
            db,
            user=current_user,
            tenant_id=tenant_id,
            module=MODULE_MOVEMENTS,
            action_type="scan_replenishment",
            entity_type="Replenishment",
            metadata={"product_id": body.product_id, "quantity": body.quantity},
        )
        db.commit()
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/replenishment/tasks", response_model=List[WmsReplenishmentTaskRead])
def get_replenishment_tasks(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    view: str = Query("location"),
    db: Session = Depends(get_db),
):
    if view not in ("location", "priority"):
        raise HTTPException(status_code=400, detail="view must be location or priority")
    try:
        return list_replenishment_tasks(db, tenant_id, warehouse_id, view=view)  # type: ignore[arg-type]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/replenishment/tasks/{task_id}", response_model=WmsReplenishmentTaskRead)
def get_replenishment_task_by_id(
    task_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return get_replenishment_task(db, tenant_id, task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/replenishment/tasks/generate", response_model=WmsReplenishmentTaskGenerateResult)
def post_replenishment_tasks_generate(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    try:
        res = generate_replenishment_tasks(db, tenant_id, warehouse_id)
        db.commit()
        return res
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        db.rollback()
        raise

@router.patch("/replenishment/tasks/{task_id}/execute", response_model=WmsReplenishmentExecuteResult)
def patch_replenishment_task_execute(
    task_id: int,
    body: WmsReplenishmentTaskExecuteBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        res = execute_replenishment_task(db, tenant_id, task_id, body, performed_by=current_user)
        log_wms_workforce_activity(
            db,
            user=current_user,
            tenant_id=tenant_id,
            module=MODULE_MOVEMENTS,
            action_type="scan_replenishment_task",
            entity_type="ReplenishmentTask",
            entity_id=task_id,
            metadata={"quantity": body.quantity},
        )
        db.commit()
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
