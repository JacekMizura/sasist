"""Capacity Analytics API — admin diagnostics (not Activity Log)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import require_any_permission
from ..database import get_db
from ..models.app_user import AppUser
from ..models.cart import Cart
from ..models.order import Order
from ..services.cart_capacity.analytics_service import (
    get_latest_run_for_cart,
    list_order_capacity_history,
    list_reason_order_details,
    warehouse_stats_24h,
)

router = APIRouter(prefix="/capacity-analytics", tags=["Capacity Analytics"])

_ADMIN_PERMS = ("warehouse.carts.admin_release", "warehouse.picking.override")


@router.get("/carts/{cart_id}/latest")
def get_cart_latest_capacity_run(
    cart_id: int,
    db: Session = Depends(get_db),
    _actor: AppUser = Depends(require_any_permission(*_ADMIN_PERMS)),
):
    cart = db.query(Cart).filter(Cart.id == int(cart_id)).first()
    if cart is None:
        raise HTTPException(status_code=404, detail="Wózek nie istnieje")
    data = get_latest_run_for_cart(db, cart_id=int(cart_id))
    if data is None:
        return {"run": None}
    return {"run": data}


@router.get("/runs/{run_id}/reasons/{reason_code}/orders")
def get_run_reason_orders(
    run_id: int,
    reason_code: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    _actor: AppUser = Depends(require_any_permission(*_ADMIN_PERMS)),
):
    return list_reason_order_details(
        db,
        run_id=int(run_id),
        reason_code=reason_code,
        offset=offset,
        limit=limit,
    )


@router.get("/stats")
def get_capacity_stats(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    hours: int = Query(24, ge=1, le=168),
    db: Session = Depends(get_db),
    _actor: AppUser = Depends(require_any_permission(*_ADMIN_PERMS)),
):
    return warehouse_stats_24h(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        hours=hours,
    )


@router.get("/orders/{order_id}/history")
def get_order_capacity_history(
    order_id: int,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Order timeline Capacity entries — readable with order view (not Activity Log)."""
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Zamówienie nie istnieje")
    return {
        "order_id": int(order_id),
        "items": list_order_capacity_history(db, order_id=int(order_id), limit=limit),
    }
