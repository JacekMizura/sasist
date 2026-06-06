"""Operational feature flags — capability probe for frontend graceful degradation."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.operational_features import (
    OperationalFeaturesDebugRead,
    OperationalFeaturesRead,
    OperationalFeaturesResolvedDebug,
)
from ..services.operational_feature_resolver import allow_operational_features_debug, build_feature_debug_bundle

router = APIRouter(prefix="/operational", tags=["Operational features"])


@router.get("/features", response_model=OperationalFeaturesRead)
def get_operational_features(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    """Always 200 when authenticated — returns resolved flags even when all OFF."""
    bundle = build_feature_debug_bundle(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    resolved = bundle["resolved"]
    return OperationalFeaturesRead(
        direct_sales=bool(resolved["direct_sales"]),
        runtime=bool(resolved["runtime"]),
        replenishment=bool(resolved["replenishment"]),
    )


@router.get("/features/debug", response_model=OperationalFeaturesDebugRead)
def get_operational_features_debug(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    if not allow_operational_features_debug():
        raise HTTPException(status_code=404, detail="Not found")
    bundle = build_feature_debug_bundle(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    resolved = bundle["resolved"]
    return OperationalFeaturesDebugRead(
        env=bundle["env"],
        tenant=bundle["tenant"],
        warehouse=bundle["warehouse"],
        resolved=OperationalFeaturesResolvedDebug(**resolved),
    )
