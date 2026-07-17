"""WMS cart stats — SSOT occupancy + current_task + lifecycle history."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.cart import Cart
from ..schemas.cart_stats import (
    WmsCartCurrentTaskOut,
    WmsCartLifecycleHistoryOut,
    WmsCartStatsOut,
)
from ..services.cart_picking_lifecycle_service import (
    get_cart_current_task,
    list_cart_lifecycle_history,
)
from ..services.cart_stats_service import get_cart_stats_or_404

router = APIRouter(prefix="/wms/carts", tags=["WMS carts"])


@router.get("/{cart_id}/stats", response_model=WmsCartStatsOut)
def get_wms_cart_stats(
    cart_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Agregat zajętości wózka + current_task (jedno źródło dla panelu / zbierania / pakowania).
    """
    return get_cart_stats_or_404(db, cart_id)


@router.get("/{cart_id}/current-task", response_model=WmsCartCurrentTaskOut | None)
def get_wms_cart_current_task(
    cart_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
):
    cart = db.query(Cart).filter(Cart.id == int(cart_id)).first()
    if cart is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Wózek nie istnieje")
    task = get_cart_current_task(db, cart, enrich=True)
    return task


@router.get("/{cart_id}/lifecycle-history", response_model=WmsCartLifecycleHistoryOut)
def get_wms_cart_lifecycle_history(
    cart_id: int = Path(..., ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    cart = db.query(Cart).filter(Cart.id == int(cart_id)).first()
    if cart is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Wózek nie istnieje")
    items = list_cart_lifecycle_history(db, cart_id=int(cart_id), limit=limit)
    return {"cart_id": int(cart_id), "items": items}
