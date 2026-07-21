"""
No-putaway / cancel putaway obligation (tests P–X).

  python -m pytest backend/tests/wms/test_wms_putaway_no_putaway_handling.py -q
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

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
from backend.services.complaints.complaint_physical_receipt import (
    document_has_putaway_eligible_received_lines,
    stock_document_item_requires_putaway,
)
from backend.services.wms_putaway_handling_service import (
    CANCEL_CODE,
    EVENT_PZ_PUTAWAY_CANCELLED,
    EVENT_PZ_PUTAWAY_HANDLING_CHANGED,
    PutawayHandlingError,
    cancel_putaway_obligation,
    set_putaway_handling,
)
from backend.services.wms_putaway_service import _document_line_putaway_remaining
from backend.services.wms_receiving_service import (
    ensure_wms_pz_product_anchor_line,
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
            name="ProdA",
            sku="PA",
            ean="5900000000050",
            sale_price=1.0,
            track_batch=False,
            track_expiry=False,
            track_serial=False,
        )
    )
    db.add(
        Product(
            id=51,
            tenant_id=1,
            name="ProdB",
            sku="PB",
            ean="5900000000051",
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

    audit_calls: list[dict] = []

    def _capture_activity(*_a, **kwargs):
        audit_calls.append(dict(kwargs))
        return None

    monkeypatch.setattr(
        "backend.services.wms_receiving_activity.record_pz_activity",
        _capture_activity,
    )
    monkeypatch.setattr(
        "backend.services.wms_receiving_service.record_pz_activity",
        _capture_activity,
    )
    monkeypatch.setattr(
        "backend.services.wms_putaway_handling_service.record_pz_activity",
        _capture_activity,
    )

    def _fake_read(db_sess, doc, **_kw):
        return SimpleNamespace(
            id=int(doc.id),
            receiving_status=getattr(doc, "receiving_status", None),
            putaway_status=getattr(doc, "putaway_status", None),
            relocation_status=getattr(doc, "relocation_status", None),
            default_requires_putaway=bool(getattr(doc, "default_requires_putaway", True)),
        )

    monkeypatch.setattr("backend.services.wms_receiving_service.build_stock_document_read", _fake_read)
    monkeypatch.setattr("backend.services.stock_document_service.build_stock_document_read", _fake_read)
    monkeypatch.setattr("backend.services.wms_putaway_handling_service.build_stock_document_read", _fake_read)

    try:
        yield db, admin, audit_calls
    finally:
        db.close()


def _pz(db, admin, *, receiving="IN_PROGRESS", default_requires_putaway=True) -> int:
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
        default_requires_putaway=bool(default_requires_putaway),
        created_at=now,
        updated_at=now,
        created_by_user_id=int(admin.id),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return int(doc.id)


def _dock_qty(db, product_id: int) -> float:
    rows = (
        db.query(Inventory)
        .filter(Inventory.product_id == int(product_id), Inventory.location_id == 10)
        .all()
    )
    return sum(float(r.quantity or 0) for r in rows)


def test_p_standard_receipt_generates_putaway_obligation(inv_db):
    db, admin, _ = inv_db
    pz_id = _pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=10), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert bool(line.requires_putaway) is True
    assert stock_document_item_requires_putaway(line, db=db) is True
    assert _document_line_putaway_remaining(db, line) == pytest.approx(10.0)
    assert _dock_qty(db, 50) == pytest.approx(10.0)
    assert document_has_putaway_eligible_received_lines(
        db, db.query(StockDocumentItem).filter(StockDocumentItem.document_id == pz_id).all()
    )


def test_q_no_putaway_before_stock_no_phantom_dock(inv_db):
    db, admin, _ = inv_db
    pz_id = _pz(db, admin, default_requires_putaway=False)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.requires_putaway = False
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=10), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.received_quantity) == pytest.approx(10.0)
    assert _document_line_putaway_remaining(db, line) == pytest.approx(0.0)
    assert _dock_qty(db, 50) == pytest.approx(0.0)
    assert not document_has_putaway_eligible_received_lines(
        db, db.query(StockDocumentItem).filter(StockDocumentItem.document_id == pz_id).all()
    )


def test_r_qty_match_does_not_skip_putaway(inv_db):
    """document_qty == actual_qty must NOT imply no-putaway."""
    db, admin, _ = inv_db
    pz_id = _pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.quantity = 10.0  # document qty
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=10), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.quantity) == pytest.approx(float(line.received_quantity))
    assert stock_document_item_requires_putaway(line, db=db) is True
    assert _document_line_putaway_remaining(db, line) == pytest.approx(10.0)
    assert _dock_qty(db, 50) == pytest.approx(10.0)


def test_s_cancel_zero_of_x_controlled(inv_db):
    db, admin, audit = inv_db
    pz_id = _pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=14), performed_by=admin
    )
    assert _dock_qty(db, 50) == pytest.approx(14.0)
    cancel_putaway_obligation(db, 1, pz_id, performed_by=admin)
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert bool(line.requires_putaway) is False
    assert _document_line_putaway_remaining(db, line) == pytest.approx(0.0)
    assert _dock_qty(db, 50) == pytest.approx(0.0)
    assert not document_has_putaway_eligible_received_lines(
        db, db.query(StockDocumentItem).filter(StockDocumentItem.document_id == pz_id).all()
    )
    codes = [c.get("event_code") for c in audit]
    assert EVENT_PZ_PUTAWAY_HANDLING_CHANGED in codes
    assert EVENT_PZ_PUTAWAY_CANCELLED in codes


def test_t_cancel_partial_rejected_inventory_unchanged(inv_db):
    db, admin, _ = inv_db
    pz_id = _pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=14), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.quantity_putaway = 2.0
    # Simulate partial putaway: 2 on shelf, 12 still on dock
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            location_id=20,
            product_id=50,
            quantity=2.0,
        )
    )
    dock = db.query(Inventory).filter(Inventory.product_id == 50, Inventory.location_id == 10).first()
    if dock is not None:
        dock.quantity = 12.0
    db.commit()
    dock_before = _dock_qty(db, 50)
    shelf_before = sum(
        float(r.quantity or 0)
        for r in db.query(Inventory).filter(Inventory.product_id == 50, Inventory.location_id == 20).all()
    )
    with pytest.raises(PutawayHandlingError) as ei:
        cancel_putaway_obligation(db, 1, pz_id, performed_by=admin)
    assert ei.value.code == CANCEL_CODE
    assert "część towaru została już rozlokowana" in ei.value.message.lower()
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert bool(line.requires_putaway) is True
    assert _dock_qty(db, 50) == pytest.approx(dock_before)
    shelf_after = sum(
        float(r.quantity or 0)
        for r in db.query(Inventory).filter(Inventory.product_id == 50, Inventory.location_id == 20).all()
    )
    assert shelf_after == pytest.approx(shelf_before)


def test_u_receiving_in_progress_cancel_then_next_receive_honors_mode(inv_db):
    db, admin, _ = inv_db
    pz_id = _pz(db, admin, receiving="IN_PROGRESS")
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=5), performed_by=admin
    )
    cancel_putaway_obligation(db, 1, pz_id, performed_by=admin)
    doc = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert bool(doc.default_requires_putaway) is False
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert bool(line.requires_putaway) is False

    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=10), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.received_quantity) == pytest.approx(15.0)
    assert bool(line.requires_putaway) is False
    assert _document_line_putaway_remaining(db, line) == pytest.approx(0.0)
    assert _dock_qty(db, 50) == pytest.approx(0.0)


def test_v_mixed_receipt_only_standard_line_putaway(inv_db):
    db, admin, _ = inv_db
    pz_id = _pz(db, admin)
    _, id_a, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    _, id_b, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 51, performed_by=admin, initial_received=0.0)
    db.commit()
    # Ordered lines are not purged as WMS ghosts when sibling receives.
    for lid in (id_a, id_b):
        ln = db.query(StockDocumentItem).filter(StockDocumentItem.id == lid).one()
        ln.ordered_quantity = 1.0
        ln.quantity = 1.0
    line_b = db.query(StockDocumentItem).filter(StockDocumentItem.id == id_b).one()
    line_b.requires_putaway = False
    db.commit()

    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, id_a, WmsReceivingItemQuantityBody(quantity_received=100), performed_by=admin
    )
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, id_b, WmsReceivingItemQuantityBody(quantity_received=20), performed_by=admin
    )
    a = db.query(StockDocumentItem).filter(StockDocumentItem.id == id_a).one()
    b = db.query(StockDocumentItem).filter(StockDocumentItem.id == id_b).one()
    assert _document_line_putaway_remaining(db, a) == pytest.approx(100.0)
    assert _document_line_putaway_remaining(db, b) == pytest.approx(0.0)
    assert _dock_qty(db, 50) == pytest.approx(100.0)
    assert _dock_qty(db, 51) == pytest.approx(0.0)
    assert document_has_putaway_eligible_received_lines(
        db, db.query(StockDocumentItem).filter(StockDocumentItem.document_id == pz_id).all()
    )


def test_w_change_handling_full_audit(inv_db):
    db, admin, audit = inv_db
    pz_id = _pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=10), performed_by=admin
    )
    audit.clear()
    set_putaway_handling(db, 1, pz_id, requires_putaway=False, performed_by=admin)
    matching = [c for c in audit if c.get("event_code") == EVENT_PZ_PUTAWAY_HANDLING_CHANGED]
    assert matching
    ev = matching[0]
    assert "STANDARDOWE ROZLOKOWANIE" in (ev.get("description") or "")
    assert "BEZ ROZLOKOWANIA" in (ev.get("description") or "")
    meta = ev.get("metadata") or {}
    assert meta.get("old_handling") == "STANDARD"
    assert meta.get("new_handling") == "NO_PUTAWAY"
    assert meta.get("lines")


def test_x_concurrency_cancel_blocked_when_putaway_started(inv_db):
    """Operator B cannot cancel while putaway already started (row lock + partial gate)."""
    db, admin, _ = inv_db
    pz_id = _pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=10), performed_by=admin
    )
    # Operator A starts putaway (persisted before B's cancel).
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.quantity_putaway = 1.0
    db.commit()

    with pytest.raises(PutawayHandlingError) as ei:
        cancel_putaway_obligation(db, 1, pz_id, performed_by=admin)
    assert ei.value.code == CANCEL_CODE
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert bool(line.requires_putaway) is True
    assert float(line.quantity_putaway) == pytest.approx(1.0)
