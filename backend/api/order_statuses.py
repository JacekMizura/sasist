"""
Panel order UI statuses for dropdowns (WMS packing settings, etc.).

Exposes a simple list — same rows as ``/office/order-ui/summary`` sub-statuses, flattened.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.order_ui_status import OrderUiStatus
from ..schemas.wms_packing_settings import OrderStatusOptionOut, OrderStatusesListOut

router = APIRouter(prefix="/order-statuses", tags=["Order statuses"])

_GROUP_ORDER: tuple[str, ...] = ("NEW", "IN_PROGRESS", "DONE")


@router.get("", response_model=OrderStatusesListOut)
def list_order_statuses(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
        )
        .order_by(OrderUiStatus.main_group.asc(), OrderUiStatus.sort_order.asc(), OrderUiStatus.id.asc())
        .all()
    )
    gidx = {g: i for i, g in enumerate(_GROUP_ORDER)}
    rows.sort(
        key=lambda r: (
            gidx.get(str(r.main_group or "NEW").strip().upper(), 99),
            int(r.sort_order or 0),
            int(r.id),
        )
    )
    items = [
        OrderStatusOptionOut(
            id=int(r.id),
            name=str(r.name or "").strip() or f"#{r.id}",
            main_group=str(r.main_group or "NEW").strip().upper(),
        )
        for r in rows
    ]
    return OrderStatusesListOut(items=items)
