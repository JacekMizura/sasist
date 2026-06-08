"""
Production / manufacturing — recipe math, schema, snapshot integrity.

  python -m pytest backend/tests/test_production.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from sqlalchemy import create_engine, text

from backend.db.schema_upgrade import ensure_production_tables
from backend.services.location_priority_service import suggest_picking_locations
from backend.services.production_recipe_service import (
    ProductionRecipeError,
    _effective_line_qty,
    calculate_required_components,
    create_recipe,
)
from backend.schemas.production import ProductionRecipeCreateBody, ProductionRecipeLineWrite


class _Line(SimpleNamespace):
    pass


class _Recipe(SimpleNamespace):
    pass


class TestRecipeCalculations(unittest.TestCase):
    def test_effective_line_qty_with_waste_and_yield(self):
        ln = _Line(quantity=2.0, waste_percent=10.0)
        per = _effective_line_qty(ln, yield_qty=4.0)
        self.assertAlmostEqual(per, 2.0 * 1.1 / 4.0, places=6)

    def test_calculate_required_components_scales_planned_qty(self):
        recipe = _Recipe(
            yield_quantity=2.0,
            lines=[
                _Line(component_product_id=10, quantity=1.0, waste_percent=0.0, sort_order=0, id=1),
                _Line(component_product_id=20, quantity=3.0, waste_percent=5.0, sort_order=1, id=2),
            ],
        )
        reqs = calculate_required_components(recipe, planned_quantity=10.0)
        self.assertEqual(len(reqs), 2)
        self.assertEqual(reqs[0]["component_product_id"], 10)
        self.assertAlmostEqual(reqs[0]["total_required"], 5.0, places=6)
        self.assertAlmostEqual(reqs[1]["total_required"], 10.0 * (3.0 * 1.05 / 2.0), places=4)

    def test_self_reference_rejected(self):
        body = ProductionRecipeCreateBody(
            product_id=5,
            name="Test",
            lines=[ProductionRecipeLineWrite(component_product_id=5, quantity=1.0)],
        )
        engine = create_engine("sqlite:///:memory:")
        ensure_production_tables(engine)
        from sqlalchemy.orm import sessionmaker

        Session = sessionmaker(bind=engine)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS products (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER,
                        name VARCHAR(256),
                        symbol VARCHAR(64),
                        sku VARCHAR(64),
                        deleted_at DATETIME
                    )
                    """
                )
            )
            conn.execute(text("INSERT INTO products (id, tenant_id, name) VALUES (5, 1, 'FG')"))
        db = Session()
        try:
            with self.assertRaises(ProductionRecipeError) as ctx:
                create_recipe(db, tenant_id=1, body=body)
            self.assertEqual(ctx.exception.code, "self_reference")
        finally:
            db.close()


class TestPickingLocationSuggest(unittest.TestCase):
    def test_suggest_picking_prefers_packing_zone(self):
        rows = [
            {"location_id": 1, "code": "BULK", "available": 50, "operational_zone_type": "RETURNS", "picking_priority": 10},
            {"location_id": 2, "code": "P1-01", "available": 10, "operational_zone_type": "PACKING", "picking_priority": 5},
        ]
        out = suggest_picking_locations(rows, quantity=8)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["location_id"], 2)
        self.assertAlmostEqual(float(out[0]["suggested_qty"]), 8.0, places=4)


class TestProductionSchema(unittest.TestCase):
    def test_ensure_production_tables_sqlite(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("CREATE TABLE products (id INTEGER PRIMARY KEY)"))
            conn.execute(text("CREATE TABLE warehouses (id INTEGER PRIMARY KEY)"))
            conn.execute(text("CREATE TABLE locations (id INTEGER PRIMARY KEY)"))
            conn.execute(text("CREATE TABLE app_users (id INTEGER PRIMARY KEY)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE stock_documents (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER,
                        document_type VARCHAR(32)
                    )
                    """
                )
            )
        ensure_production_tables(engine)
        with engine.connect() as conn:
            tables = {
                row[0]
                for row in conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                )
            }
        self.assertIn("production_recipes", tables)
        self.assertIn("production_recipe_lines", tables)
        self.assertIn("production_orders", tables)
        self.assertIn("production_order_lines_snapshot", tables)
        with engine.connect() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_documents)"))}
        self.assertIn("production_order_id", cols)


class TestRecipeCardListing(unittest.TestCase):
    def test_product_listable_excludes_deleted(self):
        from backend.services.production_recipe_card_service import _product_is_listable
        from types import SimpleNamespace

        self.assertTrue(_product_is_listable(SimpleNamespace(deleted_at=None)))
        self.assertFalse(_product_is_listable(None))
        self.assertFalse(_product_is_listable(SimpleNamespace(deleted_at="2024-01-01")))


class TestBatchCreateValidation(unittest.TestCase):
    def test_validate_batch_create_rejects_empty_lines(self):
        from unittest.mock import MagicMock

        from backend.services.production_batch_service import ProductionBatchError, _validate_batch_create_body

        db = MagicMock()
        with self.assertRaises(ProductionBatchError) as ctx:
            _validate_batch_create_body(db, tenant_id=1, warehouse_id=1, lines=[])
        self.assertEqual(ctx.exception.code, "empty_batch")

    def test_validate_batch_create_rejects_inactive_recipe(self):
        from unittest.mock import MagicMock, patch

        from backend.services.production_batch_service import ProductionBatchError, _validate_batch_create_body

        ln = MagicMock(product_id=10, composition_id=5, planned_quantity=2)
        comp = MagicMock()
        comp.composition_mode = "manufacturing"
        comp.product_id = 10
        comp.is_active = False
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = MagicMock()
        with (
            patch(
                "backend.services.production_batch_service.resolve_composition_entity",
                return_value=comp,
            ),
            patch(
                "backend.services.production_batch_service.Product",
            ),
            self.assertRaises(ProductionBatchError) as ctx,
        ):
            _validate_batch_create_body(db, tenant_id=1, warehouse_id=1, lines=[ln])
        self.assertEqual(ctx.exception.code, "recipe_inactive")


class TestProductionBatches(unittest.TestCase):
    def test_list_batches_returns_empty_when_schema_missing(self):
        from sqlalchemy.orm import sessionmaker

        from backend.services.production_batch_service import list_batches

        engine = create_engine("sqlite:///:memory:")
        Session = sessionmaker(bind=engine)
        with Session() as db:
            rows = list_batches(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(rows, [])

    def test_preview_cost_uses_composition_id_kwarg(self):
        from unittest.mock import MagicMock, patch

        from backend.services.production_batch_service import preview_batch_demand

        ln = MagicMock(product_id=10, composition_id=1, planned_quantity=2)
        comp = MagicMock()
        comp.composition_mode = "manufacturing"
        comp.product_id = 10
        comp.id = 1
        db = MagicMock()
        with (
            patch(
                "backend.services.production_batch_service._validate_batch_create_body",
                return_value=None,
            ),
            patch(
                "backend.services.production_batch_service.resolve_composition_entity",
                return_value=comp,
            ),
            patch(
                "backend.services.production_batch_service.calculate_required_components",
                return_value=[],
            ),
            patch(
                "backend.services.production_batch_service.aggregate_component_demand",
                return_value={},
            ),
            patch(
                "backend.services.production_batch_service.aggregated_demand_with_availability",
                return_value=[],
            ),
            patch(
                "backend.services.composition_engine_service.estimate_composition_cost",
                return_value={"unit_cost_net": 3.5},
            ) as mock_cost,
        ):
            result = preview_batch_demand(db, tenant_id=1, warehouse_id=1, lines=[ln])
        mock_cost.assert_called_once_with(db, tenant_id=1, composition_id=1)
        self.assertEqual(result.estimated_cost_net, 7.0)
        self.assertEqual(result.products_count, 1)


class TestProductionOrdersByProduct(unittest.TestCase):
    def test_returns_empty_when_production_orders_table_missing(self):
        from sqlalchemy.orm import sessionmaker

        from backend.services.production_order_service import list_production_orders_for_product

        engine = create_engine("sqlite:///:memory:")
        Session = sessionmaker(bind=engine)
        with Session() as db:
            rows = list_production_orders_for_product(db, tenant_id=1, product_id=15, limit=50)
        self.assertEqual(rows, [])

    def test_normalizes_batch_status_for_summary(self):
        from backend.services.production_order_service import _normalize_summary_status

        self.assertEqual(_normalize_summary_status("collecting"), "in_progress")
        self.assertEqual(_normalize_summary_status("putaway"), "in_progress")
        self.assertEqual(_normalize_summary_status("completed"), "completed")
        self.assertEqual(_normalize_summary_status("unknown"), "planned")


if __name__ == "__main__":
    unittest.main()
