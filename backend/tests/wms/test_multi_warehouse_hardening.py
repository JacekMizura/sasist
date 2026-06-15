"""P2.1 — stock document warehouse resolution without auto-assign."""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.stock_document import StockDocument
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.services.stock_document_service import (
    ensure_pz_document_warehouse_resolved,
    set_stock_document_receiving_target,
)
from backend.services.tenant_default_warehouse import ERR_CHOOSE_WAREHOUSE_FOR_DOCUMENT
from backend.services.wms_warehouse_ownership_service import (
    StockDocumentWarehouseRequiredError,
    register_stock_document_warehouse_guard,
    validate_new_stock_document_warehouse_id,
)


@pytest.fixture
def wh_db():
    register_stock_document_warehouse_guard()
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
        conn.execute(text("CREATE TABLE locations (id INTEGER PRIMARY KEY, warehouse_id INTEGER, name VARCHAR)"))
        conn.execute(text("INSERT INTO locations (id, warehouse_id, name) VALUES (10, 1, 'DOCK')"))
        conn.execute(text("INSERT INTO locations (id, warehouse_id, name) VALUES (20, 2, 'DOCK-2')"))
    Warehouse.__table__.create(engine, checkfirst=True)
    TenantWarehouse.__table__.create(engine, checkfirst=True)
    StockDocument.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Warehouse(id=1, tenant_id=1, name="WH-1"))
    db.add(Warehouse(id=2, tenant_id=1, name="WH-2"))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=1))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=2))
    db.commit()
    try:
        yield db
    finally:
        db.close()


def _draft_pz(db, *, warehouse_id=None) -> StockDocument:
    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        warehouse_id=warehouse_id,
        status="draft",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(doc)
    db.flush()
    return doc


def test_ensure_pz_document_warehouse_resolved_no_auto_assign_single_wh(wh_db) -> None:
    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        warehouse_id=None,
        status="draft",
    )
    with pytest.raises(ValueError, match=ERR_CHOOSE_WAREHOUSE_FOR_DOCUMENT):
        ensure_pz_document_warehouse_resolved(wh_db, doc)
    assert doc.warehouse_id is None


def test_ensure_pz_document_warehouse_resolved_returns_explicit_wh(wh_db) -> None:
    doc = _draft_pz(wh_db, warehouse_id=2)
    assert ensure_pz_document_warehouse_resolved(wh_db, doc) == 2


def test_set_receiving_target_no_single_wh_fallback(wh_db) -> None:
    doc = _draft_pz(wh_db, warehouse_id=1)
    doc.warehouse_id = None
    wh_db.commit()
    with pytest.raises(ValueError, match=ERR_CHOOSE_WAREHOUSE_FOR_DOCUMENT):
        set_stock_document_receiving_target(wh_db, tenant_id=1, document_id=doc.id, location_id=10)


def test_stock_document_insert_blocked_without_warehouse(wh_db) -> None:
    with pytest.raises(StockDocumentWarehouseRequiredError):
        validate_new_stock_document_warehouse_id(None, context="PZ")

    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        warehouse_id=None,
        status="draft",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    wh_db.add(doc)
    with pytest.raises(StockDocumentWarehouseRequiredError):
        wh_db.commit()
    wh_db.rollback()
