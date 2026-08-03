"""HTTP API — Living Supply Flow Plan (orchestration UX)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..auth.warehouse_deps import require_active_or_query_operable_warehouse
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.supply_flow import (
    SupplyFlowConfigOut,
    SupplyFlowConfigUpdateBody,
    SupplyFlowLivingPlanOut,
    SupplyFlowRecomputeBody,
)
from ..services.supply_flow.config_service import (
    SupplyFlowConfigError,
    get_or_create_warehouse_config,
    update_warehouse_config,
)
from ..services.supply_flow.constants import RECOMPUTE_MANUAL
from ..services.supply_flow.plan_query import living_plan_to_api_dict, load_living_plan
from ..services.supply_flow.recompute import RecomputeRequest, request_recompute

router = APIRouter(prefix="/wms/supply-flow", tags=["WMS Supply Flow"])


@router.get("/plan", response_model=SupplyFlowLivingPlanOut)
def get_supply_flow_plan(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    cfg = get_or_create_warehouse_config(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    plan = load_living_plan(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    return living_plan_to_api_dict(
        plan,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        cfg_goal=str(cfg.optimization_goal),
        cfg_horizon=int(cfg.planning_horizon_hours),
    )


@router.post("/recompute", response_model=SupplyFlowLivingPlanOut)
def recompute_supply_flow_plan(
    body: SupplyFlowRecomputeBody | None = None,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    delivery_id = body.delivery_id if body else None
    try:
        result = request_recompute(
            db,
            RecomputeRequest(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                trigger=RECOMPUTE_MANUAL,
                delivery_id=delivery_id,
            ),
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return living_plan_to_api_dict(
        result,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        cfg_goal=result.optimization_goal,
        cfg_horizon=result.planning_horizon_hours,
    )


@router.get("/config", response_model=SupplyFlowConfigOut)
def get_supply_flow_config(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    cfg = get_or_create_warehouse_config(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    db.commit()
    return SupplyFlowConfigOut(
        tenant_id=int(cfg.tenant_id),
        warehouse_id=int(cfg.warehouse_id),
        optimization_goal=str(cfg.optimization_goal),
        planning_horizon_hours=int(cfg.planning_horizon_hours),
    )


@router.patch("/config", response_model=SupplyFlowConfigOut)
def patch_supply_flow_config(
    body: SupplyFlowConfigUpdateBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    try:
        cfg = update_warehouse_config(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            optimization_goal=body.optimization_goal,
            planning_horizon_hours=body.planning_horizon_hours,
        )
        db.commit()
    except SupplyFlowConfigError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SupplyFlowConfigOut(
        tenant_id=int(cfg.tenant_id),
        warehouse_id=int(cfg.warehouse_id),
        optimization_goal=str(cfg.optimization_goal),
        planning_horizon_hours=int(cfg.planning_horizon_hours),
    )
