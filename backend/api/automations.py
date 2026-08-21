"""Backend Automation Engine CRUD API."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.automation import (
    AutomationExecutionOut,
    AutomationRuleCreate,
    AutomationRuleOut,
    AutomationRuleUpdate,
    StatusActionRuleOut,
)
from ..services.automation.store import (
    create_rule,
    delete_rule,
    execution_to_dict,
    get_rule,
    list_executions,
    list_rules,
    rule_to_dict,
    set_rule_enabled,
    update_rule,
)

router = APIRouter(prefix="/automations", tags=["Automations"])
logger = logging.getLogger(__name__)


def _out(rule) -> AutomationRuleOut:
    return AutomationRuleOut.model_validate(rule_to_dict(rule))


@router.get("/status-actions", response_model=list[StatusActionRuleOut])
def get_status_actions(
    tenant_id: int = Query(..., ge=1),
    entity_type: str = Query(..., min_length=1),
    status_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    """Projection of STATUS_ACTION rules for a panel status editor."""
    from ..services.automation.status_actions import status_action_projection

    rows = status_action_projection(
        db,
        tenant_id=tenant_id,
        entity_type=entity_type,
        status_id=status_id,
        warehouse_id=warehouse_id,
    )
    return [StatusActionRuleOut.model_validate(r) for r in rows]


@router.get("", response_model=list[AutomationRuleOut])
def get_automations(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    entity_type: Optional[str] = Query(None),
    enabled: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    rows = list_rules(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        entity_type=entity_type,
        enabled=enabled,
    )
    return [_out(r) for r in rows]


@router.get("/{rule_id}", response_model=AutomationRuleOut)
def get_automation(
    rule_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_rule(db, tenant_id=tenant_id, rule_id=rule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    return _out(row)


@router.post("", response_model=AutomationRuleOut)
def post_automation(body: AutomationRuleCreate, db: Session = Depends(get_db)):
    try:
        row = create_rule(
            db,
            tenant_id=int(body.tenant_id),
            warehouse_id=body.warehouse_id,
            entity_type=body.entity_type,
            name=body.name,
            enabled=body.enabled,
            trigger_type=body.trigger_type,
            trigger_config=body.trigger_config,
            source=body.source,
            effects=[e.model_dump() for e in body.effects],
        )
        db.commit()
        db.refresh(row)
        return _out(get_rule(db, tenant_id=int(body.tenant_id), rule_id=int(row.id)) or row)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_automation")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.patch("/{rule_id}", response_model=AutomationRuleOut)
def patch_automation(
    rule_id: int,
    body: AutomationRuleUpdate,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_rule(db, tenant_id=tenant_id, rule_id=rule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    try:
        update_rule(
            db,
            row,
            name=body.name,
            enabled=body.enabled,
            warehouse_id=body.warehouse_id,
            clear_warehouse=body.clear_warehouse,
            trigger_type=body.trigger_type,
            trigger_config=body.trigger_config,
            effects=[e.model_dump() for e in body.effects] if body.effects is not None else None,
        )
        db.commit()
        return _out(get_rule(db, tenant_id=tenant_id, rule_id=rule_id) or row)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("patch_automation")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.put("/{rule_id}", response_model=AutomationRuleOut)
def put_automation(
    rule_id: int,
    body: AutomationRuleUpdate,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    return patch_automation(rule_id=rule_id, body=body, tenant_id=tenant_id, db=db)


@router.delete("/{rule_id}", status_code=204)
def delete_automation(
    rule_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_rule(db, tenant_id=tenant_id, rule_id=rule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    try:
        delete_rule(db, row)
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("delete_automation")
        raise HTTPException(status_code=500, detail="Database error") from e
    return None


@router.post("/{rule_id}/enable", response_model=AutomationRuleOut)
def enable_automation(
    rule_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_rule(db, tenant_id=tenant_id, rule_id=rule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    set_rule_enabled(db, row, True)
    db.commit()
    return _out(get_rule(db, tenant_id=tenant_id, rule_id=rule_id) or row)


@router.post("/{rule_id}/disable", response_model=AutomationRuleOut)
def disable_automation(
    rule_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_rule(db, tenant_id=tenant_id, rule_id=rule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    set_rule_enabled(db, row, False)
    db.commit()
    return _out(get_rule(db, tenant_id=tenant_id, rule_id=rule_id) or row)


@router.get("/{rule_id}/executions", response_model=list[AutomationExecutionOut])
def get_automation_executions(
    rule_id: int,
    tenant_id: int = Query(..., ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    row = get_rule(db, tenant_id=tenant_id, rule_id=rule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    from sqlalchemy.orm import joinedload
    from ..models.automation import AutomationExecution

    rows = (
        db.query(AutomationExecution)
        .options(joinedload(AutomationExecution.effect_executions))
        .filter(AutomationExecution.rule_id == int(rule_id))
        .order_by(AutomationExecution.id.desc())
        .limit(limit)
        .all()
    )
    return [AutomationExecutionOut.model_validate(execution_to_dict(r)) for r in rows]
