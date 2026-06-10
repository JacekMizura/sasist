"""Customer purchase history analytics endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.customer_purchase_history import (
    PurchaseHistoryListOut,
    PurchaseHistorySummaryOut,
    PurchaseTrendOut,
    TopProductsOut,
)
from ..services.customers.purchase_history_service import (
    build_purchase_history,
    build_summary,
    build_top_products,
    build_trend,
    filters_from_query,
)

router = APIRouter(prefix="/customers", tags=["Customers — purchase history"])


def _filter_params(
    date_from: Optional[str] = Query(None, description="Data od (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Data do (YYYY-MM-DD)"),
    gross_min: Optional[float] = Query(None, ge=0),
    gross_max: Optional[float] = Query(None, ge=0),
    order_ui_status_id: Optional[int] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    operator_user_id: Optional[int] = Query(None),
    order_channel: Optional[str] = Query(None),
    paid_only: bool = Query(False),
    completed_only: bool = Query(False),
):
    return filters_from_query(
        date_from=date_from,
        date_to=date_to,
        gross_min=gross_min,
        gross_max=gross_max,
        order_ui_status_id=order_ui_status_id,
        warehouse_id=warehouse_id,
        operator_user_id=operator_user_id,
        order_channel=order_channel,
        paid_only=paid_only,
        completed_only=completed_only,
    )


def _customer_not_found(exc: LookupError) -> HTTPException:
    return HTTPException(status_code=404, detail="Nie znaleziono klienta.")


@router.get("/{customer_id}/purchase-history/summary", response_model=PurchaseHistorySummaryOut)
def get_customer_purchase_summary(
    customer_id: int,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
    flt=Depends(_filter_params),
):
    try:
        return build_summary(db, customer_id=customer_id, tenant_id=tenant_id, flt=flt)
    except LookupError as exc:
        raise _customer_not_found(exc) from exc


@router.get("/{customer_id}/purchase-history/documents", response_model=PurchaseHistoryListOut)
def get_customer_purchase_documents(
    customer_id: int,
    tenant_id: int = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sort_by: str = Query("date", pattern="^(date|document_number|net|gross|status)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    flt=Depends(_filter_params),
):
    try:
        return build_purchase_history(
            db,
            customer_id=customer_id,
            tenant_id=tenant_id,
            flt=flt,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )
    except LookupError as exc:
        raise _customer_not_found(exc) from exc


@router.get("/{customer_id}/purchase-history/top-products", response_model=TopProductsOut)
def get_customer_top_products(
    customer_id: int,
    tenant_id: int = Query(...),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    flt=Depends(_filter_params),
):
    try:
        return build_top_products(
            db,
            customer_id=customer_id,
            tenant_id=tenant_id,
            flt=flt,
            limit=limit,
        )
    except LookupError as exc:
        raise _customer_not_found(exc) from exc


@router.get("/{customer_id}/purchase-history/trend", response_model=PurchaseTrendOut)
def get_customer_purchase_trend(
    customer_id: int,
    tenant_id: int = Query(...),
    granularity: str = Query("month", pattern="^(day|week|month)$"),
    db: Session = Depends(get_db),
    flt=Depends(_filter_params),
):
    try:
        return build_trend(
            db,
            customer_id=customer_id,
            tenant_id=tenant_id,
            flt=flt,
            granularity=granularity,
        )
    except LookupError as exc:
        raise _customer_not_found(exc) from exc
