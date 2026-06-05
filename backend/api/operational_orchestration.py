"""Task orchestration API — assign and lifecycle transitions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.wms_operational_task import WmsOperationalTask
from ..schemas.operational_orchestration import (
    TaskAssignBody,
    TaskOrchestrationRead,
    TaskTransitionBody,
)
from ..services.operational_features_context import resolve_operational_features_context
from ..services.orchestration.assignment_service import assign_task_to_operator
from ..services.orchestration.lifecycle_service import transition_task_state

router = APIRouter(prefix="/operational-orchestration", tags=["Task orchestration"])


def _get_task(db: Session, tenant_id: int, task_id: int) -> WmsOperationalTask:
    row = (
        db.query(WmsOperationalTask)
        .filter(WmsOperationalTask.id == int(task_id), WmsOperationalTask.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


@router.post("/tasks/{task_id}/assign", response_model=TaskOrchestrationRead)
def post_assign_task(
    task_id: int,
    body: TaskAssignBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    task = _get_task(db, tenant_id, task_id)
    ctx = resolve_operational_features_context(db, tenant_id=tenant_id, warehouse_id=int(task.warehouse_id))
    if not ctx.operational_runtime_active:
        raise HTTPException(status_code=403, detail="FEATURE_OPERATIONAL_RUNTIME is disabled")
    assign_task_to_operator(
        db,
        task,
        operator_user_id=body.operator_user_id,
        activate=body.activate,
    )
    db.commit()
    return TaskOrchestrationRead(
        task_id=task.id,
        orchestration_state=task.orchestration_state,
        status=task.status,
        assigned_user_id=task.assigned_user_id,
        blocked_reason=task.blocked_reason,
    )


@router.post("/tasks/{task_id}/transition", response_model=TaskOrchestrationRead)
def post_transition_task(
    task_id: int,
    body: TaskTransitionBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    task = _get_task(db, tenant_id, task_id)
    ctx = resolve_operational_features_context(db, tenant_id=tenant_id, warehouse_id=int(task.warehouse_id))
    if not ctx.operational_runtime_active:
        raise HTTPException(status_code=403, detail="FEATURE_OPERATIONAL_RUNTIME is disabled")
    try:
        transition_task_state(db, task, new_state=body.new_state, blocked_reason=body.blocked_reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    return TaskOrchestrationRead(
        task_id=task.id,
        orchestration_state=task.orchestration_state,
        status=task.status,
        assigned_user_id=task.assigned_user_id,
        blocked_reason=task.blocked_reason,
    )
