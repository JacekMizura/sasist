"""Delete draft inventory documents — ERP cleanup."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.inventory_count.constants import INV_STATUS_IN_PROGRESS, SESSION_STATUS_ACTIVE
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.session import InventorySession
from backend.services.inventory_count.document_service import (
    create_inventory_document,
    delete_draft_inventory_document,
)
from backend.services.inventory_count.errors import InventoryDocumentNotFoundError, InventoryInvalidTransitionError


class TestDeleteDraftDocument(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, code VARCHAR(16))"))
            conn.execute(text("INSERT INTO warehouses (id, code) VALUES (1, 'WH1')"))
        self.db = self.Session()

    def tearDown(self) -> None:
        self.db.close()

    def test_delete_draft_ok(self) -> None:
        doc = create_inventory_document(self.db, tenant_id=1, warehouse_id=1)
        doc_id = doc["id"]
        delete_draft_inventory_document(self.db, tenant_id=1, document_id=doc_id)
        with self.assertRaises(InventoryDocumentNotFoundError):
            delete_draft_inventory_document(self.db, tenant_id=1, document_id=doc_id)

    def test_reject_non_draft(self) -> None:
        doc = create_inventory_document(self.db, tenant_id=1, warehouse_id=1)
        row = self.db.query(InventoryDocument).filter(InventoryDocument.id == doc["id"]).one()
        row.status = INV_STATUS_IN_PROGRESS
        self.db.commit()
        with self.assertRaises(InventoryInvalidTransitionError):
            delete_draft_inventory_document(self.db, tenant_id=1, document_id=doc["id"])

    def test_reject_active_session(self) -> None:
        doc = create_inventory_document(self.db, tenant_id=1, warehouse_id=1)
        self.db.add(
            InventorySession(
                inventory_document_id=doc["id"],
                tenant_id=1,
                warehouse_id=1,
                status=SESSION_STATUS_ACTIVE,
            )
        )
        self.db.commit()
        with self.assertRaises(InventoryInvalidTransitionError):
            delete_draft_inventory_document(self.db, tenant_id=1, document_id=doc["id"])


if __name__ == "__main__":
    unittest.main()
