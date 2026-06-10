"""Klient z zamówienia — podgląd, utworzenie, połączenie."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.customer_order_link import (
    OrderCustomerCreateBody,
    OrderCustomerLinkBody,
    OrderCustomerLinkPreviewOut,
    OrderCustomerLinkResultOut,
)
from ..services.customers.customer_order_link_service import (
    CustomerOrderLinkError,
    create_customer_from_order,
    link_order_to_customer,
    preview_order_customer_link,
)

router = APIRouter(tags=["Customers — order link"])


@router.get("/order-link/preview", response_model=OrderCustomerLinkPreviewOut)
def get_order_customer_link_preview(
    order_id: int = Query(..., ge=1),
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        payload = preview_order_customer_link(db, order_id=order_id, tenant_id=tenant_id)
        return OrderCustomerLinkPreviewOut(**payload)
    except CustomerOrderLinkError as exc:
        raise HTTPException(status_code=404, detail=exc.message) from exc


@router.post("/order-link/create", response_model=OrderCustomerLinkResultOut)
def post_order_customer_create(
    body: OrderCustomerCreateBody,
    db: Session = Depends(get_db),
):
    try:
        result = create_customer_from_order(
            db,
            order_id=body.order_id,
            tenant_id=body.tenant_id,
            force_duplicate=bool(body.force_duplicate),
        )
        db.commit()
        return OrderCustomerLinkResultOut(**result)
    except CustomerOrderLinkError as exc:
        db.rollback()
        status = 409 if exc.code == "duplicate_detected" else 400
        if exc.code == "order_not_found":
            status = 404
        raise HTTPException(status_code=status, detail=exc.message) from exc


@router.post("/order-link/link", response_model=OrderCustomerLinkResultOut)
def post_order_customer_link(
    body: OrderCustomerLinkBody,
    db: Session = Depends(get_db),
):
    try:
        result = link_order_to_customer(
            db,
            order_id=body.order_id,
            customer_id=body.customer_id,
            tenant_id=body.tenant_id,
        )
        db.commit()
        return OrderCustomerLinkResultOut(**result)
    except CustomerOrderLinkError as exc:
        db.rollback()
        status = 404 if exc.code in ("order_not_found", "customer_not_found") else 400
        raise HTTPException(status_code=status, detail=exc.message) from exc
