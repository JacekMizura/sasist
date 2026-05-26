"""Carrier detail items: separate rows per batch / expiry / serial."""

from datetime import date

from services.inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number


def _lot_key(product_id: int, batch_number: str | None, expiry_date, serial_number: str | None) -> tuple:
    bn = normalize_batch_number(batch_number)
    ed = expiry_date if expiry_date is not None else NO_EXPIRY_SENTINEL
    sn = (serial_number or "").strip()
    return (product_id, bn, ed, sn)


def test_different_batches_are_distinct_keys():
    k1 = _lot_key(1, "157894", date(2026, 4, 1), None)
    k2 = _lot_key(1, "999111", date(2026, 8, 1), None)
    assert k1 != k2


def test_serial_splits_rows():
    base = _lot_key(1, "157894", date(2026, 4, 1), None)
    serial = _lot_key(1, "157894", date(2026, 4, 1), "SN-001")
    assert base != serial
