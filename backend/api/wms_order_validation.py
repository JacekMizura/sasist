"""API Walidacji WMS zamówienia (odczyt + ręczna rewalidacja)."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth_deps import get_optional_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.order import Order
from ..services.wms_order_validation import (
    apply_wms_validation_pass_revalidate,
    validate_order_for_picking,
)
from ..services.wms_order_validation.lifecycle import read_validation_state_from_order
from ..warehouse_context import require_operable_warehouse

router = APIRouter(prefix="/wms/orders", tags=["wms-order-validation"])


class WmsOrderValidationIssueOut(BaseModel):
    reason_code: str
    reason_label: str
    product_id: Optional[int] = None
    order_item_id: Optional[int] = None
    ean: Optional[str] = None
    sku: Optional[str] = None
    product_name: Optional[str] = None
    required_qty: Optional[float] = None
    available_qty: Optional[float] = None
    allocatable_qty: Optional[float] = None
    location_id: Optional[int] = None


class WmsOrderValidationStateOut(BaseModel):
    order_id: int
    validation_status: str
    has_stored_failure: bool = False
    failed_at: Optional[str] = None
    previous_ui_status_id: Optional[int] = None
    issues: list[WmsOrderValidationIssueOut] = Field(default_factory=list)
    live: dict[str, Any] = Field(default_factory=dict)


class WmsOrderRevalidateOut(BaseModel):
    order_id: int
    validation_status: str
    issues: list[WmsOrderValidationIssueOut] = Field(default_factory=list)
    status_changed: bool = False
    restored_status_id: Optional[int] = None
    needs_manual_status: bool = False
    config_missing: bool = False


@router.get("/{order_id}/wms-validation", response_model=WmsOrderValidationStateOut)
def get_order_wms_validation(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(
            Order.id == int(order_id),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Zamówienie nie znalezione.")
    stored = read_validation_state_from_order(order)
    live = validate_order_for_picking(
        db, order_id=int(order_id), tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    issues_src = stored["issues"] if stored["has_failure"] and not live.ok else [i.to_dict() for i in live.issues]
    if live.ok and not stored["has_failure"]:
        issues_src = []
    return WmsOrderValidationStateOut(
        order_id=int(order_id),
        validation_status=live.validation_status,
        has_stored_failure=bool(stored["has_failure"]),
        failed_at=stored.get("failed_at"),
        previous_ui_status_id=stored.get("previous_ui_status_id"),
        issues=[WmsOrderValidationIssueOut(**x) for x in issues_src if isinstance(x, dict)],
        live=live.to_dict(),
    )


@router.post("/{order_id}/wms-validation/revalidate", response_model=WmsOrderRevalidateOut)
def post_order_wms_revalidate(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    order = (
        db.query(Order)
        .filter(
            Order.id == int(order_id),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Zamówienie nie znalezione.")
    uid = int(current_user.id) if current_user is not None and current_user.id is not None else None
    result = validate_order_for_picking(
        db, order_id=int(order_id), tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    applied = apply_wms_validation_pass_revalidate(
        db,
        order=order,
        result=result,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        operator_user_id=uid,
    )
    db.commit()
    return WmsOrderRevalidateOut(
        order_id=int(order_id),
        validation_status=result.validation_status,
        issues=[WmsOrderValidationIssueOut(**i.to_dict()) for i in result.issues],
        status_changed=bool(applied.get("status_changed")),
        restored_status_id=applied.get("restored_status_id"),
        needs_manual_status=bool(applied.get("needs_manual_status")),
        config_missing=bool(applied.get("config_missing")),
    )
