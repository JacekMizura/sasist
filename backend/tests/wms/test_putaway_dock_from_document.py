"""Putaway must not block on empty dock inventory when document line has remaining qty."""

from __future__ import annotations

import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.inventory_lot_keys import NO_EXPIRY_SENTINEL
from backend.services.wms_putaway_service import (
    _ensure_dock_inventory_for_putaway,
    _transfer_from_dock_to_location,
    sync_dock_inventory_from_document_line,
)


class PutawayDockFromDocumentTests(unittest.TestCase):
    def test_sync_dock_skips_without_receiving_location(self) -> None:
        db = MagicMock()
        doc = SimpleNamespace(location_id=None, warehouse_id=1)
        line = SimpleNamespace(product_id=10)
        sync_dock_inventory_from_document_line(
            db, tenant_id=1, doc=doc, line=line, quantity=3.0,
        )
        db.add.assert_not_called()

    @patch("backend.services.wms_putaway_service.upsert_dock_inventory_for_loose_receipt")
    def test_sync_dock_materializes_loose_stock(self, upsert_mock) -> None:
        db = MagicMock()
        doc = SimpleNamespace(location_id=5, warehouse_id=1)
        line = SimpleNamespace(
            product_id=10,
            batch_number="",
            expiry_date=NO_EXPIRY_SENTINEL,
            stock_disposition="SALEABLE",
            return_disposition=None,
        )
        sync_dock_inventory_from_document_line(
            db, tenant_id=1, doc=doc, line=line, quantity=2.0,
        )
        upsert_mock.assert_called_once()
        self.assertEqual(upsert_mock.call_args.kwargs["add_qty"], 2.0)
        self.assertEqual(upsert_mock.call_args.kwargs["location_id"], 5)

    @patch("backend.services.wms_putaway_service.sync_dock_inventory_from_document_line")
    @patch("backend.services.wms_putaway_service._sum_dock_inventory", return_value=0.0)
    def test_ensure_backfills_from_document_line(self, _sum_mock, sync_mock) -> None:
        db = MagicMock()
        row = SimpleNamespace(id=1, received_quantity=5.0, quantity_putaway=0.0, product_id=10)
        doc = SimpleNamespace(warehouse_id=1, location_id=5)
        _ensure_dock_inventory_for_putaway(
            db,
            tenant_id=1,
            row=row,
            doc=doc,
            dock_id=5,
            quantity=3.0,
            from_carrier_id=None,
            bn="",
            ed_store=NO_EXPIRY_SENTINEL,
            sd="SALEABLE",
        )
        sync_mock.assert_called_once()
        self.assertEqual(sync_mock.call_args.kwargs["quantity"], 3.0)
        db.flush.assert_called_once()

    @patch("backend.services.wms_putaway_service._ensure_dock_inventory_for_putaway")
    @patch("backend.services.wms_putaway_service._document_line_putaway_remaining", return_value=5.0)
    def test_transfer_retries_ensure_before_dock_error(self, _rem_mock, ensure_mock) -> None:
        db = MagicMock()
        inv = SimpleNamespace(quantity=3.0, id=1)
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        q.all.side_effect = [[], [inv]]
        db.query.return_value = q

        row = SimpleNamespace(id=1, product_id=10, received_quantity=5.0)
        doc = SimpleNamespace(warehouse_id=1)

        _transfer_from_dock_to_location(
            db,
            tenant_id=1,
            row=row,
            doc=doc,
            dock_id=5,
            target_location_id=99,
            loc_uuid=None,
            quantity=3.0,
            from_carrier_id=None,
            to_carrier_id=None,
            bn="",
            ed_store=NO_EXPIRY_SENTINEL,
            sd="SALEABLE",
        )
        ensure_mock.assert_called_once()
        self.assertEqual(ensure_mock.call_args.kwargs["quantity"], 3.0)


if __name__ == "__main__":
    unittest.main()
