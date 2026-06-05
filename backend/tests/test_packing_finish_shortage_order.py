"""
Pakowanie po workflow braków — walidacja finish vs surowe ``quantity``.

  python -m pytest backend/tests/test_packing_finish_shortage_order.py -q
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_packing_service import (
    PackingScanError,
    _assert_order_packable_for_finish,
    _packing_finish_validation_snapshot,
    order_item_required_pack_qty,
)


def _line(**kwargs):
    defaults = {
        "id": 1,
        "product_id": 10,
        "quantity": 3,
        "packing_quantity_packed": 0,
        "oms_removed_qty": 0.0,
        "oms_replaced_qty": 0.0,
        "oms_line_status": None,
        "replaced_from_order_item_id": None,
        "parent_bundle_order_item_id": None,
        "metadata_json": None,
        "wms_shortage_declared_qty": 0.0,
        "wms_picking_line_missing_qty": 0.0,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _order(**kwargs):
    defaults = {
        "id": 1171,
        "tenant_id": 1,
        "warehouse_id": 1,
        "picking_finished_at": "2026-06-04T12:00:00",
        "items": [],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestPackingFinishShortageOrder(unittest.TestCase):
    def test_required_pack_qty_after_oms_partial_removal(self):
        order = _order(items=[_line(oms_removed_qty=1.0)])
        db = MagicMock()
        with patch(
            "backend.services.fulfillment_event_service.line_picked_sum_for_order",
            return_value=2.0,
        ):
            self.assertEqual(order_item_required_pack_qty(db, order, order.items[0]), 2)

    def test_packable_when_two_of_three_picked_one_removed(self):
        order = _order(
            items=[_line(packing_quantity_packed=2, oms_removed_qty=1.0)],
        )
        db = MagicMock()
        with (
            patch(
                "backend.services.fulfillment_event_service.line_picked_sum_for_order",
                return_value=2.0,
            ),
            patch(
                "backend.services.wms_packing_service._order_item_operational_missing_qty",
                return_value=0.0,
            ),
            patch(
                "backend.services.braki_order_state_service.count_issue_queue_operational_lines",
                return_value=(0, 0),
            ),
        ):
            snap = _packing_finish_validation_snapshot(db, order, log=False)
            self.assertTrue(snap["lines_packed_complete"])
            self.assertTrue(snap["packable"])
            _assert_order_packable_for_finish(db, order)

    def test_not_packable_with_unresolved_shortage(self):
        order = _order(items=[_line(packing_quantity_packed=2)])
        db = MagicMock()
        with (
            patch(
                "backend.services.fulfillment_event_service.line_picked_sum_for_order",
                return_value=2.0,
            ),
            patch(
                "backend.services.wms_packing_service._order_item_operational_missing_qty",
                return_value=1.0,
            ),
            patch(
                "backend.services.braki_order_state_service.count_issue_queue_operational_lines",
                return_value=(0, 0),
            ),
        ):
            snap = _packing_finish_validation_snapshot(db, order, log=False)
            self.assertFalse(snap["packable"])
            with self.assertRaises(PackingScanError) as ctx:
                _assert_order_packable_for_finish(db, order)
            self.assertEqual(ctx.exception.code, "UNRESOLVED_SHORTAGES")

    def test_removed_line_does_not_block(self):
        order = _order(
            items=[
                _line(id=1, packing_quantity_packed=2, oms_removed_qty=1.0),
                _line(id=2, quantity=0, oms_removed_qty=2.0, metadata_json='{"oms_line_removed": true}'),
            ],
        )
        db = MagicMock()
        with (
            patch(
                "backend.services.fulfillment_event_service.line_picked_sum_for_order",
                return_value=2.0,
            ),
            patch(
                "backend.services.wms_packing_service._order_item_operational_missing_qty",
                return_value=0.0,
            ),
            patch(
                "backend.services.braki_order_state_service.count_issue_queue_operational_lines",
                return_value=(0, 0),
            ),
        ):
            snap = _packing_finish_validation_snapshot(db, order, log=False)
            self.assertEqual(snap["removed_lines"], 1)
            self.assertTrue(snap["packable"])


if __name__ == "__main__":
    unittest.main()
