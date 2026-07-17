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

from .cart_capacity_service import (
    CartCapacityExceeded,
    enforce_cart_orders_capacity,
)
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
    """Sumuje ``Order.total_volume_dm3`` dla zamówień na wózku — po zmianie koszyków."""
    orders_on = db.query(Order).filter(Order.cart_id == cart.id).all()
    cart.used_volume = round(sum(float(o.total_volume_dm3 or 0) for o in orders_on), 2)
    if cart.used_volume and cart.used_volume > 0:
        from .cart_picking_lifecycle_service import mark_cart_picking

        mark_cart_picking(cart)
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
        if order.cart_id is not None:
            return None
        enforce_cart_orders_capacity(db, cart, new_orders=1)
        order.cart_id = int(cart.id)
        db.add(order)

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
        Przypisz zamówienia do wózka. Tylko rekordy z ``cart_id IS NULL``.

        Reguły: ``config`` — dla każdego zamówienia wybierane są ``single_item`` lub ``multi_item``
        (klasyfikacja po liczbie pozycji). BULK wymaga ``allow_bulk``, koszyki MULTI — ``allow_basket``.
        """
        assigned: list[PickingAssignmentOrderResult] = []
        rejected: list[PickingAssignmentRejected] = []

        unique_ids: list[int] = []
        for oid in order_ids:
            if oid not in unique_ids:
                unique_ids.append(int(oid))

        try:
            cart = (
                self.db.query(Cart)
                .options(joinedload(Cart.baskets))
                .filter(Cart.id == cart_id)
                .first()
            )
            if not cart:
                for oid in unique_ids:
                    rejected.append(
                        PickingAssignmentRejected(
                            order_id=oid,
                            reason="not_found",
                            detail="Wózek nie istnieje",
                        )
                    )
                return PickingAssignmentServiceResult(
                    assigned=[],
                    rejected=rejected,
                    summary=PickingAssignmentSummary(
                        cart_id=cart_id,
                        cart_type="UNKNOWN",
                        cart_used_volume_dm3=0.0,
                        cart_total_volume_dm3=0.0,
                        basket_summaries=[],
                    ),
                )

            ctype = _normalize_cart_type(cart)
            if tenant_id is not None and int(cart.tenant_id) != int(tenant_id):
                for oid in unique_ids:
                    rejected.append(
                        PickingAssignmentRejected(
                            order_id=oid,
                            reason="warehouse_mismatch",
                            detail="tenant_id nie zgadza się z wózkiem",
                        )
                    )
                return PickingAssignmentServiceResult(
                    assigned=[],
                    rejected=rejected,
                    summary=self._empty_summary(cart, ctype),
                )

            incoming_count = 0
            if unique_ids:
                for oid, cid in (
                    self.db.query(Order.id, Order.cart_id).filter(Order.id.in_(unique_ids)).all()
                ):
                    if cid is None:
                        incoming_count += 1
            enforce_cart_orders_capacity(self.db, cart, new_orders=incoming_count)

            orders_map: dict[int, Order] = {}
            if unique_ids:
                loaded = (
                    self.db.query(Order)
                    .options(joinedload(Order.items).joinedload(OrderItem.product))
                    .filter(Order.id.in_(unique_ids))
                    .all()
                )
                orders_map = {int(o.id): o for o in loaded}

            def _order_sort_key(oid: int):
                o = orders_map.get(oid)
                if not o:
                    return (2, datetime.min, oid)
                dt = o.order_date or o.created_at or datetime.min
                return (0, dt, oid)

            sorted_candidates = sorted(unique_ids, key=_order_sort_key)

            if ctype == "BULK":
                self._assign_bulk(
                    cart,
                    sorted_candidates,
                    orders_map,
                    assigned,
                    rejected,
                    config,
                )
            elif ctype == "MULTI":
                self._assign_multi(
                    cart,
                    sorted_candidates,
                    orders_map,
                    assigned,
                    rejected,
                    config,
                )
            else:
                for oid in unique_ids:
                    rejected.append(
                        PickingAssignmentRejected(
                            order_id=oid,
                            reason="internal_error",
                            detail=f"Nieobsługiwany typ wózka: {ctype}",
                        )
                    )

            self._finalize_cart(cart, ctype)
            self.db.commit()
        except (HTTPException, CartCapacityExceeded):
            self.db.rollback()
            raise
        except Exception as e:
            logger.exception("PickingAssignmentService failed: %s", e)
            self.db.rollback()
            for oid in unique_ids:
                if oid not in {r.order_id for r in rejected}:
                    rejected.append(
                        PickingAssignmentRejected(
                            order_id=oid,
                            reason="internal_error",
                            detail=str(e)[:500],
                        )
                    )
            assigned.clear()
            try:
                cart2 = self.db.query(Cart).filter(Cart.id == cart_id).first()
                summary = (
                    self._empty_summary(cart2, _normalize_cart_type(cart2))
                    if cart2
                    else self._empty_summary(None, "UNKNOWN", cart_id)
                )
            except Exception:
                summary = PickingAssignmentSummary(
                    cart_id=cart_id,
                    cart_type="UNKNOWN",
                    cart_used_volume_dm3=0.0,
                    cart_total_volume_dm3=0.0,
                    basket_summaries=[],
                )
            return PickingAssignmentServiceResult(assigned=[], rejected=rejected, summary=summary)

        cart_refreshed = self.db.query(Cart).options(joinedload(Cart.baskets)).filter(Cart.id == cart_id).first()
        summary = self._build_summary_from_db(cart_refreshed, ctype)
        return PickingAssignmentServiceResult(assigned=assigned, rejected=rejected, summary=summary)

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
        orders_on = (
            self.db.query(Order).filter(Order.cart_id == cart.id).all()
        )
        cart.used_volume = round(
            sum(float(o.total_volume_dm3 or 0) for o in orders_on),
            2,
        )
        if orders_on:
            from .cart_picking_lifecycle_service import ensure_picking_session_for_cart

            ensure_picking_session_for_cart(
                self.db,
                cart=cart,
                orders=orders_on,
                operator_user_id=None,
                source_status_id=None,
            )
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
        existing_on_cart = (
            self.db.query(Order)
            .options(joinedload(Order.items))
            .filter(Order.cart_id == cart.id)
            .all()
        )
        singles_on_bulk = sum(1 for o in existing_on_cart if _is_single_item_order(o))
        multis_on_bulk = sum(1 for o in existing_on_cart if _is_multi_item_order(o))
        order_count_on_bulk = len(existing_on_cart)
        used_vol = sum(_order_volume_dm3(o) for o in existing_on_cart)
        cap = float(cart.total_volume or 0)
        use_per_type_limits = (
            config.max_orders_in_bulk_single_item is not None or config.max_orders_in_bulk_multi_item is not None
        )

        def _bulk_exceeds_order_limit(order: Order) -> tuple[bool, str | None]:
            if not use_per_type_limits:
                if config.max_orders_in_bulk is not None and order_count_on_bulk + 1 > config.max_orders_in_bulk:
                    return True, f"limit zamówień na BULK (łącznie): {config.max_orders_in_bulk}"
                return False, None
            if _is_single_item_order(order):
                lim = config.max_orders_in_bulk_single_item
                if lim is None:
                    lim = config.max_orders_in_bulk
                cnt = singles_on_bulk
            elif _is_multi_item_order(order):
                lim = config.max_orders_in_bulk_multi_item
                if lim is None:
                    lim = config.max_orders_in_bulk
                cnt = multis_on_bulk
            else:
                return False, None
            if lim is not None and cnt + 1 > lim:
                return True, f"limit zamówień BULK dla tego typu: {lim}"
            return False, None

        for oid in sorted_ids:
            order = orders_map.get(oid)
            if not order:
                rejected.append(PickingAssignmentRejected(order_id=oid, reason="not_found"))
                continue
            if order.cart_id is not None:
                rejected.append(
                    PickingAssignmentRejected(order_id=oid, reason="already_assigned", detail="cart_id != NULL"),
                )
                continue
            if int(order.warehouse_id) != int(cart.warehouse_id):
                rejected.append(PickingAssignmentRejected(order_id=oid, reason="warehouse_mismatch"))
                continue
            if len(order.items) == 0:
                rejected.append(PickingAssignmentRejected(order_id=oid, reason="not_found", detail="Brak pozycji"))
                continue

            if not _is_single_item_order(order) and not _is_multi_item_order(order):
                rejected.append(
                    PickingAssignmentRejected(order_id=oid, reason="not_found", detail="Niejednoznaczna klasyfikacja pozycji"),
                )
                continue

            rules = _mode_rules_for_order(order, config)
            if not rules.allow_bulk:
                rejected.append(
                    PickingAssignmentRejected(
                        order_id=oid,
                        reason="config_disallows_bulk",
                        detail="Konfiguracja: brak zgody na BULK dla tego typu zamówienia",
                    )
                )
                continue

            exceeds, lim_msg = _bulk_exceeds_order_limit(order)
            if exceeds:
                rejected.append(
                    PickingAssignmentRejected(
                        order_id=oid,
                        reason="bulk_max_orders_exceeded",
                        detail=lim_msg,
                    )
                )
                continue

            vol = _order_volume_dm3(order)
            if cap > 0 and used_vol + vol > cap + 1e-6:
                rejected.append(
                    PickingAssignmentRejected(order_id=oid, reason="bulk_volume_exceeded", detail=f"limit {cap} dm³"),
                )
                continue

            order.cart_id = cart.id
            order.basket_id = None
            order.total_volume_dm3 = vol
            self.db.add(order)
            used_vol += vol
            order_count_on_bulk += 1
            if _is_single_item_order(order):
                singles_on_bulk += 1
            elif _is_multi_item_order(order):
                multis_on_bulk += 1
            assigned.append(
                PickingAssignmentOrderResult(order_id=oid, cart_id=cart.id, basket_id=None, volume_dm3=vol),
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
        baskets_db = sorted(
            list(cart.baskets or []),
            key=lambda b: (getattr(b, "row", 0), getattr(b, "column", 0), getattr(b, "id", 0)),
        )
        runtimes: dict[int, _BasketRuntime] = {}
        basket_by_id: dict[int, CartBasket] = {int(b.id): b for b in baskets_db}

        for b in baskets_db:
            bid = int(b.id)
            cap = _basket_capacity_dm3(b)
            if cap <= 0:
                logger.warning("PickingAssignment: koszyk %s ma pojemność 0 — pomijany", bid)
                continue
            runtimes[bid] = _BasketRuntime(basket_id=bid, capacity_dm3=cap, used_dm3=0.0, order_ids=[], holds_multi_order=False)

        existing_on_cart = (
            self.db.query(Order)
            .options(joinedload(Order.items))
            .filter(Order.cart_id == cart.id)
            .all()
        )
        for o in existing_on_cart:
            if o.basket_id is None or int(o.basket_id) not in runtimes:
                continue
            br = runtimes[int(o.basket_id)]
            vol = _order_volume_dm3(o)
            br.used_dm3 = round(br.used_dm3 + vol, 4)
            if o.id not in br.order_ids:
                br.order_ids.append(int(o.id))
            if _is_multi_item_order(o):
                br.holds_multi_order = True

        for bid, br in runtimes.items():
            bobj = basket_by_id[bid]
            if br.order_ids:
                bobj.order_id = br.order_ids[0]
            else:
                bobj.order_id = None
            bobj.used_volume = round(br.used_dm3, 4)
            self.db.add(bobj)

        order_list = [basket_by_id[i] for i in sorted(runtimes.keys())]

        if not order_list:
            for oid in sorted_ids:
                order = orders_map.get(oid)
                if not order:
                    rejected.append(PickingAssignmentRejected(order_id=oid, reason="not_found"))
                elif order.cart_id is not None:
                    rejected.append(
                        PickingAssignmentRejected(order_id=oid, reason="already_assigned", detail="cart_id != NULL"),
                    )
                elif int(order.warehouse_id) != int(cart.warehouse_id):
                    rejected.append(PickingAssignmentRejected(order_id=oid, reason="warehouse_mismatch"))
                elif len(order.items) == 0:
                    rejected.append(PickingAssignmentRejected(order_id=oid, reason="not_found", detail="Brak pozycji"))
                elif not _mode_rules_for_order(order, config).allow_basket:
                    rejected.append(
                        PickingAssignmentRejected(
                            order_id=oid,
                            reason="config_disallows_basket",
                            detail="Konfiguracja: brak zgody na koszyk dla tego typu zamówienia",
                        )
                    )
                else:
                    rejected.append(
                        PickingAssignmentRejected(
                            order_id=oid,
                            reason="multi_no_basket",
                            detail="Brak koszyków z pojemnością",
                        )
                    )
            return

        for oid in sorted_ids:
            order = orders_map.get(oid)
            if not order:
                rejected.append(PickingAssignmentRejected(order_id=oid, reason="not_found"))
                continue
            if order.cart_id is not None:
                rejected.append(
                    PickingAssignmentRejected(order_id=oid, reason="already_assigned", detail="cart_id != NULL"),
                )
                continue
            if int(order.warehouse_id) != int(cart.warehouse_id):
                rejected.append(PickingAssignmentRejected(order_id=oid, reason="warehouse_mismatch"))
                continue
            if len(order.items) == 0:
                rejected.append(PickingAssignmentRejected(order_id=oid, reason="not_found", detail="Brak pozycji"))
                continue

            rules = _mode_rules_for_order(order, config)
            if not rules.allow_basket:
                rejected.append(
                    PickingAssignmentRejected(
                        order_id=oid,
                        reason="config_disallows_basket",
                        detail="Konfiguracja: brak zgody na koszyk dla tego typu zamówienia",
                    )
                )
                continue

            vol = _order_volume_dm3(order)

            if _is_multi_item_order(order):
                placed = False
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
                    br.order_ids = [oid]
                    br.holds_multi_order = True
                    b.order_id = oid
                    b.used_volume = br.used_dm3
                    self.db.add(b)
                    order.cart_id = cart.id
                    order.basket_id = bid
                    order.total_volume_dm3 = vol
                    self.db.add(order)
                    assigned.append(
                        PickingAssignmentOrderResult(order_id=oid, cart_id=cart.id, basket_id=bid, volume_dm3=vol),
                    )
                    placed = True
                    break
                if not placed:
                    max_cap = max((r.capacity_dm3 for r in runtimes.values()), default=0.0)
                    rej_reason = "multi_oversized" if vol > max_cap + 1e-6 else "multi_no_basket"
                    rejected.append(PickingAssignmentRejected(order_id=oid, reason=rej_reason))
                continue

            if not _is_single_item_order(order):
                rejected.append(
                    PickingAssignmentRejected(order_id=oid, reason="not_found", detail="Niejednoznaczna klasyfikacja pozycji"),
                )
                continue

            placed = False
            for b in order_list:
                bid = int(b.id)
                if bid not in runtimes:
                    continue
                br = runtimes[bid]
                if br.holds_multi_order:
                    continue
                if br.remaining_dm3 + 1e-6 >= vol:
                    br.used_dm3 = round(br.used_dm3 + vol, 4)
                    br.order_ids.append(oid)
                    b.used_volume = br.used_dm3
                    if b.order_id is None:
                        b.order_id = oid
                    self.db.add(b)
                    order.cart_id = cart.id
                    order.basket_id = bid
                    order.total_volume_dm3 = vol
                    self.db.add(order)
                    assigned.append(
                        PickingAssignmentOrderResult(order_id=oid, cart_id=cart.id, basket_id=bid, volume_dm3=vol),
                    )
                    placed = True
                    break

            if not placed:
                max_cap = max((r.capacity_dm3 for r in runtimes.values()), default=0.0)
                reason = "multi_oversized" if vol > max_cap + 1e-6 else "multi_no_basket"
                rejected.append(PickingAssignmentRejected(order_id=oid, reason=reason))

    def _build_summary_from_db(self, cart: Cart | None, ctype: str) -> PickingAssignmentSummary:
        if not cart:
            return PickingAssignmentSummary(
                cart_id=0,
                cart_type=ctype,
                cart_used_volume_dm3=0.0,
                cart_total_volume_dm3=0.0,
                basket_summaries=[],
            )
        orders_on = self.db.query(Order).filter(Order.cart_id == cart.id).all()
        used = round(sum(float(o.total_volume_dm3 or 0) for o in orders_on), 2)
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
