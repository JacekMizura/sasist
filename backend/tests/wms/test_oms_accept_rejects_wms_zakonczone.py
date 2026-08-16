"""OMS accept must not re-post WMS-complete (status=zakonczone) PZ documents."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.schemas.stock_document import PatchStockDocumentItemsBody, StockDocumentItemPatchLine
from backend.services.stock_document_service import accept_stock_document, patch_stock_document_items


@pytest.fixture
def pz_db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
    for model in (Warehouse, TenantWarehouse, StockDocument, StockDocumentItem):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Warehouse(id=1, tenant_id=1, name="WH-1"))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=1))
    db.flush()
    yield db
    db.close()


def _zakonczone_pz(db) -> StockDocument:
    doc = StockDocument(
        tenant_id=1,
        warehouse_id=1,
        location_id=10,
        document_type="PZ",
        status="zakonczone",
        receiving_status="DONE",
        putaway_status="DONE",
        relocation_status="DONE",
    )
    db.add(doc)
    db.flush()
    db.add(
        StockDocumentItem(
            document_id=int(doc.id),
            product_id=50,
            ordered_quantity=2001,
            received_quantity=2001,
            quantity=2001,
            quantity_putaway=2001,
        )
    )
    db.commit()
    db.refresh(doc)
    return doc


def test_accept_rejects_wms_complete_zakonczone_without_inventory_touch(pz_db):
    doc = _zakonczone_pz(pz_db)
    with pytest.raises(ValueError, match="zakończony w WMS"):
        accept_stock_document(pz_db, 1, int(doc.id))
    pz_db.refresh(doc)
    assert str(doc.status) == "zakonczone"


def test_patch_items_still_rejects_non_draft(pz_db):
    doc = _zakonczone_pz(pz_db)
    line = pz_db.query(StockDocumentItem).filter(StockDocumentItem.document_id == doc.id).one()
    body = PatchStockDocumentItemsBody(
        items=[StockDocumentItemPatchLine(id=int(line.id), received_quantity=2001.0)]
    )
    with pytest.raises(ValueError, match="Only draft documents can be edited"):
        patch_stock_document_items(pz_db, 1, int(doc.id), body)
