"""
Simulation Service

- assign_orders_to_cart: przypisuje zamówienia NEW do wolnych koszyków wózka.
  Uses: order clustering by main SKU, sort within clusters (items + volume), FFD + best-fit basket assignment.
- simulate: legacy – pobranie infrastruktury i wywołanie silnika symulacji.
"""

import logging
from collections import defaultdict
from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..models.cart_basket import CartBasket
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.enums import CartStatus, CartType

logger = logging.getLogger(__name__)


# Fallback when product volume is missing or zero (avoid 0% fill for assigned orders)
FALLBACK_VOLUME_DM3 = 0.05
DEFAULT_DIM_CM = 1.0


def _order_total_volume_and_dimensions(order: Order) -> tuple[float, float, float, float]:
    """
    Oblicza łączną objętość zamówienia (dm³) oraz maksymalne wymiary L, W, H (cm) z pozycji.
    Gdy produkt nie ma wymiarów: objętość 0.001 dm³ (1×1×1 cm), wymiary 1×1×1 cm.
    """
    total_volume = 0.0
    max_l, max_w, max_h = 0.0, 0.0, 0.0

    for item in order.items:
        product = item.product
        qty = item.quantity or 0
        if qty <= 0:
            continue

        vol_per_unit = None
        if item.total_volume is not None and item.total_volume > 0:
            vol_per_unit = float(item.total_volume)
        if vol_per_unit is None and product and product.volume is not None and product.volume > 0:
            vol_per_unit = float(product.volume)
        if vol_per_unit is None and product:
            l_ = float(product.length or 0)
            w_ = float(product.width or 0)
            h_ = float(product.height or 0)
            if l_ and w_ and h_:
                vol_per_unit = (l_ * w_ * h_) / 1000.0
        if vol_per_unit is None or vol_per_unit <= 0:
            vol_per_unit = FALLBACK_VOLUME_DM3

        total_volume += vol_per_unit * qty

        if product:
            l_ = float(product.length or 0)
            w_ = float(product.width or 0)
            h_ = float(product.height or 0)
            if not (l_ and w_ and h_):
                l_, w_, h_ = DEFAULT_DIM_CM, DEFAULT_DIM_CM, DEFAULT_DIM_CM
            if l_ > max_l:
                max_l = l_
            if w_ > max_w:
                max_w = w_
            if h_ > max_h:
                max_h = h_
        else:
            max_l = max(max_l, DEFAULT_DIM_CM)
            max_w = max(max_w, DEFAULT_DIM_CM)
            max_h = max(max_h, DEFAULT_DIM_CM)

    if total_volume <= 0:
        total_volume = FALLBACK_VOLUME_DM3
    if max_l <= 0 and max_w <= 0 and max_h <= 0:
        max_l = max_w = max_h = DEFAULT_DIM_CM
    return round(total_volume, 2), max_l, max_w, max_h


def _fits_in_basket(
    order_max_l: float, order_max_w: float, order_max_h: float,
    basket_length: float, basket_width: float, basket_height: float,
) -> bool:
    """Czy wymiary zamówienia mieszczą się w koszyku (bez obrotu)."""
    if not (basket_length and basket_width and basket_height):
        return True
    return (
        order_max_l <= basket_length
        and order_max_w <= basket_width
        and order_max_h <= basket_height
    )


def _can_assign_order(
    cart: Cart,
    orders_count: int,
    used_volume_dm3: float,
    order_volume_dm3: float,
) -> bool:
    """
    Returns True if assigning one more order (with order_volume_dm3) is allowed
    given current orders_count and used_volume_dm3, according to cart.capacity_mode.
    """
    mode = (getattr(cart, "capacity_mode", None) or "volume").lower()
    max_vol = cart.total_volume or 0
    max_ord = getattr(cart, "max_orders", None)

    if mode == "volume":
        return (used_volume_dm3 + order_volume_dm3) <= max_vol
    if mode == "orders":
        if max_ord is None:
            return True
        return (orders_count + 1) <= max_ord
    if mode == "mixed":
        vol_ok = (used_volume_dm3 + order_volume_dm3) <= max_vol
        ord_ok = (max_ord is None) or ((orders_count + 1) <= max_ord)
        return vol_ok and ord_ok
    return (used_volume_dm3 + order_volume_dm3) <= max_vol


def _sku_frequency(orders: list) -> dict:
    """SKU frequency across all orders: product_id -> sum of quantities."""
    freq = defaultdict(int)
    for order in orders:
        for item in getattr(order, "items", []) or []:
            pid = getattr(item, "product_id", None)
            if pid is not None:
                freq[pid] += int(getattr(item, "quantity", 0) or 0)
    return freq


def _order_main_sku(order, sku_frequency: dict):
    """Main SKU = product_id in this order with highest global frequency. Returns product_id or None."""
    items = getattr(order, "items", []) or []
    if not items:
        return None
    return max(items, key=lambda item: sku_frequency.get(getattr(item, "product_id", None), 0)).product_id


def _cluster_orders_by_main_sku(orders: list, sku_frequency: dict) -> list:
    """Group orders by main_sku; return list of clusters sorted by size (largest first)."""
    clusters_map = defaultdict(list)
    for order in orders:
        main_sku = _order_main_sku(order, sku_frequency)
        clusters_map[main_sku].append(order)
    # Sort clusters by number of orders descending
    clusters_sorted = sorted(clusters_map.values(), key=lambda c: -len(c))
    return clusters_sorted


def _sort_orders_for_assignment(orders: list) -> list:
    """
    Cluster orders by main SKU, then within each cluster sort by (items_count DESC, volume_dm3 DESC).
    Returns a single flat list of orders in assignment order.
    """
    if not orders:
        return []
    sku_freq = _sku_frequency(orders)
    clusters = _cluster_orders_by_main_sku(orders, sku_freq)
    result = []
    for cluster in clusters:
        # Within cluster: sort by items_count DESC, then volume DESC
        with_vol_items = []
        for o in cluster:
            vol, _, _, _ = _order_total_volume_and_dimensions(o)
            items_count = len(getattr(o, "items", []) or [])
            with_vol_items.append((o, vol, items_count))
        with_vol_items.sort(key=lambda x: (-x[2], -x[1]))  # items_count DESC, volume DESC
        result.extend([x[0] for x in with_vol_items])
    return result


class SimulationService:
    def __init__(self, db: Session):
        self.db = db

    def simulate(self, order_volumes: dict):
        """Legacy: placeholder dla /analysis/simulate (bez zewnętrznego silnika)."""
        return {
            "single_strategy": {"message": "Not implemented"},
            "multi_strategy": {"message": "Not implemented"},
        }

    def assign_orders_to_cart(
        self,
        tenant_id: int,
        warehouse_id: int,
        cart_id: int,
        wave_id: int | None = None,
    ) -> dict:
        """
        Przypisuje zamówienia ze statusem NEW do wózka.
        Gdy wave_id podane: tylko zamówienia z tej fali (Order.wave_id == wave_id).
        - MULTI: do wolnych koszyków (basket.order_id IS NULL).
        - BULK: cały wózek jako jeden pojemnik; sum(order_volumes) <= total_volume.
        Zwraca: assigned_orders_count, unassigned_orders_count, cart_utilization_percent, status.
        """
        try:
            cart = (
                self.db.query(Cart)
                .options(joinedload(Cart.baskets))
                .filter(
                    Cart.id == cart_id,
                    Cart.tenant_id == tenant_id,
                    Cart.warehouse_id == warehouse_id,
                )
                .first()
            )
            if not cart:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Wózek nie znaleziony")

            is_multi = (cart.type == CartType.MULTI or
                        str(getattr(cart.type, "value", cart.type) or "").upper() == "MULTI")

            # Zamówienia NEW; opcjonalnie tylko z fali (wave_id)
            orders_q = (
                self.db.query(Order)
                .options(joinedload(Order.items).joinedload(OrderItem.product))
                .filter(
                    Order.tenant_id == tenant_id,
                    Order.warehouse_id == warehouse_id,
                    Order.status == "NEW",
                )
            )
            if wave_id is not None:
                orders_q = orders_q.filter(Order.wave_id == wave_id)
            if not is_multi:
                orders_q = orders_q.filter(Order.cart_id == None)
            orders_all = orders_q.all()

            # Order clustering + sort: cluster by main SKU, then within cluster by (items_count DESC, volume DESC)
            orders_new = _sort_orders_for_assignment(orders_all)

            assigned_count = 0
            unassigned_count = 0

            if is_multi:
                # Best-fit: track remaining capacity per basket; sort by remaining ASC before each assignment
                empty_baskets = [b for b in (cart.baskets or []) if b.order_id is None]
                basket_remaining = {b.id: (b.usable_volume or 0) / 1000.0 for b in empty_baskets}
                running_orders = 0
                running_used_vol = float(cart.used_volume or 0)

                for order in orders_new:
                    order_volume, max_l, max_w, max_h = _order_total_volume_and_dimensions(order)
                    if not _can_assign_order(cart, running_orders, running_used_vol, order_volume):
                        unassigned_count += 1
                        continue
                    # Sort baskets by remaining capacity ASC (best fit: try smallest that fits first)
                    basket_ids_sorted = sorted(
                        (bid for bid, rem in basket_remaining.items() if rem >= order_volume),
                        key=lambda bid: basket_remaining[bid],
                    )
                    placed = False
                    for basket_id in basket_ids_sorted:
                        basket = next((b for b in (cart.baskets or []) if b.id == basket_id), None)
                        if not basket or basket.order_id is not None:
                            continue
                        bl = basket.inner_length or 0
                        bw = basket.inner_width or 0
                        bh = basket.inner_height or 0
                        if not _fits_in_basket(max_l, max_w, max_h, bl, bw, bh):
                            continue
                        basket.order_id = order.id
                        basket.used_volume = round(order_volume, 2)
                        order.cart_id = cart.id
                        order.basket_id = basket.id
                        order.total_volume_dm3 = round(order_volume, 2)
                        order.status = "ASSIGNED"
                        assigned_count += 1
                        running_orders += 1
                        running_used_vol += order_volume
                        basket_remaining[basket_id] = basket_remaining.get(basket_id, 0) - order_volume
                        if basket_remaining[basket_id] <= 0:
                            del basket_remaining[basket_id]
                        placed = True
                        break
                    if not placed:
                        unassigned_count += 1
                # used_volume set below from assigned orders
            else:
                # BULK: cały wózek jako jeden pojemnik
                total_vol = cart.total_volume or 0
                if total_vol <= 0 and cart.length and cart.width and cart.height:
                    total_vol = (float(cart.length) * float(cart.width) * float(cart.height)) / 1000.0
                    cart.total_volume = round(total_vol, 2)
                used = cart.used_volume or 0
                running_orders = len(getattr(cart, "assigned_orders", None) or [])
                cl = float(cart.length or 0)
                cw = float(cart.width or 0)
                ch = float(cart.height or 0)
                assigned_volumes = []
                for order in orders_new:
                    order_volume, max_l, max_w, max_h = _order_total_volume_and_dimensions(order)
                    if not _can_assign_order(cart, running_orders, used, order_volume):
                        unassigned_count += 1
                        continue
                    if cl and cw and ch and not _fits_in_basket(max_l, max_w, max_h, cl, cw, ch):
                        unassigned_count += 1
                        continue
                    order.cart_id = cart.id
                    order.total_volume_dm3 = round(order_volume, 2)
                    order.status = "ASSIGNED"
                    used += order_volume
                    running_orders += 1
                    assigned_volumes.append(order_volume)
                    assigned_count += 1
                # used_volume set below from assigned orders

            # Recompute used_volume from assigned orders (single source of truth)
            self.db.flush()
            orders_on_cart = self.db.query(Order).filter(Order.cart_id == cart.id).all()
            cart.used_volume = round(sum(getattr(o, "total_volume_dm3", None) or 0 for o in orders_on_cart), 2)

            total_vol = cart.total_volume or 0
            used_vol = cart.used_volume or 0
            if total_vol > 0:
                utilization_percent = round((used_vol / total_vol) * 100.0, 2)
            else:
                utilization_percent = 0.0

            if utilization_percent > 90:
                cart.status = CartStatus.FULL
            elif used_vol > 0:
                cart.status = CartStatus.IN_PROGRESS
            else:
                cart.status = CartStatus.AVAILABLE

            self.db.add(cart)
            for b in cart.baskets or []:
                self.db.add(b)
            self.db.commit()
            self.db.refresh(cart)
            print(f"DEBUG: Cart {cart.id} new used_volume: {cart.used_volume}")  # noqa: T201

            return {
                "assigned_orders_count": assigned_count,
                "unassigned_orders_count": unassigned_count,
                "cart_utilization_percent": utilization_percent,
                "status": "SUCCESS",
            }
        except Exception as e:
            self.db.rollback()
            logger.exception("assign_orders_to_cart failed: %s", e)
            raise

    def reset_fleet(self, tenant_id: int, warehouse_id: int) -> dict:
        """
        Resetuj Flotę: ustaw order.cart_id = None, order.basket_id = None, order.total_volume_dm3 = None,
        order.status = 'NEW' dla przypisanych zamówień; cart.used_volume = 0; basket.used_volume = 0, basket.order_id = None.
        """
        # Orders assigned to carts in this warehouse
        orders_updated = (
            self.db.query(Order)
            .filter(
                Order.tenant_id == tenant_id,
                Order.warehouse_id == warehouse_id,
                Order.cart_id != None,
            )
            .update(
                {
                    Order.cart_id: None,
                    Order.basket_id: None,
                    Order.total_volume_dm3: None,
                    Order.status: "NEW",
                },
                synchronize_session="fetch",
            )
        )
        # Carts in this warehouse: used_volume = 0
        carts_updated = (
            self.db.query(Cart)
            .filter(
                Cart.tenant_id == tenant_id,
                Cart.warehouse_id == warehouse_id,
            )
            .update({Cart.used_volume: 0}, synchronize_session="fetch")
        )
        # Baskets of those carts: used_volume = 0, order_id = None
        cart_ids = [
            r[0]
            for r in self.db.query(Cart.id).filter(
                Cart.tenant_id == tenant_id,
                Cart.warehouse_id == warehouse_id,
            ).all()
        ]
        if cart_ids:
            baskets_updated = (
                self.db.query(CartBasket)
                .filter(CartBasket.cart_id.in_(cart_ids))
                .update(
                    {CartBasket.used_volume: 0, CartBasket.order_id: None},
                    synchronize_session="fetch",
                )
            )
        else:
            baskets_updated = 0
        self.db.commit()
        return {
            "status": "OK",
            "orders_reset": orders_updated,
            "carts_reset": carts_updated,
            "baskets_reset": baskets_updated,
        }
