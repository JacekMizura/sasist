"""Inventory dashboard — fault tolerance and empty-state tests."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_DRAFT,
    INV_STATUS_IN_PROGRESS,
    INV_TYPE_FULL,
)
from backend.models.inventory_count.document import InventoryDocument
from backend.services.inventory_count.dashboard_schema_service import audit_inventory_dashboard_schema
from backend.services.inventory_count.dashboard_service import build_inventory_dashboard
from backend.services.inventory_count.document_service import _doc_to_dict


class TestInventoryDashboard(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, code VARCHAR(16))"))
            conn.execute(text("INSERT INTO warehouses (id, code) VALUES (1, 'WH1')"))

    def test_empty_warehouse_dashboard_ok(self):
        with self.Session() as db:
            payload = build_inventory_dashboard(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(payload["dashboard_status"], "ok")
        self.assertEqual(payload["kpis"]["active_inventories"], 0)
        self.assertEqual(payload["active_inventories"], [])
        self.assertIn("schema_audit", payload)

    def test_dashboard_with_document(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=1,
                number="INV-DASH-1",
                inventory_type=INV_TYPE_FULL,
                status=INV_STATUS_IN_PROGRESS,
                count_mode=COUNT_MODE_BLIND,
            )
            db.add(doc)
            db.commit()
            payload = build_inventory_dashboard(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(payload["dashboard_status"], "ok")
        self.assertEqual(len(payload["active_inventories"]), 1)
        self.assertEqual(payload["active_inventories"][0]["number"], "INV-DASH-1")

    def test_doc_to_dict_matches_read_schema_fields(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=1,
                number="INV-FIELDS",
                inventory_type=INV_TYPE_FULL,
                status=INV_STATUS_DRAFT,
                count_mode=COUNT_MODE_BLIND,
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)
            d = _doc_to_dict(doc)
        for key in (
            "tenant_id",
            "count_mode",
            "lock_mode",
            "recount_required",
            "scan_mode",
            "filters",
            "strategy",
            "metadata",
        ):
            self.assertIn(key, d)

    def test_schema_audit_ok_on_fresh_db(self):
        audit = audit_inventory_dashboard_schema(self.engine)
        self.assertTrue(audit["ok"])
        self.assertEqual(audit["missing_tables"], [])


if __name__ == "__main__":
    unittest.main()
