"""WMS Smart Matching — settings, history, rules, reset."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..auth.warehouse_deps import require_operable_warehouse
from ..database import get_db
from ..models.order_ui_status import OrderUiStatus
from ..schemas.wms_smart_matching import (
    WmsSmartMatchingHistoryOut,
    WmsSmartMatchingHistorySeriesPageOut,
    WmsSmartMatchingResetOut,
    WmsSmartMatchingRuleOut,
    WmsSmartMatchingSettingsOut,
    WmsSmartMatchingSettingsSave,
)
from ..services.packaging_engine.smart_matching_history_series import list_history_series
from ..services.packaging_engine.smart_matching_store import (
    get_or_create_settings,
    list_history,
    list_rules,
    reset_auto_rules,
    save_settings,
    settings_to_out,
)

router = APIRouter(prefix="/wms/smart-matching", tags=["WMS Smart Matching"])
logger = logging.getLogger(__name__)


@router.get("/settings", response_model=WmsSmartMatchingSettingsOut)
def get_smart_matching_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    try:
        row = get_or_create_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        db.commit()
        return settings_to_out(row)
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("get_smart_matching_settings")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.put("/settings", response_model=WmsSmartMatchingSettingsOut)
def put_smart_matching_settings(
    body: WmsSmartMatchingSettingsSave,
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    if int(body.warehouse_id) != int(warehouse_id):
        raise HTTPException(status_code=400, detail="warehouse_id mismatch")
    if body.proposal_init_status_id is not None:
        st = (
            db.query(OrderUiStatus)
            .filter(
                OrderUiStatus.id == int(body.proposal_init_status_id),
                OrderUiStatus.tenant_id == int(body.tenant_id),
                OrderUiStatus.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        if st is None:
            raise HTTPException(status_code=400, detail="proposal_init_status_id not found")
    for sid in body.auto_label_status_ids:
        st = (
            db.query(OrderUiStatus)
            .filter(
                OrderUiStatus.id == int(sid),
                OrderUiStatus.tenant_id == int(body.tenant_id),
                OrderUiStatus.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        if st is None:
            raise HTTPException(status_code=400, detail=f"auto_label status {sid} not found")
    try:
        row = save_settings(
            db,
            tenant_id=int(body.tenant_id),
            warehouse_id=int(warehouse_id),
            enabled=body.enabled,
            identical_orders_threshold=int(body.identical_orders_threshold),
            proposal_init_status_id=body.proposal_init_status_id,
            auto_label_enabled=body.auto_label_enabled,
            auto_label_status_ids=list(body.auto_label_status_ids or []),
            packaging_strategy=body.packaging_strategy,
            legacy_v1_fallback_enabled=body.legacy_v1_fallback_enabled,
        )
        db.commit()
        db.refresh(row)
        return settings_to_out(row)
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("put_smart_matching_settings")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.get("/history", response_model=list[WmsSmartMatchingHistoryOut])
def get_smart_matching_history(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    rows = list_history(db, tenant_id=tenant_id, warehouse_id=warehouse_id, limit=limit)
    return [WmsSmartMatchingHistoryOut.model_validate(r) for r in rows]


@router.get("/history-series", response_model=WmsSmartMatchingHistorySeriesPageOut)
def get_smart_matching_history_series(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Learning-series projection: one row per (composition_key, carton_id)."""
    payload = list_history_series(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, page=page, limit=limit
    )
    return WmsSmartMatchingHistorySeriesPageOut.model_validate(payload)


@router.get("/rules", response_model=list[WmsSmartMatchingRuleOut])
def get_smart_matching_rules(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    rows = list_rules(db, tenant_id=tenant_id, warehouse_id=warehouse_id, limit=limit)
    return [WmsSmartMatchingRuleOut.model_validate(r) for r in rows]


@router.post("/reset", response_model=WmsSmartMatchingResetOut)
def post_smart_matching_reset(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    try:
        n = reset_auto_rules(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        db.commit()
        return WmsSmartMatchingResetOut(deleted_rules=n)
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_smart_matching_reset")
        raise HTTPException(status_code=500, detail="Database error") from e
