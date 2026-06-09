"""Full inventory posting — zero uncounted scope stock (FULL + update_stock only)."""

from __future__ import annotations

import json
import unittest
from datetime import date

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.db.schema_upgrade import ensure_warehouse_inventory_movements_table
from backend.models.inventory import Inventory
from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_APPROVED,
    INV_TYPE_FULL,
    INV_TYPE_PARTIAL,
    LINE_STATUS_COUNTED,
    LINE_STATUS_OPEN,
    RESULT_POLICY_UPDATE_STOCK,
)
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.location import Location
from backend.models.product import Product
from backend.models.warehouse import Warehouse
from backend.services.inventory_count.adjustment_service import post_inventory_adjustments
from backend.services.inventory_count.strategy_service import build_operator_strategy


class TestFullInventoryZeroing(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        ensure_warehouse_inventory_movements_table(self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
        Warehouse.__table__.create(self.engine, checkfirst=True)
        Location.__table__.create(self.engine, checkfirst=True)
        Product.__table__.create(self.engine, checkfirst=True)
        Inventory.__table__.create(self.engine, checkfirst=True)
        from backend.models.stock_document import StockDocument, StockDocumentItem
        from backend.models.stock_operation import StockOperation

        StockDocument.__table__.create(self.engine, checkfirst=True)
        StockDocumentItem.__table__.create(self.engine, checkfirst=True)
        StockOperation.__table__.create(self.engine, checkfirst=True)
        self.Session = sessionmaker(bind=self.engine)

    def _stock_qty(self, db, product_id: int, location_id: int = 1) -> float:
        rows = (
            db.query(Inventory.quantity)
            .filter(
                Inventory.tenant_id == 1,
                Inventory.warehouse_id == 1,
                Inventory.product_id == int(product_id),
                Inventory.location_id == int(location_id),
            )
            .all()
        )
        return sum(float(r[0] or 0) for r in rows)

    def _seed_base(self, db):
        db.add(Warehouse(id=1, tenant_id=1, name="Magazyn 1"))
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
                quantity=5.0,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )

    def _approved_doc(
        self,
        db,
        *,
        inventory_type: str = INV_TYPE_FULL,
        lines: list[dict],
    ) -> InventoryDocument:
        strategy = build_operator_strategy(
            count_mode=COUNT_MODE_BLIND,
            movement_policy="allow_operations",
            result_policy=RESULT_POLICY_UPDATE_STOCK,
        )
        doc = InventoryDocument(
            tenant_id=1,
            warehouse_id=1,
            number=f"INV-{inventory_type}",
            inventory_type=inventory_type,
            status=INV_STATUS_APPROVED,
            count_mode=COUNT_MODE_BLIND,
            strategy_json=json.dumps(strategy),
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
                metadata_json='{"snapshot_unit_cost_net": 10.0}',
            )
            line.recompute_difference()
            db.add(line)
        db.commit()
        db.refresh(doc)
        return doc

    def test_case1_full_inventory_zeros_uncounted_product(self):
        """A counted 7, B uncounted → A=7, B=0."""
        with self.Session() as db:
            self._seed_base(db)
            doc = self._approved_doc(
                db,
                inventory_type=INV_TYPE_FULL,
                lines=[
                    {"product_id": 1, "expected": 10.0, "counted": 7.0},
                    {"product_id": 2, "expected": 5.0, "counted": None},
                ],
            )
            post_inventory_adjustments(db, tenant_id=1, document_id=int(doc.id), user_id=1)
            db.commit()
            self.assertEqual(self._stock_qty(db, 1), 7.0)
            self.assertEqual(self._stock_qty(db, 2), 0.0)

    def test_case2_partial_inventory_leaves_uncounted_stock(self):
        """PARTIAL: A=7 counted, B untouched → A=7, B=5."""
        with self.Session() as db:
            self._seed_base(db)
            doc = self._approved_doc(
                db,
                inventory_type=INV_TYPE_PARTIAL,
                lines=[
                    {"product_id": 1, "expected": 10.0, "counted": 7.0},
                    {"product_id": 2, "expected": 5.0, "counted": None},
                ],
            )
            post_inventory_adjustments(db, tenant_id=1, document_id=int(doc.id), user_id=1)
            db.commit()
            self.assertEqual(self._stock_qty(db, 1), 7.0)
            self.assertEqual(self._stock_qty(db, 2), 5.0)

    def test_case3_full_inventory_empty_location_zeros_all_scope_stock(self):
        """Nothing counted → all scoped stock goes to zero."""
        with self.Session() as db:
            self._seed_base(db)
            doc = self._approved_doc(
                db,
                inventory_type=INV_TYPE_FULL,
                lines=[
                    {"product_id": 1, "expected": 10.0, "counted": None},
                    {"product_id": 2, "expected": 5.0, "counted": None},
                ],
            )
            post_inventory_adjustments(db, tenant_id=1, document_id=int(doc.id), user_id=1)
            db.commit()
            self.assertEqual(self._stock_qty(db, 1), 0.0)
            self.assertEqual(self._stock_qty(db, 2), 0.0)


if __name__ == "__main__":
    unittest.main()
