"""Shared fixtures for inventory conflicts endpoint tests."""

from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateTable

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.app_user import AppUser
from backend.models.location import Location
from backend.models.product import Product
from backend.models.warehouse_carrier import WarehouseCarrier


def create_conflicts_test_engine():
    engine = create_engine("sqlite:///:memory:")
    ensure_inventory_count_schema(engine)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, code VARCHAR(16))"))
        conn.execute(text("INSERT INTO warehouses (id, code) VALUES (1, 'WH1')"))
        app_user_ddl = str(CreateTable(AppUser.__table__).compile(dialect=engine.dialect))
        conn.execute(text(app_user_ddl))
        location_ddl = str(CreateTable(Location.__table__).compile(dialect=engine.dialect))
        conn.execute(text(location_ddl))
        product_ddl = str(CreateTable(Product.__table__).compile(dialect=engine.dialect))
        conn.execute(text(product_ddl))
        carrier_ddl = str(CreateTable(WarehouseCarrier.__table__).compile(dialect=engine.dialect))
        conn.execute(text(carrier_ddl))
    Session = sessionmaker(bind=engine)
    with Session() as db:
        db.add(AppUser(id=1, login="u1", password_hash="x", first_name="Jan", last_name="Kowalski"))
        db.add(AppUser(id=2, login="u2", password_hash="x", first_name="Anna", last_name="Nowak"))
        db.add(Location(id=10, warehouse_id=1, name="A-01", is_active=True))
        db.add(
            WarehouseCarrier(
                id=7,
                tenant_id=1,
                code="PAL-01",
                barcode="BC7",
            )
        )
        db.add(Product(tenant_id=1, name="Prod", sku="SKU5"))
        db.flush()
        db.execute(text("UPDATE products SET id = 5 WHERE sku = 'SKU5'"))
        db.commit()
    return engine, Session
