"""Production demand planning (MRP) API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.production_planning import (
    ProductionDemandPlanningRead,
    ProductionPlanCreateBatchesBody,
    ProductionPlanSimulateBody,
    ProductionPlanSimulationRead,
)
from ..services.production_planning.constants import DEFAULT_COVERAGE_DAYS
from ..services.production_planning.planning_service import PlanningContext, get_production_demand_planning
from ..services.production_planning.simulation_service import create_batches_from_simulation, simulate_production_plan

router = APIRouter(prefix="/production/planning", tags=["Production Planning"])


@router.get("/demand", response_model=ProductionDemandPlanningRead)
def api_get_production_demand_planning(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    coverage_days: int = Query(DEFAULT_COVERAGE_DAYS, ge=1, le=365),
    db: Session = Depends(get_db),
) -> ProductionDemandPlanningRead:
    return get_production_demand_planning(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        coverage_days=int(coverage_days),
    )


@router.post("/simulate", response_model=ProductionPlanSimulationRead)
def api_simulate_production_plan(
    body: ProductionPlanSimulateBody,
    db: Session = Depends(get_db),
) -> ProductionPlanSimulationRead:
    ctx = PlanningContext(
        tenant_id=int(body.tenant_id),
        warehouse_id=int(body.warehouse_id),
        coverage_days=int(body.coverage_days),
    )
    return simulate_production_plan(db, ctx, product_quantities=body.lines)


@router.post("/simulate/create-batches")
def api_create_batches_from_simulation(
    body: ProductionPlanCreateBatchesBody,
    db: Session = Depends(get_db),
) -> dict[str, list[int]]:
    ctx = PlanningContext(
        tenant_id=int(body.tenant_id),
        warehouse_id=int(body.warehouse_id),
        coverage_days=int(body.coverage_days),
    )
    ids = create_batches_from_simulation(db, ctx)
    db.commit()
    return {"batch_ids": ids}
