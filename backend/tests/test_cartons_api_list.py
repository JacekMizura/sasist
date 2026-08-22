"""
Regression: GET /api/cartons/ must not 500 when listing rows.

Root cause (07c0ed54): ``_carton_to_read`` gained a ``db`` Session argument for Inventory SSOT,
but ``list_cartons`` still called ``_carton_to_read(x)`` — TypeError at runtime whenever the
warehouse has at least one carton (empty list skipped the call and returned 200 []).

  python -m pytest backend/tests/test_cartons_api_list.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.api import cartons as cartons_api
from backend.database import get_db
from backend.db.schema_upgrade import ensure_cartons_usable_dimensions_columns
from backend.models.carton import Carton, carton_shipping_method_links
from backend.models.inventory import Inventory
from backend.models.manufacturer import Manufacturer
from backend.models.product import Product
from backend.models.shipping_method import ShippingMethod
from backend.models.supplier import Supplier
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.packaging_engine.engine import _load_active_cartons


@pytest.fixture
def cartons_env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    for model in (Tenant, Warehouse, Product, Supplier, Manufacturer, ShippingMethod, Carton, Inventory):
        model.__table__.create(engine, checkfirst=True)
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS wm_price_tiers ("
            "id VARCHAR(36) PRIMARY KEY, tenant_id INTEGER, warehouse_id INTEGER, "
            "carton_id VARCHAR(36), packaging_material_id VARCHAR(36), sort_index INTEGER, "
            "qty_from FLOAT, package_qty FLOAT, package_net_total FLOAT, "
            "package_gross_total FLOAT, created_at DATETIME, updated_at DATETIME)"
        )
    carton_shipping_method_links.create(engine, checkfirst=True)
    ensure_cartons_usable_dimensions_columns(engine)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    db.add(Warehouse(id=2, tenant_id=1, name="WH2"))
    db.add(Tenant(id=2, name="T2", default_warehouse_id=3))
    db.add(Warehouse(id=3, tenant_id=2, name="WH-T2"))
    now = datetime.utcnow()
    db.add(
        Carton(
            id="carton-active",
            tenant_id=1,
            warehouse_id=1,
            name="Active Box",
            length_cm=30,
            width_cm=20,
            height_cm=15,
            internal_length_cm=28,
            internal_width_cm=18,
            internal_height_cm=13,
            max_payload_kg=5.0,
            weight_kg=0.4,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )
    db.add(
        Carton(
            id="carton-inactive",
            tenant_id=1,
            warehouse_id=1,
            name="Inactive Box",
            length_cm=40,
            width_cm=30,
            height_cm=20,
            weight_kg=0.6,
            is_active=False,
            created_at=now,
            updated_at=now,
        )
    )
    db.add(
        Carton(
            id="carton-wh2",
            tenant_id=1,
            warehouse_id=2,
            name="Other WH",
            length_cm=10,
            width_cm=10,
            height_cm=10,
            weight_kg=0.1,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )
    db.add(
        Carton(
            id="carton-t2",
            tenant_id=2,
            warehouse_id=3,
            name="Other Tenant",
            length_cm=10,
            width_cm=10,
            height_cm=10,
            weight_kg=0.1,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )
    db.commit()
    db.close()

    app = FastAPI()
    app.include_router(cartons_api.router, prefix="/api")

    def _override_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_db
    client = TestClient(app, raise_server_exceptions=True)
    try:
        yield {"client": client, "Session": Session, "engine": engine}
    finally:
        app.dependency_overrides.clear()


def test_list_cartons_production_case_active_only_false(cartons_env):
    """Exact production query matrix: tenant_id=1 warehouse_id=1 active_only=false."""
    client: TestClient = cartons_env["client"]
    res = client.get(
        "/api/cartons/",
        params={"tenant_id": 1, "warehouse_id": 1, "active_only": "false"},
    )
    assert res.status_code == 200, res.text
    rows = res.json()
    assert isinstance(rows, list)
    ids = {r["id"] for r in rows}
    assert ids == {"carton-active", "carton-inactive"}
    by_id = {r["id"]: r for r in rows}
    assert by_id["carton-active"]["is_active"] is True
    assert by_id["carton-inactive"]["is_active"] is False
    active = by_id["carton-active"]
    assert active["internal_length_cm"] == 28.0
    assert active["internal_width_cm"] == 18.0
    assert active["internal_height_cm"] == 13.0
    assert active["max_payload_kg"] == 5.0
    assert active["length_cm"] == 30.0
    assert "shipping_methods" in active
    assert "price_tiers" in active
    assert "stock" in active


def test_list_cartons_active_only_true(cartons_env):
    client: TestClient = cartons_env["client"]
    res = client.get(
        "/api/cartons/",
        params={"tenant_id": 1, "warehouse_id": 1, "active_only": "true"},
    )
    assert res.status_code == 200, res.text
    ids = {r["id"] for r in res.json()}
    assert ids == {"carton-active"}


def test_list_cartons_warehouse_isolation(cartons_env):
    client: TestClient = cartons_env["client"]
    res = client.get(
        "/api/cartons/",
        params={"tenant_id": 1, "warehouse_id": 2, "active_only": "false"},
    )
    assert res.status_code == 200, res.text
    assert {r["id"] for r in res.json()} == {"carton-wh2"}


def test_list_cartons_tenant_isolation(cartons_env):
    client: TestClient = cartons_env["client"]
    res = client.get(
        "/api/cartons/",
        params={"tenant_id": 1, "warehouse_id": 1, "active_only": "false"},
    )
    assert res.status_code == 200
    assert all(r["tenant_id"] == 1 for r in res.json())
    assert "carton-t2" not in {r["id"] for r in res.json()}


def test_list_cartons_empty_warehouse_200(cartons_env):
    Session = cartons_env["Session"]
    db = Session()
    db.add(Warehouse(id=99, tenant_id=1, name="Empty"))
    db.commit()
    db.close()
    client: TestClient = cartons_env["client"]
    res = client.get(
        "/api/cartons/",
        params={"tenant_id": 1, "warehouse_id": 99, "active_only": "false"},
    )
    assert res.status_code == 200, res.text
    assert res.json() == []


def test_usable_dimensions_schema_upgrade_idempotent(cartons_env):
    engine = cartons_env["engine"]
    ensure_cartons_usable_dimensions_columns(engine)
    cols = {c["name"] for c in inspect(engine).get_columns("cartons")}
    assert {"internal_length_cm", "internal_width_cm", "internal_height_cm", "max_payload_kg"} <= cols
    ensure_cartons_usable_dimensions_columns(engine)  # second pass no-op


def test_three_d_consumer_still_loads_active_cartons(cartons_env):
    Session = cartons_env["Session"]
    db = Session()
    try:
        loaded = _load_active_cartons(db, tenant_id=1, warehouse_id=1)
        assert {c.id for c in loaded} == {"carton-active"}
    finally:
        db.close()
