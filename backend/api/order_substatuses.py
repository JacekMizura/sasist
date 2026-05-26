"""Panel order sub-status reorder (custom / non-system)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.order import OrderSubstatusReorderRequest, OrderUiStatusPanelSummary
from ..services.order_ui_status_reorder import apply_order_substatus_reorder

router = APIRouter(prefix="/order-substatuses", tags=["Order sub-statuses"])


@router.post("/reorder", response_model=OrderUiStatusPanelSummary)
def reorder_order_substatuses(
    body: OrderSubstatusReorderRequest,
    db: Session = Depends(get_db),
):
    """Move one custom status up/down, or set full order of all custom statuses within a main group."""
    return apply_order_substatus_reorder(db, body)
