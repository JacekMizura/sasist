"""Pickup fulfillment API — isolated from classic WMS picking."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..api.operational_features_deps import operational_features_for_request
from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.order import Order
from ..schemas.operational_pickup import PickupHandoffResponse, PickupPrepareResponse, PickupReadyResponse
from ..services.direct_sale_service import DirectSaleError
from ..services.pickup_flow_service import (
    complete_pickup_handoff,
    mark_pickup_ready,
    start_pickup_prepare,
)

router = APIRouter(
    prefix="/operational-pickup",
    tags=["Operational pickup"],
    dependencies=[Depends(operational_features_for_request)],
)


def _operator_id(user: AppUser | None) -> int | None:
    if user is None or user.id is None:
        return None
    return int(user.id)


def _load_order(db: Session, *, order_id: int, tenant_id: int) -> Order:
    order = (
        db.query(Order)
        .filter(Order.id == int(order_id), Order.tenant_id == int(tenant_id))
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order


@router.post("/orders/{order_id}/prepare", response_model=PickupPrepareResponse)
def post_pickup_prepare(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    order = _load_order(db, order_id=order_id, tenant_id=tenant_id)
    try:
        result = start_pickup_prepare(db, order=order, performed_by_user_id=_operator_id(user))
        db.commit()
        return PickupPrepareResponse(
            order_id=result.order_id,
            task_id=result.task_id,
            pickup_zone_id=result.pickup_zone_id,
        )
    except DirectSaleError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc


@router.post("/orders/{order_id}/ready", response_model=PickupReadyResponse)
def post_pickup_ready(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    pickup_zone_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    order = _load_order(db, order_id=order_id, tenant_id=tenant_id)
    try:
        task_id = mark_pickup_ready(
            db,
            order=order,
            pickup_zone_id=pickup_zone_id,
            performed_by_user_id=_operator_id(user),
        )
        db.commit()
        return PickupReadyResponse(order_id=int(order.id), task_id=task_id, pickup_zone_id=pickup_zone_id)
    except DirectSaleError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc


@router.post("/orders/{order_id}/handoff", response_model=PickupHandoffResponse)
def post_pickup_handoff(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    order = _load_order(db, order_id=order_id, tenant_id=tenant_id)
    try:
        task_id = complete_pickup_handoff(db, order=order, performed_by_user_id=_operator_id(user))
        db.commit()
        return PickupHandoffResponse(order_id=int(order.id), task_id=task_id)
    except DirectSaleError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc
