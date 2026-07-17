"""WMS cart stats — SSOT occupancy + Active Picking + Event Log."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.cart import Cart
from ..schemas.cart_stats import (
    WmsCartActivePickingOut,
    WmsCartLifecycleEventsOut,
    WmsCartLifecycleHistoryOut,
    WmsCartStatsOut,
)
from ..services.cart_picking_lifecycle_service import (
    get_active_picking,
    list_cart_lifecycle_events,
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
    Agregat zajętości wózka + active_picking (jedno źródło dla panelu / zbierania / pakowania).
    """
    return get_cart_stats_or_404(db, cart_id)


@router.get("/{cart_id}/active-picking", response_model=WmsCartActivePickingOut | None)
@router.get("/{cart_id}/current-task", response_model=WmsCartActivePickingOut | None, include_in_schema=False)
def get_wms_cart_active_picking(
    cart_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
):
    """Aktywna kompletacja — snapshot backendowy."""
    cart = db.query(Cart).filter(Cart.id == int(cart_id)).first()
    if cart is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Wózek nie istnieje")
    return get_active_picking(db, cart, enrich=True)


@router.get("/{cart_id}/events", response_model=WmsCartLifecycleEventsOut)
def get_wms_cart_lifecycle_events(
    cart_id: int = Path(..., ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Event Log wózka — opisy po polsku, gotowe do UI historii.
    """
    cart = db.query(Cart).filter(Cart.id == int(cart_id)).first()
    if cart is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Wózek nie istnieje")
    items = list_cart_lifecycle_events(db, cart_id=int(cart_id), limit=limit)
    # Uzupełnij imię operatora gdy dostępne
    user_ids = {int(i["operator_user_id"]) for i in items if i.get("operator_user_id")}
    names: dict[int, str] = {}
    if user_ids:
        try:
            from ..models.app_user import AppUser

            for u in db.query(AppUser).filter(AppUser.id.in_(list(user_ids))).all():
                parts = [
                    (getattr(u, "first_name", None) or "").strip(),
                    (getattr(u, "last_name", None) or "").strip(),
                ]
                label = " ".join(p for p in parts if p) or (getattr(u, "login", None) or f"Użytkownik #{u.id}")
                names[int(u.id)] = label
        except Exception:
            pass
    for i in items:
        uid = i.get("operator_user_id")
        i["operator_name"] = names.get(int(uid)) if uid is not None else None
    return {"cart_id": int(cart_id), "items": items}


@router.get("/{cart_id}/lifecycle-history", response_model=WmsCartLifecycleHistoryOut)
def get_wms_cart_lifecycle_history(
    cart_id: int = Path(..., ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Techniczna historia przejść statusu (nie Event Log biznesowy)."""
    cart = db.query(Cart).filter(Cart.id == int(cart_id)).first()
    if cart is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Wózek nie istnieje")
    items = list_cart_lifecycle_history(db, cart_id=int(cart_id), limit=limit)
    return {"cart_id": int(cart_id), "items": items}
