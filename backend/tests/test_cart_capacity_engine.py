"""Unit tests for CartCapacityEngine strategies."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.services.cart_capacity import (
    CapacityStrategy,
    CartCapacityEngine,
    OccupancyState,
)
from backend.services.cart_capacity.types import BasketWorking, EngineState


def _engine(
    strategy: CapacityStrategy,
    *,
    capacity_orders: int | None = None,
    capacity_volume: float | None = None,
    assigned_orders: int = 0,
    assigned_volume: float = 0.0,
    baskets: list[BasketWorking] | None = None,
) -> CartCapacityEngine:
    return CartCapacityEngine(
        EngineState(
            strategy=strategy,
            capacity_orders=capacity_orders,
            capacity_volume=capacity_volume,
            assigned_orders=assigned_orders,
            assigned_volume=assigned_volume,
            baskets=baskets or [],
        )
    )


class TestLimitOrders(unittest.TestCase):
    def test_stops_at_order_limit(self) -> None:
        eng = _engine(CapacityStrategy.LIMIT_ORDERS, capacity_orders=2)
        orders = [SimpleNamespace(id=i, total_volume_dm3=1.0) for i in range(5)]
        result = eng.select_orders(orders)
        self.assertEqual(len(result.orders), 2)
        self.assertTrue(eng.is_capacity_reached())


class TestLimitVolume(unittest.TestCase):
    def test_packs_by_volume_only(self) -> None:
        eng = _engine(CapacityStrategy.LIMIT_VOLUME, capacity_volume=100.0)
        orders = [
            SimpleNamespace(id=1, total_volume_dm3=40.0),
            SimpleNamespace(id=2, total_volume_dm3=40.0),
            SimpleNamespace(id=3, total_volume_dm3=40.0),
        ]
        result = eng.select_orders(orders)
        self.assertEqual([o.id for o in result.orders], [1, 2])
        snap = eng.snapshot()
        self.assertEqual(snap.occupancy_state, OccupancyState.WARNING)
        self.assertFalse(snap.is_capacity_reached)


class TestHybridStopFirst(unittest.TestCase):
    def test_orders_limit_wins_first(self) -> None:
        eng = _engine(
            CapacityStrategy.HYBRID_STOP_FIRST,
            capacity_orders=2,
            capacity_volume=1000.0,
        )
        orders = [SimpleNamespace(id=i, total_volume_dm3=1.0) for i in range(5)]
        result = eng.select_orders(orders)
        self.assertEqual(len(result.orders), 2)

    def test_volume_limit_wins_first(self) -> None:
        eng = _engine(
            CapacityStrategy.HYBRID_STOP_FIRST,
            capacity_orders=10,
            capacity_volume=50.0,
        )
        orders = [
            SimpleNamespace(id=1, total_volume_dm3=30.0),
            SimpleNamespace(id=2, total_volume_dm3=30.0),
        ]
        result = eng.select_orders(orders)
        self.assertEqual(len(result.orders), 1)


class TestHybridStopVolume(unittest.TestCase):
    def test_may_exceed_advisory_order_count(self) -> None:
        eng = _engine(
            CapacityStrategy.HYBRID_STOP_VOLUME,
            capacity_orders=2,
            capacity_volume=100.0,
        )
        orders = [SimpleNamespace(id=i, total_volume_dm3=10.0) for i in range(6)]
        result = eng.select_orders(orders)
        self.assertEqual(len(result.orders), 6)
        self.assertFalse(eng.snapshot().is_capacity_reached)


class TestBasketsBestFit(unittest.TestCase):
    def test_best_fit_smallest_fitting_basket(self) -> None:
        baskets = [
            BasketWorking(basket_id=1, usable_volume=60.0),
            BasketWorking(basket_id=2, usable_volume=20.0),
            BasketWorking(basket_id=3, usable_volume=30.0),
            BasketWorking(basket_id=4, usable_volume=40.0),
        ]
        eng = _engine(CapacityStrategy.BASKETS, baskets=baskets)
        res = eng.accept(18.0, order_id=99)
        self.assertTrue(res.accepted)
        self.assertEqual(res.basket_id, 2)  # 20l — tightest fit

    def test_one_order_per_basket(self) -> None:
        baskets = [
            BasketWorking(basket_id=1, usable_volume=50.0),
            BasketWorking(basket_id=2, usable_volume=50.0),
        ]
        eng = _engine(CapacityStrategy.BASKETS, baskets=baskets)
        orders = [
            SimpleNamespace(id=1, total_volume_dm3=10.0),
            SimpleNamespace(id=2, total_volume_dm3=10.0),
            SimpleNamespace(id=3, total_volume_dm3=10.0),
        ]
        result = eng.select_orders(orders)
        self.assertEqual(len(result.orders), 2)
        self.assertEqual(len(result.basket_assignments), 2)
        self.assertTrue(eng.is_capacity_reached())


class TestOccupancyNotLifecycle(unittest.TestCase):
    def test_full_is_occupancy_not_status(self) -> None:
        eng = _engine(CapacityStrategy.LIMIT_ORDERS, capacity_orders=1)
        eng.accept(1.0, order_id=1)
        snap = eng.snapshot()
        self.assertEqual(snap.occupancy_state, OccupancyState.FULL)
        self.assertTrue(snap.is_capacity_reached)
        # Must not imply CartStatus
        self.assertNotEqual(snap.occupancy_state.value, "PICKING")


if __name__ == "__main__":
    unittest.main()
