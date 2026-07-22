"""
Putaway lifecycle: catch-up 100% ≠ COMPLETED; explicit finalize only (tests A–J).

  python -m pytest backend/tests/wms/test_wms_putaway_explicit_finalize.py -q
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.app_user import AppUser
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.receiving_scan_log import ReceivingScanLog
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_item_location import StockItemLocation
from backend.models.stock_operation import StockOperation
from backend.models.supplier import Supplier
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.models.wms_settings import WmsSettings
from backend.schemas.wms_receiving import WmsReceivingItemQuantityBody
from backend.services.stock_document_service import (
    recalculate_wms_document_completion,
    recompute_putaway_status_for_document,
)
from backend.services.wms_putaway_service import (
    PUTAWAY_REMAINING_CODE,
    RECEIVING_NOT_COMPLETED_CODE,
    PutawayFinalizeError,
    _load_putaway_pz_docs_with_lines,
    finalize_wms_relocation_pz,
)
from backend.services.wms_receiving_service import (
    ensure_wms_pz_product_anchor_line,
    patch_wms_receiving_pz_item_quantity,
)
from backend.services.receiving_workflow_status_service import (
    WH_PUTAWAY_COMPLETED,
    WH_PUTAWAY_IN_PROGRESS,
    derive_warehouse_workflow_status,
)


@pytest.fixture
def inv_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    for model in (
        Warehouse,
        Location,
        Product,
        Supplier,
        AppUser,
        Inventory,
        StockDocument,
        StockDocumentItem,
        StockItemLocation,
        StockOperation,
        TenantWarehouse,
        WmsSettings,
        ReceivingScanLog,
        ActivityEvent,
        ActivityEventLink,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Warehouse(id=1, tenant_id=1, name="WH-1", requires_putaway=True))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=1))
    db.flush()
    db.add(Location(id=10, warehouse_id=1, name="DOCK-IN", type="floor", location_type="DOCK"))
    db.add(Location(id=20, warehouse_id=1, name="A1", type="shelf", location_type="STORAGE"))
    db.add(Supplier(id=1, tenant_id=1, name="Dakoma"))
    db.add(
        Product(
            id=50,
            tenant_id=1,
            name="Prod",
            sku="P1",
            ean="5900000000050",
            sale_price=1.0,
            track_batch=False,
            track_expiry=False,
            track_serial=False,
        )
    )
    admin = AppUser(
        id=1,
        login="jan",
        email="jan@test.local",
        password_hash="x",
        first_name="Jan",
        last_name="Kowalski",
        is_active=True,
    )
    db.add(admin)
    db.commit()

    monkeypatch.setattr(
        "backend.services.wms_receiving_service.record_warehouse_product_operation",
        lambda *a, **k: None,
    )
    monkeypatch.setattr("backend.services.wms_receiving_service._sync_po_from_pz", lambda *a, **k: None)
    monkeypatch.setattr(
        "backend.services.wms_receiving_service.sync_product_purchase_prices_from_pz",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.receiving_workflow_status_service.sync_warehouse_workflow_status",
        lambda *a, **k: False,
    )
    monkeypatch.setattr("backend.services.wms_putaway_service._sync_po_from_pz", lambda *a, **k: None)
    monkeypatch.setattr(
        "backend.services.production_execution.batch_putaway_completion.try_complete_production_execution_from_pw_document",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_receiving_activity.record_pz_activity",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_receiving_service.record_pz_activity",
        lambda *a, **k: None,
    )

    def _fake_read(db_sess, doc, **_kw):
        return SimpleNamespace(
            id=int(doc.id),
            receiving_status=getattr(doc, "receiving_status", None),
            putaway_status=getattr(doc, "putaway_status", None),
            relocation_status=getattr(doc, "relocation_status", None),
            status=getattr(doc, "status", None),
        )

    monkeypatch.setattr("backend.services.wms_receiving_service.build_stock_document_read", _fake_read)
    monkeypatch.setattr("backend.services.stock_document_service.build_stock_document_read", _fake_read)
    monkeypatch.setattr("backend.services.wms_putaway_service.build_stock_document_read", _fake_read)

    try:
        yield db, admin
    finally:
        db.close()


def _pz(db, admin, *, receiving="IN_PROGRESS", doc_type="PZ") -> int:
    now = datetime.utcnow()
    doc = StockDocument(
        tenant_id=1,
        document_type=doc_type,
        supplier_id=1,
        creation_source="WMS" if doc_type == "PZ" else "PRODUCTION",
        warehouse_id=1,
        location_id=10,
        status="draft",
        receiving_status=receiving,
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        created_at=now,
        updated_at=now,
        created_by_user_id=int(admin.id),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return int(doc.id)


def _seed_received_putaway(db, admin, *, receiving, received, putaway, doc_type="PZ"):
    pz_id = _pz(db, admin, receiving=receiving, doc_type=doc_type)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(
        db, 1, pz_id, 50, performed_by=admin, initial_received=0.0
    )
    db.commit()
    if receiving != "DONE":
        patch_wms_receiving_pz_item_quantity(
            db,
            1,
            pz_id,
            item_id,
            WmsReceivingItemQuantityBody(quantity_received=float(received)),
            performed_by=admin,
        )
    else:
        line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
        line.received_quantity = float(received)
        line.quantity = float(received)
        db.commit()
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.quantity_putaway = float(putaway)
    db.commit()
    recalculate_wms_document_completion(db, 1, pz_id)
    db.commit()
    return pz_id, item_id


def test_a_catchup_100_not_completed(inv_db):
    db, admin = inv_db
    pz_id, _ = _seed_received_putaway(db, admin, receiving="IN_PROGRESS", received=14, putaway=14)
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert doc.putaway_status == "IN_PROGRESS"
    assert str(doc.relocation_status or "").upper() != "DONE"
    assert doc.status == "draft"


def test_b_new_receive_after_catchup_reopens_remaining(inv_db):
    db, admin = inv_db
    pz_id, item_id = _seed_received_putaway(
        db, admin, receiving="IN_PROGRESS", received=14, putaway=14
    )
    patch_wms_receiving_pz_item_quantity(
        db,
        1,
        pz_id,
        item_id,
        WmsReceivingItemQuantityBody(quantity_received=20),
        performed_by=admin,
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.received_quantity) == pytest.approx(34.0)
    assert float(line.quantity_putaway) == pytest.approx(14.0)
    remaining = float(line.received_quantity) - float(line.quantity_putaway)
    assert remaining == pytest.approx(20.0)
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert doc.putaway_status == "IN_PROGRESS"
    assert str(doc.relocation_status or "").upper() != "DONE"


def test_c_finalize_while_receiving_open_rejected(inv_db):
    db, admin = inv_db
    pz_id, _ = _seed_received_putaway(db, admin, receiving="IN_PROGRESS", received=14, putaway=14)
    with pytest.raises(PutawayFinalizeError) as ei:
        finalize_wms_relocation_pz(db, 1, pz_id)
    assert ei.value.code == RECEIVING_NOT_COMPLETED_CODE
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert str(doc.relocation_status or "").upper() != "DONE"


def test_d_finalize_with_remaining_rejected(inv_db):
    db, admin = inv_db
    pz_id, _ = _seed_received_putaway(db, admin, receiving="DONE", received=20, putaway=14)
    with pytest.raises(PutawayFinalizeError) as ei:
        finalize_wms_relocation_pz(db, 1, pz_id)
    assert ei.value.code == PUTAWAY_REMAINING_CODE
    assert "6" in ei.value.message


def test_e_receiving_done_full_putaway_no_auto_close(inv_db):
    db, admin = inv_db
    pz_id, _ = _seed_received_putaway(db, admin, receiving="DONE", received=20, putaway=20)
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert str(doc.relocation_status or "").upper() != "DONE"
    assert doc.putaway_status == "IN_PROGRESS"
    assert doc.status == "draft"
    # GET/recalculate side effect must not close
    recalculate_wms_document_completion(db, 1, pz_id)
    db.commit()
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert str(doc.relocation_status or "").upper() != "DONE"


def test_f_explicit_finalize_closes(inv_db):
    db, admin = inv_db
    pz_id, _ = _seed_received_putaway(db, admin, receiving="DONE", received=20, putaway=20)
    with patch(
        "backend.services.complaints.complaint_physical_receipt.filter_putaway_eligible_lines",
        side_effect=lambda _db, rows: list(rows),
    ):
        out = finalize_wms_relocation_pz(db, 1, pz_id)
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert doc.relocation_status == "DONE"
    assert doc.putaway_status == "DONE"
    assert out.relocation_status == "DONE"


def test_g_receiving_done_blocks_further_receive(inv_db):
    db, admin = inv_db
    pz_id, item_id = _seed_received_putaway(db, admin, receiving="DONE", received=20, putaway=20)
    with pytest.raises(ValueError, match="zakończone"):
        patch_wms_receiving_pz_item_quantity(
            db,
            1,
            pz_id,
            item_id,
            WmsReceivingItemQuantityBody(quantity_received=5),
            performed_by=admin,
        )


def test_h_concurrency_no_premature_close(inv_db):
    db, admin = inv_db
    pz_id, item_id = _seed_received_putaway(
        db, admin, receiving="IN_PROGRESS", received=14, putaway=14
    )
    recalculate_wms_document_completion(db, 1, pz_id)
    db.commit()
    assert str(db.query(StockDocument).get(pz_id).relocation_status or "").upper() != "DONE"
    patch_wms_receiving_pz_item_quantity(
        db,
        1,
        pz_id,
        item_id,
        WmsReceivingItemQuantityBody(quantity_received=20),
        performed_by=admin,
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.received_quantity) - float(line.quantity_putaway) == pytest.approx(20.0)
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert str(doc.relocation_status or "").upper() != "DONE"


def test_i_recompute_unit_catchup_stays_in_progress():
    doc = SimpleNamespace(
        document_type="PZ",
        status="draft",
        receiving_status="DONE",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
    )
    line = SimpleNamespace(received_quantity=20.0, quantity_putaway=20.0, product_id=1, wm_kind=None)
    with patch(
        "backend.services.stock_document_service.doc_allows_putaway_status_recompute",
        return_value=True,
    ), patch(
        "backend.services.stock_document_service.is_stock_document_item_wm_material",
        return_value=False,
    ):
        recompute_putaway_status_for_document(doc, [line], db=None)
    assert doc.putaway_status == "IN_PROGRESS"


def test_j_active_list_keeps_catchup_document(inv_db):
    db, admin = inv_db
    pz_id, _ = _seed_received_putaway(db, admin, receiving="IN_PROGRESS", received=14, putaway=14)
    docs, _by = _load_putaway_pz_docs_with_lines(
        db, 1, extra_filters=(StockDocument.warehouse_id == 1,)
    )
    assert any(int(d.id) == pz_id for d in docs)
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    doc.receiving_status = "DONE"
    db.commit()
    with patch(
        "backend.services.complaints.complaint_physical_receipt.filter_putaway_eligible_lines",
        side_effect=lambda _db, rows: list(rows),
    ), patch(
        "backend.services.complaints.complaint_physical_receipt.document_has_putaway_eligible_received_lines",
        return_value=True,
    ):
        finalize_wms_relocation_pz(db, 1, pz_id)
    docs2, _ = _load_putaway_pz_docs_with_lines(
        db, 1, extra_filters=(StockDocument.warehouse_id == 1,)
    )
    assert not any(int(d.id) == pz_id for d in docs2)


def test_workflow_status_catchup_not_completed():
    doc = SimpleNamespace(
        status="draft",
        receiving_status="DONE",
        putaway_status="IN_PROGRESS",
        relocation_status="OPEN",
    )
    line = SimpleNamespace(received_quantity=10.0, quantity_putaway=10.0)
    with patch(
        "backend.services.receiving_workflow_status_service.compute_is_fully_received_for_items",
        return_value=True,
    ), patch(
        "backend.services.receiving_workflow_status_service.compute_is_fully_putaway_for_items",
        return_value=True,
    ), patch(
        "backend.services.receiving_workflow_status_service.is_stock_document_cancelled",
        return_value=False,
    ):
        st = derive_warehouse_workflow_status(doc, [line], db=None, full_recv=True, full_put=True)
    assert st == WH_PUTAWAY_IN_PROGRESS
    assert st != WH_PUTAWAY_COMPLETED
