"""Resolve basket put allocations without writing picks.

Product scan identifies the SKU; basket scan chooses order / order_item.
Never bind a single FIFO destination basket before the basket is scanned.
"""

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


def _line_remaining(db: Session, *, oi, cart_id: int) -> float:
    need = float(oi.quantity)
    miss_ln = float(oi.wms_picking_line_missing_qty or 0)
    picked_sum = sum_pick_events_for_line_cart(db, int(oi.id), int(cart_id))
    return need - float(picked_sum or 0) - miss_ln


def _line_eligible(oi) -> bool:
    if order_item_is_replaced_line(oi):
        return False
    if order_item_skip_bundle_commercial_header_for_ops(oi):
        return False
    st_oi = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()
    if st_oi in ("picked", "missing"):
        return False
    return True


def _orders_for_product(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
) -> list[Order]:
    if not order_ids:
        return []
    return (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.basket))
        .filter(Order.id.in_([int(x) for x in order_ids]))
        .order_by(Order.id.asc())
        .all()
    )


def list_eligible_basket_allocations(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
) -> list[BasketPutAllocation]:
    """
    All open order lines for this product that have a basket on the active cart.

    Order of list is stable (Order.id, OrderItem.id) for display only —
    it does NOT imply forced put order.

    SSOT aligned with product detail ``orders[]`` / basket_slot:
    order must be on this cart (cart_id) OR assigned to a basket of this cart.
    """
    cid = int(cart.id)
    out: list[BasketPutAllocation] = []
    for o in _orders_for_product(db, cart=cart, order_ids=order_ids):
        oc = getattr(o, "cart_id", None)
        if oc is not None and int(oc) != cid:
            continue
        ensure_order_basket_for_wms_pick(db, cart, o)
        db.refresh(o)
        if oc is None and (getattr(o, "cart_id", None) is None or int(o.cart_id) != cid):
            # Still allow if Order.basket_id points at a basket on this cart.
            bid_probe = getattr(o, "basket_id", None)
            if bid_probe is None:
                continue
            on_cart = (
                db.query(CartBasket.id)
                .filter(CartBasket.id == int(bid_probe), CartBasket.cart_id == cid)
                .first()
            )
            if on_cart is None:
                continue
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
        label = primary_basket_label(basket)
        for oi in sorted(o.items or [], key=lambda x: int(x.id)):
            if int(oi.product_id) != int(product_id):
                continue
            if not _line_eligible(oi):
                continue
            rem = _line_remaining(db, oi=oi, cart_id=cid)
            if rem <= 1e-9:
                continue
            out.append(
                BasketPutAllocation(
                    order_id=int(o.id),
                    order_item_id=int(oi.id),
                    product_id=int(product_id),
                    basket_id=int(basket.id),
                    basket_label=label,
                    line_remaining=float(rem),
                )
            )
            # One open line per order for this SKU (deterministic within order).
            break
    return out


def resolve_next_basket_allocation(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
) -> BasketPutAllocation | None:
    """First eligible allocation (display / series-exhausted fallback). Not a forced destination."""
    rows = list_eligible_basket_allocations(
        db, cart=cart, order_ids=order_ids, product_id=product_id
    )
    return rows[0] if rows else None


def resolve_allocation_for_series(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
    order_item_id: int,
    basket_id: int,
) -> BasketPutAllocation | None:
    """Re-resolve remaining qty for an active series target."""
    for alloc in list_eligible_basket_allocations(
        db, cart=cart, order_ids=order_ids, product_id=product_id
    ):
        if int(alloc.order_item_id) == int(order_item_id) and int(alloc.basket_id) == int(basket_id):
            return alloc
    return None


def resolve_allocation_for_basket_scan(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
    basket: CartBasket,
) -> tuple[BasketPutAllocation | None, str | None]:
    """
    Authoritative: product_id + scanned basket → open order_item + live remaining.

    Preference:
      1) eligible list filtered by basket_id (same SSOT as detail eligible rows)
      2) Order linked via basket.order_id
      3) Order with Order.basket_id == basket.id on this cart
    """
    cid = int(cart.id)
    bid = int(basket.id)
    eligible = [
        a
        for a in list_eligible_basket_allocations(
            db, cart=cart, order_ids=order_ids, product_id=product_id
        )
        if int(a.basket_id) == bid
    ]
    if eligible:
        return eligible[0], None

    order: Order | None = None
    basket_oid = getattr(basket, "order_id", None)
    if basket_oid is not None:
        q = (
            db.query(Order)
            .options(joinedload(Order.items))
            .filter(Order.id == int(basket_oid))
        )
        if order_ids:
            q = q.filter(Order.id.in_([int(x) for x in order_ids]))
        order = q.first()
        if order is not None:
            oc = getattr(order, "cart_id", None)
            if oc is not None and int(oc) != cid:
                order = None

    if order is None:
        q = (
            db.query(Order)
            .options(joinedload(Order.items))
            .filter(Order.basket_id == bid)
        )
        if order_ids:
            q = q.filter(Order.id.in_([int(x) for x in order_ids]))
        # Prefer order already on this cart; else any in scope with this basket.
        candidates = q.all()
        for cand in candidates:
            oc = getattr(cand, "cart_id", None)
            if oc is not None and int(oc) == cid:
                order = cand
                break
        if order is None and candidates:
            order = candidates[0]

    if order is None:
        return None, "BASKET_PRODUCT_MISMATCH"

    had_sku_line = False
    for oi in sorted(order.items or [], key=lambda x: int(x.id)):
        if int(oi.product_id) != int(product_id):
            continue
        if order_item_is_replaced_line(oi):
            continue
        if order_item_skip_bundle_commercial_header_for_ops(oi):
            continue
        had_sku_line = True
        rem = _line_remaining(db, oi=oi, cart_id=cid)
        st_oi = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()
        if rem <= 1e-9 or st_oi in ("picked", "missing"):
            return None, "BASKET_PRODUCT_ALREADY_COMPLETE"
        label = primary_basket_label(basket)
        return (
            BasketPutAllocation(
                order_id=int(order.id),
                order_item_id=int(oi.id),
                product_id=int(product_id),
                basket_id=bid,
                basket_label=label,
                line_remaining=float(rem),
            ),
            None,
        )

    if had_sku_line:
        return None, "BASKET_PRODUCT_ALREADY_COMPLETE"
    return None, "BASKET_PRODUCT_MISMATCH"


def eligible_baskets_payload(allocations: list[BasketPutAllocation]) -> list[dict]:
    """Compact list for pending metadata + UI (one row per basket/order)."""
    seen: set[int] = set()
    rows: list[dict] = []
    for a in allocations:
        if a.basket_id in seen:
            continue
        seen.add(a.basket_id)
        rows.append(
            {
                "basket_id": int(a.basket_id),
                "basket_label": a.basket_label,
                "order_id": int(a.order_id),
                "order_item_id": int(a.order_item_id),
                "line_remaining": float(a.line_remaining),
            }
        )
    return rows
