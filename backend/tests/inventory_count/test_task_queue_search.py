"""Task queue search regression."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.app_user import AppUser
from backend.models.inventory_count.constants import INV_STATUS_IN_PROGRESS, TASK_STATUS_OPEN
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.inventory_count.task import InventoryTask
from backend.models.location import Location
from backend.models.product import Product
from backend.services.inventory_count.wms_task_queue_service import list_tasks_paginated


class TestTaskQueueSearch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        with cls.engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE warehouses (id INTEGER PRIMARY KEY, tenant_id INTEGER)"))
            conn.execute(text("INSERT INTO warehouses (id, tenant_id) VALUES (1, 1)"))
        ensure_inventory_count_schema(cls.engine)
        Location.__table__.create(cls.engine, checkfirst=True)
        Product.__table__.create(cls.engine, checkfirst=True)
        AppUser.__table__.create(cls.engine, checkfirst=True)
        cls.Session = sessionmaker(bind=cls.engine)
        with cls.Session() as db:
            db.add(Location(id=1, warehouse_id=1, name="A1-01", is_active=True))
            db.add(Product(id=10, tenant_id=1, name="Test Product", sku="SKU1", ean="5900000001", symbol="SKU1"))
            db.add(
                InventoryDocument(
                    id=1,
                    tenant_id=1,
                    warehouse_id=1,
                    number="INV-1",
                    status=INV_STATUS_IN_PROGRESS,
                    total_lines=1,
                    counted_lines=0,
                    difference_lines=0,
                    coverage_percent=0,
                )
            )
            db.add(
                InventoryTask(
                    id=1,
                    inventory_document_id=1,
                    tenant_id=1,
                    warehouse_id=1,
                    location_id=1,
                    task_number="INV-1-T0001",
                    status=TASK_STATUS_OPEN,
                    priority=50,
                    line_count=1,
                    counted_line_count=0,
                    progress_percent=0,
                    sequence_no=1,
                )
            )
            db.add(
                InventoryDocumentLine(
                    id=1,
                    inventory_document_id=1,
                    location_id=1,
                    product_id=10,
                    expected_quantity=5,
                    status="open",
                )
            )
            db.commit()

    def test_queue_without_search(self):
        db = self.Session()
        try:
            out = list_tasks_paginated(db, tenant_id=1, warehouse_id=1)
            self.assertEqual(out["total"], 1)
        finally:
            db.close()

    def test_queue_with_location_search(self):
        db = self.Session()
        try:
            out = list_tasks_paginated(db, tenant_id=1, warehouse_id=1, search="A1")
            self.assertGreaterEqual(out["total"], 1)
        finally:
            db.close()

    def test_queue_with_product_search_empty_ok(self):
        db = self.Session()
        try:
            out = list_tasks_paginated(db, tenant_id=1, warehouse_id=1, search="ZZZNOMATCH")
            self.assertEqual(out["total"], 0)
            self.assertEqual(out["items"], [])
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
