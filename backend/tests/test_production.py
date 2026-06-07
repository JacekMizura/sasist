"""
Production / manufacturing — recipe math, schema, snapshot integrity.

  python -m pytest backend/tests/test_production.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from sqlalchemy import create_engine, text

from backend.db.schema_upgrade import ensure_production_tables
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


if __name__ == "__main__":
    unittest.main()
