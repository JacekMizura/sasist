"""
Order-to-Container Assignment Engine (volume-based first-fit).

Czysta logika przygotowania przypisań zamówień → koszyki na wózku MULTI.
- Nie modyfikuje zapisów Pick / PickTask / fal.
- Nie wywołuje commitów — wynik to struktura danych do dalszego użycia (API, WMS).

Rozszerzalność: w przyszłości można podmienić heurystykę pakowania (np. 3D FFD, wagi)
lub dodać warstwę optymalizacji tras — interfejs opiera się na Pydantic request/result.

Jednostki: dm³ (zgodnie z total_volume wózka i logiką cart_service / orders.total_volume_dm3).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional, Sequence

from ..schemas.picking_container_assignment import (
    PickingBasketAssignmentRow,
    PickingBasketSlotIn,
    PickingCartSessionAssignmentRequest,
    PickingCartSessionAssignmentResult,
    PickingOrderVolumeComputed,
    PickingOrderVolumeIn,
    PickingUnassignedOrderOut,
)

logger = logging.getLogger(__name__)


def volume_dm3_from_box_cm(length_cm: float, width_cm: float, height_cm: float) -> float:
    """Objętość prostopadłościanu: wymiary w cm → dm³."""
    return max(0.0, (length_cm * width_cm * height_cm) / 1000.0)


def volume_dm3_per_unit_from_line_fields(
    *,
    volume_dm3: Optional[float],
    length_cm: float,
    width_cm: float,
    height_cm: float,
    fallback_dm3: float,
) -> float:
    """
    Kolejność: product.volume (dm³) → L×W×H/1000 → fallback (jak cart_service).
    """
    if volume_dm3 is not None and float(volume_dm3) > 0:
        return round(float(volume_dm3), 6)
    if length_cm > 0 and width_cm > 0 and height_cm > 0:
        return round(volume_dm3_from_box_cm(length_cm, width_cm, height_cm), 6)
    return float(fallback_dm3)


def compute_order_total_volume_dm3(order: PickingOrderVolumeIn, *, fallback_dm3: float) -> float:
    """Suma objętości zamówienia w dm³."""
    if order.total_volume_dm3 is not None:
        return round(max(0.0, float(order.total_volume_dm3)), 4)
    total = 0.0
    for line in order.lines:
        u = line.volume_dm3_per_unit
        if u is None or u <= 0:
            u = fallback_dm3
            logger.debug("picking assignment: line fallback volume order_id=%s product_id=%s", order.order_id, line.product_id)
        total += float(u) * int(line.quantity)
    return round(total, 4)


def _sort_prepared_orders(
    prepared: list[tuple[PickingOrderVolumeIn, float]],
    sort_mode: str,
) -> list[tuple[PickingOrderVolumeIn, float]]:
    """Sortuje (zamówienie, objętość) wg trybu."""

    def key_date_asc(item: tuple[PickingOrderVolumeIn, float]):
        o, _vol = item
        dt = o.order_date
        return (0 if dt is not None else 1, dt or datetime.min, o.order_id)

    def key_date_desc(item: tuple[PickingOrderVolumeIn, float]):
        o, _vol = item
        dt = o.order_date
        if dt is None:
            return (1, 0.0, o.order_id)
        return (0, -dt.timestamp(), o.order_id)

    out = list(prepared)
    if sort_mode == "date_asc":
        out.sort(key=key_date_asc)
    elif sort_mode == "date_desc":
        out.sort(key=key_date_desc)
    elif sort_mode == "volume_desc":
        out.sort(key=lambda it: (-it[1], it[0].order_id))
    elif sort_mode == "volume_asc":
        out.sort(key=lambda it: (it[1], it[0].order_id))
    else:
        out.sort(key=key_date_asc)
    return out


@dataclass
class _BasketWorkingState:
    basket_id: int
    capacity: float
    remaining: float
    assigned_order_ids: list[int]
    used_volume: float

    @classmethod
    def from_slot(cls, slot: PickingBasketSlotIn) -> _BasketWorkingState:
        cap = float(slot.capacity_volume_dm3)
        return cls(
            basket_id=int(slot.basket_id),
            capacity=cap,
            remaining=cap,
            assigned_order_ids=[],
            used_volume=0.0,
        )


def assign_orders_to_baskets_first_fit_volume(
    request: PickingCartSessionAssignmentRequest,
) -> PickingCartSessionAssignmentResult:
    """
    Algorytm first-fit po posortowanej liście zamówień:
    kolejne zamówienie trafia do pierwszego koszyka z wolnym miejscem (remaining >= volume).

    - Zamówienie większe niż pojemność **największego** koszyka → ``oversized``.
    - Mieści się pojedynczo, ale brak miejsca w sesji → ``no_capacity_remaining``.
    - Wiele zamówień na jednym koszyku: dozwolone (sumaryczna objętość).
    """
    if not request.baskets:
        return PickingCartSessionAssignmentResult(
            cart_id=request.cart_id,
            baskets=[],
            unassigned_orders=[
                PickingUnassignedOrderOut(
                    order_id=o.order_id,
                    reason="no_capacity_remaining",
                    order_volume_dm3=compute_order_total_volume_dm3(o, fallback_dm3=request.volume_fallback_dm3),
                )
                for o in request.orders
            ],
            order_volumes=[],
        )

    max_cap = max(float(b.capacity_volume_dm3) for b in request.baskets)

    prepared: list[tuple[PickingOrderVolumeIn, float]] = [
        (o, compute_order_total_volume_dm3(o, fallback_dm3=request.volume_fallback_dm3)) for o in request.orders
    ]

    ordered = _sort_prepared_orders(prepared, request.sort_orders_by)

    order_volumes_out = [PickingOrderVolumeComputed(order_id=o.order_id, volume_dm3=v) for o, v in prepared]

    states = [_BasketWorkingState.from_slot(s) for s in request.baskets]
    unassigned: list[PickingUnassignedOrderOut] = []

    for order, vol in ordered:
        oid = order.order_id
        if vol > max_cap + 1e-9:
            unassigned.append(
                PickingUnassignedOrderOut(order_id=oid, reason="oversized", order_volume_dm3=vol),
            )
            continue
        placed = False
        for st in states:
            if st.remaining + 1e-9 >= vol:
                st.assigned_order_ids.append(oid)
                st.used_volume = round(st.used_volume + vol, 4)
                st.remaining = round(max(0.0, st.capacity - st.used_volume), 4)
                placed = True
                break
        if not placed:
            unassigned.append(
                PickingUnassignedOrderOut(order_id=oid, reason="no_capacity_remaining", order_volume_dm3=vol),
            )

    basket_rows = [
        PickingBasketAssignmentRow(
            basket_id=st.basket_id,
            assigned_order_ids=list(st.assigned_order_ids),
            used_volume_dm3=round(st.used_volume, 4),
            remaining_capacity_dm3=round(st.remaining, 4),
        )
        for st in states
    ]

    return PickingCartSessionAssignmentResult(
        cart_id=request.cart_id,
        baskets=basket_rows,
        unassigned_orders=unassigned,
        order_volumes=order_volumes_out,
    )


def picking_order_volume_in_from_orm(order: Any) -> PickingOrderVolumeIn:
    """
    Zamówienie SQLAlchemy → wejście silnika.
    Objętość jak w cart_service (`_order_used_volume_dm3_from_items`), ew. cache `total_volume_dm3`.
    """
    from ..services.cart_service import _order_used_volume_dm3_from_items

    oid = int(getattr(order, "id", 0))
    od = getattr(order, "order_date", None) or getattr(order, "created_at", None)
    tv = getattr(order, "total_volume_dm3", None)
    if tv is not None and float(tv) > 0:
        vol = float(tv)
    else:
        vol = float(_order_used_volume_dm3_from_items(order))
    return PickingOrderVolumeIn(
        order_id=oid,
        order_date=od,
        lines=[],
        total_volume_dm3=round(vol, 4),
    )


def picking_basket_slots_from_multi_cart(cart: Any) -> list[PickingBasketSlotIn]:
    """
    Wózek MULTI (Cart z relacją `baskets`) → sloty z pojemnością dm³.
    `CartBasket.usable_volume` w DB jest w cm³ (L×W×H); jeśli 0, liczymy z wymiarów wewnętrznych.
    """
    raw = list(getattr(cart, "baskets", None) or [])
    baskets = sorted(raw, key=lambda b: (getattr(b, "row", 0), getattr(b, "column", 0), getattr(b, "id", 0)))
    slots: list[PickingBasketSlotIn] = []
    for b in baskets:
        cm3 = float(getattr(b, "usable_volume", None) or 0)
        if cm3 > 0:
            cap_dm3 = round(cm3 / 1000.0, 6)
        else:
            cap_dm3 = volume_dm3_from_box_cm(
                float(getattr(b, "inner_length", None) or 0),
                float(getattr(b, "inner_width", None) or 0),
                float(getattr(b, "inner_height", None) or 0),
            )
        if cap_dm3 <= 0:
            logger.warning(
                "picking_container_assignment: koszyk id=%s — pominięty (pojemność 0)",
                getattr(b, "id", None),
            )
            continue
        slots.append(PickingBasketSlotIn(basket_id=int(b.id), capacity_volume_dm3=cap_dm3))
    return slots


def build_cart_session_assignment_from_orm(
    cart: Any,
    orders: Sequence[Any],
    *,
    sort_orders_by: str = "date_asc",
) -> PickingCartSessionAssignmentResult:
    """Wygodny wrapper ORM → wynik przypisania (bez zapisu do bazy)."""
    req = PickingCartSessionAssignmentRequest(
        cart_id=int(getattr(cart, "id", 0)),
        baskets=picking_basket_slots_from_multi_cart(cart),
        orders=[picking_order_volume_in_from_orm(o) for o in orders],
        sort_orders_by=sort_orders_by,  # type: ignore[arg-type]
    )
    return assign_orders_to_baskets_first_fit_volume(req)


class OrderToContainerAssignmentEngine:
    """
    Stabilna fasada: w przyszłości można dodać wstrzykiwanie strategii (best-fit, wagowy, seed RNG).
    Obecnie deleguje do ``assign_orders_to_baskets_first_fit_volume``.
    """

    assign = staticmethod(assign_orders_to_baskets_first_fit_volume)

    @staticmethod
    def assign_from_orm(
        cart: Any,
        orders: Sequence[Any],
        *,
        sort_orders_by: str = "date_asc",
    ) -> PickingCartSessionAssignmentResult:
        return build_cart_session_assignment_from_orm(cart, orders, sort_orders_by=sort_orders_by)
