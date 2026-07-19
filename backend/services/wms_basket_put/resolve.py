"""Resolve next pick allocation (order/line/basket) without writing picks."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session, joinedload

from ...models.cart import Cart
from ...models.cart_basket import CartBasket
from ...models.enums import CartType
from ...models.order import Order
from ...models.order_item import order_item_is_replaced_line
from ..bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from ..fulfillment_event_service import sum_pick_events_for_line_cart
from ..picking_assignment_service import ensure_order_basket_for_wms_pick
from .basket_match import primary_basket_label


@dataclass(frozen=True)
class BasketPutAllocation:
    order_id: int
    order_item_id: int
    product_id: int
    basket_id: int
    basket_label: str
    line_remaining: float


def cart_is_baskets_mode(cart: Cart) -> bool:
    raw = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    upper = str(raw).split(".")[-1].upper()
    if upper in ("MULTI", "BASKETS"):
        return True
    try:
        if cart.type == CartType.MULTI:
            return True
    except Exception:
        pass
    return upper == "MULTI"


def resolve_next_basket_allocation(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
) -> BasketPutAllocation | None:
    """
    FIFO next open line for product on this cart — same order as ``record_wms_quick_pick``.
    Ensures basket assignment for MULTI before returning.
    """
    if not order_ids:
        return None
    cid = int(cart.id)
    orders = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.basket))
        .filter(Order.id.in_([int(x) for x in order_ids]))
        .order_by(Order.id.asc())
        .all()
    )
    for o in orders:
        for oi in sorted(o.items or [], key=lambda x: int(x.id)):
            if int(oi.product_id) != int(product_id):
                continue
            if order_item_is_replaced_line(oi):
                continue
            if order_item_skip_bundle_commercial_header_for_ops(oi):
                continue
            st_oi = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()
            if st_oi in ("picked", "missing"):
                continue
            need = float(oi.quantity)
            miss_ln = float(oi.wms_picking_line_missing_qty or 0)
            picked_sum = sum_pick_events_for_line_cart(db, int(oi.id), cid)
            rem = need - float(picked_sum or 0) - miss_ln
            if rem <= 1e-9:
                continue
            if o.cart_id is None or int(o.cart_id) != cid:
                continue
            ensure_order_basket_for_wms_pick(db, cart, o)
            db.refresh(o)
            bid = getattr(o, "basket_id", None)
            if bid is None:
                continue
            basket = (
                db.query(CartBasket)
                .filter(CartBasket.id == int(bid), CartBasket.cart_id == cid)
                .first()
            )
            if basket is None:
                continue
            return BasketPutAllocation(
                order_id=int(o.id),
                order_item_id=int(oi.id),
                product_id=int(product_id),
                basket_id=int(basket.id),
                basket_label=primary_basket_label(basket),
                line_remaining=float(rem),
            )
    return None
