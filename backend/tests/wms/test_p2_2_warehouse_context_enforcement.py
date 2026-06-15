"""P2.2 — warehouse-scoped access enforcement (cross-warehouse denial)."""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.auth.warehouse_deps import (
    load_inventory_document_for_active_warehouse,
    load_production_order_for_active_warehouse,
    load_stock_document_for_active_warehouse,
)
from backend.models.app_user import AppUser
from backend.models.inventory_count.document import InventoryDocument
from backend.models.production import ProductionOrder
from backend.models.stock_document import StockDocument
from backend.models.user_warehouse_assignment import UserWarehouseAssignment
from backend.models.warehouse import Warehouse
from backend.services.user_warehouse_context_service import sync_user_warehouse_assignments
from backend.services.warehouse_scoped_access_service import (
    WarehouseContextMismatchError,
    assert_entity_warehouse_matches_active,
)
from backend.services.wms_warehouse_ownership_service import register_stock_document_warehouse_guard


@pytest.fixture
def wh_db(monkeypatch):
    monkeypatch.setenv("WMS_ENFORCE_WAREHOUSE_ASSIGNMENTS", "hard")
    register_stock_document_warehouse_guard()
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
    AppUser.__table__.create(engine, checkfirst=True)
    UserWarehouseAssignment.__table__.create(engine, checkfirst=True)
    Warehouse.__table__.create(engine, checkfirst=True)
    StockDocument.__table__.create(engine, checkfirst=True)
    InventoryDocument.__table__.create(engine, checkfirst=True)
    ProductionOrder.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(AppUser(id=1, login="op_a", email="a@test.pl", password_hash="x", role="user", is_active=True))
    db.add(Warehouse(id=1, tenant_id=1, name="Magazyn A"))
    db.add(Warehouse(id=2, tenant_id=1, name="Magazyn B"))
    db.commit()
    sync_user_warehouse_assignments(db, user_id=1, warehouse_ids=[1, 2], default_warehouse_id=1)
    db.commit()
    try:
        yield db
    finally:
        db.close()


def test_assert_entity_warehouse_matches_active_success() -> None:
    assert assert_entity_warehouse_matches_active(2, 2) == 2


def test_assert_entity_warehouse_matches_active_cross_wh_404() -> None:
    with pytest.raises(WarehouseContextMismatchError) as exc:
        assert_entity_warehouse_matches_active(2, 1)
    assert exc.value.status_code == 404


def test_load_stock_document_cross_warehouse_denied(wh_db) -> None:
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    assert user is not None
    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        warehouse_id=2,
        status="draft",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(doc)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        load_stock_document_for_active_warehouse(
            db, user, tenant_id=1, document_id=doc.id, active_warehouse_id=1
        )
    assert exc.value.status_code == 404


def test_load_stock_document_same_warehouse_allowed(wh_db) -> None:
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    assert user is not None
    doc = StockDocument(
        tenant_id=1,
        document_type="WZ",
        warehouse_id=1,
        status="draft",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(doc)
    db.commit()

    loaded = load_stock_document_for_active_warehouse(
        db, user, tenant_id=1, document_id=doc.id, active_warehouse_id=1
    )
    assert loaded.id == doc.id


def test_load_inventory_document_cross_warehouse_denied(wh_db) -> None:
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    assert user is not None
    inv = InventoryDocument(
        tenant_id=1,
        warehouse_id=2,
        status="draft",
        number="INV-1",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(inv)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        load_inventory_document_for_active_warehouse(
            db, user, tenant_id=1, document_id=inv.id, active_warehouse_id=1
        )
    assert exc.value.status_code == 404


def test_load_production_order_cross_warehouse_denied(wh_db) -> None:
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    assert user is not None
    order = ProductionOrder(
        tenant_id=1,
        number="MO-1",
        product_id=1,
        warehouse_id=2,
        planned_quantity=1.0,
        produced_quantity=0.0,
        status="draft",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(order)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        load_production_order_for_active_warehouse(
            db, user, tenant_id=1, order_id=order.id, active_warehouse_id=1
        )
    assert exc.value.status_code == 404
