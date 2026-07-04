"""Production demand planning (MRP-lite) API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.production_planning import ProductionDemandPlanningRead
from ..services.production_planning.constants import DEFAULT_COVERAGE_DAYS, DEFAULT_SALES_LOOKBACK_DAYS
from ..services.production_planning.demand_engine_service import get_production_demand_planning

router = APIRouter(prefix="/production/planning", tags=["Production Planning"])


@router.get("/demand", response_model=ProductionDemandPlanningRead)
def api_get_production_demand_planning(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    coverage_days: int = Query(DEFAULT_COVERAGE_DAYS, ge=1, le=365),
    sales_lookback_days: int = Query(DEFAULT_SALES_LOOKBACK_DAYS, ge=7, le=365),
    db: Session = Depends(get_db),
) -> ProductionDemandPlanningRead:
    """MRP-lite demand snapshot: orders + stock coverage forecast + combined gap."""
    return get_production_demand_planning(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        coverage_days=int(coverage_days),
        sales_lookback_days=int(sales_lookback_days),
    )
