"""
Etykieta zastępcza (WMS packing): template type, snapshot, barcode scan, courier retry.

  python -m pytest backend/tests/test_wms_packing_replacement_label.py -q
"""

from __future__ import annotations

import json
from datetime import datetime
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.domain.label_templates.constants import (
    LABEL_TEMPLATE_TYPE_ORDER,
    LABEL_TEMPLATE_TYPE_ORDER_REPLACEMENT,
    ORDER_FAMILY_TEMPLATE_TYPES,
    is_order_replacement_template_type,
)
from backend.models.label_template import SavedLabelTemplate
from backend.models.order import Order
from backend.models.order_document import OrderDocument
from backend.models.order_document_type_enum import OrderDocumentType
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_packing_replacement_label import (
    REPLACEMENT_STATUS_AWAITING_COURIER,
    REPLACEMENT_STATUS_COURIER_GENERATED,
    REPLACEMENT_STATUS_REGENERATE_FAILED,
    WmsPackingReplacementLabel,
)
from backend.models.wms_packing_settings import WmsPackingSettings
from backend.schemas.wms_packing_settings import WmsPackingFallbackLabel
from backend.services.wms_packing_replacement_label_service import (
    ReplacementLabelError,
    apply_packing_snapshot,
    build_packing_snapshot,
    create_replacement_label,
    format_replacement_barcode,
    get_by_barcode,
    parse_replacement_barcode,
    require_order_replacement_template,
    retry_courier_label_from_replacement,
)
from backend.services.wms_packing_service import (
    _packing_step_generate_shipment,
    _packing_step_print_label,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Order,
        OrderDocument,
        WmsPackingSettings,
        SavedLabelTemplate,
        WmsPackingReplacementLabel,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        Order(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            number="ORD-100",
            selected_carton_id="carton-m",
            packing_consumables_json=json.dumps(
                {"packaging_carton_ids": ["carton-m"], "tape": 1},
                ensure_ascii=False,
            ),
            shipping_method="Kurier DPD",
            shipping_method_id=7,
            created_at=datetime.utcnow(),
        )
    )
    session.add(
        SavedLabelTemplate(
            id=50,
            tenant_id=1,
            name="Etykieta zastępcza A",
            template_type=LABEL_TEMPLATE_TYPE_ORDER_REPLACEMENT,
            template_json='{"width":100,"height":100,"elements":[]}',
        )
    )
    session.add(
        SavedLabelTemplate(
            id=51,
            tenant_id=1,
            name="Zwykła etykieta zamówienia",
            template_type=LABEL_TEMPLATE_TYPE_ORDER,
            template_json='{"width":100,"height":100,"elements":[]}',
        )
    )
    session.add(
        WmsPackingSettings(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            fallback_label_json=json.dumps(
                {"template_id": 50, "delay_seconds": 3},
                ensure_ascii=False,
            ),
        )
    )
    session.commit()
    yield session
    session.close()


def _order(db) -> Order:
    return db.query(Order).filter(Order.id == 100).one()


def test_order_replacement_is_orders_family_type():
    assert LABEL_TEMPLATE_TYPE_ORDER_REPLACEMENT in ORDER_FAMILY_TEMPLATE_TYPES
    assert is_order_replacement_template_type("order_replacement")
    assert is_order_replacement_template_type("ORDER_REPLACEMENT")
    assert not is_order_replacement_template_type("order")
    assert not is_order_replacement_template_type("product")


def test_filter_templates_by_family_and_type(db):
    rows = (
        db.query(SavedLabelTemplate)
        .filter(
            SavedLabelTemplate.tenant_id == 1,
            SavedLabelTemplate.template_type == LABEL_TEMPLATE_TYPE_ORDER_REPLACEMENT,
        )
        .all()
    )
    assert len(rows) == 1
    assert rows[0].id == 50
    assert rows[0].name == "Etykieta zastępcza A"


def test_require_template_rejects_non_replacement_type(db):
    with pytest.raises(ReplacementLabelError) as ei:
        require_order_replacement_template(db, tenant_id=1, template_id=51)
    assert ei.value.code == "invalid_template_type"


def test_require_template_accepts_order_replacement(db):
    tpl = require_order_replacement_template(db, tenant_id=1, template_id=50)
    assert int(tpl.id) == 50


def test_packing_snapshot_captures_carton_and_shipping(db):
    order = _order(db)
    snap = build_packing_snapshot(order)
    assert snap["selected_carton_id"] == "carton-m"
    assert "carton-m" in snap["packaging_carton_ids"]
    assert snap["shipping_method_id"] == 7
    assert snap["shipping_method"] == "Kurier DPD"
    assert snap["parcel_count"] >= 1


def test_apply_snapshot_restores_packaging_choices(db):
    order = _order(db)
    order.selected_carton_id = None
    order.packing_consumables_json = None
    order.shipping_method_id = None
    order.shipping_method = None
    apply_packing_snapshot(
        order,
        {
            "selected_carton_id": "carton-l",
            "packaging_carton_ids": ["carton-l", "carton-s"],
            "packing_consumables": {"tape": 2},
            "shipping_method_id": 9,
            "shipping_method": "InPost",
        },
    )
    assert order.selected_carton_id == "carton-l"
    payload = json.loads(order.packing_consumables_json or "{}")
    assert payload["packaging_carton_ids"] == ["carton-l", "carton-s"]
    assert order.shipping_method_id == 9
    assert order.shipping_method == "InPost"


def test_courier_label_failure_offers_replacement(db):
    order = _order(db)
    gen = _packing_step_generate_shipment(db, order)
    assert gen.ok is False
    assert gen.offer_replacement_label is True
    assert "courier_label_unavailable" in (gen.message or "")

    print_step = _packing_step_print_label(
        db,
        tenant_id=1,
        order=order,
        fb=WmsPackingFallbackLabel(template_id=50, delay_seconds=3),
    )
    assert print_step.ok is False
    assert print_step.offer_replacement_label is True


def test_create_replacement_label_persists_snapshot_and_barcode(db):
    order = _order(db)
    with patch(
        "backend.services.label_render_service.render_label_template",
        return_value=b"%PDF-1.4 replacement",
    ):
        row, pdf = create_replacement_label(
            db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            courier_error="courier_label_unavailable:timeout",
        )
        db.commit()

    assert pdf.startswith(b"%PDF")
    assert row.status == REPLACEMENT_STATUS_AWAITING_COURIER
    assert row.barcode == format_replacement_barcode(int(row.id))
    assert parse_replacement_barcode(row.barcode) == row.barcode
    snap = json.loads(row.snapshot_json)
    assert snap["selected_carton_id"] == "carton-m"
    assert snap["shipping_method_id"] == 7
    assert "carton-m" in snap["packaging_carton_ids"]
    assert row.last_error and "timeout" in row.last_error


def test_create_replacement_requires_configured_template(db):
    order = _order(db)
    settings = db.query(WmsPackingSettings).filter(WmsPackingSettings.id == 1).one()
    settings.fallback_label_json = json.dumps({"template_id": None, "delay_seconds": 0})
    db.commit()
    with pytest.raises(ReplacementLabelError) as ei:
        create_replacement_label(db, tenant_id=1, warehouse_id=1, order=order)
    assert ei.value.code == "replacement_template_not_configured"


def test_get_by_barcode_resolves_order_state(db):
    order = _order(db)
    with patch(
        "backend.services.label_render_service.render_label_template",
        return_value=b"%PDF-1.4",
    ):
        row, _ = create_replacement_label(db, tenant_id=1, warehouse_id=1, order=order)
        db.commit()

    found = get_by_barcode(db, tenant_id=1, barcode=row.barcode.lower())
    assert found is not None
    assert found.order_id == 100
    snap = json.loads(found.snapshot_json)
    assert snap["selected_carton_id"] == "carton-m"


def test_retry_courier_success_uses_snapshot_and_marks_done(db):
    order = _order(db)
    with patch(
        "backend.services.label_render_service.render_label_template",
        return_value=b"%PDF-1.4",
    ):
        row, _ = create_replacement_label(db, tenant_id=1, warehouse_id=1, order=order)
        db.commit()

    # Operator changed carton after replacement — retry must restore snapshot carton-m.
    order.selected_carton_id = "wrong-carton"
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

    result = retry_courier_label_from_replacement(db, tenant_id=1, warehouse_id=1, row=row)
    db.commit()
    db.refresh(order)
    db.refresh(row)

    assert result["ok"] is True
    assert result["status"] == REPLACEMENT_STATUS_COURIER_GENERATED
    assert order.selected_carton_id == "carton-m"
    assert row.status == REPLACEMENT_STATUS_COURIER_GENERATED
    assert row.resolved_at is not None


def test_retry_courier_failure_keeps_replacement_state(db):
    order = _order(db)
    with patch(
        "backend.services.label_render_service.render_label_template",
        return_value=b"%PDF-1.4",
    ):
        row, _ = create_replacement_label(db, tenant_id=1, warehouse_id=1, order=order)
        db.commit()

    result = retry_courier_label_from_replacement(db, tenant_id=1, warehouse_id=1, row=row)
    db.commit()
    db.refresh(row)

    assert result["ok"] is False
    assert result["status"] == REPLACEMENT_STATUS_REGENERATE_FAILED
    assert row.status == REPLACEMENT_STATUS_REGENERATE_FAILED
    assert row.resolved_at is None
    # Snapshot retained for another attempt
    assert json.loads(row.snapshot_json)["selected_carton_id"] == "carton-m"
