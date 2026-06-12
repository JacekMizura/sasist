"""Network commercial ATP — multi-WH foundation (read-only projection)."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.services.network_commercial_availability_service import (
    list_network_stock_warehouse_ids,
    network_commercially_sellable_qty,
)


@pytest.fixture
def network_wh_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    Warehouse.__table__.create(engine, checkfirst=True)
    TenantWarehouse.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(Warehouse(id=1, tenant_id=1, name="Warszawa"))
    db.add(Warehouse(id=2, tenant_id=1, name="Poznań"))
    db.add(Warehouse(id=3, tenant_id=1, name="Serwis"))
    db.add(
        TenantWarehouse(
            tenant_id=1,
            warehouse_id=1,
            role="owner",
            is_default=1,
            participates_in_network_stock=True,
            fulfillment_eligible=True,
            fulfillment_priority=1,
        )
    )
    db.add(
        TenantWarehouse(
            tenant_id=1,
            warehouse_id=2,
            role="operator",
            is_default=0,
            participates_in_network_stock=True,
            fulfillment_eligible=True,
            fulfillment_priority=2,
        )
    )
    db.add(
        TenantWarehouse(
            tenant_id=1,
            warehouse_id=3,
            role="operator",
            is_default=0,
            participates_in_network_stock=False,
            fulfillment_eligible=False,
            fulfillment_priority=100,
        )
    )
    db.commit()

    def _fake_commercial(db, *, tenant_id, warehouse_id, product_id):
        return {1: 20.0, 2: 30.0, 3: 50.0}.get(int(warehouse_id), 0.0)

    monkeypatch.setattr(
        "backend.services.network_commercial_availability_service.commercially_sellable_qty",
        _fake_commercial,
    )

    try:
        yield db
    finally:
        db.close()


def test_list_network_stock_warehouse_ids_excludes_service(network_wh_db):
    ids = list_network_stock_warehouse_ids(network_wh_db, 1)
    assert ids == [1, 2]


def test_network_commercially_sellable_qty_sums_network_warehouses_only(network_wh_db):
    qty = network_commercially_sellable_qty(network_wh_db, tenant_id=1, product_id=99)
    assert qty == 50.0  # 20 + 30; Serwis (50) excluded


def test_network_commercially_sellable_qty_empty_when_no_network_warehouses(network_wh_db):
    for tw in network_wh_db.query(TenantWarehouse).all():
        tw.participates_in_network_stock = False
    network_wh_db.commit()
    assert network_commercially_sellable_qty(network_wh_db, tenant_id=1, product_id=1) == 0.0
