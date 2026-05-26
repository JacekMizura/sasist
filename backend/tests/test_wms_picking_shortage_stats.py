"""
Statystyki braków po finalizacji wózka (logika bez bazy).

Uruchomienie:
  python -m pytest backend/tests/test_wms_picking_shortage_stats.py -q
"""

from backend.services.wms_picking_product_list_service import cohort_shortage_stats_from_orders


class _DummyItem:
    __slots__ = ("product_id", "wms_picking_line_missing_qty", "oms_line_status")

    def __init__(self, product_id: int, missing: float, oms_line_status: str | None = None):
        self.product_id = product_id
        self.wms_picking_line_missing_qty = missing
        self.oms_line_status = oms_line_status


class _DummyOrder:
    __slots__ = ("items",)

    def __init__(self, items: list):
        self.items = items


def test_cohort_shortage_empty():
    assert cohort_shortage_stats_from_orders([]) == (0, 0.0)
    assert cohort_shortage_stats_from_orders([_DummyOrder([])]) == (0, 0.0)


def test_cohort_shortage_one_product_one_unit():
    o = _DummyOrder([_DummyItem(10, 1.0)])
    assert cohort_shortage_stats_from_orders([o]) == (1, 1.0)


def test_cohort_shortage_same_product_two_lines_counts_one_sku():
    o = _DummyOrder([_DummyItem(5, 1.0), _DummyItem(5, 2.0)])
    assert cohort_shortage_stats_from_orders([o]) == (1, 3.0)


def test_cohort_shortage_two_products():
    o = _DummyOrder([_DummyItem(1, 0.5), _DummyItem(2, 1.5)])
    assert cohort_shortage_stats_from_orders([o]) == (2, 2.0)


def test_cohort_shortage_skips_replaced_lines():
    o = _DummyOrder(
        [
            _DummyItem(1, 2.0, oms_line_status="REPLACED"),
            _DummyItem(2, 1.0, None),
        ]
    )
    assert cohort_shortage_stats_from_orders([o]) == (1, 1.0)
