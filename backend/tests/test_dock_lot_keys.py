"""PZ dock lot keys: receiving and putaway must use the same inventory identity."""

from datetime import date

from services.inventory_lot_keys import NO_EXPIRY_SENTINEL, dock_lot_keys_for_pz_line


class _Line:
    def __init__(self, batch_number=None, expiry_date=None):
        self.batch_number = batch_number
        self.expiry_date = expiry_date


def test_dock_lot_uses_line_batch_even_without_product_flags():
    row = _Line(batch_number=" 157894 ", expiry_date=date(2026, 4, 1))
    bn, ed = dock_lot_keys_for_pz_line(row)
    assert bn == "157894"
    assert ed == date(2026, 4, 1)


def test_dock_lot_no_expiry_sentinel_when_missing():
    row = _Line(batch_number="", expiry_date=None)
    bn, ed = dock_lot_keys_for_pz_line(row)
    assert bn == ""
    assert ed == NO_EXPIRY_SENTINEL
