"""Packaging Intelligence — dashboard i rozszerzenia API (WMS)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.packaging_intelligence import PackagingIntelligenceDashboardOut

router = APIRouter(prefix="/wms", tags=["Packaging Intelligence"])
logger = logging.getLogger(__name__)


@router.get("/packaging-intelligence/dashboard", response_model=PackagingIntelligenceDashboardOut)
def get_packaging_intelligence_dashboard(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    period_days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
):
    """Operacyjne KPI dopasowania opakowań — z historii Smart Matching."""
    from ..services.packaging_engine.smart_matching_store import dashboard_stats

    stats = dashboard_stats(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), period_days=int(period_days)
    )
    return PackagingIntelligenceDashboardOut.model_validate(stats)
