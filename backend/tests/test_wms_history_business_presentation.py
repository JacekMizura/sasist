"""Historia WMS business presentation — post-pack, picks, carton, no technical dumps.

  python -m pytest backend/tests/test_wms_history_business_presentation.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.app_user import AppUser
from backend.models.order import Order
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_event import (
    EVT_CARTON_SELECTED,
    EVT_PACKED_ITEM,
    EVT_PACKING_AUTOMATION_FINISHED,
    EVT_PACKING_FINISHED,
    EVT_PICKED_ITEM,
    EVT_PICKING_FINISHED,
    WmsOrderEvent,
)
from backend.services.activity_log.order_presentation import build_order_inline_detail_rows
from backend.services.activity_log.wms_business_presentation import (
    format_post_pack_step_rows,
    rendered_text_is_business_safe,
)
from backend.services.wms_audit_service import _timeline_event_from_row


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, AppUser, Product, Order, WmsOrderEvent):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        AppUser(
            id=7,
            login="admin",
            email="a@x",
            password_hash="x",
            first_name="Super",
            last_name="Admin",
            is_active=True,
        )
    )
    session.add(Product(id=10, tenant_id=1, sku="ST-001", name="Sznurówadła CAT 100 cm", ean="5900001"))
    session.add(
        Order(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            number="ORD-100",
            status="PACKING",
        )
    )
    session.commit()
    yield session
    session.close()


SAMPLE_STEPS = [
    {"step": "change_order_status", "ok": True, "message": "Spakowane"},
    {
        "step": "create_document",
        "ok": True,
        "message": "id=c749a28f-5389-4b90-8e22-01d30ad64027;number=FV/2026/08/000006",
    },
    {"step": "packaging_rw", "ok": True, "skipped": True, "message": "no_consumables"},
    {"step": "generate_shipment", "ok": True, "skipped": True, "message": "disabled_in_settings"},
]


def _render_blob(ev) -> str:
    parts = [ev.title, ev.user_label or ""]
    for b in ev.body or []:
        parts.append(b)
    for d in ev.details or []:
        parts.append(f"{d.label} {d.value}")
    return " | ".join(parts)


def test_post_pack_steps_business_rows_hide_technical():
    rows = format_post_pack_step_rows(SAMPLE_STEPS)
    by_label = {r["label"]: r["value"] for r in rows}
    assert by_label["Status"] == "Spakowane"
    assert by_label["Dokument"] == "FV/2026/08/000006"
    assert by_label["Przesyłka"] == "Nie utworzono (wyłączona)"
    assert "RW" not in " ".join(by_label)  # no_consumables hidden
    blob = " ".join(f"{k} {v}" for k, v in by_label.items())
    assert rendered_text_is_business_safe(blob)
    assert "change_order_status" not in blob
    assert "c749a28f" not in blob
    assert "disabled_in_settings" not in blob
    assert "no_consumables" not in blob


def test_packing_automation_timeline_presentation(db):
    import json

    row = WmsOrderEvent(
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_PACKING_AUTOMATION_FINISHED,
        created_at=datetime(2026, 8, 23, 14, 11, 0),
        metadata_json=json.dumps(
            {
                "packing_duration_label": "8 s",
                "post_pack_steps": SAMPLE_STEPS,
            },
            ensure_ascii=False,
        ),
    )
    db.add(row)
    db.flush()
    ev = _timeline_event_from_row(db, row)
    assert ev.title == "Automatyka pakowania zakończona"
    assert ev.user_label == "Super Admin"
    assert (ev.badge or "") == ""
    blob = _render_blob(ev)
    assert "Automatyka i synchronizacja" not in blob
    assert rendered_text_is_business_safe(blob)
    labels = {d.label: d.value for d in ev.details}
    assert labels["Status"] == "Spakowane"
    assert labels["Dokument"] == "FV/2026/08/000006"
    assert labels["Przesyłka"] == "Nie utworzono (wyłączona)"
    assert labels["Czas"] == "8 s"


def test_activity_inline_rows_share_post_pack_formatter():
    rows = build_order_inline_detail_rows(
        EVT_PACKING_AUTOMATION_FINISHED,
        {
            "packing_duration_label": "8 s",
            "post_pack_steps": SAMPLE_STEPS,
        },
    )
    by_label = {r["label"]: r["value"] for r in rows}
    assert by_label["Status"] == "Spakowane"
    assert by_label["Dokument"] == "FV/2026/08/000006"
    assert rendered_text_is_business_safe(" ".join(by_label.values()))


def test_picking_product_and_location(db):
    import json

    row = WmsOrderEvent(
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_PICKED_ITEM,
        product_id=10,
        quantity=2,
        created_at=datetime(2026, 8, 23, 13, 0, 0),
        metadata_json=json.dumps(
            {
                "sku": "ST-001",
                "product_name": "Sznurówadła CAT 100 cm",
                "quantity": 2,
                "source_location": "A1-A-1",
            },
            ensure_ascii=False,
        ),
    )
    db.add(row)
    db.flush()
    ev = _timeline_event_from_row(db, row)
    assert "Zebrano 2 × Sznurówadła CAT 100 cm" == ev.title
    assert ev.user_label == "Super Admin"
    labels = {d.label: d.value for d in ev.details}
    assert labels["SKU"] == "ST-001"
    assert labels["Lokalizacja"] == "A1-A-1"
    assert rendered_text_is_business_safe(_render_blob(ev))


def test_multi_qty_same_product(db):
    import json

    row = WmsOrderEvent(
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_PICKED_ITEM,
        product_id=10,
        quantity=5,
        metadata_json=json.dumps({"sku": "ST-001", "product_name": "X", "quantity": 5, "source_location": "B1"}),
    )
    db.add(row)
    db.flush()
    ev = _timeline_event_from_row(db, row)
    assert ev.title.startswith("Zebrano 5 ×")


def test_carton_selected_and_no_carton(db):
    import json

    with_carton = WmsOrderEvent(
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_CARTON_SELECTED,
        metadata_json=json.dumps(
            {"carton_name": "Gabaryt A", "carton_label": "64 × 38 × 8 cm", "source": "MANUAL"},
            ensure_ascii=False,
        ),
    )
    no_carton = WmsOrderEvent(
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_CARTON_SELECTED,
        metadata_json=json.dumps({"no_carton": True}, ensure_ascii=False),
    )
    db.add_all([with_carton, no_carton])
    db.flush()
    ev1 = _timeline_event_from_row(db, with_carton)
    assert "Gabaryt A" in ev1.title
    assert "64 × 38 × 8 cm" in _render_blob(ev1)
    assert any(d.label == "Źródło" and d.value == "Ręcznie" for d in ev1.details)
    ev2 = _timeline_event_from_row(db, no_carton)
    assert ev2.title == "Bez dodatkowego opakowania"


def test_packing_finished_title_not_technical(db):
    import json

    row = WmsOrderEvent(
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_PACKING_FINISHED,
        metadata_json=json.dumps({"packing_duration_label": "1 s", "no_carton": True}),
    )
    db.add(row)
    db.flush()
    ev = _timeline_event_from_row(db, row)
    assert ev.title == "Zakończono pakowanie"
    assert "Kompletacja fizyczna" not in ev.title
    labels = {d.label: d.value for d in ev.details}
    assert labels["Opakowanie"] == "Bez dodatkowego opakowania"
    assert labels["Czas"] == "1 s"


def test_packed_item_workstation(db):
    import json

    row = WmsOrderEvent(
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        product_id=10,
        event_type=EVT_PACKED_ITEM,
        quantity=1,
        metadata_json=json.dumps({"sku": "BR-02141", "quantity": 1, "workstation_id": 1}),
    )
    db.add(row)
    db.flush()
    ev = _timeline_event_from_row(db, row)
    assert "Spakowano" in ev.title
    assert any(d.label == "Stanowisko" and d.value == "#1" for d in ev.details)


def test_picking_finished_summary(db):
    import json

    row = WmsOrderEvent(
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_PICKING_FINISHED,
        metadata_json=json.dumps(
            {
                "units_count": 3,
                "products_count": 2,
                "locations_count": 2,
                "picking_duration_label": "32 min 10 s",
            }
        ),
    )
    db.add(row)
    db.flush()
    ev = _timeline_event_from_row(db, row)
    assert ev.title == "Zakończono zbieranie"
    blob = _render_blob(ev)
    assert "3 szt." in blob
    assert "32 min 10 s" in blob


def test_no_duplicate_automation_titles_in_presentation(db):
    """Single PACKING_AUTOMATION_FINISHED card — not 'synchronizacja' alias."""
    import json

    row = WmsOrderEvent(
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_PACKING_AUTOMATION_FINISHED,
        metadata_json=json.dumps({"post_pack_steps": SAMPLE_STEPS}),
    )
    db.add(row)
    db.flush()
    ev = _timeline_event_from_row(db, row)
    assert ev.title == "Automatyka pakowania zakończona"
    assert "synchronizacja" not in ev.title.lower()
