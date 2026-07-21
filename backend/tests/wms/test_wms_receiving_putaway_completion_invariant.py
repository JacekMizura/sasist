"""
Receiving vs putaway completion invariant (parallel putaway OK; finalize gated).

  python -m pytest backend/tests/wms/test_wms_receiving_putaway_completion_invariant.py -q
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
from backend.schemas.stock_document import PatchStockDocumentItemsBody
from backend.schemas.wms_receiving import WmsReceivingItemQuantityBody
from backend.services.stock_document_service import (
    recalculate_wms_document_completion,
    recompute_putaway_status_for_document,
)
from backend.services.wms_putaway_service import (
    PUTAWAY_REMAINING_CODE,
    RECEIVING_NOT_COMPLETED_CODE,
    PutawayFinalizeError,
    finalize_wms_relocation_pz,
)
from backend.services.wms_receiving_service import (
    ensure_wms_pz_product_anchor_line,
    finish_wms_receiving_pz,
    patch_wms_receiving_pz_item_quantity,
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
        )

    monkeypatch.setattr("backend.services.wms_receiving_service.build_stock_document_read", _fake_read)
    monkeypatch.setattr("backend.services.stock_document_service.build_stock_document_read", _fake_read)
    monkeypatch.setattr("backend.services.wms_putaway_service.build_stock_document_read", _fake_read)

    try:
        yield db, admin
    finally:
        db.close()


def _pz(db, admin, *, receiving="IN_PROGRESS") -> int:
    now = datetime.utcnow()
    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        supplier_id=1,
        creation_source="WMS",
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


def test_j_remaining_zero_while_receiving_open_not_putaway_done():
    doc = SimpleNamespace(
        document_type="PZ",
        status="draft",
        receiving_status="IN_PROGRESS",
        putaway_status="NOT_STARTED",
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


def test_j_recalculate_does_not_auto_close_relocation_while_receiving_open(inv_db):
    db, admin = inv_db
    pz_id = _pz(db, admin, receiving="IN_PROGRESS")
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=20), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.quantity_putaway = 20.0
    db.commit()
    recalculate_wms_document_completion(db, 1, pz_id)
    db.commit()
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert doc.receiving_status == "IN_PROGRESS"
    assert doc.putaway_status == "IN_PROGRESS"
    assert str(doc.relocation_status or "").upper() != "DONE"


def test_k_finalize_while_receiving_open_rejected(inv_db):
    db, admin = inv_db
    pz_id = _pz(db, admin, receiving="IN_PROGRESS")
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=20), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.quantity_putaway = 20.0
    db.commit()
    with pytest.raises(PutawayFinalizeError) as ei:
        finalize_wms_relocation_pz(db, 1, pz_id)
    assert ei.value.code == RECEIVING_NOT_COMPLETED_CODE
    assert "przyjęcie tej dostawy nadal trwa" in str(ei.value).lower()
    detail = ei.value.to_detail()
    assert detail["code"] == RECEIVING_NOT_COMPLETED_CODE
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert str(doc.relocation_status or "").upper() != "DONE"


def test_l_more_receive_after_putaway_creates_new_remaining(inv_db):
    db, admin = inv_db
    pz_id = _pz(db, admin, receiving="IN_PROGRESS")
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=20), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.quantity_putaway = 20.0
    db.commit()
    recompute_putaway_status_for_document(
        db.query(StockDocument).get(pz_id),
        [line],
        db,
    )
    assert db.query(StockDocument).get(pz_id).putaway_status == "IN_PROGRESS"

    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=10), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.received_quantity) == pytest.approx(30.0)
    remaining = float(line.received_quantity) - float(line.quantity_putaway or 0)
    assert remaining == pytest.approx(10.0)
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert doc.putaway_status == "IN_PROGRESS"
    assert str(doc.relocation_status or "").upper() != "DONE"


def test_m_finalize_blocked_when_remaining_putaway(inv_db):
    db, admin = inv_db
    pz_id = _pz(db, admin, receiving="DONE")
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    # receiving DONE but allow qty patch? finish gate blocks qty when DONE.
    # Seed line quantities directly for finalize gate test.
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.received_quantity = 20.0
    line.quantity = 20.0
    line.quantity_putaway = 10.0
    db.commit()
    with pytest.raises(PutawayFinalizeError) as ei:
        finalize_wms_relocation_pz(db, 1, pz_id)
    assert ei.value.code == PUTAWAY_REMAINING_CODE


def test_n_finalize_ok_when_receiving_done_and_fully_putaway(inv_db):
    db, admin = inv_db
    pz_id = _pz(db, admin, receiving="DONE")
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.received_quantity = 20.0
    line.quantity = 20.0
    line.quantity_putaway = 20.0
    db.commit()
    with patch(
        "backend.services.wms_putaway_service.compute_is_fully_putaway_for_items",
        return_value=True,
    ), patch(
        "backend.services.complaints.complaint_physical_receipt.filter_putaway_eligible_lines",
        side_effect=lambda _db, rows: list(rows),
    ):
        out = finalize_wms_relocation_pz(db, 1, pz_id)
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert doc.relocation_status == "DONE"
    assert doc.putaway_status == "DONE"
    assert out.relocation_status == "DONE"


def test_o_parallel_receive_putaway_lifecycle(inv_db):
    """receive → putaway → receive → putaway: no premature COMPLETED."""
    db, admin = inv_db
    pz_id = _pz(db, admin, receiving="IN_PROGRESS")
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()

    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=20), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.quantity_putaway = 20.0
    db.commit()
    recalculate_wms_document_completion(db, 1, pz_id)
    db.commit()
    doc = db.query(StockDocument).get(pz_id)
    assert doc.putaway_status == "IN_PROGRESS"
    assert doc.relocation_status != "DONE"

    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=15), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.received_quantity) - float(line.quantity_putaway) == pytest.approx(15.0)
    line.quantity_putaway = 35.0
    db.commit()
    recalculate_wms_document_completion(db, 1, pz_id)
    db.commit()
    doc = db.query(StockDocument).get(pz_id)
    assert doc.receiving_status == "IN_PROGRESS"
    assert doc.putaway_status == "IN_PROGRESS"
    assert doc.relocation_status != "DONE"

    with patch(
        "backend.services.complaints.complaint_physical_receipt.filter_putaway_eligible_lines",
        side_effect=lambda _db, rows: list(rows),
    ):
        line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
        finish_wms_receiving_pz(
            db,
            1,
            pz_id,
            PatchStockDocumentItemsBody(
                items=[{"id": int(item_id), "received_quantity": float(line.received_quantity or 0)}]
            ),
        )
    doc = db.query(StockDocument).get(pz_id)
    assert doc.receiving_status == "DONE"
    assert doc.putaway_status == "DONE"
    # After receiving close + full putaway, completion may set relocation DONE (or require finalize).
    if str(doc.relocation_status or "").upper() != "DONE":
        with patch(
            "backend.services.wms_putaway_service.compute_is_fully_putaway_for_items",
            return_value=True,
        ), patch(
            "backend.services.complaints.complaint_physical_receipt.filter_putaway_eligible_lines",
            side_effect=lambda _db, rows: list(rows),
        ):
            finalize_wms_relocation_pz(db, 1, pz_id)
    doc = db.query(StockDocument).get(pz_id)
    assert doc.relocation_status == "DONE"


def test_receiving_done_full_putaway_status_done_unit():
    doc = SimpleNamespace(
        document_type="PZ",
        status="draft",
        receiving_status="DONE",
        putaway_status="IN_PROGRESS",
    )
    line = SimpleNamespace(received_quantity=10.0, quantity_putaway=10.0, product_id=1, wm_kind=None)
    with patch(
        "backend.services.stock_document_service.doc_allows_putaway_status_recompute",
        return_value=True,
    ), patch(
        "backend.services.stock_document_service.is_stock_document_item_wm_material",
        return_value=False,
    ):
        recompute_putaway_status_for_document(doc, [line], db=None)
    assert doc.putaway_status == "DONE"
