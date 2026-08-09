"""
Regression: STOCK_PRODUCTION bundle „Dezodorant x3” → BOM v1 → create ProductionOrder.

Root cause fixed: production_orders.recipe_id was NOT NULL in DB while composition-only
MOs set recipe_id=NULL (bundle BOM has no legacy production_recipes row).

  python -m pytest backend/tests/test_bundle_stock_production_order.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.db.schema_upgrade import ensure_production_orders_recipe_id_nullable
from backend.models.bundle import Bundle, BundleItem
from backend.models.inventory import Inventory
from backend.models.product import Product
from backend.models.product_composition import ProductComposition, ProductCompositionLine
from backend.models.production import ProductionOrder, ProductionOrderLineSnapshot
from backend.models.stock_reservation import StockReservation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.schemas.production import ProductionOrderCreateBody
from backend.services.bundle_operational_mode import STOCK_PRODUCTION
from backend.services.bundle_stock_product_service import ensure_shadow_product_for_stock_bundle
from backend.services.production_order_service import create_production_order


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    tables = [
        Tenant.__table__,
        Warehouse.__table__,
        Product.__table__,
        Bundle.__table__,
        BundleItem.__table__,
        ProductComposition.__table__,
        ProductCompositionLine.__table__,
        ProductionOrder.__table__,
        ProductionOrderLineSnapshot.__table__,
        Inventory.__table__,
        StockReservation.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _seed_dezodorant_x3(db) -> tuple[Bundle, ProductComposition]:
    coccine = Product(
        id=101,
        tenant_id=1,
        name="DEZODORANT ODŚWIEŻACZ ANTYBAKTERYJNY Coccine",
        sku="COCCINE",
        symbol="COCCINE",
    )
    db.add(coccine)
    db.flush()
    bundle = Bundle(
        id=1,
        tenant_id=1,
        name="Dezodorant x3",
        sku="DEO-X3",
        ean="5901111111111",
        sale_price=29.0,
        bundle_fulfillment_mode=STOCK_PRODUCTION,
        linked_product_id=None,
    )
    db.add(bundle)
    db.flush()
    db.add(BundleItem(bundle_id=bundle.id, product_id=coccine.id, quantity=3.0, sort_order=0))
    db.flush()
    pid = ensure_shadow_product_for_stock_bundle(db, bundle)
    assert pid is not None
    db.commit()
    comp = (
        db.query(ProductComposition)
        .filter(
            ProductComposition.product_id == int(pid),
            ProductComposition.composition_mode == "manufacturing",
            ProductComposition.is_active.is_(True),
        )
        .first()
    )
    assert comp is not None
    assert comp.source_recipe_id is None
    assert len(comp.lines) == 1
    assert int(comp.lines[0].component_product_id) == 101
    assert float(comp.lines[0].quantity) == 3.0
    return bundle, comp


def test_dezodorant_x3_create_production_order_qty_1(db):
    bundle, comp = _seed_dezodorant_x3(db)
    body = ProductionOrderCreateBody(
        composition_id=int(comp.id),
        warehouse_id=1,
        planned_quantity=1,
        status="planned",
    )
    out = create_production_order(db, tenant_id=1, body=body)
    db.commit()

    assert out.product_id == int(bundle.linked_product_id)
    assert out.product_name == "Dezodorant x3"
    assert out.composition_id == int(comp.id)
    assert out.recipe_id is None
    assert out.planned_quantity == 1.0
    assert out.recipe_name and "BOM" in out.recipe_name
    assert len(out.lines) == 1
    line = out.lines[0]
    assert line.component_product_id == 101
    assert line.quantity_per_unit == 3.0
    assert line.total_required_quantity == 3.0
    assert "Coccine" in line.product_name_snapshot


def test_legacy_recipe_id_not_null_migration_allows_null_insert():
    """Legacy production_orders.recipe_id NOT NULL → ensure → NULL insert (composition-only MO)."""
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE production_recipes (id INTEGER PRIMARY KEY, tenant_id INTEGER, name TEXT)"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE production_orders ("
                "id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL, number TEXT NOT NULL, "
                "recipe_id INTEGER NOT NULL REFERENCES production_recipes(id), "
                "composition_id INTEGER, product_id INTEGER NOT NULL, warehouse_id INTEGER NOT NULL, "
                "planned_quantity REAL NOT NULL, produced_quantity REAL DEFAULT 0, "
                "status TEXT, created_at DATETIME, updated_at DATETIME)"
            )
        )

    cols_before = {c["name"]: c for c in inspect(engine).get_columns("production_orders")}
    assert cols_before["recipe_id"]["nullable"] is False

    with engine.begin() as conn:
        with pytest.raises(Exception):
            conn.execute(
                text(
                    "INSERT INTO production_orders "
                    "(id, tenant_id, number, recipe_id, composition_id, product_id, warehouse_id, "
                    "planned_quantity, status) "
                    "VALUES (1, 1, 'MO/2026/0001', NULL, 1, 10, 1, 1.0, 'planned')"
                )
            )

    assert ensure_production_orders_recipe_id_nullable(engine) is True
    cols_after = {c["name"]: c for c in inspect(engine).get_columns("production_orders")}
    assert cols_after["recipe_id"]["nullable"] is True

    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO production_orders "
                "(id, tenant_id, number, recipe_id, composition_id, product_id, warehouse_id, "
                "planned_quantity, status) "
                "VALUES (1, 1, 'MO/2026/0001', NULL, 1, 10, 1, 1.0, 'planned')"
            )
        )
        row = conn.execute(text("SELECT recipe_id, composition_id, planned_quantity FROM production_orders WHERE id=1")).one()
    assert row[0] is None
    assert int(row[1]) == 1
    assert float(row[2]) == 1.0
    engine.dispose()
