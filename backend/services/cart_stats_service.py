"""
SSOT liczników wózka — wyłącznie z orders.cart_id / orders.picking_session_id.

Nie używa tabeli picks ani lokalnego cache jako źródła prawdy dla zajętości.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..models.order import Order
from ..models.order_item import OrderItem


def _norm_cart_type(cart: Cart) -> str:
    raw = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    return str(raw).split(".")[-1].upper()


def _norm_capacity_mode(val: Any) -> str:
    if val is None:
        return "volume"
    if hasattr(val, "value"):
        val = val.value
    s = str(val).strip().lower()
    if s in ("volume", "orders", "mixed"):
        return s
    return "volume"


def query_orders_on_cart(db: Session, cart: Cart):
    """
    Zamówienia na wózku: Order.cart_id == cart.id
    oraz (gdy jest aktywna sesja) Order.picking_session_id == cart.current_session_id.
    """
    cid = int(cart.id)
    clauses = [Order.cart_id == cid]
    sid = getattr(cart, "current_session_id", None)
    if sid is not None and int(sid) > 0:
        clauses.append(Order.picking_session_id == int(sid))
    return (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(or_(*clauses), Order.deleted_at.is_(None))
    )


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
      volume_used, percent_used
    """
    orders = query_orders_on_cart(db, cart).all()
    # Dedup by id (cart_id + session overlap)
    by_id: dict[int, Order] = {}
    for o in orders:
        by_id[int(o.id)] = o
    orders = list(by_id.values())

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

    mode = _norm_capacity_mode(getattr(cart, "capacity_mode", None))
    max_vol = float(getattr(cart, "total_volume", None) or 0)
    max_ord = getattr(cart, "max_orders", None)

    vol_pct = (volume_used / max_vol * 100.0) if max_vol > 0 else 0.0
    ord_pct = (
        (orders_count / float(max_ord) * 100.0)
        if max_ord is not None and int(max_ord) > 0
        else 0.0
    )

    if mode == "orders":
        percent_used = ord_pct
    elif mode == "mixed":
        percent_used = min(vol_pct, ord_pct) if max_ord is not None else vol_pct
    else:
        percent_used = vol_pct

    return {
        "orders_count": int(orders_count),
        "products_count": int(products_count),
        "sections_count": int(sections_count),
        "occupied_sections": int(occupied_sections),
        "volume_used": float(volume_used),
        "percent_used": round(float(percent_used), 2),
    }


def get_cart_stats_or_404(db: Session, cart_id: int) -> dict[str, Any]:
    cart = (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(Cart.id == int(cart_id))
        .first()
    )
    if not cart:
        raise HTTPException(status_code=404, detail="Wózek nie istnieje")
    return compute_cart_stats(db, cart)


def batch_cart_stats(db: Session, carts: list[Cart]) -> dict[int, dict[str, Any]]:
    """Agregaty dla listy wózków (ta sama reguła co GET /wms/carts/{id}/stats)."""
    out: dict[int, dict[str, Any]] = {}
    if not carts:
        return out
    ids = [int(c.id) for c in carts]
    session_ids = [
        int(c.current_session_id)
        for c in carts
        if getattr(c, "current_session_id", None) is not None and int(c.current_session_id) > 0
    ]

    clauses = [Order.cart_id.in_(ids)]
    if session_ids:
        clauses.append(Order.picking_session_id.in_(session_ids))

    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(or_(*clauses), Order.deleted_at.is_(None))
        .all()
    )

    cart_by_id = {int(c.id): c for c in carts}
    session_to_cart: dict[int, int] = {}
    for c in carts:
        sid = getattr(c, "current_session_id", None)
        if sid is not None and int(sid) > 0:
            session_to_cart[int(sid)] = int(c.id)

    orders_by_cart: dict[int, dict[int, Order]] = {cid: {} for cid in ids}
    for o in orders:
        placed = False
        if o.cart_id is not None and int(o.cart_id) in orders_by_cart:
            orders_by_cart[int(o.cart_id)][int(o.id)] = o
            placed = True
        sid = getattr(o, "picking_session_id", None)
        if sid is not None and int(sid) in session_to_cart:
            cid = session_to_cart[int(sid)]
            orders_by_cart[cid][int(o.id)] = o
            placed = True
        if not placed and o.cart_id is not None:
            # ignore foreign carts
            pass

    for cart in carts:
        cid = int(cart.id)
        # Temporarily attach filtered list via compute path using in-memory orders
        # Reuse compute_cart_stats by setting a lightweight path:
        orders_list = list(orders_by_cart.get(cid, {}).values())
        out[cid] = _stats_from_orders(cart, orders_list)

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
    mode = _norm_capacity_mode(getattr(cart, "capacity_mode", None))
    max_vol = float(getattr(cart, "total_volume", None) or 0)
    max_ord = getattr(cart, "max_orders", None)
    vol_pct = (volume_used / max_vol * 100.0) if max_vol > 0 else 0.0
    ord_pct = (
        (orders_count / float(max_ord) * 100.0)
        if max_ord is not None and int(max_ord) > 0
        else 0.0
    )
    if mode == "orders":
        percent_used = ord_pct
    elif mode == "mixed":
        percent_used = min(vol_pct, ord_pct) if max_ord is not None else vol_pct
    else:
        percent_used = vol_pct

    return {
        "orders_count": int(orders_count),
        "products_count": int(products_count),
        "sections_count": int(sections_count),
        "occupied_sections": int(occupied_sections),
        "volume_used": float(volume_used),
        "percent_used": round(float(percent_used), 2),
    }
