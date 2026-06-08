"""Start inventory document — locks, materialization, structured errors."""

from __future__ import annotations

import unittest
from datetime import date

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.inventory import Inventory
from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_DRAFT,
    INV_STATUS_IN_PROGRESS,
    INV_TYPE_FULL,
    MOVEMENT_POLICY_BLOCK_PICK,
)
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.location_lock import InventoryLocationLock
from backend.models.location import Location
from backend.models.product import Product
from backend.services.inventory_count.document_service import start_inventory_document
from backend.services.inventory_count.errors import InventoryScopeNotReadyError
from backend.services.inventory_count.location_lock_service import apply_location_locks_for_document


class TestInventoryStartDocument(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, code VARCHAR(16))"))
            conn.execute(text("INSERT INTO warehouses (id, code) VALUES (1, 'WH1')"))
            for tbl in ("locations", "products"):
                conn.execute(text(f"DROP TABLE IF EXISTS {tbl}"))
        Location.__table__.create(self.engine, checkfirst=True)
        Product.__table__.create(self.engine, checkfirst=True)
        with self.Session() as db:
            db.add(Location(id=10, warehouse_id=1, name="A-01", is_active=True))
            db.add(Product(id=5, tenant_id=1, name="Prod", sku="SKU1", ean="5900000000001"))
            db.commit()
        with self.engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS inventory (
                        id INTEGER PRIMARY KEY, tenant_id INTEGER, warehouse_id INTEGER,
                        location_id INTEGER, product_id INTEGER, quantity REAL,
                        batch_number VARCHAR(128), stock_disposition VARCHAR(32),
                        carrier_id INTEGER, location_uuid VARCHAR(64), expiry_date DATE,
                        created_at TIMESTAMP, updated_at TIMESTAMP
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "INSERT INTO inventory (id, tenant_id, warehouse_id, location_id, product_id, quantity) "
                    "VALUES (1, 1, 1, 10, 5, 12.0)"
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS stock_reservations (
                        id INTEGER PRIMARY KEY, tenant_id INTEGER, order_id INTEGER,
                        product_id INTEGER, location_id INTEGER, quantity REAL,
                        status VARCHAR(20), batch_number VARCHAR(128), expiry_date DATE,
                        created_at TIMESTAMP, updated_at TIMESTAMP
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS inventory_serials (
                        id INTEGER PRIMARY KEY, tenant_id INTEGER, product_id INTEGER,
                        serial_number VARCHAR(128), warehouse_id INTEGER, location_id INTEGER,
                        status VARCHAR(32), batch_number VARCHAR(128), expiry_date DATE,
                        stock_disposition VARCHAR(32)
                    )
                    """
                )
            )

    def test_start_with_block_picking_creates_locks(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=1,
                number="INV-START-1",
                inventory_type=INV_TYPE_FULL,
                status=INV_STATUS_DRAFT,
                count_mode=COUNT_MODE_BLIND,
                lock_mode=MOVEMENT_POLICY_BLOCK_PICK,
                filters_json='{"scope_mode":"full"}',
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)

            result = start_inventory_document(db, tenant_id=1, document_id=doc.id, user_id=None)
            self.assertEqual(result["status"], INV_STATUS_IN_PROGRESS)
            locks = (
                db.query(InventoryLocationLock)
                .filter(InventoryLocationLock.inventory_document_id == doc.id)
                .all()
            )
            self.assertEqual(len(locks), 1)
            self.assertEqual(int(locks[0].location_id), 10)

    def test_start_rejects_empty_product_scope(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=1,
                number="INV-START-2",
                inventory_type="PARTIAL",
                status=INV_STATUS_DRAFT,
                count_mode=COUNT_MODE_BLIND,
                lock_mode="allow_operations",
                filters_json='{"scope_mode":"products","product_ids":[]}',
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)

            with self.assertRaises(InventoryScopeNotReadyError) as ctx:
                start_inventory_document(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(ctx.exception.code, "scope_not_configured")


if __name__ == "__main__":
    unittest.main()
