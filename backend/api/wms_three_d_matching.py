"""WMS 3D Matching — history of solver attempts (audit, not learning)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..auth.warehouse_deps import require_operable_warehouse
from ..database import get_db
from ..schemas.wms_three_d_matching import WmsThreeDMatchingHistoryPageOut
from ..services.packaging_engine.three_d_matching_history import list_three_d_history

router = APIRouter(prefix="/wms/3d-matching", tags=["WMS 3D Matching"])
logger = logging.getLogger(__name__)


@router.get("/history", response_model=WmsThreeDMatchingHistoryPageOut)
def get_three_d_matching_history(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    order_q: str | None = Query(None, description="Order number or id"),
    result_status: str | None = Query(None),
    carton_id: str | None = Query(None),
    user_id: int | None = Query(None),
    strategy: str | None = Query(None),
    trigger: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: Session = Depends(get_db),
):
    try:
        data = list_three_d_history(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            page=page,
            limit=limit,
            order_q=order_q,
            result_status=result_status,
            carton_id=carton_id,
            user_id=user_id,
            strategy=strategy,
            trigger=trigger,
            date_from=date_from,
            date_to=date_to,
        )
        return WmsThreeDMatchingHistoryPageOut(**data)
    except SQLAlchemyError as e:
        logger.exception("get_three_d_matching_history")
        raise HTTPException(status_code=500, detail="Database error") from e
