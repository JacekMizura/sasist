"""Order › Logi presentation + actor regressions (inline details, WMS prefix, USER actor)."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.order import (
    _apply_order_patch_to_order,
    add_order_line,
    create_order_operational_note,
    patch_order_item_line,
)
from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.app_user import AppUser
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_operational_note import OrderOperationalNote
from backend.models.order_ui_status import OrderUiStatus
from backend.models.product import Product
from backend.models.shipping_method import ShippingMethod
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.schemas.order import (
    OrderAddLineBody,
    OrderItemLineEditPatch,
    OrderItemPanelPatchBody,
    OrderOperationalNoteCreateBody,
    OrderPatchBody,
)
from backend.services.activity_log.order_event_codes import (
    ORDER_ITEM_ADDED,
    ORDER_ITEM_PRICE_CHANGED,
    ORDER_ITEM_QUANTITY_CHANGED,
    ORDER_NOTE_ADDED,
    ORDER_SHIPPING_ADDRESS_CHANGED,
)
from backend.services.activity_log.order_presentation import (
    apply_wms_prefix,
    build_order_inline_detail_rows,
    details_display_for,
    format_order_effect_message,
    order_event_action_label,
)
from backend.services.activity_log.presentation import enrich_activity_item, resolve_operator_display
from backend.services.activity_log.service import list_activity_for_object
from backend.services.activity_log.wms_order_activity import EVT_PACK_ALL_USED, EVT_PICKING_STARTED
from backend.services.bundle_explosion import OrderCreateLinesResult, ResolvedOrderLine
from backend.services.stock_disposition import DEFAULT_STOCK_DISPOSITION


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for m in (
        Tenant,
        Warehouse,
        AppUser,
        Order,
        OrderItem,
        Product,
        OrderOperationalNote,
        OrderUiStatus,
        ShippingMethod,
        ActivityEvent,
        ActivityEventLink,
    ):
        m.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        AppUser(
            id=7,
            login="jacek",
            email="jacek@example.com",
            password_hash="x",
            first_name="Jacek",
            last_name="Mizura",
            is_active=True,
        )
    )
    session.add(Product(id=10, tenant_id=1, sku="SKU-10", name="Sznurówadła CAT 100 cm", ean="5901"))
    session.add(Product(id=11, tenant_id=1, sku="BR-02141", name="Bruder Ładowarka", ean="4001702021412"))
    session.add(
        Order(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            number="1273",
            status="new",
            value=100.0,
            currency="PLN",
            addresses_json=json.dumps(
                {
                    "shipping": {
                        "name": "Jan",
                        "street": "Okopowa 56/43",
                        "city": "Warszawa",
                        "postal_code": "01-042",
                        "country": "PL",
                    }
                },
                ensure_ascii=False,
            ),
        )
    )
    session.add(
        OrderItem(
            id=1,
            order_id=100,
            product_id=10,
            quantity=1,
            unit_price=10.0,
            total_price=10.0,
            vat_percent=23,
        )
    )
    session.commit()
    yield session
    session.close()


@pytest.fixture
def user(db):
    return db.query(AppUser).filter(AppUser.id == 7).one()


@pytest.fixture(autouse=True)
def _stub_order_read(monkeypatch):
    monkeypatch.setattr(
        "backend.api.order.build_order_read",
        lambda db, order: {"id": int(order.id), "number": order.number},
    )
    monkeypatch.setattr(
        "backend.api.order.apply_fulfillment_state_from_resolver",
        lambda *a, **k: None,
    )
    monkeypatch.setattr("backend.api.order.touch_picking_in_progress", lambda *a, **k: None)
    monkeypatch.setattr(
        "backend.api.order._recompute_order_value_and_volume",
        lambda *a, **k: None,
    )


def test_user_address_change_actor_not_system(db, user):
    order = db.query(Order).filter(Order.id == 100).one()
    _apply_order_patch_to_order(
        db,
        order,
        OrderPatchBody(shipping_street="Okopowa 56/60", shipping_postal_code="01-043"),
        actor_user_id=7,
    )
    db.commit()
    rows = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == ORDER_SHIPPING_ADDRESS_CHANGED
    ]
    assert len(rows) == 1
    assert rows[0]["actor_user_id"] == 7
    assert rows[0]["operator_display"] == "Jacek Mizura"
    assert rows[0]["metadata"].get("actor_kind") == "USER"
    assert rows[0]["details_display"] == "inline"
    labels = {d["label"] for d in (rows[0].get("details") or [])}
    assert "Ulica" in labels
    assert "Kod pocztowy" in labels
    assert "Miasto" not in labels  # unchanged omitted


def test_user_note_actor(db, user):
    create_order_operational_note(
        100,
        OrderOperationalNoteCreateBody(content="test", show_in_picking=True, show_in_packing=True),
        db,
        user=user,
    )
    rows = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == ORDER_NOTE_ADDED
    ]
    assert len(rows) == 1
    assert rows[0]["actor_user_id"] == 7
    assert "test" in rows[0]["action"]
    assert rows[0]["details_display"] == "none" or not rows[0].get("details")


def test_user_qty_and_price_actor(db, user):
    patch_order_item_line(
        100,
        1,
        OrderItemPanelPatchBody(line_edit=OrderItemLineEditPatch(quantity=8, unit_price=150.0)),
        db,
        current_user=user,
    )
    items = list_activity_for_object(db, object_type="order", object_id=100)
    qty = [i for i in items if i["event_code"] == ORDER_ITEM_QUANTITY_CHANGED]
    price = [i for i in items if i["event_code"] == ORDER_ITEM_PRICE_CHANGED]
    assert len(qty) == 1 and qty[0]["actor_user_id"] == 7
    assert qty[0]["details_display"] == "inline"
    assert any(d["label"] == "Ilość" and "1 → 8" in d["value"] for d in qty[0]["details"])
    assert "z 1 na 8" not in qty[0]["action"]
    assert len(price) == 1 and price[0]["actor_user_id"] == 7
    assert any(d["label"] == "Cena" for d in price[0]["details"])


def test_user_add_product_snapshot(db, user, monkeypatch):
    monkeypatch.setattr(
        "backend.api.order.resolve_order_create_lines",
        lambda *a, **k: OrderCreateLinesResult(
            lines=[
                ResolvedOrderLine(
                    product_id=11,
                    quantity=1,
                    unit_price=150.0,
                    total_price=150.0,
                    list_price=150.0,
                    line_volume=0.001,
                    source_bundle_id=None,
                    bundle_instance_id=None,
                    metadata_json=None,
                    required_stock_disposition=DEFAULT_STOCK_DISPOSITION,
                    product_sales_offer_id=None,
                    vat_percent=23,
                )
            ],
            bundle_snapshots_by_instance={},
        ),
    )
    monkeypatch.setattr(
        "backend.api.order.disposition_for_new_order_line",
        lambda *a, **k: DEFAULT_STOCK_DISPOSITION,
    )
    add_order_line(
        100,
        OrderAddLineBody(product_id=11, quantity=1, unit_price=150.0),
        db,
        current_user=user,
    )
    rows = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == ORDER_ITEM_ADDED
    ]
    assert len(rows) == 1
    assert rows[0]["actor_user_id"] == 7
    assert rows[0]["metadata"].get("sku") == "BR-02141"
    assert rows[0]["metadata"].get("ean") == "4001702021412"
    labels = {d["label"]: d["value"] for d in rows[0]["details"]}
    assert labels.get("SKU") == "BR-02141"
    assert labels.get("EAN") == "4001702021412"
    assert "Ilość" in labels
    assert "Cena" in labels
    assert rows[0]["details_display"] == "inline"


def test_wms_prefixes():
    assert apply_wms_prefix(EVT_PACK_ALL_USED, "Spakowano.", {"source_category": "WMS"}).startswith(
        "[WMS - Pakowanie]"
    )
    assert apply_wms_prefix(EVT_PICKING_STARTED, "Start.", {"source_category": "WMS"}).startswith(
        "[WMS - Zbieranie]"
    )
    assert order_event_action_label(ORDER_ITEM_ADDED) == "Dodano produkt"
    assert details_display_for(ORDER_SHIPPING_ADDRESS_CHANGED) == "inline"


def test_automation_stays_automation():
    op = resolve_operator_display(
        actor_name=None,
        actor_user_id=None,
        metadata={"actor_kind": "AUTOMATION", "actor_label": "Automatyzacja"},
    )
    assert op == "Automatyzacja"


def test_system_when_no_user():
    op = resolve_operator_display(actor_name=None, actor_user_id=None, metadata={"actor_kind": "SYSTEM"})
    assert op == "System"


def test_address_diff_only_changed():
    rows = build_order_inline_detail_rows(
        ORDER_SHIPPING_ADDRESS_CHANGED,
        {
            "changed_fields": [
                {"key": "street", "label": "Ulica", "old": "A", "new": "B"},
                {"key": "postcode", "label": "Kod pocztowy", "old": "01", "new": "02"},
            ]
        },
    )
    assert len(rows) == 2


def test_enrich_inline_no_pokaz_szczegoly_contract():
    item = {
        "event_code": ORDER_ITEM_QUANTITY_CHANGED,
        "description": "Zmieniono ilość produktu „X”.",
        "severity": "INFO",
        "category": "order",
        "actor_user_id": 7,
        "actor_name": "Jacek Mizura",
        "metadata": {
            "actor_kind": "USER",
            "product_name": "X",
            "old_quantity": 1,
            "new_quantity": 8,
            "sku": "S1",
        },
        "occurred_at": None,
    }
    out = enrich_activity_item(item)
    assert out["details_display"] == "inline"
    assert out["operator_display"] == "Jacek Mizura"
    assert out["event_display_label"] == "Zmieniono ilość"


def test_note_effect_shows_preview():
    msg = format_order_effect_message(
        ORDER_NOTE_ADDED,
        stored_description="Dodano notatkę do zamówienia.",
        metadata={"content_preview": "test"},
    )
    assert "test" in msg
