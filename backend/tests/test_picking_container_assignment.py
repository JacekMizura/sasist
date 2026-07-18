"""
Testy Order-to-Container Assignment Engine (bez bazy).

Uruchomienie z katalogu głównego repo:
  python -m pytest backend/tests/test_picking_container_assignment.py -q
lub:
  cd backend && python -m pytest tests/test_picking_container_assignment.py -q
"""

from datetime import datetime, timedelta

from backend.schemas.picking_container_assignment import (
    PickingBasketSlotIn,
    PickingCartSessionAssignmentRequest,
    PickingOrderLineVolumeIn,
    PickingOrderVolumeIn,
)
from backend.services.picking_container_assignment import (
    assign_orders_to_baskets_best_fit,
    compute_order_total_volume_dm3,
    volume_dm3_from_box_cm,
)


def test_volume_box_cm_to_dm3():
    assert abs(volume_dm3_from_box_cm(10, 20, 30) - 6.0) < 1e-6


def test_compute_order_from_lines():
    o = PickingOrderVolumeIn(
        order_id=1,
        order_date=None,
        lines=[
            PickingOrderLineVolumeIn(product_id=1, quantity=2, volume_dm3_per_unit=1.5),
            PickingOrderLineVolumeIn(product_id=2, quantity=1, volume_dm3_per_unit=3.0),
        ],
    )
    assert compute_order_total_volume_dm3(o, fallback_dm3=0.05) == 6.0


def test_best_fit_one_order_per_basket():
    req = PickingCartSessionAssignmentRequest(
        cart_id=10,
        baskets=[
            PickingBasketSlotIn(basket_id=101, capacity_volume_dm3=100.0),
            PickingBasketSlotIn(basket_id=102, capacity_volume_dm3=50.0),
            PickingBasketSlotIn(basket_id=103, capacity_volume_dm3=30.0),
        ],
        orders=[
            PickingOrderVolumeIn(order_id=1, total_volume_dm3=30.0),
            PickingOrderVolumeIn(order_id=2, total_volume_dm3=40.0),
            PickingOrderVolumeIn(order_id=3, total_volume_dm3=25.0),
        ],
        sort_orders_by="volume_asc",
    )
    res = assign_orders_to_baskets_best_fit(req)
    assert len(res.baskets) == 3
    by_basket = {row.basket_id: row.assigned_order_ids for row in res.baskets}
    assert by_basket[103] == [3]
    assert by_basket[102] == [1]
    assert by_basket[101] == [2]
    assert res.unassigned_orders == []


def test_oversized_order():
    req = PickingCartSessionAssignmentRequest(
        cart_id=1,
        baskets=[
            PickingBasketSlotIn(basket_id=1, capacity_volume_dm3=5.0),
            PickingBasketSlotIn(basket_id=2, capacity_volume_dm3=8.0),
        ],
        orders=[PickingOrderVolumeIn(order_id=99, total_volume_dm3=10.0)],
    )
    res = assign_orders_to_baskets_best_fit(req)
    assert len(res.unassigned_orders) == 1
    assert res.unassigned_orders[0].reason == "oversized"
    assert res.unassigned_orders[0].order_id == 99


def test_no_capacity_remaining():
    req = PickingCartSessionAssignmentRequest(
        cart_id=1,
        baskets=[PickingBasketSlotIn(basket_id=1, capacity_volume_dm3=10.0)],
        orders=[
            PickingOrderVolumeIn(order_id=1, total_volume_dm3=6.0),
            PickingOrderVolumeIn(order_id=2, total_volume_dm3=6.0),
        ],
    )
    res = assign_orders_to_baskets_best_fit(req)
    assigned = [row for row in res.baskets if row.assigned_order_ids]
    assert len(assigned) == 1
    assert len(assigned[0].assigned_order_ids) == 1
    assert len(res.unassigned_orders) == 1
    assert res.unassigned_orders[0].reason == "no_capacity_remaining"


def test_sort_date_asc():
    t0 = datetime(2024, 1, 1)
    req = PickingCartSessionAssignmentRequest(
        cart_id=1,
        baskets=[
            PickingBasketSlotIn(basket_id=1, capacity_volume_dm3=50.0),
            PickingBasketSlotIn(basket_id=2, capacity_volume_dm3=50.0),
        ],
        orders=[
            PickingOrderVolumeIn(order_id=2, order_date=t0 + timedelta(days=1), total_volume_dm3=1.0),
            PickingOrderVolumeIn(order_id=1, order_date=t0, total_volume_dm3=1.0),
        ],
        sort_orders_by="date_asc",
    )
    res = assign_orders_to_baskets_best_fit(req)
    assigned_ids = [oid for row in res.baskets for oid in row.assigned_order_ids]
    assert assigned_ids == [1, 2]
