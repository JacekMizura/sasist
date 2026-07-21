"""
Manual WMS PZ receiving lifecycle — regressions for premature DONE / list hide / qty delta.

  python -m pytest backend/tests/wms/test_manual_pz_receiving_lifecycle.py -q
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.app_user import AppUser
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.receiving_document_carrier import ReceivingDocumentCarrier
from backend.models.receiving_scan_log import ReceivingScanLog
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.supplier import Supplier
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.models.warehouse_carrier import WarehouseCarrier
from backend.models.wms_settings import WmsSettings
from backend.schemas.stock_document import PatchStockDocumentItemsBody
from backend.schemas.wms_receiving import WmsReceivingItemQuantityBody
from backend.services.stock_document_service import (
    compute_is_fully_received_for_items,
    compute_line_receiving_progress,
    recalculate_wms_document_completion,
)
from backend.services.wms_receiving_service import (
    ensure_wms_pz_product_anchor_line,
    finish_wms_receiving_pz,
    list_wms_receiving_pz_documents,
    patch_wms_receiving_pz_item_quantity,
)


# ---------------------------------------------------------------------------
# A / F / G — progress SSOT (no DB)
# ---------------------------------------------------------------------------


def test_g_manual_line_first_scan_does_not_fully_receive():
    """ordered_quantity=0 must never become ``received`` after +1."""
    items = [
        SimpleNamespace(id=114, delivery_item_id=None, ordered_quantity=0.0, received_quantity=1.0),
    ]
    assert compute_line_receiving_progress(items) == "in_progress"
    assert compute_is_fully_received_for_items(items) is False


def test_f_expected_partial_keeps_in_progress():
    items = [
        SimpleNamespace(id=1, delivery_item_id=99, ordered_quantity=10.0, received_quantity=7.0),
    ]
    assert compute_line_receiving_progress(items) == "in_progress"
    remaining = 10.0 - 7.0
    assert remaining == 3.0


def test_expected_full_marks_received():
    items = [
        SimpleNamespace(id=1, delivery_item_id=99, ordered_quantity=10.0, received_quantity=10.0),
    ]
    assert compute_line_receiving_progress(items) == "received"
    assert compute_is_fully_received_for_items(items) is True


def test_c_expected_surplus_allowed_progress_received():
    items = [
        SimpleNamespace(id=1, delivery_item_id=99, ordered_quantity=10.0, received_quantity=12.0),
    ]
    assert compute_line_receiving_progress(items) == "received"
    assert float(items[0].received_quantity) - float(items[0].ordered_quantity) == 2.0


def test_g_expected_full_does_not_auto_done_receiving(recv_db):
    """actual >= expected must NOT flip receiving_status to DONE."""
    db, admin = recv_db
    pz_id = _create_manual_pz(db, admin)
    db.add(
        StockDocumentItem(
            document_id=pz_id,
            product_id=50,
            delivery_item_id=501,
            ordered_quantity=10.0,
            received_quantity=10.0,
            quantity=10.0,
        )
    )
    db.commit()
    recalculate_wms_document_completion(db, 1, pz_id)
    raw = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert str(raw.receiving_status).upper() == "IN_PROGRESS"
    assert any(int(r.id) == pz_id for r in list_wms_receiving_pz_documents(db, 1, warehouse_id=1))


def test_c_patch_surplus_over_ordered(recv_db):
    db, admin = recv_db
    pz_id = _create_manual_pz(db, admin)
    db.add(
        StockDocumentItem(
            document_id=pz_id,
            product_id=50,
            delivery_item_id=502,
            ordered_quantity=10.0,
            received_quantity=0.0,
            quantity=0.0,
        )
    )
    db.commit()
    item = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == pz_id, StockDocumentItem.product_id == 50)
        .one()
    )
    patch_wms_receiving_pz_item_quantity(
        db,
        1,
        pz_id,
        int(item.id),
        WmsReceivingItemQuantityBody(quantity_received=12, loose_units_count=12, cartons_count=0),
        performed_by=admin,
    )
    item = db.query(StockDocumentItem).filter(StockDocumentItem.id == int(item.id)).one()
    assert float(item.received_quantity or 0) == 12.0
    raw = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert str(raw.receiving_status).upper() != "DONE"


def test_manual_after_eleven_still_in_progress():
    items = [
        SimpleNamespace(id=114, delivery_item_id=None, ordered_quantity=0.0, received_quantity=11.0),
    ]
    assert compute_line_receiving_progress(items) == "in_progress"


# ---------------------------------------------------------------------------
# Integration fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def recv_db(monkeypatch):
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
        StockOperation,
        ReceivingDocumentCarrier,
        WarehouseCarrier,
        ReceivingScanLog,
        WmsSettings,
        TenantWarehouse,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    wh = Warehouse(id=1, tenant_id=1, name="WH-1", requires_putaway=True)
    db.add(wh)
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=1))
    db.flush()
    dock = Location(
        id=10,
        warehouse_id=1,
        name="DOCK-IN",
        type="floor",
        location_type="DOCK",
    )
    db.add(dock)
    db.add(
        Product(
            id=50,
            tenant_id=1,
            name="Dezodorant test",
            sku="DEZ-1",
            ean="5907546514532",
            sale_price=1.0,
            track_batch=False,
            track_expiry=False,
            track_serial=False,
        )
    )
    db.add(Supplier(id=1, tenant_id=1, name="Dostawca WMS"))
    admin = AppUser(
        id=1,
        login="admin",
        email="admin@test.local",
        password_hash="x",
        first_name="Super",
        last_name="Admin",
        is_active=True,
    )
    db.add(admin)
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

    def _fake_read(db_sess, doc, **_kw):
        return SimpleNamespace(
            id=int(doc.id),
            receiving_status=getattr(doc, "receiving_status", None),
            items=[],
        )

    monkeypatch.setattr(
        "backend.services.wms_receiving_service.build_stock_document_read",
        _fake_read,
    )
    monkeypatch.setattr(
        "backend.services.stock_document_service.build_stock_document_read",
        _fake_read,
    )

    try:
        yield db, admin
    finally:
        db.close()


def _create_manual_pz(db, admin) -> int:
    now = datetime.utcnow()
    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        supplier_id=1,
        delivery_id=None,
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


def test_a_b_c_manual_receive_plus_ten_stays_on_list(recv_db):
    """A+B+C: +1 then +10 → received=11; stays on active list; reopenable."""
    db, admin = recv_db
    pz_id = _create_manual_pz(db, admin)

    ensured, item_id, auto = ensure_wms_pz_product_anchor_line(
        db, 1, pz_id, 50, performed_by=admin, initial_received=1.0
    )
    db.commit()
    assert auto is True
    assert item_id > 0

    raw = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    # Root-cause regression: must NOT flip to DONE after first piece.
    assert str(raw.receiving_status).upper() != "DONE"
    assert str(raw.receiving_status).upper() in ("IN_PROGRESS", "NEW")

    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.ordered_quantity or 0) == 0.0
    assert float(line.received_quantity or 0) == 1.0

    listed = list_wms_receiving_pz_documents(db, 1, warehouse_id=1)
    assert any(int(r.id) == pz_id for r in listed), "PZ znikał z listy po receive 1 (receiving_status=DONE)"

    # Simulate the recalculate path that previously auto-DONE'd inside build_stock_document_read.
    recalculate_wms_document_completion(db, 1, pz_id)
    db.commit()
    raw = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert str(raw.receiving_status).upper() != "DONE"

    patched = patch_wms_receiving_pz_item_quantity(
        db,
        1,
        pz_id,
        item_id,
        WmsReceivingItemQuantityBody(
            quantity_received=10,
            loose_units_count=10,
            cartons_count=0,
        ),
        performed_by=admin,
    )
    assert patched is not None
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.received_quantity or 0) == 11.0

    raw = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert str(raw.receiving_status).upper() != "DONE"
    listed2 = list_wms_receiving_pz_documents(db, 1, warehouse_id=1)
    assert any(int(r.id) == pz_id for r in listed2)

    # DOCK-IN qty must match received (1+10), not double.
    dock_qty = (
        db.query(Inventory)
        .filter(
            Inventory.product_id == 50,
            Inventory.location_id == 10,
            Inventory.warehouse_id == 1,
        )
        .all()
    )
    total_dock = sum(float(i.quantity or 0) for i in dock_qty)
    assert total_dock == pytest.approx(11.0)


def test_d_only_finish_removes_from_active_list(recv_db):
    db, admin = recv_db
    pz_id = _create_manual_pz(db, admin)

    _, item_id, _ = ensure_wms_pz_product_anchor_line(
        db, 1, pz_id, 50, performed_by=admin, initial_received=1.0
    )
    db.commit()

    assert any(int(r.id) == pz_id for r in list_wms_receiving_pz_documents(db, 1, warehouse_id=1))

    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    finish_wms_receiving_pz(
        db,
        1,
        pz_id,
        PatchStockDocumentItemsBody(
            items=[{"id": int(item_id), "received_quantity": float(line.received_quantity or 0)}]
        ),
    )
    raw = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert str(raw.receiving_status).upper() == "DONE"
    assert not any(int(r.id) == pz_id for r in list_wms_receiving_pz_documents(db, 1, warehouse_id=1))


def test_recalculate_does_not_done_open_ended(recv_db):
    db, admin = recv_db
    pz_id = _create_manual_pz(db, admin)
    db.add(
        StockDocumentItem(
            document_id=pz_id,
            product_id=50,
            ordered_quantity=0.0,
            received_quantity=1.0,
            quantity=1.0,
        )
    )
    db.commit()
    recalculate_wms_document_completion(db, 1, pz_id)
    raw = db.query(StockDocument).filter(StockDocument.id == pz_id).one()
    assert str(raw.receiving_status).upper() != "DONE"
    assert str(raw.receiving_status).upper() == "IN_PROGRESS"


def test_h_validation_exclusions_untouched():
    """Per-product skip still disables effective serial (policy SSOT unchanged)."""
    from backend.services.product_validation_policy import resolve_effective_receiving_requirements

    settings = SimpleNamespace(
        validation_policy_migrated=True,
        validation_require_dimensions=False,
        validation_require_weight=False,
        validation_require_batch=False,
        validation_require_expiry=False,
        validation_require_serial=True,
        validation_require_master_carton=False,
        validation_require_master_carton_ean=False,
        validation_require_master_carton_qty=False,
        validation_require_master_carton_dims=False,
        validation_require_master_carton_weight=False,
    )
    product = SimpleNamespace(
        validation_skip_dimensions=False,
        validation_skip_weight=False,
        validation_skip_batch=False,
        validation_skip_expiry=False,
        validation_skip_serial=True,
        validation_skip_master_carton=False,
        validation_skip_master_carton_ean=False,
        validation_skip_master_carton_qty=False,
        validation_skip_master_carton_dims=False,
        validation_skip_master_carton_weight=False,
        require_recv_height=False,
        require_recv_width=False,
        require_recv_length=False,
        require_recv_weight=False,
        require_recv_master_carton=False,
        require_recv_master_carton_ean=False,
        require_recv_master_carton_qty=False,
        require_recv_master_carton_dims=False,
        require_recv_master_carton_weight=False,
        track_batch=False,
        track_expiry=False,
        track_serial=True,
        height=None,
        width=None,
        length=None,
        weight=None,
        bulk_ean=None,
        units_per_carton=None,
        carton_length_cm=None,
        carton_width_cm=None,
        carton_height_cm=None,
        carton_weight_kg=None,
        metadata_json=None,
    )
    eff = resolve_effective_receiving_requirements(product, settings)
    assert eff.track_serial is False
