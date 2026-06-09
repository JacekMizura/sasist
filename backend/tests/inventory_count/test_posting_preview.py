"""Posting preview — RW/PW summary for supervisor approval modal."""

from __future__ import annotations

import json
import unittest
from datetime import date

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateTable

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.db.schema_upgrade import ensure_warehouse_inventory_movements_table
from backend.models.app_user import AppUser
from backend.models.inventory import Inventory
from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_IN_PROGRESS,
    INV_TYPE_FULL,
    INV_TYPE_PARTIAL,
    LINE_STATUS_COUNTED,
    LINE_STATUS_OPEN,
    RESULT_POLICY_UPDATE_STOCK,
)
from backend.models.inventory_count.count_entry import InventoryCountEntry
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.inventory_count.recount import InventoryRecount
from backend.models.location import Location
from backend.models.product import Product
from backend.models.warehouse import Warehouse
from backend.services.inventory_count.conflict_resolution_service import accept_operator_count_entry
from backend.services.inventory_count.posting_preview_service import build_posting_preview
from backend.services.inventory_count.strategy_service import build_operator_strategy


class TestPostingPreview(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        ensure_warehouse_inventory_movements_table(self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            app_user_ddl = str(CreateTable(AppUser.__table__).compile(dialect=self.engine.dialect))
            conn.execute(text(app_user_ddl))
        Warehouse.__table__.create(self.engine, checkfirst=True)
        Location.__table__.create(self.engine, checkfirst=True)
        Product.__table__.create(self.engine, checkfirst=True)
        Inventory.__table__.create(self.engine, checkfirst=True)
        self.Session = sessionmaker(bind=self.engine)
        with self.Session() as db:
            db.add(AppUser(id=1, login="u1", password_hash="x", first_name="Jan", last_name="Kowalski"))
            db.add(AppUser(id=2, login="u2", password_hash="x", first_name="Anna", last_name="Nowak"))
            db.commit()

    def _strategy(self) -> str:
        return json.dumps(
            build_operator_strategy(
                count_mode=COUNT_MODE_BLIND,
                movement_policy="allow_operations",
                result_policy=RESULT_POLICY_UPDATE_STOCK,
            )
        )

    def _seed_stock(self, db):
        db.add(Warehouse(id=1, tenant_id=1, name="Magazyn"))
        db.add(Location(id=1, warehouse_id=1, name="A-01", is_active=True))
        db.add(
            Product(
                id=1,
                tenant_id=1,
                name="Produkt A",
                sku="SKU-A",
                ean="5900000000001",
                purchase_price=10.0,
            )
        )
        db.add(
            Product(
                id=2,
                tenant_id=1,
                name="Produkt B",
                sku="SKU-B",
                ean="5900000000002",
                purchase_price=5.0,
            )
        )
        db.add(
            Inventory(
                tenant_id=1,
                warehouse_id=1,
                location_id=1,
                product_id=1,
                quantity=10.0,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )
        db.add(
            Inventory(
                tenant_id=1,
                warehouse_id=1,
                location_id=1,
                product_id=2,
                quantity=7.0,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )

    def _doc(
        self,
        db,
        *,
        inventory_type: str = INV_TYPE_FULL,
        lines: list[dict],
    ) -> InventoryDocument:
        doc = InventoryDocument(
            tenant_id=1,
            warehouse_id=1,
            number=f"INV-{inventory_type}",
            inventory_type=inventory_type,
            status=INV_STATUS_IN_PROGRESS,
            count_mode=COUNT_MODE_BLIND,
            strategy_json=self._strategy(),
            filters_json=json.dumps({"scope_mode": "full"}),
        )
        db.add(doc)
        db.flush()
        for spec in lines:
            line = InventoryDocumentLine(
                inventory_document_id=doc.id,
                location_id=spec.get("location_id", 1),
                product_id=spec["product_id"],
                expected_quantity=spec.get("expected", 0.0),
                counted_quantity=spec.get("counted"),
                status=LINE_STATUS_COUNTED if spec.get("counted") is not None else LINE_STATUS_OPEN,
                metadata_json=spec.get("metadata_json", '{"snapshot_unit_cost_net": 10.0}'),
            )
            line.recompute_difference()
            db.add(line)
        db.commit()
        db.refresh(doc)
        return doc

    def test_preview_without_conflicts(self):
        with self.Session() as db:
            self._seed_stock(db)
            doc = self._doc(
                db,
                inventory_type=INV_TYPE_PARTIAL,
                lines=[{"product_id": 1, "expected": 10.0, "counted": 12.0}],
            )
            result = build_posting_preview(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["document_id"], doc.id)
            self.assertEqual(result["unresolved_conflicts"], 0)
            self.assertEqual(result["surplus_lines"], 1)
            self.assertEqual(result["shortage_lines"], 0)

    def test_preview_manually_resolved_conflict_uses_accepted_count(self):
        with self.Session() as db:
            self._seed_stock(db)
            doc = self._doc(
                db,
                inventory_type=INV_TYPE_PARTIAL,
                lines=[{"product_id": 1, "expected": 100.0, "counted": None}],
            )
            line = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.inventory_document_id == doc.id).one()
            e1 = InventoryCountEntry(
                inventory_document_line_id=line.id,
                inventory_document_id=doc.id,
                user_id=1,
                counted_quantity=10.0,
                delta_quantity=10.0,
                source="scanner",
            )
            e2 = InventoryCountEntry(
                inventory_document_line_id=line.id,
                inventory_document_id=doc.id,
                user_id=2,
                counted_quantity=12.0,
                delta_quantity=2.0,
                source="scanner",
            )
            db.add_all([e1, e2])
            db.commit()
            accept_operator_count_entry(
                db,
                tenant_id=1,
                document_id=doc.id,
                line_id=line.id,
                count_entry_id=e1.id,
                user_id=99,
            )
            db.commit()

            result = build_posting_preview(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["unresolved_conflicts"], 0)
            self.assertEqual(result["shortage_lines"], 1)
            rw = result["rw_preview"]
            self.assertEqual(len(rw), 1)
            self.assertAlmostEqual(float(rw[0]["quantity"]), 90.0, places=3)

    def test_preview_after_recount_completed(self):
        with self.Session() as db:
            self._seed_stock(db)
            doc = self._doc(
                db,
                inventory_type=INV_TYPE_PARTIAL,
                lines=[{"product_id": 1, "expected": 100.0, "counted": None}],
            )
            line = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.inventory_document_id == doc.id).one()
            db.add_all(
                [
                    InventoryCountEntry(
                        inventory_document_line_id=line.id,
                        inventory_document_id=doc.id,
                        user_id=1,
                        counted_quantity=10.0,
                        delta_quantity=10.0,
                        source="scanner",
                    ),
                    InventoryCountEntry(
                        inventory_document_line_id=line.id,
                        inventory_document_id=doc.id,
                        user_id=2,
                        counted_quantity=12.0,
                        delta_quantity=2.0,
                        source="scanner",
                    ),
                ]
            )
            db.add(
                InventoryRecount(
                    inventory_document_id=doc.id,
                    inventory_document_line_id=line.id,
                    status="done",
                    reason="operator_conflict",
                )
            )
            line.counted_quantity = 11.0
            line.recompute_difference()
            db.commit()

            result = build_posting_preview(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["unresolved_conflicts"], 0)

    def test_full_inventory_zeros_uncounted_and_orphan_stock(self):
        with self.Session() as db:
            self._seed_stock(db)
            doc = self._doc(
                db,
                inventory_type=INV_TYPE_FULL,
                lines=[
                    {"product_id": 1, "expected": 10.0, "counted": 10.0},
                ],
            )
            result = build_posting_preview(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["shortage_lines"], 1)
            rw = result["rw_preview"]
            self.assertTrue(any(float(x["quantity"]) == 7.0 for x in rw))

    def test_partial_inventory_ignores_uncounted(self):
        with self.Session() as db:
            self._seed_stock(db)
            doc = self._doc(
                db,
                inventory_type=INV_TYPE_PARTIAL,
                lines=[
                    {"product_id": 1, "expected": 10.0, "counted": 8.0},
                    {"product_id": 2, "expected": 7.0, "counted": None},
                ],
            )
            result = build_posting_preview(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["shortage_lines"], 1)
            self.assertEqual(result["surplus_lines"], 0)
            self.assertEqual(len(result["rw_preview"]), 1)
            self.assertEqual(int(result["rw_preview"][0]["product_id"]), 1)

    def test_orphan_stock_line_none_does_not_crash(self):
        """Regression: orphan RW row had line=None → resolve_line_unit_cost_net AttributeError."""
        with self.Session() as db:
            self._seed_stock(db)
            doc = self._doc(
                db,
                inventory_type=INV_TYPE_FULL,
                lines=[{"product_id": 1, "expected": 10.0, "counted": 10.0}],
            )
            result = build_posting_preview(db, tenant_id=1, document_id=doc.id)
            self.assertGreaterEqual(result["shortage_lines"], 1)


if __name__ == "__main__":
    unittest.main()
