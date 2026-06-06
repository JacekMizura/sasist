"""
Panel order UI statuses for dropdowns (WMS packing settings, direct sales, etc.).

Active order-compatible statuses only — same source as office order panel.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.wms_packing_settings import OrderStatusesListOut
from ..services.order_status_select_service import list_selectable_order_status_options

router = APIRouter(prefix="/order-statuses", tags=["Order statuses"])


@router.get("", response_model=OrderStatusesListOut)
def list_order_statuses(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    items = list_selectable_order_status_options(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    return OrderStatusesListOut(items=items)
