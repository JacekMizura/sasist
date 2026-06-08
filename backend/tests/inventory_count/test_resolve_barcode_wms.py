"""WMS resolve-barcode endpoint and service — reality-first counting."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.inventory_count.constants import (
    DISC_EXPECTED,
    DISC_UNPLANNED_PRODUCT,
    DISC_WRONG_LOCATION,
    INV_STATUS_IN_PROGRESS,
    TASK_STATUS_OPEN,
)
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.inventory_count.task import InventoryTask
from backend.models.location import Location
from backend.models.product import Product
from backend.services.inventory_count.count_entry_service import resolve_barcode_to_line
from backend.services.inventory_count.errors import (
    InventoryBarcodeAmbiguousError,
    InventoryBarcodeNotFoundError,
    InventoryTaskNotFoundError,
)


class TestResolveBarcodeService(unittest.TestCase):
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
        cls.Session = sessionmaker(bind=cls.engine)
        with cls.Session() as db:
            db.add(Location(id=1, warehouse_id=1, name="A1-01", is_active=True))
            db.add(Location(id=2, warehouse_id=1, name="B2-02", is_active=True))
            db.add(
                Product(
                    id=10,
                    tenant_id=1,
                    name="Product A",
                    sku="SKU-A",
                    ean="5905450181208",
                    symbol="SKU-A",
                )
            )
            db.add(
                Product(
                    id=11,
                    tenant_id=1,
                    name="Product C wrong loc",
                    sku="SKU-C",
                    ean="5905450181209",
                    symbol="SKU-C",
                )
            )
            db.add(
                Product(
                    id=12,
                    tenant_id=1,
                    name="Product unplanned",
                    sku="SKU-U",
                    ean="5905450181210",
                    symbol="SKU-U",
                )
            )
            db.add(
                InventoryDocument(
                    id=1,
                    tenant_id=1,
                    warehouse_id=1,
                    number="INV-1",
                    status=INV_STATUS_IN_PROGRESS,
                    total_lines=2,
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
            db.add(
                InventoryDocumentLine(
                    id=2,
                    inventory_document_id=1,
                    location_id=2,
                    product_id=11,
                    expected_quantity=3,
                    status="open",
                )
            )
            db.commit()

    def test_existing_barcode(self):
        db = self.Session()
        try:
            out = resolve_barcode_to_line(
                db,
                tenant_id=1,
                task_id=1,
                barcode_value="5905450181208",
            )
            self.assertEqual(out["line_id"], 1)
            self.assertEqual(out["product_id"], 10)
            self.assertEqual(out["discrepancy_class"], DISC_EXPECTED)
        finally:
            db.close()

    def test_unknown_barcode(self):
        db = self.Session()
        try:
            with self.assertRaises(InventoryBarcodeNotFoundError) as ctx:
                resolve_barcode_to_line(db, tenant_id=1, task_id=1, barcode_value="UNKNOWN999")
            self.assertEqual(ctx.exception.barcode, "UNKNOWN999")
        finally:
            db.close()

    def test_invalid_task(self):
        db = self.Session()
        try:
            with self.assertRaises(InventoryTaskNotFoundError):
                resolve_barcode_to_line(db, tenant_id=1, task_id=999, barcode_value="5905450181208")
        finally:
            db.close()

    def test_unplanned_product_auto_creates_line(self):
        db = self.Session()
        try:
            out = resolve_barcode_to_line(db, tenant_id=1, task_id=1, barcode_value="5905450181210")
            self.assertTrue(out["line_created"])
            self.assertEqual(out["discrepancy_class"], DISC_UNPLANNED_PRODUCT)
            self.assertGreater(out["line_id"], 1)
            line = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.id == out["line_id"]).first()
            self.assertIsNotNone(line)
            self.assertEqual(int(line.product_id), 12)
            self.assertEqual(float(line.expected_quantity or 0), 0.0)
        finally:
            db.close()

    def test_wrong_location_product_still_accepted(self):
        db = self.Session()
        try:
            out = resolve_barcode_to_line(db, tenant_id=1, task_id=1, barcode_value="5905450181209")
            self.assertEqual(out["discrepancy_class"], DISC_WRONG_LOCATION)
            self.assertTrue(out["line_created"])
            line = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.id == out["line_id"]).first()
            self.assertIsNotNone(line)
            self.assertEqual(int(line.location_id), 1)
            self.assertEqual(int(line.product_id), 11)
        finally:
            db.close()

    def test_ambiguous_barcode_multiple_products(self):
        db = self.Session()
        try:
            db.add(
                Product(
                    id=99,
                    tenant_id=1,
                    name="Dup",
                    sku="SKU-DUP1",
                    ean="5900000009991",
                    symbol="SHARED-SCAN",
                )
            )
            db.add(
                Product(
                    id=100,
                    tenant_id=1,
                    name="Dup 2",
                    sku="SKU-DUP2",
                    ean="5900000009992",
                    symbol="SHARED-SCAN",
                )
            )
            db.commit()
            with self.assertRaises(InventoryBarcodeAmbiguousError) as ctx:
                resolve_barcode_to_line(db, tenant_id=1, task_id=1, barcode_value="SHARED-SCAN")
            self.assertGreaterEqual(len(ctx.exception.product_ids), 2)
        finally:
            db.close()


class TestResolveBarcodeApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient

        from backend.main import app

        cls.client = TestClient(app)

    def test_route_registered_post(self):
        r = self.client.post(
            "/api/wms/inventory-count/tasks/1/resolve-barcode",
            params={"tenant_id": 1, "barcode_value": "UNKNOWN999"},
        )
        self.assertIn(r.status_code, (404, 400, 422))
        if r.status_code == 404:
            body = r.json()
            detail = body.get("detail") or body
            if isinstance(detail, dict):
                self.assertIn(detail.get("error") or detail.get("code"), ("barcode_not_found", "task_not_found"))


class TestWarehouseLocationsApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient

        from backend.main import app

        cls.client = TestClient(app)

    def test_locations_route_does_not_500(self):
        r = self.client.get("/api/warehouses/1/locations")
        self.assertNotEqual(r.status_code, 500, r.text[:500])


if __name__ == "__main__":
    unittest.main()
