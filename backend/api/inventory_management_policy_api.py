"""Inventory management policy API — settings + audited manual correction."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.inventory_management_policy import (
    InventoryManagementSettingsRead,
    InventoryManagementSettingsSave,
    ManualStockCorrectionRequest,
    ManualStockCorrectionResponse,
)
from ..services.inventory_management_policy_service import (
    InventoryManagementPolicyError,
    can_manual_adjust_stock,
    get_inventory_management_mode,
    normalize_inventory_management_mode,
    save_inventory_management_mode,
)
from ..services.inventory_manual_adjustment_service import apply_manual_stock_correction
from ..services.tenant_default_warehouse import resolve_tenant_default_warehouse_id
from .wms_settings import _wms_settings_wh_dep

router = APIRouter(prefix="/wms", tags=["WMS Inventory Policy"])


def _policy_error_to_http(exc: InventoryManagementPolicyError) -> HTTPException:
    return HTTPException(status_code=400, detail={"message": str(exc), "code": exc.code})


@router.get("/settings/inventory-management", response_model=InventoryManagementSettingsRead)
def get_inventory_management_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(_wms_settings_wh_dep),
    db: Session = Depends(get_db),
):
    mode = get_inventory_management_mode(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    ui_mode = normalize_inventory_management_mode(mode)
    if ui_mode not in ("DOCUMENTS_ONLY", "HYBRID"):
        ui_mode = "HYBRID"
    return InventoryManagementSettingsRead(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        inventory_management_mode=ui_mode,  # type: ignore[arg-type]
        can_manual_adjust_stock=can_manual_adjust_stock(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)),
    )


@router.put("/settings/inventory-management", response_model=InventoryManagementSettingsRead)
def save_inventory_management_settings(
    body: InventoryManagementSettingsSave,
    db: Session = Depends(get_db),
):
    try:
        wh_id = (
            body.warehouse_id
            if body.warehouse_id is not None
            else resolve_tenant_default_warehouse_id(db, body.tenant_id)
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu") from None
    try:
        save_inventory_management_mode(
            db,
            tenant_id=int(body.tenant_id),
            warehouse_id=int(wh_id),
            mode=body.inventory_management_mode,
        )
        db.commit()
    except InventoryManagementPolicyError as exc:
        raise _policy_error_to_http(exc) from exc
    mode = get_inventory_management_mode(db, tenant_id=int(body.tenant_id), warehouse_id=int(wh_id))
    return InventoryManagementSettingsRead(
        tenant_id=int(body.tenant_id),
        warehouse_id=int(wh_id),
        inventory_management_mode=normalize_inventory_management_mode(mode),  # type: ignore[arg-type]
        can_manual_adjust_stock=can_manual_adjust_stock(db, tenant_id=int(body.tenant_id), warehouse_id=int(wh_id)),
    )


@router.post("/inventory/manual-adjustment", response_model=ManualStockCorrectionResponse, status_code=201)
def post_manual_stock_correction(body: ManualStockCorrectionRequest, db: Session = Depends(get_db)):
    try:
        result = apply_manual_stock_correction(
            db,
            tenant_id=int(body.tenant_id),
            warehouse_id=int(body.warehouse_id),
            product_id=int(body.product_id),
            location_id=int(body.location_id),
            quantity_delta=float(body.quantity_delta),
            reason=body.reason,
            stock_disposition=body.stock_disposition,
            batch_number=body.batch_number,
            expiration_date=body.expiration_date,
            user_id=None,
        )
        db.commit()
    except InventoryManagementPolicyError as exc:
        db.rollback()
        raise _policy_error_to_http(exc) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ManualStockCorrectionResponse.model_validate(result)
