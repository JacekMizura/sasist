"""Unit tests for supplier / WM tier price selection on purchase order lines."""

from backend.services.delivery_line_pricing import pick_unit_net_from_steps


def test_pick_unit_net_thresholds():
    steps = [(1.0, 10.0), (100.0, 9.5), (500.0, 9.1), (1000.0, 8.7)]
    assert pick_unit_net_from_steps(steps, 1.0)[0] == 10.0
    assert pick_unit_net_from_steps(steps, 100.0)[0] == 9.5
    # 350 is in the 100–499 band: highest threshold with qty_from ≤ qty is 100 → 9.5
    assert pick_unit_net_from_steps(steps, 350.0)[0] == 9.5
    assert pick_unit_net_from_steps(steps, 1600.0)[0] == 8.7


def test_pick_unit_net_empty():
    assert pick_unit_net_from_steps([], 100.0) == (None, None)
