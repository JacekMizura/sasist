"""P4.18 — Bundle warehouse intelligence API (recommendations only, no automation)."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth.warehouse_deps import require_operable_warehouse
from ..database import get_db
from ..schemas.bundle_intelligence import (
    BundleCapacityCartRead,
    BundleCapacityRackRead,
    BundleCapacityReportRead,
    BundleDashboardRead,
    BundleKpiRowRead,
    BundleReplenishmentBody,
    BundleReplenishmentRowRead,
    BundleSlottingPairRead,
)
from ..services.bundles.intelligence.analytics_service import build_bundle_dashboard
from ..services.bundles.intelligence.capacity_service import build_bundle_capacity_report
from ..services.bundles.intelligence.replenishment_service import build_bundle_replenishment_forecast
from ..services.bundles.intelligence.slotting_service import build_bundle_slotting_recommendations

router = APIRouter(prefix="/bundles/intelligence", tags=["Bundle intelligence"])


def _kpi_row(r) -> BundleKpiRowRead:
    return BundleKpiRowRead(**r.__dict__)


@router.get("/dashboard", response_model=BundleDashboardRead)
def get_bundle_intelligence_dashboard(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    period_days: int = Query(30, ge=7, le=365),
    list_limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> BundleDashboardRead:
    dash = build_bundle_dashboard(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        period_days=int(period_days),
        list_limit=int(list_limit),
    )
    return BundleDashboardRead(
        period_days=dash.period_days,
        top_bundles=[_kpi_row(r) for r in dash.top_bundles],
        fastest_growing=[_kpi_row(r) for r in dash.fastest_growing],
        highest_margin=[_kpi_row(r) for r in dash.highest_margin],
        most_returns=[_kpi_row(r) for r in dash.most_returns],
    )


@router.get("/slotting", response_model=List[BundleSlottingPairRead])
def get_bundle_slotting_recommendations(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    min_co_occurrence_rate: float = Query(0.8, ge=0.5, le=1.0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> List[BundleSlottingPairRead]:
    rows = build_bundle_slotting_recommendations(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        min_co_occurrence_rate=float(min_co_occurrence_rate),
        limit=int(limit),
    )
    return [BundleSlottingPairRead(**r.__dict__) for r in rows]


@router.post("/replenishment", response_model=List[BundleReplenishmentRowRead])
def post_bundle_replenishment_forecast(
    body: BundleReplenishmentBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
) -> List[BundleReplenishmentRowRead]:
    rows = build_bundle_replenishment_forecast(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        bundle_qty_forecast=body.bundle_qty_forecast,
        horizon_weeks=float(body.horizon_weeks),
        velocity_period_days=int(body.velocity_period_days),
    )
    return [BundleReplenishmentRowRead(**r.__dict__) for r in rows]


@router.get("/replenishment", response_model=List[BundleReplenishmentRowRead])
def get_bundle_replenishment_forecast(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    horizon_weeks: float = Query(1.0, ge=0.1, le=52),
    velocity_period_days: int = Query(30, ge=7, le=365),
    db: Session = Depends(get_db),
) -> List[BundleReplenishmentRowRead]:
    rows = build_bundle_replenishment_forecast(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        bundle_qty_forecast=None,
        horizon_weeks=float(horizon_weeks),
        velocity_period_days=int(velocity_period_days),
    )
    return [BundleReplenishmentRowRead(**r.__dict__) for r in rows]


@router.get("/capacity", response_model=BundleCapacityReportRead)
def get_bundle_capacity_report(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
) -> BundleCapacityReportRead:
    report = build_bundle_capacity_report(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    return BundleCapacityReportRead(
        cart_rows=[BundleCapacityCartRead(**r.__dict__) for r in report.cart_rows],
        rack_rows=[BundleCapacityRackRead(**r.__dict__) for r in report.rack_rows],
        overloaded_carts=report.overloaded_carts,
        overloaded_rack_segments=report.overloaded_rack_segments,
    )
