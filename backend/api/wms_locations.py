"""WMS location visual preview API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.wms_location_visual import LocationVisualContextOut
from ..services.wms_location_visual_service import LocationVisualContextError, build_location_visual_context

router = APIRouter(prefix="/wms", tags=["WMS locations"])


@router.get("/locations/{location_id}/visual-context", response_model=LocationVisualContextOut)
def get_location_visual_context(
    location_id: int,
    tenant_id: int = Query(..., ge=1),
    carrier_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    try:
        return build_location_visual_context(
            db,
            tenant_id=int(tenant_id),
            location_id=int(location_id),
            carrier_id=carrier_id,
        )
    except LocationVisualContextError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
