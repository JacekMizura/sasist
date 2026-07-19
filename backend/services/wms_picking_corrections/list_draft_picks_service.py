"""
List draft picks for a product on a picking cart (MULTI recovery UI).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.cart_basket import CartBasket
from ...models.location import Location
from ...models.order import Order
from ...models.pick import Pick


def list_draft_picks_for_product_on_cart(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
    product_id: int,
) -> list[dict]:
    """
    Active draft Picks (picked_at IS NULL) for one product on the session cart.
    Ordered by Pick.id ASC (creation / finalize order).
    """
    rows = (
        db.query(Pick, Location, Order, CartBasket)
        .outerjoin(Location, Location.id == Pick.location_id)
        .outerjoin(Order, Order.id == Pick.order_id)
        .outerjoin(CartBasket, CartBasket.id == Order.basket_id)
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.cart_id == int(cart_id),
            Pick.product_id == int(product_id),
            Pick.picked_at.is_(None),
        )
        .order_by(Pick.id.asc())
        .all()
    )
    out: list[dict] = []
    for pick, loc, order, basket in rows:
        loc_code = ""
        if loc is not None:
            loc_code = (loc.name or "").strip() or f"#{pick.location_id}"
        else:
            loc_code = f"#{pick.location_id}"
        basket_label = None
        basket_id = None
        if basket is not None:
            basket_id = int(basket.id)
            basket_label = (basket.name or "").strip() or None
        created = getattr(pick, "created_at", None)
        out.append(
            {
                "pick_id": int(pick.id),
                "order_id": int(pick.order_id),
                "order_item_id": int(pick.order_item_id) if pick.order_item_id is not None else None,
                "order_number": (str(order.number) if order is not None and order.number else str(pick.order_id)),
                "basket_id": basket_id,
                "basket_label": basket_label,
                "location_id": int(pick.location_id),
                "location_code": loc_code,
                "quantity": float(pick.quantity or 0),
                "picked_at": None,
                "created_at": created.isoformat() if created is not None else None,
                "product_id": int(pick.product_id),
            }
        )
    return out
