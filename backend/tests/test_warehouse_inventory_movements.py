"""Tests for warehouse inventory movement ledger."""

from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.services.warehouse_inventory_movement_service import (
    MOVEMENT_DAMAGE,
    MOVEMENT_PICK,
    MOVEMENT_PUTAWAY,
    MOVEMENT_RECEIVING,
    disposition_to_inventory_bucket,
    mirror_product_warehouse_operation,
    record_inventory_movement,
)
from backend.services.warehouse_inventory_timeline_service import list_product_movement_timeline
from backend.services.stock_disposition import STOCK_DISPOSITION_REJECTED_STOCK, STOCK_DISPOSITION_SALEABLE


class DispositionBucketTests(unittest.TestCase):
    def test_saleable_maps_to_sellable(self):
        self.assertEqual(disposition_to_inventory_bucket(STOCK_DISPOSITION_SALEABLE), "sellable")

    def test_rejected_maps_to_damaged(self):
        self.assertEqual(disposition_to_inventory_bucket(STOCK_DISPOSITION_REJECTED_STOCK), "damaged")


class RecordMovementTests(unittest.TestCase):
    def test_record_inventory_movement_adds_row(self):
        db = MagicMock()
        row = record_inventory_movement(
            db,
            tenant_id=1,
            warehouse_id=2,
            product_id=99,
            movement_type=MOVEMENT_RECEIVING,
            quantity=3.0,
            inventory_bucket="receiving",
            operator_admin_id=7,
            source_document_type="PZ",
            source_document_id=10,
            source_line_id=20,
        )
        db.add.assert_called_once()
        self.assertEqual(row.movement_type, MOVEMENT_RECEIVING)
        self.assertEqual(row.quantity, 3.0)
        self.assertEqual(row.operator_admin_id, 7)


class MirrorProductOperationTests(unittest.TestCase):
    def test_mirror_receiving_operation(self):
        db = MagicMock()
        op = SimpleNamespace(
            tenant_id=1,
            warehouse_id=2,
            product_id=50,
            movement_type="RECEIVING",
            quantity=4.0,
            admin_id=3,
            source_location_id=None,
            target_location_id=8,
            stock_document_id=11,
            batch_number="LOT1",
            expiry_date=None,
            created_at=datetime.utcnow(),
            pick_id=None,
        )
        row = mirror_product_warehouse_operation(db, op)
        self.assertIsNotNone(row)
        db.add.assert_called()
        self.assertEqual(row.movement_type, MOVEMENT_RECEIVING)

    def test_mirror_putaway_operation(self):
        db = MagicMock()
        op = SimpleNamespace(
            tenant_id=1,
            warehouse_id=2,
            product_id=50,
            movement_type="PUTAWAY",
            quantity=2.0,
            admin_id=3,
            source_location_id=5,
            target_location_id=8,
            stock_document_id=11,
            batch_number=None,
            expiry_date=None,
            created_at=datetime.utcnow(),
            pick_id=None,
        )
        row = mirror_product_warehouse_operation(db, op)
        self.assertEqual(row.movement_type, MOVEMENT_PUTAWAY)

    def test_mirror_picking_operation(self):
        db = MagicMock()
        op = SimpleNamespace(
            tenant_id=1,
            warehouse_id=2,
            product_id=50,
            movement_type="PICKING",
            quantity=1.0,
            admin_id=3,
            source_location_id=8,
            target_location_id=None,
            stock_document_id=None,
            batch_number=None,
            expiry_date=None,
            created_at=datetime.utcnow(),
            pick_id=99,
        )
        row = mirror_product_warehouse_operation(db, op)
        self.assertEqual(row.movement_type, MOVEMENT_PICK)


class TimelineQueryTests(unittest.TestCase):
    def test_list_product_timeline_delegates_to_query(self):
        db = MagicMock()
        fake_row = SimpleNamespace(
            id=1,
            movement_type=MOVEMENT_RECEIVING,
            quantity=1.0,
            inventory_bucket="receiving",
            product_id=10,
            operator_admin_id=2,
            from_location_id=None,
            to_location_id=3,
            from_carrier_id=None,
            to_carrier_id=None,
            source_document_type="PZ",
            source_document_id=5,
            source_line_id=6,
            lot_number=None,
            serial_number=None,
            created_at=datetime.utcnow(),
            metadata_json=None,
        )
        chain = MagicMock()
        chain.filter.return_value = chain
        chain.order_by.return_value = chain
        chain.limit.return_value = chain
        chain.all.return_value = [fake_row]
        db.query.return_value = chain

        entries = list_product_movement_timeline(db, tenant_id=1, warehouse_id=2, product_id=10, limit=10)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].movement_type, MOVEMENT_RECEIVING)


if __name__ == "__main__":
    unittest.main()
