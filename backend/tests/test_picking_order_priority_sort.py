"""Order.priority_color ranks picking batch candidates ahead of date/location sort."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from backend.services.picking_config_service import (
    order_priority_rank,
    sort_orders_for_picking_batch,
)


def test_priority_color_ranks_ahead_of_date_sort():
    older = SimpleNamespace(id=1, priority_color=None, order_date=datetime(2024, 1, 1), created_at=None)
    newer_priority = SimpleNamespace(
        id=2, priority_color="red", order_date=datetime(2025, 6, 1), created_at=None
    )
    mid = SimpleNamespace(id=3, priority_color="orange", order_date=datetime(2024, 6, 1), created_at=None)

    ranked = sort_orders_for_picking_batch([older, newer_priority, mid], order_sort="date")
    assert [o.id for o in ranked] == [2, 3, 1]
    assert order_priority_rank(newer_priority) < order_priority_rank(mid) < order_priority_rank(older)


def test_same_priority_uses_configured_date_order():
    a = SimpleNamespace(id=10, priority_color="red", order_date=datetime(2024, 3, 1), created_at=None)
    b = SimpleNamespace(id=11, priority_color="red", order_date=datetime(2024, 1, 1), created_at=None)
    ranked = sort_orders_for_picking_batch([a, b], order_sort="date")
    assert [o.id for o in ranked] == [11, 10]
