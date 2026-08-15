"""Regression: ProductionBatch finish-production creates one multi-line PW."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.product_composition import (
    ProductionBatch,
    ProductionBatchLine,
    ProductComposition,
    ProductCompositionLine,
)
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.production_fg_output import ProductionFgOutput
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.warehouse_inventory_movement import WarehouseInventoryMovement
from backend.models.wms_product_warehouse_operation import WmsProductWarehouseOperation
from backend.services.production_batch_service import finish_production
from backend.services.production_execution.batch_putaway_completion import (
    try_complete_production_batch_from_pw_document,
)
from backend.services.production_execution.pw_putaway_handoff import create_batch_pw_documents_for_putaway


def _engine():
    eng = create_engine("sqlite:///:memory:")

    @event.listens_for(eng, "connect")
    def _fk(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=OFF")
        cur.close()

    return eng


@pytest.fixture
def multi_fg_finish_db(monkeypatch):
    monkeypatch.setattr(
        "backend.services.production_execution.pw_putaway_handoff.require_warehouse_series",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("no series")),
    )
    monkeypatch.setattr(
        "backend.services.production_execution.pw_putaway_handoff.upsert_dock_inventory_for_loose_receipt",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.pw_putaway_handoff.append_receipt_operation",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.production_warehouse_audit.record_production_pw_receipt_audit",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_batch_service._batch_has_shortages",
        lambda *_a, **_k: False,
    )
    monkeypatch.setattr(
        "backend.services.production_batch_service.list_tenant_warehouse_ids",
        lambda *_a, **_k: {1},
    )
    monkeypatch.setattr(
        "backend.services.stock_document_service.ensure_default_pz_receiving_location_if_missing",
        lambda db, doc: setattr(doc, "location_id", 99) or None,
    )

    engine = _engine()
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE IF NOT EXISTS app_users (id INTEGER PRIMARY KEY)")
    for model in (
        Tenant,
        Warehouse,
        Location,
        Product,
        ProductComposition,
        ProductCompositionLine,
        ProductionBatch,
        ProductionBatchLine,
        Inventory,
        StockDocument,
        StockDocumentItem,
        StockOperation,
        ProductionFgOutput,
        WarehouseInventoryMovement,
        WmsProductWarehouseOperation,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH1", requires_putaway=True))
    db.add(
        Location(
            id=99,
            warehouse_id=1,
            name="STAGING",
            type="dock",
            location_type="DOCK",
            is_active=True,
        )
    )
    db.add(Product(id=201, tenant_id=1, name="Sznurowadła CAT 100 cm", sku="CAT100"))
    db.add(Product(id=202, tenant_id=1, name="Sznurowadła CAT 150 cm", sku="CAT150"))
    db.add(
        ProductComposition(
            id=1,
            tenant_id=1,
            product_id=201,
            composition_mode="manufacturing",
            name="BOM100",
            is_active=True,
        )
    )
    db.add(
        ProductComposition(
            id=2,
            tenant_id=1,
            product_id=202,
            composition_mode="manufacturing",
            name="BOM150",
            is_active=True,
        )
    )
    batch = ProductionBatch(
        id=16,
        tenant_id=1,
        number="BAT/2026/0016",
        warehouse_id=1,
        status="in_progress",
        execution_interface="WMS",
    )
    db.add(batch)
    db.flush()
    db.add(
        ProductionBatchLine(
            id=1,
            batch_id=16,
            product_id=201,
            composition_id=1,
            planned_quantity=14.0,
            completed_quantity=14.0,
            status="in_progress",
        )
    )
    db.add(
        ProductionBatchLine(
            id=2,
            batch_id=16,
            product_id=202,
            composition_id=2,
            planned_quantity=12.0,
            completed_quantity=12.0,
            status="in_progress",
        )
    )
    db.commit()
    yield db
    db.close()


def test_finish_production_one_pw_two_lines(multi_fg_finish_db):
    db = multi_fg_finish_db
    result = finish_production(db, tenant_id=1, batch_id=16)
    db.commit()

    assert result.status == "awaiting_putaway"
    lines = db.query(ProductionBatchLine).filter(ProductionBatchLine.batch_id == 16).all()
    pw_ids = {int(ln.pw_stock_document_id) for ln in lines}
    assert len(pw_ids) == 1
    pw_id = next(iter(pw_ids))

    pw_docs = (
        db.query(StockDocument)
        .filter(StockDocument.production_batch_id == 16, StockDocument.document_type == "PW")
        .all()
    )
    assert len(pw_docs) == 1
    assert int(pw_docs[0].id) == pw_id

    items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == pw_id)
        .order_by(StockDocumentItem.product_id.asc())
        .all()
    )
    assert len(items) == 2
    by_pid = {int(i.product_id): float(i.quantity) for i in items}
    assert by_pid[201] == pytest.approx(14.0)
    assert by_pid[202] == pytest.approx(12.0)


def test_finish_production_idempotent_no_second_pw(multi_fg_finish_db):
    db = multi_fg_finish_db
    finish_production(db, tenant_id=1, batch_id=16)
    db.commit()
    batch = db.query(ProductionBatch).filter(ProductionBatch.id == 16).one()
    # Force re-call of creator (status would normally block finish_production)
    ids1 = create_batch_pw_documents_for_putaway(db, batch=batch)
    ids2 = create_batch_pw_documents_for_putaway(db, batch=batch)
    db.commit()
    assert ids1 == ids2
    assert len(ids1) == 1
    assert (
        db.query(StockDocument)
        .filter(StockDocument.production_batch_id == 16, StockDocument.document_type == "PW")
        .count()
    ) == 1
    assert (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == ids1[0])
        .count()
    ) == 2


def test_partial_putaway_does_not_complete_batch_until_all_lines(multi_fg_finish_db):
    db = multi_fg_finish_db
    finish_production(db, tenant_id=1, batch_id=16)
    db.commit()

    pw = (
        db.query(StockDocument)
        .filter(StockDocument.production_batch_id == 16, StockDocument.document_type == "PW")
        .one()
    )
    items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(pw.id))
        .order_by(StockDocumentItem.product_id.asc())
        .all()
    )
    assert len(items) == 2

    # Putaway only first FG line — document not DONE → batch stays awaiting_putaway
    items[0].quantity_putaway = float(items[0].received_quantity or 0)
    pw.putaway_status = "IN_PROGRESS"
    pw.relocation_status = "OPEN"
    assert try_complete_production_batch_from_pw_document(db, pw) is False
    batch = db.query(ProductionBatch).filter(ProductionBatch.id == 16).one()
    assert batch.status == "awaiting_putaway"

    # Complete both lines + finalize PW
    items[1].quantity_putaway = float(items[1].received_quantity or 0)
    pw.putaway_status = "DONE"
    pw.relocation_status = "DONE"
    assert try_complete_production_batch_from_pw_document(db, pw) is True
    db.commit()
    batch = db.query(ProductionBatch).filter(ProductionBatch.id == 16).one()
    assert batch.status == "completed"
