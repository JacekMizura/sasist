"""P2.5 — company fulfillment assignment policy (tenant-wide)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import require_any_permission
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.fulfillment_configuration import FulfillmentConfigurationRead, FulfillmentConfigurationUpdate
from ..services.fulfillment_configuration_service import (
    FulfillmentConfigurationError,
    get_fulfillment_configuration,
    update_fulfillment_configuration,
)

router = APIRouter(prefix="/company/fulfillment-configuration", tags=["Fulfillment configuration"])

_company_perm = require_any_permission("settings.users", "settings.company")


@router.get("", response_model=FulfillmentConfigurationRead)
def get_configuration(
    tenant_id: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_company_perm),
):
    try:
        return get_fulfillment_configuration(db, tenant_id)
    except FulfillmentConfigurationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("", response_model=FulfillmentConfigurationRead)
def patch_configuration(
    body: FulfillmentConfigurationUpdate,
    tenant_id: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_company_perm),
):
    try:
        return update_fulfillment_configuration(db, tenant_id, body)
    except FulfillmentConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
