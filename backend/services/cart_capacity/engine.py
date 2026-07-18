"""
CartCapacityEngine — sole SSOT for cart capacity decisions.

Does not rank orders, optimize routes, or touch Cart.status lifecycle.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Literal, Sequence

from sqlalchemy.orm import Session

from ...models.cart import Cart
from ...models.order import Order
from .enums import CapacityStrategy
from .exceptions import CartCapacityExceeded
from .occupancy import compute_occupancy_state
from .profile import (
    is_multi_cart,
    load_basket_workings,
    resolve_capacity_orders,
    resolve_capacity_strategy,
    resolve_capacity_volume,
)
from .types import (
    BasketSlotSnapshot,
    BasketSummary,
    BasketWorking,
    CapacitySnapshot,
    EngineState,
)

CapacityPolicy = Literal["truncate", "error"]


def order_volume_dm3(order: Any) -> float:
    tv = getattr(order, "total_volume_dm3", None)
    if tv is not None:
        try:
            return max(0.0, float(tv))
        except (TypeError, ValueError):
            pass
    return 0.0


def _best_fit_basket(baskets: Sequence[BasketWorking], volume: float) -> BasketWorking | None:
    """
    Best-fit: among free baskets that can hold ``volume``, pick the smallest
    usable_volume that still fits (tightest fit).
    """
    candidates = [
        b
        for b in baskets
        if not b.occupied and float(b.usable_volume) + 1e-9 >= float(volume)
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda b: (float(b.usable_volume), int(b.basket_id)))


@dataclass
class AcceptResult:
    accepted: bool
    basket_id: int | None = None
    reason: str | None = None


@dataclass
class SelectionResult:
    orders: list
    basket_assignments: dict[int, int]  # order_id -> basket_id (BASKETS only)


class CartCapacityEngine:
    """Mutable working capacity state for one cart."""

    def __init__(self, state: EngineState):
        self._state = state

    @classmethod
    def from_cart(
        cls,
        cart: Cart,
        *,
        assigned_orders: int | None = None,
        assigned_volume: float | None = None,
        baskets: list[BasketWorking] | None = None,
    ) -> CartCapacityEngine:
        strategy = resolve_capacity_strategy(cart)
        if is_multi_cart(cart):
            strategy = CapacityStrategy.BASKETS
        bask = baskets if baskets is not None else load_basket_workings(cart)
        if assigned_orders is None:
            if strategy == CapacityStrategy.BASKETS:
                assigned_orders = sum(1 for b in bask if b.occupied)
            else:
                assigned_orders = 0
        if assigned_volume is None:
            if strategy == CapacityStrategy.BASKETS:
                assigned_volume = sum(float(b.used_volume) for b in bask if b.occupied)
            else:
                assigned_volume = float(getattr(cart, "used_volume", None) or 0)
        return cls(
            EngineState(
                strategy=strategy,
                capacity_orders=resolve_capacity_orders(cart),
                capacity_volume=resolve_capacity_volume(cart),
                assigned_orders=int(assigned_orders or 0),
                assigned_volume=float(assigned_volume or 0),
                baskets=bask,
            )
        )

    @classmethod
    def from_db(cls, db: Session, cart: Cart) -> CartCapacityEngine:
        """Load assigned occupancy from orders / baskets (SSOT = list_orders_on_cart)."""
        from ..cart_stats_service import list_orders_on_cart

        strategy = resolve_capacity_strategy(cart)
        if is_multi_cart(cart):
            strategy = CapacityStrategy.BASKETS
            # Ensure baskets are loaded
            _ = getattr(cart, "baskets", None)
            bask = load_basket_workings(cart)
            assigned_orders = sum(1 for b in bask if b.occupied)
            assigned_volume = sum(float(b.used_volume or 0) for b in bask if b.occupied)
            # Prefer order volumes when basket.used_volume empty but order linked
            if assigned_orders and assigned_volume <= 0:
                for b in bask:
                    if b.order_id is None:
                        continue
                    o = (
                        db.query(Order)
                        .filter(Order.id == int(b.order_id), Order.deleted_at.is_(None))
                        .first()
                    )
                    if o is not None:
                        b.used_volume = order_volume_dm3(o)
                assigned_volume = sum(float(b.used_volume) for b in bask if b.occupied)
            return cls.from_cart(
                cart,
                assigned_orders=assigned_orders,
                assigned_volume=assigned_volume,
                baskets=bask,
            )

        orders = list_orders_on_cart(db, cart)
        assigned_orders = len(orders)
        assigned_volume = round(sum(order_volume_dm3(o) for o in orders), 4)
        return cls.from_cart(
            cart,
            assigned_orders=assigned_orders,
            assigned_volume=assigned_volume,
            baskets=[],
        )

    @property
    def strategy(self) -> CapacityStrategy:
        return self._state.strategy

    def clone(self) -> CartCapacityEngine:
        return CartCapacityEngine(deepcopy(self._state))

    def remaining(self) -> dict[str, float | int | None]:
        snap = self.snapshot()
        return {
            "remaining_orders": snap.remaining_orders,
            "remaining_volume": snap.remaining_volume,
        }

    def is_capacity_reached(self) -> bool:
        return self.snapshot().is_capacity_reached

    def can_accept(self, order_volume: float, *, order_id: int | None = None) -> bool:
        return self.accept(order_volume, order_id=order_id, dry_run=True).accepted

    def accept(
        self,
        order_volume: float,
        *,
        order_id: int | None = None,
        dry_run: bool = False,
    ) -> AcceptResult:
        st = self._state
        vol = max(0.0, float(order_volume or 0))
        strategy = st.strategy

        if strategy == CapacityStrategy.LIMIT_ORDERS:
            cap = st.capacity_orders
            if cap is None:
                ok = True
            else:
                ok = (st.assigned_orders + 1) <= int(cap)
            if not ok:
                return AcceptResult(False, reason="orders_limit")
            if not dry_run:
                st.assigned_orders += 1
                st.assigned_volume += vol
            return AcceptResult(True)

        if strategy == CapacityStrategy.LIMIT_VOLUME:
            cap_v = st.capacity_volume
            if cap_v is None:
                ok = True
            else:
                ok = (st.assigned_volume + vol) <= float(cap_v) + 1e-9
            if not ok:
                return AcceptResult(False, reason="volume_limit")
            if not dry_run:
                st.assigned_orders += 1
                st.assigned_volume += vol
            return AcceptResult(True)

        if strategy == CapacityStrategy.HYBRID_STOP_FIRST:
            cap_o = st.capacity_orders
            cap_v = st.capacity_volume
            if cap_o is not None and (st.assigned_orders + 1) > int(cap_o):
                return AcceptResult(False, reason="orders_limit")
            if cap_v is not None and (st.assigned_volume + vol) > float(cap_v) + 1e-9:
                return AcceptResult(False, reason="volume_limit")
            if not dry_run:
                st.assigned_orders += 1
                st.assigned_volume += vol
            return AcceptResult(True)

        if strategy == CapacityStrategy.HYBRID_STOP_VOLUME:
            # Order count is advisory only — stop solely on volume
            cap_v = st.capacity_volume
            if cap_v is not None and (st.assigned_volume + vol) > float(cap_v) + 1e-9:
                return AcceptResult(False, reason="volume_limit")
            if not dry_run:
                st.assigned_orders += 1
                st.assigned_volume += vol
            return AcceptResult(True)

        if strategy == CapacityStrategy.BASKETS:
            basket = _best_fit_basket(st.baskets, vol)
            if basket is None:
                return AcceptResult(False, reason="no_basket")
            if not dry_run:
                basket.order_id = int(order_id) if order_id is not None else -1
                basket.used_volume = vol
                st.assigned_orders = sum(1 for b in st.baskets if b.occupied)
                st.assigned_volume = sum(float(b.used_volume) for b in st.baskets if b.occupied)
                st.last_basket_id = int(basket.basket_id)
            return AcceptResult(True, basket_id=int(basket.basket_id))

        return AcceptResult(False, reason="unknown_strategy")

    def snapshot(self) -> CapacitySnapshot:
        st = self._state
        strategy = st.strategy
        basket_summary: BasketSummary | None = None
        overflow = False

        if strategy == CapacityStrategy.BASKETS:
            slots = tuple(
                BasketSlotSnapshot(
                    id=int(b.basket_id),
                    occupied=b.occupied,
                    order_id=b.order_id if b.order_id is not None and b.order_id > 0 else b.order_id,
                    usable_volume=round(float(b.usable_volume), 4),
                    used_volume=round(float(b.used_volume), 4),
                    remaining_volume=round(float(b.remaining_volume), 4),
                )
                for b in st.baskets
            )
            total = len(slots)
            occupied = sum(1 for s in slots if s.occupied)
            free = total - occupied
            basket_summary = BasketSummary(total=total, occupied=occupied, free=free, slots=slots)
            assigned_orders = occupied
            assigned_volume = sum(s.used_volume for s in slots if s.occupied)
            capacity_orders = total if total > 0 else None
            capacity_volume = None
            remaining_orders = free
            remaining_volume = None
            usage = (occupied / total) if total > 0 else 0.0
            # Full when no free basket OR no free basket can accept any positive volume
            # (presentation: all occupied ⇒ full)
            is_reached = free <= 0
            if occupied > total:
                overflow = True
        else:
            assigned_orders = int(st.assigned_orders)
            assigned_volume = float(st.assigned_volume)
            capacity_orders = st.capacity_orders
            capacity_volume = st.capacity_volume

            rem_o: int | None = None
            rem_v: float | None = None
            ratios: list[float] = []

            if strategy == CapacityStrategy.LIMIT_ORDERS:
                if capacity_orders is not None:
                    rem_o = max(0, int(capacity_orders) - assigned_orders)
                    ratios.append(assigned_orders / float(capacity_orders) if capacity_orders else 0.0)
                    overflow = assigned_orders > int(capacity_orders)
                    is_reached = rem_o <= 0
                else:
                    is_reached = False
            elif strategy == CapacityStrategy.LIMIT_VOLUME:
                if capacity_volume is not None:
                    rem_v = max(0.0, float(capacity_volume) - assigned_volume)
                    ratios.append(assigned_volume / float(capacity_volume) if capacity_volume else 0.0)
                    overflow = assigned_volume > float(capacity_volume) + 1e-9
                    is_reached = rem_v <= 1e-9
                else:
                    is_reached = False
            elif strategy == CapacityStrategy.HYBRID_STOP_FIRST:
                ord_full = False
                vol_full = False
                if capacity_orders is not None:
                    rem_o = max(0, int(capacity_orders) - assigned_orders)
                    ratios.append(assigned_orders / float(capacity_orders))
                    ord_full = rem_o <= 0
                    if assigned_orders > int(capacity_orders):
                        overflow = True
                if capacity_volume is not None:
                    rem_v = max(0.0, float(capacity_volume) - assigned_volume)
                    ratios.append(assigned_volume / float(capacity_volume))
                    vol_full = rem_v <= 1e-9
                    if assigned_volume > float(capacity_volume) + 1e-9:
                        overflow = True
                is_reached = ord_full or vol_full
            elif strategy == CapacityStrategy.HYBRID_STOP_VOLUME:
                if capacity_orders is not None:
                    rem_o = max(0, int(capacity_orders) - assigned_orders)
                    # advisory — do not drive is_reached from orders alone
                    ratios.append(assigned_orders / float(capacity_orders))
                if capacity_volume is not None:
                    rem_v = max(0.0, float(capacity_volume) - assigned_volume)
                    ratios.append(assigned_volume / float(capacity_volume))
                    overflow = assigned_volume > float(capacity_volume) + 1e-9
                    is_reached = rem_v <= 1e-9
                else:
                    is_reached = False
            else:
                is_reached = False

            remaining_orders = rem_o
            remaining_volume = rem_v
            usage = max(ratios) if ratios else 0.0

        occupancy = compute_occupancy_state(
            usage_ratio=usage,
            is_capacity_reached=is_reached,
            overflow=overflow,
        )
        return CapacitySnapshot(
            strategy=strategy,
            occupancy_state=occupancy,
            capacity_orders=capacity_orders if strategy != CapacityStrategy.BASKETS else (
                basket_summary.total if basket_summary else None
            ),
            capacity_volume=capacity_volume if strategy != CapacityStrategy.BASKETS else None,
            assigned_orders=assigned_orders,
            assigned_volume=assigned_volume,
            remaining_orders=remaining_orders,
            remaining_volume=remaining_volume,
            capacity_usage_percent=round(min(100.0, max(0.0, usage * 100.0)), 2),
            is_capacity_reached=is_reached,
            basket_summary=basket_summary,
        )

    def select_orders(
        self,
        candidates: Sequence[Any],
        *,
        on_capacity: CapacityPolicy = "truncate",
    ) -> SelectionResult:
        """
        Walk candidates in given order; accept while capacity allows.
        Caller owns ranking; engine only gates fit.
        """
        selected: list[Any] = []
        basket_assignments: dict[int, int] = {}
        baskets = self._state.strategy == CapacityStrategy.BASKETS
        for o in candidates:
            vol = order_volume_dm3(o)
            oid = getattr(o, "id", None)
            res = self.accept(vol, order_id=int(oid) if oid is not None else None, dry_run=False)
            if res.accepted:
                selected.append(o)
                if res.basket_id is not None and oid is not None:
                    basket_assignments[int(oid)] = int(res.basket_id)
                continue
            if on_capacity == "error":
                if not selected:
                    raise CartCapacityExceeded(
                        current_orders=self._state.assigned_orders,
                        capacity_orders=int(self._state.capacity_orders or 0),
                        attempted=len(candidates),
                        strategy=self._state.strategy.value,
                        reason=res.reason or "capacity_reached",
                    )
                break
            # BASKETS: skip order that does not fit any free basket; try next candidate.
            # Other strategies: stop (greedy prefix of ranked list).
            if baskets:
                continue
            break
        return SelectionResult(orders=selected, basket_assignments=basket_assignments)


def build_capacity_snapshot(db: Session, cart: Cart) -> CapacitySnapshot:
    return CartCapacityEngine.from_db(db, cart).snapshot()


def select_orders_for_cart(
    db: Session,
    cart: Cart,
    candidates: Sequence[Order],
    *,
    on_capacity: CapacityPolicy = "truncate",
) -> SelectionResult:
    engine = CartCapacityEngine.from_db(db, cart)
    return engine.select_orders(candidates, on_capacity=on_capacity)
