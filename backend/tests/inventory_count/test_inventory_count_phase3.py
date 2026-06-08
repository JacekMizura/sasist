"""Phase 3 inventory count — permissions, posting safety, concurrency, audit."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_APPROVED,
    INV_STATUS_IN_PROGRESS,
    INV_STATUS_POSTED,
    INV_TYPE_FULL,
    LINE_STATUS_COUNTED,
)
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.inventory_count.session import InventorySession
from backend.models.product import Product
from backend.services.inventory_count.adjustment_service import post_inventory_adjustments
from backend.services.inventory_count.audit_service import forbid_audit_mutation, log_inventory_audit
from backend.services.inventory_count.concurrency_service import acquire_line_count_lock, assert_line_version
from backend.services.inventory_count.errors import (
    InventoryConcurrentUpdateError,
    InventoryDuplicatePostError,
    InventoryLineLockedError,
)
from backend.services.inventory_count.permissions import INVENTORY_ROLE_PRESETS, PERM_POST, PERM_VIEW


class TestInventoryPermissions(unittest.TestCase):
    def test_role_presets_defined(self):
        self.assertIn("inventory_operator", INVENTORY_ROLE_PRESETS)
        self.assertIn(PERM_VIEW, INVENTORY_ROLE_PRESETS["inventory_viewer"])
        self.assertIn(PERM_POST, INVENTORY_ROLE_PRESETS["inventory_manager"])


class TestPostingSafety(unittest.TestCase):
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

    def test_idempotent_post_when_already_posted(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=1,
                number="INV-POST-1",
                inventory_type=INV_TYPE_FULL,
                status=INV_STATUS_POSTED,
                count_mode=COUNT_MODE_BLIND,
                posted_at=datetime.utcnow(),
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)
            result = post_inventory_adjustments(db, tenant_id=1, document_id=doc.id, idempotency_key="key-1")
            self.assertTrue(result.get("idempotent"))

    def test_duplicate_post_blocked_when_stock_docs_linked(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=1,
                number="INV-POST-2",
                inventory_type=INV_TYPE_FULL,
                status=INV_STATUS_APPROVED,
                count_mode=COUNT_MODE_BLIND,
                rw_stock_document_id=999,
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)
            with self.assertRaises(InventoryDuplicatePostError):
                post_inventory_adjustments(db, tenant_id=1, document_id=doc.id)


class TestConcurrentCounting(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, code VARCHAR(16))"))
            conn.execute(text("INSERT INTO warehouses (id, code) VALUES (1, 'WH1')"))

    def test_line_lock_conflict(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=1,
                number="INV-LOCK-1",
                inventory_type=INV_TYPE_FULL,
                status=INV_STATUS_IN_PROGRESS,
                count_mode=COUNT_MODE_BLIND,
            )
            db.add(doc)
            db.flush()
            s1 = InventorySession(
                inventory_document_id=doc.id,
                tenant_id=1,
                warehouse_id=1,
                status="active",
            )
            s2 = InventorySession(
                inventory_document_id=doc.id,
                tenant_id=1,
                warehouse_id=1,
                status="active",
            )
            db.add_all([s1, s2])
            db.flush()
            line = InventoryDocumentLine(
                inventory_document_id=doc.id,
                location_id=1,
                product_id=1,
                expected_quantity=5,
                status=LINE_STATUS_COUNTED,
            )
            db.add(line)
            db.commit()
            db.refresh(line)
            db.refresh(s1)
            db.refresh(s2)

            acquire_line_count_lock(db, line=line, session_id=s1.id, user_id=1)
            line.count_lock_at = datetime.utcnow()
            db.commit()
            db.refresh(line)

            with self.assertRaises(InventoryLineLockedError):
                acquire_line_count_lock(db, line=line, session_id=s2.id, user_id=2)

    def test_optimistic_version_mismatch(self):
        line = InventoryDocumentLine(
            inventory_document_id=1,
            location_id=1,
            product_id=1,
            expected_quantity=1,
            version=3,
        )
        with self.assertRaises(InventoryConcurrentUpdateError):
            assert_line_version(line, expected_version=2)


class TestAuditImmutability(unittest.TestCase):
    def test_forbid_mutation_guard(self):
        with self.assertRaises(RuntimeError):
            forbid_audit_mutation()

    def test_audit_logs_previous_and_next_state(self):
        engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(engine)
        Session = sessionmaker(bind=engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
        with Session() as db:
            row = log_inventory_audit(
                db,
                tenant_id=1,
                action="test.action",
                previous_state={"qty": 1},
                next_state={"qty": 2},
            )
            db.commit()
            self.assertIn("qty", row.previous_state_json or "")
            self.assertIn("qty", row.next_state_json or "")


if __name__ == "__main__":
    unittest.main()
