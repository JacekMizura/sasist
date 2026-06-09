"""Per-operator inventory counts must not aggregate across operators."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_IN_PROGRESS,
    INV_TYPE_FULL,
)
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.services.inventory_count.count_entry_service import record_count_scan
from backend.services.inventory_count.recount_conflict_service import operator_quantities_for_line


class TestOperatorCountEntries(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, code VARCHAR(16))"))
            conn.execute(text("INSERT INTO warehouses (id, code) VALUES (1, 'WH1')"))

    def test_second_operator_does_not_add_to_first(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=1,
                number="INV-OP-1",
                inventory_type=INV_TYPE_FULL,
                status=INV_STATUS_IN_PROGRESS,
                count_mode=COUNT_MODE_BLIND,
            )
            db.add(doc)
            db.flush()
            line = InventoryDocumentLine(
                inventory_document_id=doc.id,
                location_id=1,
                product_id=1,
                expected_quantity=0,
            )
            db.add(line)
            db.commit()
            db.refresh(line)

            record_count_scan(
                db,
                tenant_id=1,
                document_id=doc.id,
                line_id=line.id,
                quantity=0,
                user_id=1,
                delta=1,
            )
            for _ in range(26):
                record_count_scan(
                    db,
                    tenant_id=1,
                    document_id=doc.id,
                    line_id=line.id,
                    quantity=0,
                    user_id=1,
                    delta=1,
                )
            record_count_scan(
                db,
                tenant_id=1,
                document_id=doc.id,
                line_id=line.id,
                quantity=0,
                user_id=2,
                delta=1,
            )
            for _ in range(7):
                record_count_scan(
                    db,
                    tenant_id=1,
                    document_id=doc.id,
                    line_id=line.id,
                    quantity=0,
                    user_id=2,
                    delta=1,
                )

            db.refresh(line)
            by_user = operator_quantities_for_line(db, int(line.id))
            self.assertEqual(by_user[1], 27.0)
            self.assertEqual(by_user[2], 8.0)
            self.assertIsNone(line.counted_quantity)


if __name__ == "__main__":
    unittest.main()
