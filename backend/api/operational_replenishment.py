"""Operational replenishment engine API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.wms_operational_task import WmsOperationalTask
from ..schemas.operational_replenishment import (
    ReplenishmentExecuteStepBody,
    ReplenishmentExecuteStepResult,
    ReplenishmentRuleRead,
    ReplenishmentRuleUpsertBody,
    ReplenishmentScanResult,
)
from ..services.operational_features_context import resolve_operational_features_context
from ..services.replenishment.detection_service import scan_warehouse_replenishment
from ..services.replenishment.rules_service import list_replenishment_rules, upsert_replenishment_rule

router = APIRouter(prefix="/operational-replenishment", tags=["Operational replenishment"])


def _require_replenishment(db: Session, tenant_id: int, warehouse_id: int):
    ctx = resolve_operational_features_context(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not ctx.replenishment_engine_active:
        raise HTTPException(status_code=403, detail="FEATURE_REPLENISHMENT_ENGINE is disabled")
    return ctx


@router.get("/rules", response_model=list[ReplenishmentRuleRead])
def get_replenishment_rules(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    rows = list_replenishment_rules(db, tenant_id=tenant_id, warehouse_id=warehouse_id, active_only=False)
    return [
        ReplenishmentRuleRead(
            id=r.id,
            warehouse_id=r.warehouse_id,
            product_id=r.product_id,
            zone_type=r.zone_type,
            task_type=r.task_type,
            min_qty=float(r.min_qty),
            max_qty=float(r.max_qty) if r.max_qty is not None else None,
            target_qty=float(r.target_qty) if r.target_qty is not None else None,
            preferred_source_zone_type=r.preferred_source_zone_type,
            priority=int(r.priority),
            is_active=bool(r.is_active),
            updated_at=r.updated_at,
        )
        for r in rows
    ]


@router.put("/rules", response_model=ReplenishmentRuleRead)
def put_replenishment_rule(
    body: ReplenishmentRuleUpsertBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    _require_replenishment(db, tenant_id, warehouse_id)
    row = upsert_replenishment_rule(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        zone_type=body.zone_type,
        min_qty=body.min_qty,
        rule_id=body.rule_id,
        product_id=body.product_id,
        task_type=body.task_type,
        max_qty=body.max_qty,
        target_qty=body.target_qty,
        preferred_source_zone_type=body.preferred_source_zone_type,
        season_key=body.season_key,
        time_window=body.time_window,
        priority=body.priority,
        is_active=body.is_active,
    )
    db.commit()
    return ReplenishmentRuleRead(
        id=row.id,
        warehouse_id=row.warehouse_id,
        product_id=row.product_id,
        zone_type=row.zone_type,
        task_type=row.task_type,
        min_qty=float(row.min_qty),
        max_qty=float(row.max_qty) if row.max_qty is not None else None,
        target_qty=float(row.target_qty) if row.target_qty is not None else None,
        preferred_source_zone_type=row.preferred_source_zone_type,
        priority=int(row.priority),
        is_active=bool(row.is_active),
        updated_at=row.updated_at,
    )


@router.post("/scan", response_model=ReplenishmentScanResult)
def post_replenishment_scan(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    product_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    ctx = _require_replenishment(db, tenant_id, warehouse_id)
    result = scan_warehouse_replenishment(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        features=ctx,
    )
    db.commit()
    return ReplenishmentScanResult(**result)


@router.post("/tasks/{task_id}/execute-step", response_model=ReplenishmentExecuteStepResult)
def post_replenishment_execute_step(
    task_id: int,
    body: ReplenishmentExecuteStepBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    from ..services.replenishment.execution_service import advance_replenishment_execution
    import json

    task = (
        db.query(WmsOperationalTask)
        .filter(WmsOperationalTask.id == int(task_id), WmsOperationalTask.tenant_id == int(tenant_id))
        .first()
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    _require_replenishment(db, tenant_id, int(task.warehouse_id))
    try:
        advance_replenishment_execution(
            db,
            task,
            step=body.step,
            scan_code=body.scan_code,
            note=body.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    payload = {}
    try:
        payload = json.loads(task.payload_json or "{}")
    except Exception:
        pass
    return ReplenishmentExecuteStepResult(
        task_id=int(task.id),
        orchestration_state=task.orchestration_state,
        status=str(task.status),
        quantity_done=float(task.quantity_done or 0),
        task_payload=payload if isinstance(payload, dict) else {},
    )
