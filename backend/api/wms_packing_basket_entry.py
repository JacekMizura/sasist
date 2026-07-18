"""WMS pakowanie — rozwiązanie zamówienia po kodzie koszyka (wózek MULTI)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from fastapi import Depends
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.wms_packing import WmsPackingBasketOrderOut
from ..services.wms_packing_service import PackingScanError, resolve_packing_order_for_basket_scan

from .wms_packing_entry import _packing_scan_http_exception

router = APIRouter(prefix="/baskets", tags=["WMS packing baskets"])
logger = logging.getLogger(__name__)


@router.get("/{code}/order", response_model=WmsPackingBasketOrderOut)
def get_basket_packing_order(
    code: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    cart_id: int = Query(..., ge=1, description="Aktywny wózek MULTI z sesji pakowania"),
    status: int = Query(..., ge=1, description="order_ui_status_id — jak w GET /wms/packing/orders"),
    mode: str = Query(..., description="Musi być baskets"),
    db: Session = Depends(get_db),
):
    """Jedno zamówienie przypisane do koszyka (nazwa, S-r-k lub kod kreskowy koszyka) na danym wózku."""
    try:
        return resolve_packing_order_for_basket_scan(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            cart_id=cart_id,
            basket_scan=code,
            status_id=status,
            mode=mode,
        )
    except PackingScanError as e:
        raise _packing_scan_http_exception(e) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        logger.exception("get_basket_packing_order")
        raise HTTPException(status_code=500, detail="Database error") from e
