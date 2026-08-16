"""RW document lines split by PRODUCT × LOT × expiry."""

from __future__ import annotations

from datetime import date

from backend.services.inventory_lot_keys import NO_EXPIRY_SENTINEL
from backend.services.production_execution.rw_lot_lines import (
    RwIssueSlice,
    group_slices_by_lot,
    slices_from_committed_dicts,
)


def test_group_multi_lot_same_product():
    slices = [
        RwIssueSlice(product_id=3, quantity=6, location_id=1, batch_number="LOT-A", expiry_date=date(2027, 1, 1)),
        RwIssueSlice(product_id=3, quantity=4, location_id=2, batch_number="LOT-B", expiry_date=date(2027, 3, 1)),
    ]
    grouped = group_slices_by_lot(slices)
    assert len(grouped) == 2
    assert sum(s.quantity for s in grouped[(3, "LOT-A", date(2027, 1, 1))]) == 6
    assert sum(s.quantity for s in grouped[(3, "LOT-B", date(2027, 3, 1))]) == 4


def test_group_same_lot_merges_locations():
    slices = [
        RwIssueSlice(product_id=3, quantity=6, location_id=1, batch_number="LOT-A", expiry_date=date(2027, 1, 1)),
        RwIssueSlice(product_id=3, quantity=4, location_id=2, batch_number="LOT-A", expiry_date=date(2027, 1, 1)),
    ]
    grouped = group_slices_by_lot(slices)
    assert len(grouped) == 1
    assert sum(s.quantity for s in next(iter(grouped.values()))) == 10


def test_no_lot_product_empty_batch():
    slices = slices_from_committed_dicts(
        9,
        [
            {"location_id": 1, "quantity": 10, "batch_number": "", "expiry_date": None},
        ],
    )
    grouped = group_slices_by_lot(slices)
    assert len(grouped) == 1
    key = next(iter(grouped.keys()))
    assert key == (9, "", NO_EXPIRY_SENTINEL)


def test_same_lot_different_expiry_splits():
    slices = [
        RwIssueSlice(product_id=3, quantity=5, location_id=1, batch_number="LOT-A", expiry_date=date(2027, 1, 1)),
        RwIssueSlice(product_id=3, quantity=5, location_id=1, batch_number="LOT-A", expiry_date=date(2027, 6, 1)),
    ]
    grouped = group_slices_by_lot(slices)
    assert len(grouped) == 2
    assert sum(sum(s.quantity for s in g) for g in grouped.values()) == 10


def test_create_rw_lines_one_per_lot(db_session=None):
    """Lightweight: group + qty totals without full DB when fixture unavailable."""
    slices = [
        RwIssueSlice(product_id=3, quantity=6, location_id=1, batch_number="LOT-A", expiry_date=date(2027, 1, 1)),
        RwIssueSlice(product_id=3, quantity=4, location_id=1, batch_number="LOT-B", expiry_date=date(2027, 3, 1)),
    ]
    grouped = group_slices_by_lot(slices)
    assert sorted(sum(s.quantity for s in g) for g in grouped.values()) == [4, 6]
