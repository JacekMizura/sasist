"""P2.1 — Purchase order warehouse_id hardening."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.purchase_order import PurchaseOrder
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.services.purchasing_order_service import (
    ERR_PO_WAREHOUSE_REQUIRED,
    create_orders_from_generator,
)


@pytest.fixture
def po_db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1), (2)"))
    Warehouse.__table__.create(engine, checkfirst=True)
    TenantWarehouse.__table__.create(engine, checkfirst=True)
    PurchaseOrder.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Warehouse(id=1, tenant_id=1, name="WH-1"))
    db.add(Warehouse(id=2, tenant_id=1, name="WH-2"))
    db.add(Warehouse(id=99, tenant_id=2, name="Other tenant WH"))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=1))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=2))
    db.commit()
    try:
        yield db
    finally:
        db.close()


def test_create_orders_from_generator_rejects_missing_warehouse(po_db) -> None:
    with pytest.raises(HTTPException) as exc:
        create_orders_from_generator(
            po_db,
            tenant_id=1,
            warehouse_id=None,  # type: ignore[arg-type]
            product_ids=[1],
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == ERR_PO_WAREHOUSE_REQUIRED


def test_create_orders_from_generator_rejects_foreign_tenant_warehouse(po_db) -> None:
    with pytest.raises(HTTPException) as exc:
        create_orders_from_generator(po_db, tenant_id=1, warehouse_id=99, product_ids=[1])
    assert exc.value.status_code == 400
    assert "warehouse_id is not linked" in str(exc.value.detail)


def test_create_orders_from_generator_accepts_valid_warehouse_single_wh_tenant(po_db) -> None:
    """Single-warehouse tenant still requires explicit warehouse_id (no auto-pick)."""
    with pytest.raises(HTTPException) as exc:
        create_orders_from_generator(po_db, tenant_id=1, warehouse_id=None, product_ids=[1])  # type: ignore[arg-type]
    assert exc.value.detail == ERR_PO_WAREHOUSE_REQUIRED
