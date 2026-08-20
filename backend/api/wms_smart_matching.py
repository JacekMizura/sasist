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
    WmsSmartMatchingHistoryEventsPageOut,
    WmsSmartMatchingHistoryOut,
    WmsSmartMatchingHistorySeriesPageOut,
    WmsSmartMatchingLearningSeriesOut,
    WmsSmartMatchingManualRuleSave,
    WmsSmartMatchingProductPanelOut,
    WmsSmartMatchingProductSettingsSave,
    WmsSmartMatchingResetOut,
    WmsSmartMatchingRuleLockSave,
    WmsSmartMatchingRuleOut,
    WmsSmartMatchingRuleV2Out,
    WmsSmartMatchingSettingsOut,
    WmsSmartMatchingSettingsSave,
)
from ..services.packaging_engine.smart_matching_history_events_v2 import (
    learning_series_for_product_carton,
    list_history_events_v2,
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
from ..services.packaging_engine.smart_matching_v2.product_rules import (
    delete_manual_rule,
    get_product_smart_matching_panel,
    rule_to_dict,
    set_product_smart_matching_enabled,
    set_rule_locked,
    upsert_manual_rule,
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
    """Legacy v1 learning-series projection (compatibility). Prefer /history-events for UI."""
    payload = list_history_series(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, page=page, limit=limit
    )
    return WmsSmartMatchingHistorySeriesPageOut.model_validate(payload)


@router.get("/history-events", response_model=WmsSmartMatchingHistoryEventsPageOut)
def get_smart_matching_history_events(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    product_id: int | None = Query(None, ge=1),
    carton_id: str | None = Query(None),
    user_id: int | None = Query(None, ge=1),
    event_type: str | None = Query("all"),
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
):
    """v2 decision history: one row per ObservationV2."""
    payload = list_history_events_v2(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        page=page,
        limit=limit,
        product_id=product_id,
        carton_id=carton_id,
        user_id=user_id,
        event_type=event_type,
        date_from=date_from,
        date_to=date_to,
    )
    return WmsSmartMatchingHistoryEventsPageOut.model_validate(payload)


@router.get("/learning-series", response_model=WmsSmartMatchingLearningSeriesOut)
def get_smart_matching_learning_series(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    product_id: int = Query(..., ge=1),
    carton_id: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Popover series for (product, carton) — hit_index oldest→newest, render newest-first."""
    payload = learning_series_for_product_carton(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        carton_id=carton_id,
    )
    return WmsSmartMatchingLearningSeriesOut.model_validate(payload)


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


@router.get("/products/{product_id}", response_model=WmsSmartMatchingProductPanelOut)
def get_product_smart_matching(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    payload = get_product_smart_matching_panel(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=int(product_id)
    )
    return WmsSmartMatchingProductPanelOut.model_validate(payload)


@router.put("/products/{product_id}/settings", response_model=WmsSmartMatchingProductPanelOut)
def put_product_smart_matching_settings(
    product_id: int,
    body: WmsSmartMatchingProductSettingsSave,
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    if int(body.warehouse_id) != int(warehouse_id):
        raise HTTPException(status_code=400, detail="warehouse_id mismatch")
    try:
        set_product_smart_matching_enabled(
            db,
            tenant_id=int(body.tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product_id),
            enabled=bool(body.smart_matching_enabled),
        )
        db.commit()
        payload = get_product_smart_matching_panel(
            db, tenant_id=int(body.tenant_id), warehouse_id=int(warehouse_id), product_id=int(product_id)
        )
        return WmsSmartMatchingProductPanelOut.model_validate(payload)
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("put_product_smart_matching_settings")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.post("/products/{product_id}/rules", response_model=WmsSmartMatchingRuleV2Out)
def post_product_manual_rule(
    product_id: int,
    body: WmsSmartMatchingManualRuleSave,
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    if int(body.warehouse_id) != int(warehouse_id):
        raise HTTPException(status_code=400, detail="warehouse_id mismatch")
    try:
        row = upsert_manual_rule(
            db,
            tenant_id=int(body.tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product_id),
            min_qty=int(body.min_qty),
            carton_id=str(body.carton_id),
            is_locked=bool(body.is_locked),
        )
        db.commit()
        db.refresh(row)
        return WmsSmartMatchingRuleV2Out.model_validate(rule_to_dict(db, row))
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_product_manual_rule")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.put("/products/{product_id}/rules/{rule_id}", response_model=WmsSmartMatchingRuleV2Out)
def put_product_manual_rule(
    product_id: int,
    rule_id: int,
    body: WmsSmartMatchingManualRuleSave,
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    if int(body.warehouse_id) != int(warehouse_id):
        raise HTTPException(status_code=400, detail="warehouse_id mismatch")
    try:
        row = upsert_manual_rule(
            db,
            tenant_id=int(body.tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product_id),
            min_qty=int(body.min_qty),
            carton_id=str(body.carton_id),
            is_locked=bool(body.is_locked),
            rule_id=int(rule_id),
        )
        db.commit()
        db.refresh(row)
        return WmsSmartMatchingRuleV2Out.model_validate(rule_to_dict(db, row))
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("put_product_manual_rule")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.put("/rules-v2/{rule_id}/lock", response_model=WmsSmartMatchingRuleV2Out)
def put_rule_v2_lock(
    rule_id: int,
    body: WmsSmartMatchingRuleLockSave,
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    if int(body.warehouse_id) != int(warehouse_id):
        raise HTTPException(status_code=400, detail="warehouse_id mismatch")
    try:
        row = set_rule_locked(
            db,
            tenant_id=int(body.tenant_id),
            warehouse_id=int(warehouse_id),
            rule_id=int(rule_id),
            is_locked=bool(body.is_locked),
        )
        db.commit()
        db.refresh(row)
        return WmsSmartMatchingRuleV2Out.model_validate(rule_to_dict(db, row))
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("put_rule_v2_lock")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.delete("/products/{product_id}/rules/{rule_id}")
def delete_product_manual_rule(
    product_id: int,
    rule_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    _ = product_id
    try:
        ok = delete_manual_rule(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, rule_id=int(rule_id)
        )
        if not ok:
            raise HTTPException(status_code=404, detail="manual rule not found")
        db.commit()
        return {"ok": True}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("delete_product_manual_rule")
        raise HTTPException(status_code=500, detail="Database error") from e
