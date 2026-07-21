"""
WMS receiving: quantity correction, defects (REJECTED_STOCK), delete A/B/C.

  python -m pytest backend/tests/wms/test_wms_receiving_correction_defect_delete.py -q
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
from backend.models.receiving_document_carrier import ReceivingDocumentCarrier
from backend.models.receiving_scan_log import ReceivingScanLog
from backend.models.stock_item_location import StockItemLocation
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.supplier import Supplier
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.models.warehouse_carrier import WarehouseCarrier
from backend.models.wms_settings import WmsSettings
from backend.models.wms_product_warehouse_operation import WmsProductWarehouseOperation
from backend.schemas.wms_receiving import WmsReceivingItemQuantityBody, WmsReceivingMarkDamagedBody
from backend.services.activity_log import list_activity_for_object
from backend.services.inventory_lot_keys import NO_EXPIRY_SENTINEL
from backend.services.stock_disposition import (
    STOCK_DISPOSITION_REJECTED_STOCK,
    STOCK_DISPOSITION_SALEABLE,
    stock_disposition_for_document_line,
)
from backend.services.wms_putaway_service import _transfer_from_dock_to_location
from backend.services.wms_receiving_activity import EVENT_PZ_PRODUCT_RECEIVED, EVENT_PZ_RECEIVE_REVERTED
from backend.services.wms_receiving_line_commercial import remove_wms_receiving_extra_line
from backend.services.wms_receiving_service import (
    ensure_wms_pz_product_anchor_line,
    mark_wms_receiving_pz_item_damaged,
    patch_wms_receiving_pz_item_quantity,
)


@pytest.fixture
def flow_db(monkeypatch):
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
        ReceivingDocumentCarrier,
        WarehouseCarrier,
        ReceivingScanLog,
        WmsSettings,
        TenantWarehouse,
        ActivityEvent,
        ActivityEventLink,
        WmsProductWarehouseOperation,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(Warehouse(id=1, tenant_id=1, name="WH-1", requires_putaway=True))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=1))
    db.flush()
    db.add(Location(id=10, warehouse_id=1, name="DOCK-IN", type="floor", location_type="DOCK"))
    db.add(Location(id=20, warehouse_id=1, name="A1-A-1", type="shelf", location_type="STORAGE"))
    db.add(Location(id=21, warehouse_id=1, name="A1-A-4", type="shelf", location_type="STORAGE"))
    db.add(Supplier(id=1, tenant_id=1, name="Dakoma"))
    db.add(
        Product(
            id=50,
            tenant_id=1,
            name="Sznurówadła CAT 100 cm",
            sku="SZN-100",
            ean="5900000000050",
            sale_price=99.0,
            purchase_price=10.0,
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
    anna = AppUser(
        id=2,
        login="anna",
        email="anna@test.local",
        password_hash="x",
        first_name="Anna",
        last_name="Nowak",
        is_active=True,
    )
    db.add(admin)
    db.add(anna)
    db.commit()

    monkeypatch.setattr(
        "backend.services.wms_receiving_service.record_warehouse_product_operation",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_receiving_service._sync_po_from_pz",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_receiving_service.sync_product_purchase_prices_from_pz",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.receiving_workflow_status_service.sync_warehouse_workflow_status",
        lambda *a, **k: False,
    )
    monkeypatch.setattr(
        "backend.services.warehouse_inventory_movement_service.safe_record_damage_movement",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_putaway_service._sync_po_from_pz",
        lambda *a, **k: None,
    )

    def _fake_read(db_sess, doc, **_kw):
        return SimpleNamespace(id=int(doc.id), items=[])

    monkeypatch.setattr("backend.services.wms_receiving_service.build_stock_document_read", _fake_read)
    monkeypatch.setattr("backend.services.stock_document_service.build_stock_document_read", _fake_read)
    monkeypatch.setattr(
        "backend.services.wms_receiving_line_commercial.build_stock_document_read",
        _fake_read,
    )

    try:
        yield db, admin, anna
    finally:
        db.close()


def _create_pz(db, admin) -> int:
    now = datetime.utcnow()
    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        supplier_id=1,
        creation_source="WMS",
        warehouse_id=1,
        location_id=10,
        status="draft",
        receiving_status="IN_PROGRESS",
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


def _simulate_putaway(db, line: StockDocumentItem, *, location_id: int, qty: float) -> None:
    """Transfer DOCK→location with line disposition + bump quantity_putaway (no full putaway side-effects)."""
    doc = db.query(StockDocument).filter(StockDocument.id == int(line.document_id)).one()
    dock_id = int(doc.location_id)
    sd = stock_disposition_for_document_line(line)
    _transfer_from_dock_to_location(
        db,
        tenant_id=int(doc.tenant_id),
        row=line,
        doc=doc,
        dock_id=dock_id,
        target_location_id=int(location_id),
        loc_uuid=None,
        quantity=float(qty),
        from_carrier_id=None,
        to_carrier_id=None,
        bn="",
        ed_store=NO_EXPIRY_SENTINEL,
        sd=sd,
    )
    line.quantity_putaway = float(line.quantity_putaway or 0) + float(qty)
    db.add(line)
    db.commit()


def _dock_qty(db, *, product_id: int = 50, disposition: str = STOCK_DISPOSITION_SALEABLE) -> float:
    rows = (
        db.query(Inventory)
        .filter(
            Inventory.product_id == product_id,
            Inventory.location_id == 10,
            Inventory.stock_disposition == disposition,
        )
        .all()
    )
    return sum(float(r.quantity or 0) for r in rows)


def _loc_qty(db, *, location_id: int, disposition: str) -> float:
    rows = (
        db.query(Inventory)
        .filter(
            Inventory.product_id == 50,
            Inventory.location_id == location_id,
            Inventory.stock_disposition == disposition,
        )
        .all()
    )
    return sum(float(r.quantity or 0) for r in rows)


def test_a_receive_correct_dock_and_audit(flow_db):
    db, admin, _ = flow_db
    pz_id = _create_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=10, loose_units_count=10), performed_by=admin
    )
    assert float(db.query(StockDocumentItem).get(item_id).received_quantity) == pytest.approx(10.0)
    assert _dock_qty(db) == pytest.approx(10.0)

    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=-3), performed_by=admin
    )
    line = db.query(StockDocumentItem).get(item_id)
    assert float(line.received_quantity) == pytest.approx(7.0)
    assert _dock_qty(db) == pytest.approx(7.0)
    logs = db.query(ReceivingScanLog).filter(ReceivingScanLog.document_id == pz_id).all()
    assert any(float(l.quantity_added) == 10.0 for l in logs)
    assert any(float(l.quantity_added) == -3.0 for l in logs)
    acts = list_activity_for_object(db, object_type="document", object_id=pz_id)
    assert any(a["event_code"] == EVENT_PZ_PRODUCT_RECEIVED for a in acts)
    assert any(a["event_code"] == EVENT_PZ_RECEIVE_REVERTED for a in acts)


def test_b_correction_blocked_below_putaway(flow_db):
    db, admin, _ = flow_db
    pz_id = _create_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=10), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    _simulate_putaway(db, line, location_id=20, qty=8)
    dock_before = _dock_qty(db)
    line_before = float(db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one().received_quantity)
    with pytest.raises(ValueError, match="rozlokowanej"):
        patch_wms_receiving_pz_item_quantity(
            db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=-3), performed_by=admin
        )
    db.rollback()
    assert float(db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one().received_quantity) == pytest.approx(
        line_before
    )
    assert _dock_qty(db) == pytest.approx(dock_before)
    assert _loc_qty(db, location_id=20, disposition=STOCK_DISPOSITION_SALEABLE) == pytest.approx(8.0)


def test_c_defect_split_good_rejected(flow_db):
    db, admin, _ = flow_db
    pz_id = _create_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=23), performed_by=admin
    )
    mark_wms_receiving_pz_item_damaged(
        db, 1, pz_id, item_id, WmsReceivingMarkDamagedBody(quantity=3, description="uszkodzone"), performed_by=admin
    )
    lines = db.query(StockDocumentItem).filter(StockDocumentItem.document_id == pz_id).all()
    total = sum(float(x.received_quantity or 0) for x in lines)
    good = sum(
        float(x.received_quantity or 0)
        for x in lines
        if (getattr(x, "stock_disposition", None) or STOCK_DISPOSITION_SALEABLE) == STOCK_DISPOSITION_SALEABLE
    )
    bad = sum(
        float(x.received_quantity or 0)
        for x in lines
        if getattr(x, "stock_disposition", None) == STOCK_DISPOSITION_REJECTED_STOCK
    )
    assert total == pytest.approx(23.0)
    assert good == pytest.approx(20.0)
    assert bad == pytest.approx(3.0)
    assert _dock_qty(db, disposition=STOCK_DISPOSITION_SALEABLE) == pytest.approx(20.0)
    assert _dock_qty(db, disposition=STOCK_DISPOSITION_REJECTED_STOCK) == pytest.approx(3.0)


def test_d_e_putaway_keeps_disposition(flow_db):
    db, admin, _ = flow_db
    pz_id = _create_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=23), performed_by=admin
    )
    mark_wms_receiving_pz_item_damaged(
        db, 1, pz_id, item_id, WmsReceivingMarkDamagedBody(quantity=3), performed_by=admin
    )
    good_line = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == pz_id, StockDocumentItem.id == item_id)
        .one()
    )
    bad_line = (
        db.query(StockDocumentItem)
        .filter(
            StockDocumentItem.document_id == pz_id,
            StockDocumentItem.stock_disposition == STOCK_DISPOSITION_REJECTED_STOCK,
        )
        .one()
    )
    _simulate_putaway(db, good_line, location_id=20, qty=20)
    _simulate_putaway(db, bad_line, location_id=21, qty=3)
    assert _loc_qty(db, location_id=20, disposition=STOCK_DISPOSITION_SALEABLE) == pytest.approx(20.0)
    assert _loc_qty(db, location_id=21, disposition=STOCK_DISPOSITION_REJECTED_STOCK) == pytest.approx(3.0)
    assert _loc_qty(db, location_id=21, disposition=STOCK_DISPOSITION_SALEABLE) == pytest.approx(0.0)
    assert _dock_qty(db, disposition=STOCK_DISPOSITION_SALEABLE) == pytest.approx(0.0)
    assert _dock_qty(db, disposition=STOCK_DISPOSITION_REJECTED_STOCK) == pytest.approx(0.0)


def test_f_delete_unreceived_extra(flow_db):
    db, admin, _ = flow_db
    pz_id = _create_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    remove_wms_receiving_extra_line(db, 1, pz_id, item_id, performed_by=admin)
    assert db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).first() is None


def test_g_delete_received_withdraws_dock(flow_db):
    db, admin, _ = flow_db
    pz_id = _create_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=6), performed_by=admin
    )
    assert _dock_qty(db) == pytest.approx(6.0)
    remove_wms_receiving_extra_line(db, 1, pz_id, item_id, performed_by=admin)
    assert db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).first() is None
    assert _dock_qty(db) == pytest.approx(0.0)
    acts = list_activity_for_object(db, object_type="document", object_id=pz_id)
    assert any(a["event_code"] == EVENT_PZ_RECEIVE_REVERTED for a in acts)
    assert any("Usunięto" in (a["description"] or "") or "Wycofano" in (a["description"] or "") for a in acts)


def test_h_delete_after_putaway_rejected(flow_db):
    db, admin, _ = flow_db
    pz_id = _create_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=6), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    _simulate_putaway(db, line, location_id=20, qty=2)
    dock_before = _dock_qty(db)
    loc_before = _loc_qty(db, location_id=20, disposition=STOCK_DISPOSITION_SALEABLE)
    with pytest.raises(ValueError, match="rozlokowana"):
        remove_wms_receiving_extra_line(db, 1, pz_id, item_id, performed_by=admin)
    db.rollback()
    assert db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one() is not None
    assert _dock_qty(db) == pytest.approx(dock_before)
    assert _loc_qty(db, location_id=20, disposition=STOCK_DISPOSITION_SALEABLE) == pytest.approx(loc_before)


def test_i_concurrent_correction_vs_putaway_floor(flow_db):
    """Operator A putaway leaves floor; operator B correction must not go below it."""
    db, admin, anna = flow_db
    pz_id = _create_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=10), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    _simulate_putaway(db, line, location_id=20, qty=8)
    # Remaining on DOCK = 2; correction -3 would yield received=7 < putaway=8 → reject
    with pytest.raises(ValueError, match="rozlokowanej"):
        patch_wms_receiving_pz_item_quantity(
            db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=-3), performed_by=admin
        )
    db.rollback()
    # Safe correction of remaining dock qty (-2 → received=8 == putaway)
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=-2), performed_by=admin
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.received_quantity) == pytest.approx(8.0)
    assert float(line.quantity_putaway) == pytest.approx(8.0)
    assert _dock_qty(db) == pytest.approx(0.0)
    assert _loc_qty(db, location_id=20, disposition=STOCK_DISPOSITION_SALEABLE) == pytest.approx(8.0)
