from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette import status

from ..database import get_db
from ..services.cart_service import CartService
from ..schemas.cart import (
    CartMultiCreate,
    CartBulkCreate,
    CartUpdate,
    CartGroupCreate,
    CartGroupUpdate,
)

router = APIRouter(
    prefix="/carts",
    tags=["Carts"]
)

# ==========================================================
# GET ALL: Pobiera listę wózków przypisanych do Tenanta
# ==========================================================
@router.get("/")
def get_carts(tenant_id: int, cart_type: str | None = None, db: Session = Depends(get_db)):
    service = CartService(db)
    return service.get_all(tenant_id, cart_type)

# ==========================================================
# CREATE GROUP: Tworzy nową grupę wózków
# ==========================================================
@router.get("/groups/")
def list_cart_groups(
    tenant_id: int,
    cart_type: str,
    db: Session = Depends(get_db),
):
    service = CartService(db)
    return service.get_groups(tenant_id, cart_type)


@router.post("/groups/")
def create_cart_group(
    tenant_id: int,
    data: CartGroupCreate,
    db: Session = Depends(get_db)
):
    service = CartService(db)
    return service.create_group(tenant_id, data.cart_type, data.name, data.description)


@router.put("/groups/{group_id}/")
def update_cart_group(
    group_id: int,
    data: CartGroupUpdate,
    db: Session = Depends(get_db),
):
    service = CartService(db)
    return service.update_group(group_id, data.name, data.description)


@router.delete("/groups/{group_id}/")
def delete_cart_group(
    group_id: int,
    db: Session = Depends(get_db),
):
    service = CartService(db)
    return service.delete_group(group_id)

# ==========================================================
# GET DETAILS: Pobiera pełne dane wózka wraz z jego koszykami
# ==========================================================
@router.get("/{cart_id}/")
def get_cart_details(cart_id: int, db: Session = Depends(get_db)):
    service = CartService(db)
    return service.get_details(cart_id)

def _cart_to_response_item(cart):
    """Format created cart like get_all items for frontend consistency."""
    cart.recalculate_total_volume()
    raw_type = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    clean_type = raw_type.split(".")[-1].upper()
    raw_status = cart.status.value if hasattr(cart.status, "value") else str(cart.status)
    clean_status = raw_status.split(".")[-1].upper()
    return {
        "id": cart.id,
        "name": cart.name,
        "type": clean_type,
        "status": clean_status,
        "group_id": cart.group_id,
        "image_url": cart.image_url,
        "total_baskets": len(cart.baskets) if clean_type == "MULTI" else 1,
        "total_volume_dm3": round(cart.total_volume or 0, 2),
        "used_volume": round(cart.used_volume or 0, 2),
        "width": getattr(cart, "width", None) or 0,
        "length": getattr(cart, "length", None) or 0,
        "height": getattr(cart, "height", None) or 0,
    }


# ==========================================================
# CREATE MULTI: Tworzy nowy wózek z wieloma koszykami naraz
# ==========================================================
@router.post("/multi/", status_code=status.HTTP_201_CREATED)
def create_multi_cart(
    data: CartMultiCreate,
    db: Session = Depends(get_db)
):
    service = CartService(db)
    cart = service.create_multi_cart(data)
    return _cart_to_response_item(cart)


# ==========================================================
# UPDATE CART: Aktualizuje nazwę wózka i jego strukturę koszyków
# ==========================================================
@router.put("/{cart_id}/")
def update_cart(
    cart_id: int, 
    data: CartUpdate,
    db: Session = Depends(get_db)
):
    service = CartService(db)
    # Logika: Service powinien obsłużyć podmienianie koszyków
    return service.update_cart(cart_id, data)

# ==========================================================
# DELETE: Usuwa wózek oraz wszystkie przypisane do niego koszyki
# ==========================================================
@router.delete("/{cart_id}/")
def delete_cart(cart_id: int, db: Session = Depends(get_db)):
    service = CartService(db)
    return service.delete_cart(cart_id)

# ==========================================================
# RESET / CLEAR: Czyści przypisania (order.cart_id/basket_id = NULL)
# ==========================================================
@router.post("/{cart_id}/reset/")
def reset_cart(cart_id: int, db: Session = Depends(get_db)):
    service = CartService(db)
    return service.reset_cart(cart_id)


@router.post("/{cart_id}/clear/")
def clear_cart(cart_id: int, db: Session = Depends(get_db)):
    """Wyczyść wózek: odepnij wszystkie zamówienia od tego wózka."""
    service = CartService(db)
    return service.clear_cart(cart_id)

# ==========================================================
# BASKET OPERATIONS: Zarządzanie pojedynczymi koszykami
# ==========================================================

@router.put("/basket/{basket_id}/")
def update_basket(
    basket_id: int,
    data: dict,
    db: Session = Depends(get_db)
):
    service = CartService(db)
    return service.update_basket(basket_id, data)

@router.delete("/basket/{basket_id}/")
def delete_basket(
    basket_id: int,
    db: Session = Depends(get_db)
):
    service = CartService(db)
    return service.delete_basket(basket_id)


@router.post("/basket/{basket_id}/clear/")
def clear_basket(basket_id: int, db: Session = Depends(get_db)):
    """Opróżnij koszyk: odepnij zamówienie od tego koszyka."""
    service = CartService(db)
    return service.clear_basket(basket_id)

# ==========================================================
# CREATE BULK: Tworzy standardowy wózek jednokomorowy
# ==========================================================
@router.post("/bulk/", status_code=status.HTTP_201_CREATED)
def create_bulk_cart(data: CartBulkCreate, db: Session = Depends(get_db)):
    service = CartService(db)
    cart = service.create_bulk_cart(data)
    return _cart_to_response_item(cart)