"""
Picking Assignment Service — przypisanie zamówień do wózka / koszyków przed kompletacją.

- Nie modyfikuje PickTask, zakończenia picków ani logiki MM.
- Nie zmienia stanów magazynowych.
- Zapis: Order.cart_id, Order.basket_id, Order.total_volume_dm3, CartBasket.order_id, CartBasket.used_volume, Cart.used_volume.

BULK / MULTI: zachowanie wynika z ``PickingAssignmentConfig`` (allow_bulk / allow_basket per typ zamówienia,
``max_orders_in_bulk``). Domyślnie na MULTI: wiele jednopozycyjnych w koszyku (objętość); wielopozycyjne:
jedno zamówienie na koszyk (wyłączność).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Sequence

from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..models.cart_basket import CartBasket
from ..models.enums import CartStatus
from ..models.order import Order
from ..models.order_item import OrderItem
from ..schemas.picking_assignment import (
    PickingAssignmentBasketSummary,
    PickingAssignmentConfig,
    PickingAssignmentModeRules,
    PickingAssignmentOrderResult,
    PickingAssignmentRejected,
    PickingAssignmentServiceResult,
    PickingAssignmentSummary,
)
from fastapi import HTTPException

from .cart_service import _order_used_volume_dm3_from_items

logger = logging.getLogger(__name__)


def _normalize_cart_type(cart: Cart) -> str:
    raw = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    return str(raw).split(".")[-1].upper()


def _basket_capacity_dm3(b: CartBasket) -> float:
    cm3 = float(getattr(b, "usable_volume", None) or 0)
    if cm3 > 0:
        return round(cm3 / 1000.0, 6)
    l_ = float(getattr(b, "inner_length", None) or 0)
    w_ = float(getattr(b, "inner_width", None) or 0)
    h_ = float(getattr(b, "inner_height", None) or 0)
    if l_ > 0 and w_ > 0 and h_ > 0:
        return round((l_ * w_ * h_) / 1000.0, 6)
    return 0.0


def _order_volume_dm3(order: Order) -> float:
    tv = getattr(order, "total_volume_dm3", None)
    if tv is not None and float(tv) > 0:
        return round(float(tv), 4)
    return float(_order_used_volume_dm3_from_items(order))


def _is_single_item_order(order: Order) -> bool:
    return len(getattr(order, "items", None) or []) == 1


def _is_multi_item_order(order: Order) -> bool:
    return len(getattr(order, "items", None) or []) > 1


def _mode_rules_for_order(order: Order, config: PickingAssignmentConfig) -> PickingAssignmentModeRules:
    if _is_multi_item_order(order):
        return config.multi_item
    return config.single_item


@dataclass
class _BasketRuntime:
    basket_id: int
    capacity_dm3: float
    used_dm3: float = 0.0
    order_ids: list[int] = field(default_factory=list)
    holds_multi_order: bool = False

    @property
    def remaining_dm3(self) -> float:
        return max(0.0, round(self.capacity_dm3 - self.used_dm3, 4))


def format_cart_basket_label(b: CartBasket) -> str:
    """Etykieta koszyka na UI (WMS)."""
    name = (getattr(b, "name", None) or "").strip()
    if name:
        return name
    row = int(getattr(b, "row", 0) or 0)
    col = int(getattr(b, "column", 0) or 0)
    if row or col:
        return f"Koszyk {row}/{col}"
    return f"B{int(b.id)}"


def refresh_cart_used_volume_wms(db: Session, cart: Cart) -> None:
    """Sumuje objętość zamówień na wózku (SSOT list_orders_on_cart) — po zmianie koszyków.
    Nie zmienia statusu lifecycle (wyłącznie volume)."""
    from .cart_stats_service import list_orders_on_cart
    from .cart_capacity.engine import order_volume_dm3

    orders_on = list_orders_on_cart(db, cart)
    cart.used_volume = round(sum(order_volume_dm3(o) for o in orders_on), 2)
    db.add(cart)


def ensure_order_basket_for_wms_pick(db: Session, cart: Cart, order: Order) -> Optional[CartBasket]:
    """
    Wózek MULTI: jeśli zamówienie nie ma ``basket_id``, przypisz pierwszy koszyk z wystarczającą
    wolną pojemnością (wg ``_order_volume_dm3`` — objętość zamówienia / produkt × ilość).

    Ustawia ``Order.cart_id`` (gdy NULL), ``Order.basket_id``, ``Order.total_volume_dm3``,
    ``CartBasket.used_volume`` i ``CartBasket.order_id`` zgodnie z logiką ``_assign_multi``.
    Dla wózka innego niż MULTI zwraca ``None`` bez zmian.
    """
    if _normalize_cart_type(cart) != "MULTI":
        return None
    if order.basket_id is not None:
        b = next((x for x in (cart.baskets or []) if int(x.id) == int(order.basket_id)), None)
        if b is not None:
            return b
        ext = db.query(CartBasket).filter(CartBasket.id == int(order.basket_id)).first()
        return ext

    items = getattr(order, "items", None) or []
    if len(items) == 0:
        return None
    if not _is_single_item_order(order) and not _is_multi_item_order(order):
        return None

    baskets_db = sorted(list(cart.baskets or []), key=lambda b: (getattr(b, "row", 0), getattr(b, "column", 0), getattr(b, "id", 0)))
    runtimes: dict[int, _BasketRuntime] = {}
    basket_by_id: dict[int, CartBasket] = {int(b.id): b for b in baskets_db}

    for b in baskets_db:
        bid = int(b.id)
        cap = _basket_capacity_dm3(b)
        if cap <= 0:
            continue
        runtimes[bid] = _BasketRuntime(basket_id=bid, capacity_dm3=cap, used_dm3=0.0, order_ids=[], holds_multi_order=False)

    if not runtimes:
        return None

    existing_on_cart = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.cart_id == cart.id, Order.id != order.id)
        .all()
    )
    for o in existing_on_cart:
        if o.basket_id is None or int(o.basket_id) not in runtimes:
            continue
        br = runtimes[int(o.basket_id)]
        vol_o = _order_volume_dm3(o)
        br.used_dm3 = round(br.used_dm3 + vol_o, 4)
        if o.id not in br.order_ids:
            br.order_ids.append(int(o.id))
        if _is_multi_item_order(o):
            br.holds_multi_order = True

    vol = _order_volume_dm3(order)
    if getattr(order, "total_volume_dm3", None) is None or float(order.total_volume_dm3 or 0) <= 0:
        order.total_volume_dm3 = vol
        db.add(order)

    order_list = [basket_by_id[i] for i in sorted(runtimes.keys())]

    if int(order.cart_id or 0) != int(cart.id):
        # cart_id ustawia wyłącznie CartLifecycleService.start_picking
        return None

    if _is_multi_item_order(order):
        for b in order_list:
            bid = int(b.id)
            if bid not in runtimes:
                continue
            br = runtimes[bid]
            if br.holds_multi_order or len(br.order_ids) > 0:
                continue
            if br.used_dm3 > 1e-6:
                continue
            if vol > br.capacity_dm3 + 1e-6:
                continue
            br.used_dm3 = round(vol, 4)
            br.order_ids = [int(order.id)]
            br.holds_multi_order = True
            b.order_id = int(order.id)
            b.used_volume = br.used_dm3
            order.basket_id = bid
            db.add(b)
            db.add(order)
            refresh_cart_used_volume_wms(db, cart)
            return b
        return None

    for b in order_list:
        bid = int(b.id)
        if bid not in runtimes:
            continue
        br = runtimes[bid]
        if br.holds_multi_order:
            continue
        if br.remaining_dm3 + 1e-6 >= vol:
            br.used_dm3 = round(br.used_dm3 + vol, 4)
            br.order_ids.append(int(order.id))
            b.used_volume = br.used_dm3
            if b.order_id is None:
                b.order_id = int(order.id)
            order.basket_id = bid
            db.add(b)
            db.add(order)
            refresh_cart_used_volume_wms(db, cart)
            return b
    return None


class PickingAssignmentService:
    """Przypisanie zamówień do wózka (BULK lub MULTI) w jednej transakcji."""

    def __init__(self, db: Session):
        self.db = db

    def assign_orders_to_cart(
        self,
        order_ids: Sequence[int],
        cart_id: int,
        config: PickingAssignmentConfig,
        *,
        tenant_id: Optional[int] = None,
    ) -> PickingAssignmentServiceResult:
        """
        LEGACY WYŁĄCZONE.

        Przypisanie ``order.cart_id`` wyłącznie przy skanie wózka
        (``CartLifecycleService.start_picking``).
        """
        del order_ids, cart_id, config, tenant_id
        from .cart_picking_lifecycle_service import CartLifecycleError

        raise CartLifecycleError(
            "Przypisanie zamówień do wózka przed skanem jest zabronione. "
            "Użyj CartLifecycleService.start_picking po fizycznym skanie wózka.",
            code="legacy_assign_forbidden",
        )

    def _empty_summary(self, cart: Cart | None, ctype: str, cart_id_fallback: int | None = None) -> PickingAssignmentSummary:
        cid = int(cart.id) if cart else int(cart_id_fallback or 0)
        cap = float(getattr(cart, "total_volume", None) or 0) if cart else 0.0
        return PickingAssignmentSummary(
            cart_id=cid,
            cart_type=ctype,
            cart_used_volume_dm3=float(getattr(cart, "used_volume", None) or 0) if cart else 0.0,
            cart_total_volume_dm3=cap,
            basket_summaries=[],
        )

    def _finalize_cart(self, cart: Cart, _ctype: str) -> None:
        """Volume refresh only — lifecycle (status/session/cart_id) wyłącznie w CartLifecycleService."""
        from .cart_stats_service import list_orders_on_cart
        from .cart_capacity.engine import order_volume_dm3

        orders_on = list_orders_on_cart(self.db, cart)
        cart.used_volume = round(sum(order_volume_dm3(o) for o in orders_on), 2)
        self.db.add(cart)

    def _assign_bulk(
        self,
        cart: Cart,
        sorted_ids: list[int],
        orders_map: dict[int, Order],
        assigned: list[PickingAssignmentOrderResult],
        rejected: list[PickingAssignmentRejected],
        config: PickingAssignmentConfig,
    ) -> None:
        del cart, sorted_ids, orders_map, assigned, rejected, config
        from .cart_picking_lifecycle_service import CartLifecycleError

        raise CartLifecycleError(
            "Legacy _assign_bulk zabronione. Użyj CartLifecycleService.start_picking.",
            code="legacy_assign_forbidden",
        )

    def _assign_multi(
        self,
        cart: Cart,
        sorted_ids: list[int],
        orders_map: dict[int, Order],
        assigned: list[PickingAssignmentOrderResult],
        rejected: list[PickingAssignmentRejected],
        config: PickingAssignmentConfig,
    ) -> None:
        del cart, sorted_ids, orders_map, assigned, rejected, config
        from .cart_picking_lifecycle_service import CartLifecycleError

        raise CartLifecycleError(
            "Legacy _assign_multi zabronione. Użyj CartLifecycleService.start_picking.",
            code="legacy_assign_forbidden",
        )

    def _build_summary_from_db(self, cart: Cart | None, ctype: str) -> PickingAssignmentSummary:
        if not cart:
            return PickingAssignmentSummary(
                cart_id=0,
                cart_type=ctype,
                cart_used_volume_dm3=0.0,
                cart_total_volume_dm3=0.0,
                basket_summaries=[],
            )
        from .cart_stats_service import list_orders_on_cart
        from .cart_capacity.engine import order_volume_dm3

        orders_on = list_orders_on_cart(self.db, cart)
        used = round(sum(order_volume_dm3(o) for o in orders_on), 2)
        summaries: list[PickingAssignmentBasketSummary] = []
        for b in sorted(cart.baskets or [], key=lambda x: (x.row, x.column, x.id)):
            cap = _basket_capacity_dm3(b)
            oids = [int(o.id) for o in orders_on if o.basket_id == b.id]
            summaries.append(
                PickingAssignmentBasketSummary(
                    basket_id=int(b.id),
                    capacity_dm3=cap,
                    used_volume_dm3=float(b.used_volume or 0),
                    order_ids=oids,
                )
            )
        return PickingAssignmentSummary(
            cart_id=int(cart.id),
            cart_type=ctype,
            cart_used_volume_dm3=used,
            cart_total_volume_dm3=float(cart.total_volume or 0),
            basket_summaries=summaries,
        )
