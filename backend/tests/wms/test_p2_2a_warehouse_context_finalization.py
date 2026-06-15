"""P2.2A — final YELLOW→GREEN: putaway item, MM draft, production loaders."""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.auth.warehouse_deps import (
    assert_warehouse_scoped_entity_access,
    load_stock_document_item_for_active_warehouse,
    load_production_batch_for_active_warehouse,
)
from backend.models.app_user import AppUser
from backend.models.product_composition import ProductionBatch
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.user_warehouse_assignment import UserWarehouseAssignment
from backend.models.warehouse import Warehouse
from backend.services.user_warehouse_context_service import sync_user_warehouse_assignments
from backend.services.warehouse_scoped_access_service import WarehouseContextMismatchError
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
    StockDocumentItem.__table__.create(engine, checkfirst=True)
    ProductionBatch.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(AppUser(id=1, login="op", email="op@test.pl", password_hash="x", role="user", is_active=True))
    db.add(Warehouse(id=1, tenant_id=1, name="Magazyn A"))
    db.add(Warehouse(id=2, tenant_id=1, name="Magazyn B"))
    db.commit()
    sync_user_warehouse_assignments(db, user_id=1, warehouse_ids=[1, 2], default_warehouse_id=1)
    db.commit()
    try:
        yield db
    finally:
        db.close()


def _pz_with_line(db, *, warehouse_id: int) -> tuple[StockDocument, StockDocumentItem]:
    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        warehouse_id=warehouse_id,
        status="draft",
        receiving_status="IN_PROGRESS",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(doc)
    db.flush()
    item = StockDocumentItem(
        document_id=doc.id,
        product_id=1,
        ordered_quantity=10.0,
        received_quantity=5.0,
        quantity_putaway=0.0,
        quantity=10.0,
    )
    db.add(item)
    db.commit()
    return doc, item


def test_load_stock_document_item_cross_warehouse_denied(wh_db) -> None:
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    assert user is not None
    _doc, item = _pz_with_line(db, warehouse_id=2)

    with pytest.raises(HTTPException) as exc:
        load_stock_document_item_for_active_warehouse(
            db, user, tenant_id=1, item_id=item.id, active_warehouse_id=1
        )
    assert exc.value.status_code == 404


def test_load_stock_document_item_same_warehouse_allowed(wh_db) -> None:
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    assert user is not None
    _doc, item = _pz_with_line(db, warehouse_id=1)

    row, doc = load_stock_document_item_for_active_warehouse(
        db, user, tenant_id=1, item_id=item.id, active_warehouse_id=1
    )
    assert row.id == item.id
    assert doc.warehouse_id == 1


def test_mm_draft_source_warehouse_must_match_active(wh_db) -> None:
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    assert user is not None

    with pytest.raises(WarehouseContextMismatchError):
        assert_warehouse_scoped_entity_access(db, user, 2, 1)


def test_production_batch_cross_warehouse_denied(wh_db) -> None:
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    assert user is not None
    batch = ProductionBatch(
        tenant_id=1,
        number="B-1",
        warehouse_id=2,
        status="planned",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(batch)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        load_production_batch_for_active_warehouse(
            db, user, tenant_id=1, batch_id=batch.id, active_warehouse_id=1
        )
    assert exc.value.status_code == 404
