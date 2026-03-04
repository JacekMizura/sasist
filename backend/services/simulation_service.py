"""
Simulation Service

- assign_orders_to_cart: przypisuje zamówienia NEW do wolnych koszyków wózka (po objętości i wymiarach).
- simulate: legacy – pobranie infrastruktury i wywołanie silnika symulacji.
"""

import logging
from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..models.cart_basket import CartBasket
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.enums import CartStatus, CartType

logger = logging.getLogger(__name__)


# 1×1×1 cm = 1 cm³ = 0.001 dm³ gdy produkt nie ma wymiarów
FALLBACK_VOLUME_DM3 = 0.001
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
    ) -> dict:
        """
        Przypisuje zamówienia ze statusem NEW do wózka.
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

            # Zamówienia NEW; dla BULK tylko te bez przypisanego wózka
            orders_q = (
                self.db.query(Order)
                .options(joinedload(Order.items).joinedload(OrderItem.product))
                .filter(
                    Order.tenant_id == tenant_id,
                    Order.warehouse_id == warehouse_id,
                    Order.status == "NEW",
                )
            )
            if not is_multi:
                orders_q = orders_q.filter(Order.cart_id == None)
            orders_new = orders_q.order_by(Order.id).all()

            assigned_count = 0
            unassigned_count = 0

            if is_multi:
                baskets = sorted(
                    [b for b in (cart.baskets or []) if b.order_id is None],
                    key=lambda b: (b.row, b.column),
                )
                for order in orders_new:
                    order_volume, max_l, max_w, max_h = _order_total_volume_and_dimensions(order)
                    placed = False
                    for basket in baskets:
                        if basket.order_id is not None:
                            continue
                        basket_dm3 = (basket.usable_volume or 0) / 1000.0
                        if basket_dm3 < order_volume:
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
                cl = float(cart.length or 0)
                cw = float(cart.width or 0)
                ch = float(cart.height or 0)
                assigned_volumes = []
                for order in orders_new:
                    order_volume, max_l, max_w, max_h = _order_total_volume_and_dimensions(order)
                    if used + order_volume > total_vol:
                        unassigned_count += 1
                        continue
                    if cl and cw and ch and not _fits_in_basket(max_l, max_w, max_h, cl, cw, ch):
                        unassigned_count += 1
                        continue
                    order.cart_id = cart.id
                    order.total_volume_dm3 = round(order_volume, 2)
                    order.status = "ASSIGNED"
                    used += order_volume
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
