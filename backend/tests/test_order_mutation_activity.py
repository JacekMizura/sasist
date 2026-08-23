"""OMS manual mutation Activity Log — address / notes / line_edit via real endpoints."""

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
from backend.models.order_ui_status import OrderUiStatus
from backend.models.shipping_method import ShippingMethod
from backend.models.order_operational_note import OrderOperationalNote
from backend.models.product import Product
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
from backend.services.activity_log.order_mutation_activity import (
    emit_order_shipping_address_changed_activity,
    snapshot_shipping_address,
)
from backend.services.activity_log.service import list_activity_for_object
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
    session.add(Product(id=11, tenant_id=1, sku="SKU-11", name="Produkt B", ean="5902"))
    session.add(
        Order(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            number="1273",
            status="new",
            value=136.41,
            currency="PLN",
            addresses_json=json.dumps(
                {
                    "shipping": {
                        "name": "Jan Kowalski",
                        "street": "Okopowa 56/43",
                        "city": "Warszawa",
                        "postal_code": "00-001",
                        "country": "PL",
                    },
                    "billing": {"first_name": "Jan", "last_name": "Kowalski", "phone": "500"},
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
            unit_price=136.41,
            total_price=136.41,
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


def _patch(db, order_id: int, body: OrderPatchBody, user):
    order = db.query(Order).filter(Order.id == int(order_id)).one()
    _apply_order_patch_to_order(
        db,
        order,
        body,
        actor_user_id=int(user.id) if user is not None else None,
    )
    db.commit()
    return order


def test_shipping_address_change_emits_diff(db, user):
    _patch(db, 100, OrderPatchBody(shipping_street="Okopowa 56/60"), user)
    items = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == ORDER_SHIPPING_ADDRESS_CHANGED
    ]
    assert len(items) == 1
    row = items[0]
    assert row["description"] == "Zmieniono adres dostawy."
    assert row["actor_user_id"] == 7
    assert row["operator_display"] == "Jacek Mizura"
    assert row["metadata"]["actor_kind"] == "USER"
    changed = row["metadata"]["changed_fields"]
    assert len(changed) == 1
    assert changed[0]["key"] == "street"
    assert "56/43" in changed[0]["old"]
    assert "56/60" in changed[0]["new"]
    assert row["details"]
    assert any("Ulica" in d["label"] for d in row["details"])


def test_shipping_address_noop(db, user):
    _patch(db, 100, OrderPatchBody(shipping_street="Okopowa 56/43"), user)
    assert (
        db.query(ActivityEvent)
        .filter(ActivityEvent.event_code == ORDER_SHIPPING_ADDRESS_CHANGED)
        .count()
        == 0
    )


def test_note_add_via_operational_post(db, user):
    create_order_operational_note(
        100,
        OrderOperationalNoteCreateBody(
            content="Sprawdź opakowanie",
            show_in_picking=True,
            show_in_packing=False,
        ),
        db,
        user=user,
    )
    items = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == ORDER_NOTE_ADDED
    ]
    assert len(items) == 1
    assert items[0]["description"] == "Dodano notatkę do zamówienia."
    assert items[0]["actor_user_id"] == 7
    assert items[0]["metadata"]["show_in_picking"] is True
    assert items[0]["metadata"]["note_id"]


def test_note_add_via_patch_append(db, user):
    _patch(db, 100, OrderPatchBody(operational_note_append="Notatka z patch"), user)
    assert (
        db.query(ActivityEvent).filter(ActivityEvent.event_code == ORDER_NOTE_ADDED).count() == 1
    )


def test_item_quantity_and_price_change(db, user, monkeypatch):
    monkeypatch.setattr(
        "backend.api.order.apply_fulfillment_state_from_resolver",
        lambda *a, **k: None,
    )
    monkeypatch.setattr("backend.api.order.touch_picking_in_progress", lambda *a, **k: None)
    patch_order_item_line(
        100,
        1,
        OrderItemPanelPatchBody(line_edit=OrderItemLineEditPatch(quantity=3)),
        db,
        current_user=user,
    )
    qty_rows = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == ORDER_ITEM_QUANTITY_CHANGED
    ]
    assert len(qty_rows) == 1
    assert "z 1 na 3" in qty_rows[0]["description"]
    assert "Sznurówadła CAT 100 cm" in qty_rows[0]["description"]
    assert qty_rows[0]["actor_user_id"] == 7

    patch_order_item_line(
        100,
        1,
        OrderItemPanelPatchBody(line_edit=OrderItemLineEditPatch(unit_price=246.0)),
        db,
        current_user=user,
    )
    price_rows = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == ORDER_ITEM_PRICE_CHANGED
    ]
    assert len(price_rows) == 1
    assert "136,41 zł" in price_rows[0]["description"]
    assert "246,00 zł" in price_rows[0]["description"]


def test_item_qty_noop(db, user, monkeypatch):
    monkeypatch.setattr(
        "backend.api.order.apply_fulfillment_state_from_resolver",
        lambda *a, **k: None,
    )
    monkeypatch.setattr("backend.api.order.touch_picking_in_progress", lambda *a, **k: None)
    patch_order_item_line(
        100,
        1,
        OrderItemPanelPatchBody(line_edit=OrderItemLineEditPatch(quantity=1)),
        db,
        current_user=user,
    )
    assert (
        db.query(ActivityEvent)
        .filter(ActivityEvent.event_code == ORDER_ITEM_QUANTITY_CHANGED)
        .count()
        == 0
    )


def test_add_product_emits_item_added(db, user, monkeypatch):
    monkeypatch.setattr(
        "backend.api.order.resolve_order_create_lines",
        lambda *a, **k: OrderCreateLinesResult(
            lines=[
                ResolvedOrderLine(
                    product_id=11,
                    quantity=1,
                    unit_price=10.0,
                    total_price=10.0,
                    list_price=10.0,
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
        OrderAddLineBody(product_id=11, quantity=1, unit_price=10.0),
        db,
        current_user=user,
    )
    rows = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == ORDER_ITEM_ADDED
    ]
    assert len(rows) == 1
    assert "Produkt B" in rows[0]["description"]
    assert rows[0]["actor_user_id"] == 7
    assert rows[0]["metadata"].get("sku") == "SKU-11"


def test_failed_address_commit_rolls_back_activity(db, user, monkeypatch):
    order = db.query(Order).filter(Order.id == 100).one()
    _apply_order_patch_to_order(
        db,
        order,
        OrderPatchBody(shipping_city="Kraków"),
        actor_user_id=7,
    )

    def boom():
        raise RuntimeError("commit boom")

    monkeypatch.setattr(db, "commit", boom)
    with pytest.raises(RuntimeError, match="commit boom"):
        db.commit()
    db.rollback()
    assert (
        db.query(ActivityEvent)
        .filter(ActivityEvent.event_code == ORDER_SHIPPING_ADDRESS_CHANGED)
        .count()
        == 0
    )


def test_address_idempotent_retry(db):
    old = snapshot_shipping_address({"street": "A"})
    new = snapshot_shipping_address({"street": "B"})
    emit_order_shipping_address_changed_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        old_snapshot=old,
        new_snapshot=new,
        actor_user_id=7,
        mutation_token="t1",
    )
    emit_order_shipping_address_changed_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        old_snapshot=old,
        new_snapshot=new,
        actor_user_id=7,
        mutation_token="t1",
    )
    db.commit()
    assert (
        db.query(ActivityEvent)
        .filter(ActivityEvent.event_code == ORDER_SHIPPING_ADDRESS_CHANGED)
        .count()
        == 1
    )
