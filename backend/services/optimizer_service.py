"""
Fleet Optimizer Service

Analiza zapotrzebowania na wózki (best-fit bez zapisu do bazy).
"""

import logging
from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..models.cart_basket import CartBasket
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.enums import CartType, CartStatus
from .simulation_service import (
    _order_total_volume_and_dimensions,
    _fits_in_basket,
    _can_assign_order,
    _sort_orders_for_assignment,
    FALLBACK_VOLUME_DM3,
)
from .cart_capacity_service import enforce_cart_orders_capacity

logger = logging.getLogger(__name__)


def _analyze_fleet(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
) -> dict:
    """
    Best-fit: oblicza minimalną liczbę wózków potrzebnych do obsłużenia zamówień NEW.
    Nie zapisuje nic do bazy.
    """
    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
            Order.status == "NEW",
            Order.cart_id == None,
        )
        .all()
    )

    # Order clustering + sort (main SKU clusters, then items_count DESC, volume DESC within cluster)
    orders_sorted = _sort_orders_for_assignment(orders)
    order_specs = []
    for o in orders_sorted:
        vol, max_l, max_w, max_h = _order_total_volume_and_dimensions(o)
        items_count = len(getattr(o, "items", []) or [])
        order_specs.append({
            "order_id": o.id, "volume": vol, "max_l": max_l, "max_w": max_w, "max_h": max_h,
            "items_count": items_count,
        })

    # Wózki MULTI: lista wolnych pojemności koszyków (dm³) + wymiary
    multi_carts = (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(
            Cart.tenant_id == tenant_id,
            Cart.warehouse_id == warehouse_id,
            Cart.type == CartType.MULTI,
        )
        .all()
    )
    multi_cart_by_id = {c.id: c for c in multi_carts}
    multi_slots = []
    for c in multi_carts:
        for b in c.baskets or []:
            if b.order_id is not None:
                continue
            vol_dm3 = (b.usable_volume or 0) / 1000.0
            multi_slots.append({
                "cart_id": c.id,
                "basket_id": b.id,
                "basket": b,
                "vol": vol_dm3,
                "l": b.inner_length or 0, "w": b.inner_width or 0, "h": b.inner_height or 0,
            })
    # Best-fit: sort slots by capacity ASC (smallest first)
    multi_slots.sort(key=lambda x: x["vol"])
    cart_orders = {c.id: len(getattr(c, "assigned_orders", None) or []) for c in multi_carts}
    cart_used = {c.id: float(c.used_volume or 0) for c in multi_carts}

    bulk_carts = (
        db.query(Cart)
        .filter(
            Cart.tenant_id == tenant_id,
            Cart.warehouse_id == warehouse_id,
            Cart.type == CartType.BULK,
        )
        .all()
    )
    bulk_capacity = []
    for c in bulk_carts:
        total = c.total_volume or 0
        if total <= 0 and c.length and c.width and c.height:
            total = (float(c.length) * float(c.width) * float(c.height)) / 1000.0
        used = c.used_volume or 0
        bulk_capacity.append({
            "cart_id": c.id,
            "cart": c,
            "total": total,
            "used": used,
            "initial_used": used,
            "free": max(0, total - used),
            "l": float(c.length or 0), "w": float(c.width or 0), "h": float(c.height or 0),
            "orders_count": len(getattr(c, "assigned_orders", None) or []),
        })

    multi_used = [False] * len(multi_slots)
    unassigned = 0
    slot_indices_by_vol = sorted(range(len(multi_slots)), key=lambda i: multi_slots[i]["vol"])
    for spec in order_specs:
        placed = False
        for i in slot_indices_by_vol:
            if multi_used[i]:
                continue
            slot = multi_slots[i]
            cid = slot["cart_id"]
            cart = multi_cart_by_id.get(cid)
            if cart and not _can_assign_order(cart, cart_orders.get(cid, 0), cart_used.get(cid, 0), spec["volume"]):
                continue
            if slot["vol"] < spec["volume"]:
                continue
            if not _fits_in_basket(spec["max_l"], spec["max_w"], spec["max_h"], slot["l"], slot["w"], slot["h"]):
                continue
            multi_used[i] = True
            cart_orders[cid] = cart_orders.get(cid, 0) + 1
            cart_used[cid] = cart_used.get(cid, 0) + spec["volume"]
            placed = True
            break
        if not placed:
            for bc in bulk_capacity:
                if bc["free"] >= spec["volume"]:
                    if (bc["l"] and bc["w"] and bc["h"] and
                            not _fits_in_basket(spec["max_l"], spec["max_w"], spec["max_h"], bc["l"], bc["w"], bc["h"])):
                        continue
                    cc = bc["cart"]
                    if not _can_assign_order(cc, bc.get("orders_count", 0), bc["used"], spec["volume"]):
                        continue
                    bc["free"] -= spec["volume"]
                    bc["used"] += spec["volume"]
                    bc["orders_count"] = bc.get("orders_count", 0) + 1
                    placed = True
                    break
        if not placed:
            unassigned += 1

    total_orders = len(orders)
    assigned_in_sim = total_orders - unassigned
    remaining_orders = unassigned
    used_vol = sum(spec["volume"] for spec in order_specs[:assigned_in_sim])

    # Sugerowana mieszanka = liczba wózków faktycznie użytych w symulacji
    sectional_cart_ids_used = set()
    for i, slot in enumerate(multi_slots):
        if multi_used[i]:
            sectional_cart_ids_used.add(slot["cart_id"])
    suggested_sectional_carts = len(sectional_cart_ids_used)
    suggested_bulk_carts = sum(1 for bc in bulk_capacity if bc["used"] > bc["initial_used"])

    # Pojemność tylko sugerowanych wózków (użytych w symulacji) – "Pozostałe miejsce"
    suggested_multi_capacity = sum(s["vol"] for s, u in zip(multi_slots, multi_used) if u)
    suggested_bulk_total = sum(bc["total"] for bc in bulk_capacity if bc["used"] > bc["initial_used"])
    total_suggested_capacity = suggested_multi_capacity + suggested_bulk_total
    if total_suggested_capacity > 0:
        remaining_capacity_pct = round(((total_suggested_capacity - used_vol) / total_suggested_capacity) * 100.0, 2)
    else:
        total_fleet_capacity = sum(s["vol"] for s in multi_slots) + sum(b["total"] for b in bulk_capacity)
        remaining_capacity_pct = round(((total_fleet_capacity - used_vol) / total_fleet_capacity) * 100.0, 2) if total_fleet_capacity > 0 else 0.0
    remaining_capacity_pct = max(0.0, min(100.0, remaining_capacity_pct))

    total_capacity = sum(s["vol"] for s in multi_slots) + sum(b["total"] for b in bulk_capacity)

    return {
        "orders_to_serve": total_orders,
        "assigned_in_simulation": assigned_in_sim,
        "remaining_orders": remaining_orders,
        "suggested_sectional_carts": suggested_sectional_carts,
        "suggested_bulk_carts": suggested_bulk_carts,
        "total_capacity_dm3": round(total_capacity, 2),
        "used_capacity_dm3": round(used_vol, 2),
        "remaining_capacity_percent": remaining_capacity_pct,
        "status": "SUCCESS",
    }


def _apply_fleet(db: Session, tenant_id: int, warehouse_id: int) -> dict:
    """
    Runs the same best-fit assignment as _analyze_fleet but persists to DB:
    sets order.cart_id, order.basket_id, order.total_volume_dm3, order.status = ASSIGNED;
    basket.order_id, basket.used_volume; recalculates cart.used_volume; then db.commit().
    """
    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
            Order.status == "NEW",
            Order.cart_id == None,
        )
        .all()
    )
    order_by_id = {o.id: o for o in orders}

    # Order clustering + sort (main SKU clusters, then items_count DESC, volume DESC within cluster)
    orders_sorted = _sort_orders_for_assignment(orders)
    order_specs = []
    for o in orders_sorted:
        vol, max_l, max_w, max_h = _order_total_volume_and_dimensions(o)
        items_count = len(getattr(o, "items", []) or [])
        order_specs.append({
            "order_id": o.id, "volume": vol, "max_l": max_l, "max_w": max_w, "max_h": max_h,
            "items_count": items_count,
        })

    multi_carts = (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(
            Cart.tenant_id == tenant_id,
            Cart.warehouse_id == warehouse_id,
            Cart.type == CartType.MULTI,
        )
        .all()
    )
    multi_cart_by_id = {c.id: c for c in multi_carts}
    multi_slots = []
    for c in multi_carts:
        for b in c.baskets or []:
            if b.order_id is not None:
                continue
            vol_dm3 = (b.usable_volume or 0) / 1000.0
            multi_slots.append({
                "cart_id": c.id,
                "basket_id": b.id,
                "basket": b,
                "vol": vol_dm3,
                "l": b.inner_length or 0, "w": b.inner_width or 0, "h": b.inner_height or 0,
            })
    multi_slots.sort(key=lambda x: x["vol"])
    cart_orders = {c.id: len(getattr(c, "assigned_orders", None) or []) for c in multi_carts}
    cart_used = {c.id: float(c.used_volume or 0) for c in multi_carts}

    bulk_carts = (
        db.query(Cart)
        .filter(
            Cart.tenant_id == tenant_id,
            Cart.warehouse_id == warehouse_id,
            Cart.type == CartType.BULK,
        )
        .all()
    )
    bulk_capacity = []
    for c in bulk_carts:
        total = c.total_volume or 0
        if total <= 0 and c.length and c.width and c.height:
            total = (float(c.length) * float(c.width) * float(c.height)) / 1000.0
        used = c.used_volume or 0
        bulk_capacity.append({
            "cart_id": c.id,
            "cart": c,
            "total": total,
            "used": used,
            "initial_used": used,
            "free": max(0, total - used),
            "l": float(c.length or 0), "w": float(c.width or 0), "h": float(c.height or 0),
            "orders_count": len(getattr(c, "assigned_orders", None) or []),
        })

    multi_used = [False] * len(multi_slots)
    affected_cart_ids = set()
    unassigned = 0
    slot_indices_by_vol = sorted(range(len(multi_slots)), key=lambda i: multi_slots[i]["vol"])

    for spec in order_specs:
        placed = False
        for i in slot_indices_by_vol:
            if multi_used[i]:
                continue
            slot = multi_slots[i]
            cid = slot["cart_id"]
            cart = multi_cart_by_id.get(cid)
            if cart and not _can_assign_order(cart, cart_orders.get(cid, 0), cart_used.get(cid, 0), spec["volume"]):
                continue
            if slot["vol"] < spec["volume"]:
                continue
            if not _fits_in_basket(spec["max_l"], spec["max_w"], spec["max_h"], slot["l"], slot["w"], slot["h"]):
                continue
            multi_used[i] = True
            cart_orders[cid] = cart_orders.get(cid, 0) + 1
            cart_used[cid] = cart_used.get(cid, 0) + spec["volume"]
            order = order_by_id.get(spec["order_id"])
            if order:
                if cart is not None:
                    enforce_cart_orders_capacity(db, cart, new_orders=1)
                order.cart_id = slot["cart_id"]
                order.basket_id = slot["basket_id"]
                order.total_volume_dm3 = round(spec["volume"], 2)
                order.status = "ASSIGNED"
                slot["basket"].order_id = order.id
                slot["basket"].used_volume = round(spec["volume"], 2)
                affected_cart_ids.add(slot["cart_id"])
            placed = True
            break
        if not placed:
            for bc in bulk_capacity:
                if bc["free"] >= spec["volume"]:
                    if (bc["l"] and bc["w"] and bc["h"] and
                            not _fits_in_basket(spec["max_l"], spec["max_w"], spec["max_h"], bc["l"], bc["w"], bc["h"])):
                        continue
                    if not _can_assign_order(bc["cart"], bc.get("orders_count", 0), bc["used"], spec["volume"]):
                        continue
                    bc["free"] -= spec["volume"]
                    bc["used"] += spec["volume"]
                    bc["orders_count"] = bc.get("orders_count", 0) + 1
                    order = order_by_id.get(spec["order_id"])
                    if order:
                        enforce_cart_orders_capacity(db, bc["cart"], new_orders=1)
                        order.cart_id = bc["cart_id"]
                        order.basket_id = None
                        order.total_volume_dm3 = round(spec["volume"], 2)
                        order.status = "ASSIGNED"
                        affected_cart_ids.add(bc["cart_id"])
                    placed = True
                    break
        if not placed:
            unassigned += 1

    # Recalculate cart.used_volume from assigned orders
    for cid in affected_cart_ids:
        cart = db.query(Cart).filter(Cart.id == cid).first()
        if not cart:
            continue
        orders_on_cart = db.query(Order).filter(Order.cart_id == cid).all()
        cart.used_volume = round(sum(getattr(o, "total_volume_dm3", None) or 0 for o in orders_on_cart), 2)
        if cart.total_volume and cart.total_volume > 0:
            util = (cart.used_volume or 0) / cart.total_volume * 100
            if util > 90:
                cart.status = CartStatus.FULL
            else:
                cart.status = CartStatus.IN_PROGRESS
        else:
            cart.status = CartStatus.IN_PROGRESS if (cart.used_volume or 0) > 0 else CartStatus.AVAILABLE
        db.add(cart)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("apply_fleet commit failed: %s", e)
        raise

    total_orders = len(orders)
    assigned_in_sim = total_orders - unassigned
    used_vol = sum(spec["volume"] for spec in order_specs[:assigned_in_sim])
    sectional_cart_ids_used = set(slot["cart_id"] for i, slot in enumerate(multi_slots) if multi_used[i])
    suggested_sectional_carts = len(sectional_cart_ids_used)
    suggested_bulk_carts = sum(1 for bc in bulk_capacity if bc["used"] > bc["initial_used"])
    total_capacity = sum(s["vol"] for s in multi_slots) + sum(b["total"] for b in bulk_capacity)
    total_suggested_capacity = sum(s["vol"] for s, u in zip(multi_slots, multi_used) if u) + sum(bc["total"] for bc in bulk_capacity if bc["used"] > bc["initial_used"])
    if total_suggested_capacity > 0:
        remaining_capacity_pct = round(((total_suggested_capacity - used_vol) / total_suggested_capacity) * 100.0, 2)
    else:
        remaining_capacity_pct = round(((total_capacity - used_vol) / total_capacity) * 100.0, 2) if total_capacity > 0 else 0.0
    remaining_capacity_pct = max(0.0, min(100.0, remaining_capacity_pct))

    return {
        "orders_to_serve": total_orders,
        "assigned_in_simulation": assigned_in_sim,
        "remaining_orders": unassigned,
        "suggested_sectional_carts": suggested_sectional_carts,
        "suggested_bulk_carts": suggested_bulk_carts,
        "total_capacity_dm3": round(total_capacity, 2),
        "used_capacity_dm3": round(used_vol, 2),
        "remaining_capacity_percent": remaining_capacity_pct,
        "status": "SUCCESS",
    }


class OptimizerService:
    def __init__(self, db: Session):
        self.db = db

    def analyze_fleet(self, tenant_id: int, warehouse_id: int) -> dict:
        return _analyze_fleet(self.db, tenant_id, warehouse_id)

    def apply_fleet(self, tenant_id: int, warehouse_id: int) -> dict:
        """Run best-fit assignment and persist to DB (order.cart_id, basket, cart.used_volume)."""
        return _apply_fleet(self.db, tenant_id, warehouse_id)
