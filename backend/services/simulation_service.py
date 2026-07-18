"""
Simulation Service

- assign_orders_to_cart: przypisuje zamówienia NEW do wolnych koszyków wózka.
  Uses: order clustering by main SKU, sort within clusters (items + volume), FFD + best-fit basket assignment.
- simulate: legacy – pobranie infrastruktury i wywołanie silnika symulacji.
"""

import logging
from collections import defaultdict
from sqlalchemy.orm import Session, joinedload

from fastapi import HTTPException

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
        LEGACY PERSIST WYŁĄCZONY.

        Simulation tylko liczy — nie zapisuje order.cart_id / cart.status.
        """
        raise HTTPException(
            status_code=409,
            detail={
                "code": "legacy_sim_assign_forbidden",
                "error": (
                    "Symulacja nie zapisuje lifecycle wózka. "
                    "Przypisanie zamówień tylko przez startPicking po skanie wózka."
                ),
            },
        )

    def reset_fleet(self, tenant_id: int, warehouse_id: int) -> dict:
        """
        Admin reset: wyczyść occupancy zamówień i zwolnij wózki przez CartLifecycleService.release_cart.
        """
        from .cart_picking_lifecycle_service import release_cart
        from .order_fulfillment_state import clear_order_picking_session_context

        orders = (
            self.db.query(Order)
            .filter(
                Order.tenant_id == tenant_id,
                Order.warehouse_id == warehouse_id,
                Order.cart_id.isnot(None),
            )
            .all()
        )
        for o in orders:
            clear_order_picking_session_context(o)
            o.total_volume_dm3 = None
            o.status = "NEW"
            self.db.add(o)
        orders_updated = len(orders)

        carts = (
            self.db.query(Cart)
            .options(joinedload(Cart.baskets))
            .filter(
                Cart.tenant_id == tenant_id,
                Cart.warehouse_id == warehouse_id,
            )
            .all()
        )
        for cart in carts:
            release_cart(self.db, cart=cart, reason="reset_fleet")
        self.db.commit()
        return {
            "status": "OK",
            "orders_reset": orders_updated,
            "carts_reset": len(carts),
            "baskets_reset": sum(len(c.baskets or []) for c in carts),
        }
