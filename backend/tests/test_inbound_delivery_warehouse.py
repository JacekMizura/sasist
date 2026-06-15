"""InboundDelivery requires warehouse_id at insert."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inbound_delivery import InboundDelivery
from backend.models.supplier import Supplier
from backend.services.inbound_delivery_warehouse_service import (
    ERR_INBOUND_DELIVERY_NO_WAREHOUSE,
    InboundDeliveryWarehouseRequiredError,
    register_inbound_delivery_warehouse_guard,
    validate_inbound_delivery_warehouse_id,
)


@pytest.fixture
def delivery_db():
    register_inbound_delivery_warehouse_guard()
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
        conn.execute(text("CREATE TABLE warehouses (id INTEGER PRIMARY KEY, tenant_id INTEGER, name VARCHAR)"))
        conn.execute(text("INSERT INTO warehouses (id, tenant_id, name) VALUES (1, 1, 'WH')"))
    Supplier.__table__.create(engine, checkfirst=True)
    InboundDelivery.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Supplier(id=1, tenant_id=1, name="Sup", active=True))
    db.commit()
    try:
        yield db
    finally:
        db.close()


def test_validate_rejects_none() -> None:
    with pytest.raises(InboundDeliveryWarehouseRequiredError):
        validate_inbound_delivery_warehouse_id(None)


def test_orm_blocks_insert_without_warehouse(delivery_db) -> None:
    d = InboundDelivery(tenant_id=1, supplier_id=1, status="draft")
    delivery_db.add(d)
    with pytest.raises(InboundDeliveryWarehouseRequiredError):
        delivery_db.flush()


def test_orm_allows_insert_with_warehouse(delivery_db) -> None:
    d = InboundDelivery(tenant_id=1, supplier_id=1, warehouse_id=1, status="draft")
    delivery_db.add(d)
    delivery_db.flush()
    assert d.id is not None
