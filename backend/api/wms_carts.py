"""WMS cart stats — SSOT occupancy from orders.cart_id / picking_session_id."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.cart_stats import WmsCartStatsOut
from ..services.cart_stats_service import get_cart_stats_or_404

router = APIRouter(prefix="/wms/carts", tags=["WMS carts"])


@router.get("/{cart_id}/stats", response_model=WmsCartStatsOut)
def get_wms_cart_stats(
    cart_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Agregat zajętości wózka (jedno źródło prawdy dla panelu / kartoteki).

    Źródło: orders.cart_id (+ orders.picking_session_id dla aktywnej sesji).
    """
    return get_cart_stats_or_404(db, cart_id)
