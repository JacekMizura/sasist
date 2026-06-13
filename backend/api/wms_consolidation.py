"""P5.1 — WMS consolidation queue API (target warehouse operations)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import require_any_permission
from ..auth.warehouse_deps import require_operable_warehouse
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.order_consolidation import (
    ConsolidationPlanListOut,
    ConsolidationPlanListRow,
    ConsolidationPlanRead,
    ConsolidationSummaryOut,
)
from ..services.order_consolidation.wms_operations_service import (
    WmsConsolidationAccessError,
    build_wms_consolidation_summary,
    get_wms_consolidation_plan_detail,
    list_wms_consolidation_plans,
)

router = APIRouter(prefix="/wms", tags=["WMS consolidation"])

_wms_perm = require_any_permission("warehouse.operations", "warehouse.inventory", "orders.read")


@router.get("/consolidation-plans/summary", response_model=ConsolidationSummaryOut)
def get_wms_consolidation_summary(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_wms_perm),
):
    payload = build_wms_consolidation_summary(
        db,
        tenant_id=int(tenant_id),
        target_warehouse_id=int(warehouse_id),
    )
    db.commit()
    return ConsolidationSummaryOut(**payload)


@router.get("/consolidation-plans", response_model=ConsolidationPlanListOut)
def list_wms_consolidation_plans_endpoint(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    include_completed: bool = Query(False),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_wms_perm),
):
    rows = list_wms_consolidation_plans(
        db,
        tenant_id=int(tenant_id),
        target_warehouse_id=int(warehouse_id),
        include_completed=include_completed,
    )
    db.commit()
    return ConsolidationPlanListOut(plans=[ConsolidationPlanListRow(**r) for r in rows])


@router.get("/consolidation-plans/{plan_id}", response_model=ConsolidationPlanRead)
def get_wms_consolidation_plan_endpoint(
    plan_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_wms_perm),
):
    try:
        payload = get_wms_consolidation_plan_detail(db, plan_id=int(plan_id), tenant_id=int(tenant_id))
        db.commit()
    except WmsConsolidationAccessError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ConsolidationPlanRead(**payload)
