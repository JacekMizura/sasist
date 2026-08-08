"""
Post-pack auto actions: status change gate + waybill print resolution.

  python -m pytest backend/tests/test_wms_packing_post_pack_auto_actions.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.order import Order
from backend.models.order_document import OrderDocument
from backend.models.order_document_type_enum import OrderDocumentType
from backend.models.order_ui_status import OrderUiStatus
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_packing_settings import WmsPackingSettings
from backend.schemas.wms_packing_settings import (
    WmsPackingAutoActions,
    WmsPackingDocumentSettings,
    WmsPackingFallbackLabel,
)
from backend.services.wms_packing_service import (
    _packing_step_apply_packed_status,
    _packing_step_generate_shipment,
    _packing_step_print_document,
    _packing_step_print_label,
    _resolve_post_pack_sale_series_id,
    _waybill_docs_client_message,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, OrderUiStatus, Order, OrderDocument, WmsPackingSettings):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        OrderUiStatus(
            id=10,
            tenant_id=1,
            warehouse_id=1,
            main_group="TO_PACK",
            name="Do pakowania",
            color="#000",
            sort_order=1,
        )
    )
    session.add(
        OrderUiStatus(
            id=20,
            tenant_id=1,
            warehouse_id=1,
            main_group="PACKED",
            name="Spakowane",
            color="#0a0",
            sort_order=2,
        )
    )
    session.add(
        Order(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            number="ORD-100",
            order_ui_status_id=10,
            created_at=datetime.utcnow(),
        )
    )
    session.add(
        WmsPackingSettings(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            packed_status_id=20,
            auto_actions_json="{}",
        )
    )
    session.commit()
    yield session
    session.close()


def _order(db) -> Order:
    return db.query(Order).filter(Order.id == 100).one()


def _settings(db) -> WmsPackingSettings:
    return db.query(WmsPackingSettings).filter(WmsPackingSettings.id == 1).one()


def test_change_order_status_disabled_leaves_status_unchanged(db):
    order = _order(db)
    row = _settings(db)
    before = order.order_ui_status_id
    actions = WmsPackingAutoActions(change_order_status=False)
    step = _packing_step_apply_packed_status(
        db,
        order=order,
        row=row,
        actions=actions,
        tenant_id=1,
        warehouse_id=1,
    )
    assert step.ok is True
    assert step.skipped is True
    assert step.message == "disabled_in_settings"
    assert order.order_ui_status_id == before


def test_change_order_status_enabled_sets_packed_status(db):
    order = _order(db)
    row = _settings(db)
    actions = WmsPackingAutoActions(change_order_status=True)
    step = _packing_step_apply_packed_status(
        db,
        order=order,
        row=row,
        actions=actions,
        tenant_id=1,
        warehouse_id=1,
    )
    assert step.ok is True
    assert step.skipped is not True
    assert order.order_ui_status_id == 20
    assert "Spakowane" in (step.message or "")


def test_print_label_uses_existing_waybill_document(db):
    order = _order(db)
    db.add(
        OrderDocument(
            order_id=order.id,
            tenant_id=1,
            warehouse_id=1,
            document_type=OrderDocumentType.LIST_PRZEWOZOWY.value,
            original_filename="waybill.pdf",
            stored_filename="waybill.pdf",
            file_url="/files/waybill.pdf",
        )
    )
    db.commit()
    step = _packing_step_print_label(
        db,
        tenant_id=1,
        order=order,
        fb=WmsPackingFallbackLabel(),
    )
    assert step.ok is True
    assert step.skipped is not True
    assert "client_print_waybill" in (step.message or "")
    assert "file_url=/files/waybill.pdf" in (step.message or "")


def test_print_label_missing_waybill_soft_skips(db):
    order = _order(db)
    step = _packing_step_print_label(
        db,
        tenant_id=1,
        order=order,
        fb=WmsPackingFallbackLabel(),
    )
    assert step.ok is True
    assert step.skipped is True
    assert step.message == "missing_waybill"


def test_print_label_includes_sales_companion_when_present(db):
    order = _order(db)
    db.add(
        OrderDocument(
            order_id=order.id,
            tenant_id=1,
            warehouse_id=1,
            document_type=OrderDocumentType.LIST_PRZEWOZOWY.value,
            original_filename="waybill.pdf",
            stored_filename="waybill.pdf",
            file_url="/files/waybill.pdf",
        )
    )
    db.add(
        OrderDocument(
            order_id=order.id,
            tenant_id=1,
            warehouse_id=1,
            document_type=OrderDocumentType.DOKUMENT_SPRZEDAZY.value,
            original_filename="fv.pdf",
            stored_filename="fv.pdf",
            file_url="/files/fv.pdf",
        )
    )
    db.commit()
    step = _packing_step_print_label(
        db,
        tenant_id=1,
        order=order,
        fb=WmsPackingFallbackLabel(),
    )
    assert step.ok is True
    assert "sales_file_url=/files/fv.pdf" in (step.message or "")


def test_generate_shipment_reuses_existing_waybill(db):
    order = _order(db)
    db.add(
        OrderDocument(
            order_id=order.id,
            tenant_id=1,
            warehouse_id=1,
            document_type=OrderDocumentType.LIST_PRZEWOZOWY.value,
            original_filename="waybill.pdf",
            stored_filename="waybill.pdf",
            file_url="/files/waybill.pdf",
        )
    )
    db.commit()
    step = _packing_step_generate_shipment(db, order)
    assert step.ok is True
    assert step.skipped is not True
    assert "existing_waybill" in (step.message or "")
    assert "file_url=/files/waybill.pdf" in (step.message or "")


def test_print_document_missing_soft_skips(db):
    order = _order(db)
    step = _packing_step_print_document(db, order)
    assert step.ok is True
    assert step.skipped is True
    assert step.message == "missing_sales_document"


def test_preferred_document_type_invoice_overrides_order(db):
    order = _order(db)
    order.import_metadata_json = '{"panel_document_type":"PARAGON"}'
    db.commit()
    doc = WmsPackingDocumentSettings(
        preferred_document_type="INVOICE",
        invoice_series_id="inv-1",
        receipt_series_id="rec-1",
    )
    series_id, panel_t, err = _resolve_post_pack_sale_series_id(order, doc)
    assert err is None
    assert panel_t == "INVOICE"
    assert series_id == "inv-1"


def test_preferred_document_type_from_order(db):
    order = _order(db)
    order.import_metadata_json = '{"panel_document_type":"PARAGON"}'
    db.commit()
    doc = WmsPackingDocumentSettings(
        preferred_document_type="FROM_ORDER",
        invoice_series_id="inv-1",
        receipt_series_id="rec-1",
    )
    series_id, panel_t, err = _resolve_post_pack_sale_series_id(order, doc)
    assert err is None
    assert panel_t == "PARAGON"
    assert series_id == "rec-1"


def test_waybill_message_lists_all_urls(db):
    order = _order(db)
    db.add(
        OrderDocument(
            order_id=order.id,
            tenant_id=1,
            warehouse_id=1,
            document_type=OrderDocumentType.LIST_PRZEWOZOWY.value,
            original_filename="a.pdf",
            stored_filename="a.pdf",
            file_url="/files/a.pdf",
        )
    )
    db.add(
        OrderDocument(
            order_id=order.id,
            tenant_id=1,
            warehouse_id=1,
            document_type=OrderDocumentType.LIST_PRZEWOZOWY.value,
            original_filename="b.pdf",
            stored_filename="b.pdf",
            file_url="/files/b.pdf",
        )
    )
    db.commit()
    msg = _waybill_docs_client_message(db, order=order, kind="client_print_waybill")
    assert msg is not None
    assert "file_urls=" in msg
    assert "waybill_count=2" in msg
