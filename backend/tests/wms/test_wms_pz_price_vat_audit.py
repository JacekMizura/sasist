"""
Manual WMS PZ — last purchase price autofill, VAT snapshot, Activity Log audit.

  python -m pytest backend/tests/wms/test_wms_pz_price_vat_audit.py -q
"""

from __future__ import annotations

import json
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
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.supplier import Supplier
from backend.models.supplier_product import SupplierProduct
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.models.warehouse_carrier import WarehouseCarrier
from backend.models.wms_settings import WmsSettings
from backend.schemas.wms_receiving import (
    WmsReceivingItemQuantityBody,
    WmsReceivingLineCommercialBody,
    WmsReceivingMarkDamagedBody,
)
from backend.services.activity_log import list_activity_for_object
from backend.services.cart_lifecycle_event_catalog import title_pl
from backend.services.product_cost_service import resolve_suggested_purchase_price_net_for_pz
from backend.services.wms_receiving_activity import (
    EVENT_PZ_PRICE_CHANGED,
    EVENT_PZ_PRODUCT_RECEIVED,
    EVENT_PZ_RECEIVE_REVERTED,
    EVENT_PZ_VAT_CHANGED,
)
from backend.services.wms_receiving_line_commercial import patch_wms_receiving_line_commercial
from backend.services.wms_receiving_service import (
    ensure_wms_pz_product_anchor_line,
    mark_wms_receiving_pz_item_damaged,
    patch_wms_receiving_pz_item_quantity,
)
from backend.utils.product_vat import product_vat_rate_percent


def _meta_vat(pct: float) -> str:
    return json.dumps({"product_ui": {"vat_rate": pct}}, ensure_ascii=False)


@pytest.fixture
def audit_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1), (2)"))

    for model in (
        Warehouse,
        Location,
        Product,
        Supplier,
        SupplierProduct,
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
        ActivityEvent,
        ActivityEventLink,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(Warehouse(id=1, tenant_id=1, name="WH-1", requires_putaway=True))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=1))
    db.flush()
    db.add(
        Location(id=10, warehouse_id=1, name="DOCK-IN", type="floor", location_type="DOCK")
    )
    db.add(Supplier(id=1, tenant_id=1, name="Dakoma"))
    db.add(Supplier(id=2, tenant_id=1, name="Anel"))
    db.add(Supplier(id=99, tenant_id=2, name="OtherTenant"))
    db.add(
        Product(
            id=50,
            tenant_id=1,
            name="Sznurówadła CAT 150 cm",
            sku="SZN-1",
            ean="5900000000050",
            sale_price=99.0,
            purchase_price=None,
            metadata_json=_meta_vat(23),
            track_batch=False,
            track_expiry=False,
            track_serial=False,
        )
    )
    db.add(
        Product(
            id=51,
            tenant_id=1,
            name="Produkt 8%",
            sku="VAT8",
            ean="5900000000051",
            sale_price=10.0,
            purchase_price=None,
            metadata_json=_meta_vat(8),
            track_batch=False,
            track_expiry=False,
            track_serial=False,
        )
    )
    db.add(
        Product(
            id=52,
            tenant_id=1,
            name="Bez historii ceny",
            sku="NO-PRICE",
            ean="5900000000052",
            sale_price=5.0,
            purchase_price=None,
            metadata_json=_meta_vat(5),
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

    def _fake_read(db_sess, doc, **_kw):
        return SimpleNamespace(id=int(doc.id), receiving_status=getattr(doc, "receiving_status", None), items=[])

    monkeypatch.setattr(
        "backend.services.wms_receiving_service.build_stock_document_read",
        _fake_read,
    )
    monkeypatch.setattr(
        "backend.services.stock_document_service.build_stock_document_read",
        _fake_read,
    )
    monkeypatch.setattr(
        "backend.services.wms_receiving_line_commercial.build_stock_document_read",
        _fake_read,
    )

    try:
        yield db, admin, anna
    finally:
        db.close()


def _create_manual_pz(db, admin, *, supplier_id: int = 1) -> int:
    now = datetime.utcnow()
    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        supplier_id=supplier_id,
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


def _post_historical_pz(db, *, product_id: int, supplier_id: int, price: float, when: datetime) -> None:
    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        supplier_id=supplier_id,
        warehouse_id=1,
        location_id=10,
        status="posted",
        receiving_status="DONE",
        created_at=when,
        updated_at=when,
    )
    db.add(doc)
    db.flush()
    db.add(
        StockDocumentItem(
            document_id=int(doc.id),
            product_id=product_id,
            ordered_quantity=1.0,
            received_quantity=1.0,
            quantity=1.0,
            purchase_price_net=price,
            vat_rate=23.0,
        )
    )
    db.commit()


def test_a_last_purchase_price_autofill(audit_db):
    db, admin, _anna = audit_db
    _post_historical_pz(db, product_id=50, supplier_id=1, price=12.50, when=datetime(2026, 1, 1))
    pz_id = _create_manual_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(
        db, 1, pz_id, 50, performed_by=admin, initial_received=0.0
    )
    db.commit()
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.purchase_price_net) == pytest.approx(12.50)


def test_b_latest_of_several_prices(audit_db):
    db, admin, _ = audit_db
    _post_historical_pz(db, product_id=50, supplier_id=1, price=10.0, when=datetime(2026, 1, 1))
    _post_historical_pz(db, product_id=50, supplier_id=1, price=14.25, when=datetime(2026, 6, 1))
    assert resolve_suggested_purchase_price_net_for_pz(db, 1, 50, supplier_id=1) == pytest.approx(14.25)


def test_c_supplier_specific_price(audit_db):
    db, admin, _ = audit_db
    _post_historical_pz(db, product_id=50, supplier_id=1, price=12.50, when=datetime(2026, 6, 1))
    _post_historical_pz(db, product_id=50, supplier_id=2, price=9.99, when=datetime(2026, 7, 1))
    assert resolve_suggested_purchase_price_net_for_pz(db, 1, 50, supplier_id=1) == pytest.approx(12.50)
    assert resolve_suggested_purchase_price_net_for_pz(db, 1, 50, supplier_id=2) == pytest.approx(9.99)


def test_d_no_price_stays_none_not_zero(audit_db):
    db, admin, _ = audit_db
    pz_id = _create_manual_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(
        db, 1, pz_id, 52, performed_by=admin, initial_received=0.0
    )
    db.commit()
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert line.purchase_price_net is None
    assert resolve_suggested_purchase_price_net_for_pz(db, 1, 52, supplier_id=1) is None


def test_e_f_vat_from_product_card(audit_db):
    db, admin, _ = audit_db
    pz_id = _create_manual_pz(db, admin)
    _, id23, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    _, id8, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 51, performed_by=admin, initial_received=0.0)
    db.commit()
    assert float(db.query(StockDocumentItem).get(id23).vat_rate) == pytest.approx(23.0)
    assert float(db.query(StockDocumentItem).get(id8).vat_rate) == pytest.approx(8.0)
    assert product_vat_rate_percent(_meta_vat(5)) == pytest.approx(5.0)


def test_g_vat_snapshot_survives_product_change(audit_db):
    db, admin, _ = audit_db
    pz_id = _create_manual_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    prod = db.query(Product).filter(Product.id == 50).one()
    prod.metadata_json = _meta_vat(8)
    db.commit()
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.vat_rate) == pytest.approx(23.0)


def test_h_i_rescan_does_not_overwrite_manual_price_vat(audit_db):
    db, admin, _ = audit_db
    _post_historical_pz(db, product_id=50, supplier_id=1, price=12.50, when=datetime(2026, 1, 1))
    pz_id = _create_manual_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_line_commercial(
        db,
        1,
        pz_id,
        item_id,
        WmsReceivingLineCommercialBody(purchase_price_net=13.20, vat_rate=8.0),
        performed_by=admin,
    )
    ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=1.0)
    db.commit()
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.purchase_price_net) == pytest.approx(13.20)
    assert float(line.vat_rate) == pytest.approx(8.0)


def test_j_k_l_receive_logs_per_operator(audit_db):
    db, admin, anna = audit_db
    pz_id = _create_manual_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db,
        1,
        pz_id,
        item_id,
        WmsReceivingItemQuantityBody(quantity_received=10, loose_units_count=10),
        performed_by=admin,
    )
    patch_wms_receiving_pz_item_quantity(
        db,
        1,
        pz_id,
        item_id,
        WmsReceivingItemQuantityBody(quantity_received=5, loose_units_count=5),
        performed_by=anna,
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.received_quantity) == pytest.approx(15.0)
    logs = (
        db.query(ReceivingScanLog)
        .filter(ReceivingScanLog.document_id == pz_id)
        .order_by(ReceivingScanLog.id.asc())
        .all()
    )
    assert [(int(l.admin_id), float(l.quantity_added)) for l in logs] == [(1, 10.0), (2, 5.0)]
    acts = list_activity_for_object(db, object_type="document", object_id=pz_id)
    recv = [a for a in acts if a["event_code"] == EVENT_PZ_PRODUCT_RECEIVED]
    assert len(recv) >= 2
    assert any("10" in (a["description"] or "") and a["actor_user_id"] == 1 for a in recv)
    assert any("5" in (a["description"] or "") and a["actor_user_id"] == 2 for a in recv)


def test_m_n_price_vat_old_new_audit(audit_db):
    db, admin, _ = audit_db
    pz_id = _create_manual_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    line.purchase_price_net = 88.74
    line.vat_rate = 23.0
    db.commit()
    patch_wms_receiving_line_commercial(
        db,
        1,
        pz_id,
        item_id,
        WmsReceivingLineCommercialBody(purchase_price_net=91.20, vat_rate=8.0),
        performed_by=admin,
    )
    acts = list_activity_for_object(db, object_type="document", object_id=pz_id)
    price_ev = next(a for a in acts if a["event_code"] == EVENT_PZ_PRICE_CHANGED)
    vat_ev = next(a for a in acts if a["event_code"] == EVENT_PZ_VAT_CHANGED)
    assert "88,74" in price_ev["description"] and "91,20" in price_ev["description"]
    assert "23" in vat_ev["description"] and "8" in vat_ev["description"]
    assert price_ev["actor_user_id"] == 1
    assert title_pl(EVENT_PZ_PRICE_CHANGED) == "Zmieniono cenę"
    assert title_pl(EVENT_PZ_VAT_CHANGED) == "Zmieniono VAT"


def test_o_defect_audit(audit_db):
    db, admin, _ = audit_db
    pz_id = _create_manual_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=5.0)
    db.commit()
    mark_wms_receiving_pz_item_damaged(
        db,
        1,
        pz_id,
        item_id,
        WmsReceivingMarkDamagedBody(quantity=2, description="Uszkodzone opakowanie"),
        performed_by=admin,
    )
    acts = list_activity_for_object(db, object_type="document", object_id=pz_id)
    assert any("wadliw" in (a["description"] or "").lower() and "2" in (a["description"] or "") for a in acts)


def test_p_revert_keeps_original_receive(audit_db):
    db, admin, _ = audit_db
    pz_id = _create_manual_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db,
        1,
        pz_id,
        item_id,
        WmsReceivingItemQuantityBody(quantity_received=10, loose_units_count=10),
        performed_by=admin,
    )
    patch_wms_receiving_pz_item_quantity(
        db,
        1,
        pz_id,
        item_id,
        WmsReceivingItemQuantityBody(quantity_received=-2, loose_units_count=0),
        performed_by=admin,
    )
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).one()
    assert float(line.received_quantity) == pytest.approx(8.0)
    logs = db.query(ReceivingScanLog).filter(ReceivingScanLog.document_id == pz_id).all()
    assert any(float(l.quantity_added) == 10.0 for l in logs)
    assert any(float(l.quantity_added) == -2.0 for l in logs)
    acts = list_activity_for_object(db, object_type="document", object_id=pz_id)
    assert any(a["event_code"] == EVENT_PZ_RECEIVE_REVERTED for a in acts)
    assert any(a["event_code"] == EVENT_PZ_PRODUCT_RECEIVED for a in acts)


def test_q_concurrent_additive_increments(audit_db):
    """Two operators add deltas sequentially with row lock path — no lost update."""
    db, admin, anna = audit_db
    pz_id = _create_manual_pz(db, admin)
    _, item_id, _ = ensure_wms_pz_product_anchor_line(db, 1, pz_id, 50, performed_by=admin, initial_received=0.0)
    db.commit()
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=10), performed_by=admin
    )
    patch_wms_receiving_pz_item_quantity(
        db, 1, pz_id, item_id, WmsReceivingItemQuantityBody(quantity_received=5), performed_by=anna
    )
    assert float(db.query(StockDocumentItem).get(item_id).received_quantity) == pytest.approx(15.0)


def test_s_tenant_isolation_price(audit_db):
    db, admin, _ = audit_db
    now = datetime.utcnow()
    foreign = StockDocument(
        tenant_id=2,
        document_type="PZ",
        supplier_id=99,
        warehouse_id=1,
        status="posted",
        created_at=now,
        updated_at=now,
    )
    db.add(foreign)
    db.flush()
    db.add(
        StockDocumentItem(
            document_id=int(foreign.id),
            product_id=50,
            ordered_quantity=1,
            received_quantity=1,
            quantity=1,
            purchase_price_net=777.0,
            vat_rate=23,
        )
    )
    db.commit()
    assert resolve_suggested_purchase_price_net_for_pz(db, 1, 50, supplier_id=1) is None


def test_t_polish_titles_never_raw_codes():
    for code in (
        EVENT_PZ_PRODUCT_RECEIVED,
        EVENT_PZ_PRICE_CHANGED,
        EVENT_PZ_VAT_CHANGED,
        EVENT_PZ_RECEIVE_REVERTED,
    ):
        label = title_pl(code)
        assert "_" not in label
        assert label.upper() != code.upper()
        assert any(ch.isalpha() for ch in label)
