"""
SSOT liczników wózka — wyłącznie z orders.cart_id / orders.picking_session_id.

Nie używa tabeli picks ani lokalnego cache jako źródła prawdy dla zajętości.
"""

from __future__ import annotations

from typing import Any, Sequence

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..models.order import Order
from ..models.order_item import OrderItem
from .cart_capacity.engine import CartCapacityEngine, order_volume_dm3


def _norm_cart_type(cart: Cart) -> str:
    raw = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    return str(raw).split(".")[-1].upper()


def _capacity_snapshot_for_orders(cart: Cart, orders: list[Order]):
    assigned_orders = len(orders)
    assigned_volume = round(sum(order_volume_dm3(o) for o in orders), 4)
    return CartCapacityEngine.from_cart(
        cart,
        assigned_orders=assigned_orders,
        assigned_volume=assigned_volume,
    ).snapshot()


def query_orders_on_cart(db: Session, cart: Cart, *, with_items: bool = False):
    """
    Zamówienia na wózku (SSOT):
    - Order.cart_id == cart.id
    - Order.picking_session_id == cart.current_session_id (gdy ustawione)
    - Order.picking_session_id == aktywna sesja wózka (gdy current_session_id NULL — heal path)
    """
    from .cart_picking_lifecycle_service import find_open_picking_session

    cid = int(cart.id)
    clauses = [Order.cart_id == cid]
    sid = getattr(cart, "current_session_id", None)
    if sid is not None and int(sid) > 0:
        clauses.append(Order.picking_session_id == int(sid))
    else:
        sess = find_open_picking_session(db, cart=cart)
        if sess is not None:
            clauses.append(Order.picking_session_id == int(sess.id))
    q = db.query(Order).filter(or_(*clauses), Order.deleted_at.is_(None))
    if with_items:
        q = q.options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.customer),
            joinedload(Order.order_ui_status),
        )
    return q


def list_orders_on_cart(
    db: Session, cart: Cart, *, with_items: bool = False
) -> list[Order]:
    """Deduplikowana lista zamówień na wózku — jedyne SSOT dla liczników / list / Capacity."""
    by_id: dict[int, Order] = {}
    for o in query_orders_on_cart(db, cart, with_items=with_items).all():
        by_id[int(o.id)] = o
    return list(by_id.values())


def orders_event_meta(
    orders: list[Order] | Sequence[Order],
    *,
    for_activity_log: bool = False,
    activity_number_cap: int = 50,
) -> dict[str, Any]:
    """Metadata for Activity/Event Log.

    ``for_activity_log=True`` caps stored number lists (full lists → Capacity Analytics).
    """
    order_list = list(orders)
    order_ids: list[int] = []
    order_numbers: list[str] = []
    for o in order_list:
        oid = int(o.id)
        order_ids.append(oid)
        num = getattr(o, "number", None)
        order_numbers.append(str(num).strip() if num not in (None, "") else str(oid))
    truncated = False
    if for_activity_log and len(order_numbers) > int(activity_number_cap):
        truncated = True
        order_ids = order_ids[: int(activity_number_cap)]
        order_numbers = order_numbers[: int(activity_number_cap)]
    meta: dict[str, Any] = {
        "order_ids": order_ids,
        "order_numbers": order_numbers,
        "orders_count": len(order_list),
    }
    if truncated:
        meta["order_numbers_truncated"] = True
    return meta


def format_orders_operation_description(
    verb: str,
    orders: list[Order] | Sequence[Order],
    *,
    for_activity_log: bool = False,
) -> str:
    """
    Activity Log: „Przypisano N zamówień.” (wynik operacji, bez listy tysięcy #).
    Inne konteksty: krótka lista numerów gdy N ≤ 15.
    """
    meta = orders_event_meta(orders, for_activity_log=for_activity_log)
    n = int(meta["orders_count"])
    if for_activity_log or n > 15:
        return f"{verb} {n} zamówień."
    nums = [f"#{x}" for x in meta["order_numbers"]]
    if n <= 0:
        return f"{verb} 0 zamówień."
    return f"{verb} {n} zamówień: {', '.join(nums)}."


def _order_volume_dm3(order: Order) -> float:
    tv = getattr(order, "total_volume_dm3", None)
    if tv is not None and float(tv) > 0:
        return round(float(tv), 4)
    total = 0.0
    for item in getattr(order, "items", None) or []:
        qty = float(getattr(item, "quantity", 0) or 0)
        if qty <= 0:
            continue
        item_vol = getattr(item, "total_volume", None)
        if item_vol is not None and float(item_vol) > 0:
            total += float(item_vol) * qty
            continue
        product = getattr(item, "product", None)
        if product is not None and getattr(product, "volume", None) is not None and float(product.volume or 0) > 0:
            total += float(product.volume) * qty
            continue
        if product is not None:
            l_ = float(getattr(product, "length", None) or 0)
            w_ = float(getattr(product, "width", None) or 0)
            h_ = float(getattr(product, "height", None) or 0)
            if l_ > 0 and w_ > 0 and h_ > 0:
                total += (l_ * w_ * h_) / 1000.0 * qty
    return round(total, 4)


def compute_cart_stats(db: Session, cart: Cart) -> dict[str, Any]:
    """
    Agregat SSOT:
      orders_count, products_count, sections_count, occupied_sections,
      volume_used, percent_used, capacity
    """
    orders = list_orders_on_cart(db, cart)

    stats = _stats_from_orders(cart, orders)
    snap = _capacity_snapshot_for_orders(cart, orders)
    stats["percent_used"] = round(float(snap.capacity_usage_percent), 2)
    stats["capacity"] = snap.to_dict()
    return stats


def get_cart_stats_or_404(db: Session, cart_id: int) -> dict[str, Any]:
    cart = (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(Cart.id == int(cart_id))
        .first()
    )
    if not cart:
        raise HTTPException(status_code=404, detail="Wózek nie istnieje")
    stats = compute_cart_stats(db, cart)
    from .cart_picking_lifecycle_service import get_cart_current_task, get_cart_status

    stats["status"] = get_cart_status(cart).value
    active = get_cart_current_task(db, cart, enrich=True)
    stats["active_picking"] = active
    stats["current_task"] = active
    return stats


def batch_cart_stats(db: Session, carts: list[Cart]) -> dict[int, dict[str, Any]]:
    """Agregaty dla listy wózków (ta sama reguła co GET /wms/carts/{id}/stats)."""
    from .cart_picking_lifecycle_service import (
        SESSION_KIND_PICKING_ACTIVE,
        find_open_picking_session,
    )
    from ..models.wms_operation_session import WmsOperationSession

    out: dict[int, dict[str, Any]] = {}
    if not carts:
        return out
    ids = [int(c.id) for c in carts]
    session_to_cart: dict[int, int] = {}
    for c in carts:
        sid = getattr(c, "current_session_id", None)
        if sid is not None and int(sid) > 0:
            session_to_cart[int(sid)] = int(c.id)
        else:
            sess = find_open_picking_session(db, cart=c)
            if sess is not None:
                session_to_cart[int(sess.id)] = int(c.id)

    # Fallback: any open picking session for these carts
    if ids:
        for sess in (
            db.query(WmsOperationSession)
            .filter(
                WmsOperationSession.cart_id.in_(ids),
                WmsOperationSession.completed_at.is_(None),
                WmsOperationSession.session_kind.in_(
                    (SESSION_KIND_PICKING_ACTIVE, "picking_recovery_active")
                ),
            )
            .all()
        ):
            cid = int(sess.cart_id)
            if int(sess.id) not in session_to_cart:
                session_to_cart[int(sess.id)] = cid

    session_ids = list(session_to_cart.keys())
    clauses = [Order.cart_id.in_(ids)]
    if session_ids:
        clauses.append(Order.picking_session_id.in_(session_ids))

    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(or_(*clauses), Order.deleted_at.is_(None))
        .all()
    )

    orders_by_cart: dict[int, dict[int, Order]] = {cid: {} for cid in ids}
    for o in orders:
        if o.cart_id is not None and int(o.cart_id) in orders_by_cart:
            orders_by_cart[int(o.cart_id)][int(o.id)] = o
        sid = getattr(o, "picking_session_id", None)
        if sid is not None and int(sid) in session_to_cart:
            cid = session_to_cart[int(sid)]
            if cid in orders_by_cart:
                orders_by_cart[cid][int(o.id)] = o

    for cart in carts:
        cid = int(cart.id)
        orders_list = list(orders_by_cart.get(cid, {}).values())
        stats = _stats_from_orders(cart, orders_list)
        snap = _capacity_snapshot_for_orders(cart, orders_list)
        stats["percent_used"] = round(float(snap.capacity_usage_percent), 2)
        stats["capacity"] = snap.to_dict()
        from .cart_picking_lifecycle_service import get_cart_current_task, get_cart_status

        stats["status"] = get_cart_status(cart).value
        active = get_cart_current_task(db, cart, enrich=False)
        stats["active_picking"] = active
        stats["current_task"] = active
        out[cid] = stats

    return out


def _stats_from_orders(cart: Cart, orders: list[Order]) -> dict[str, Any]:
    orders_count = len(orders)
    product_ids: set[int] = set()
    for o in orders:
        for item in getattr(o, "items", None) or []:
            pid = getattr(item, "product_id", None)
            if pid is not None:
                product_ids.add(int(pid))
    products_count = len(product_ids)

    ctype = _norm_cart_type(cart)
    baskets = list(getattr(cart, "baskets", None) or [])
    if ctype == "MULTI":
        sections_count = len(baskets)
        occupied_ids: set[int] = set()
        for b in baskets:
            if getattr(b, "order_id", None) is not None:
                occupied_ids.add(int(b.id))
        for o in orders:
            bid = getattr(o, "basket_id", None)
            if bid is not None:
                occupied_ids.add(int(bid))
        occupied_sections = len(occupied_ids)
    else:
        sections_count = 1
        occupied_sections = orders_count

    volume_used = round(sum(_order_volume_dm3(o) for o in orders), 2)

    return {
        "orders_count": int(orders_count),
        "products_count": int(products_count),
        "sections_count": int(sections_count),
        "occupied_sections": int(occupied_sections),
        "volume_used": float(volume_used),
        "percent_used": 0.0,
    }
