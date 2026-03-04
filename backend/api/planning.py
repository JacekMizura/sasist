"""
API: Planning

Endpoint planowania kompletacji.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.planning import PlanningRequest, PlanningResponse
from ..services.planning_service import PlanningService


router = APIRouter(prefix="/planning", tags=["Planning"])


@router.post("/run", response_model=PlanningResponse)
def run_planning(data: PlanningRequest, db: Session = Depends(get_db)):

    service = PlanningService(db)

    result = service.run_planning(
        tenant_id=data.tenant_id,
        warehouse_id=data.warehouse_id,
        orders=[order.dict() for order in data.orders]
    )

    return result
