"""Operational feature flags — capability probe for frontend graceful degradation."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.operational_features import OperationalFeaturesRead
from ..services.operational_features_context import build_operational_features_context

router = APIRouter(prefix="/operational", tags=["Operational features"])


@router.get("/features", response_model=OperationalFeaturesRead)
def get_operational_features(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    """Always 200 when authenticated — returns resolved flags even when all OFF."""
    ctx = build_operational_features_context(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    return OperationalFeaturesRead(
        direct_sales=ctx.operational_sales_sessions_active,
        runtime=ctx.operational_runtime_active,
        replenishment=ctx.replenishment_engine_active,
    )
