"""Phase 2 inventory count — snapshots, differences, approval, reports."""

from __future__ import annotations

import unittest
from datetime import date

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.inventory import Inventory
from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_APPROVED,
    INV_STATUS_AWAITING_APPROVAL,
    INV_STATUS_IN_PROGRESS,
    INV_TYPE_FULL,
    LINE_STATUS_COUNTED,
)
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.inventory_count.snapshot import InventorySnapshot, InventorySnapshotStockLine
from backend.models.location import Location
from backend.models.product import Product
from backend.services.inventory_count.approval_service import approve_inventory_document, submit_for_approval
from backend.services.inventory_count.difference_service import classify_line_difference, difference_percent
from backend.services.inventory_count.document_service import create_inventory_document
from backend.services.inventory_count.line_materialization_service import materialize_document_lines_from_snapshot
from backend.services.inventory_count.kpi_service import recompute_document_kpis
from backend.services.inventory_count.report_service import _build_xlsx


class TestDifferenceEngine(unittest.TestCase):
    def test_difference_percent(self):
        self.assertAlmostEqual(difference_percent(100, 95), 5.0)
        self.assertAlmostEqual(difference_percent(0, 5), 100.0)

    def test_classify_thresholds(self):
        th = {"auto_approve_percent": 1.0, "supervisor_review_percent": 5.0, "mandatory_recount_percent": 10.0}
        self.assertEqual(classify_line_difference(expected=100, counted=99.5, thresholds=th), "auto_approve")
        self.assertEqual(classify_line_difference(expected=100, counted=94, thresholds=th), "supervisor_review")
        self.assertEqual(classify_line_difference(expected=100, counted=80, thresholds=th), "supervisor_review")


class TestSnapshotAndLines(unittest.TestCase):
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

    def test_materialize_lines_from_snapshot(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=1,
                number="INV-TEST-1",
                inventory_type=INV_TYPE_FULL,
                status=INV_STATUS_IN_PROGRESS,
                count_mode=COUNT_MODE_BLIND,
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)
            snap = InventorySnapshot(
                inventory_document_id=doc.id,
                tenant_id=1,
                warehouse_id=1,
                snapshot_kind="stock",
                row_count=1,
            )
            db.add(snap)
            db.flush()
            db.add(
                InventorySnapshotStockLine(
                    snapshot_id=snap.id,
                    location_id=10,
                    product_id=5,
                    quantity=12.0,
                )
            )
            db.commit()
            result = materialize_document_lines_from_snapshot(db, document=doc)
            db.commit()
            self.assertEqual(result["lines_created"], 1)
            line = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.inventory_document_id == doc.id).first()
            self.assertIsNotNone(line)
            assert line is not None
            self.assertAlmostEqual(float(line.expected_quantity), 12.0)


class TestApprovalWorkflow(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, code VARCHAR(16))"))
            conn.execute(text("INSERT INTO warehouses (id, code) VALUES (1, 'WH1')"))
        Product.__table__.create(self.engine, checkfirst=True)

    def test_submit_and_approve(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=1,
                number="INV-APPROVAL-1",
                inventory_type=INV_TYPE_FULL,
                status=INV_STATUS_IN_PROGRESS,
                count_mode=COUNT_MODE_BLIND,
            )
            db.add(doc)
            db.flush()
            db.add(
                InventoryDocumentLine(
                    inventory_document_id=doc.id,
                    location_id=10,
                    product_id=5,
                    expected_quantity=10.0,
                    counted_quantity=10.0,
                    status=LINE_STATUS_COUNTED,
                )
            )
            db.commit()
            db.refresh(doc)
            recompute_document_kpis(db, doc)
            db.commit()

            submit = submit_for_approval(db, tenant_id=1, document_id=doc.id, user_id=1)
            self.assertEqual(submit["status"], INV_STATUS_AWAITING_APPROVAL)

            approved = approve_inventory_document(db, tenant_id=1, document_id=doc.id, user_id=2)
            self.assertEqual(approved["status"], INV_STATUS_APPROVED)


class TestReportGeneration(unittest.TestCase):
    def test_build_xlsx_bytes(self):
        try:
            content = _build_xlsx(["A", "B"], [[1, 2]])
        except RuntimeError:
            self.skipTest("openpyxl not installed")
        self.assertTrue(content.startswith(b"PK"))


if __name__ == "__main__":
    unittest.main()
