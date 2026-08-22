"""Message template variable registry + renderer + scopes regression tests."""

from __future__ import annotations

import json
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.messaging import MessageTemplate
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.messaging.context import build_entity_email_context
from backend.services.messaging.template_scopes import (
    normalize_supported_contexts,
    serialize_supported_contexts,
    template_supports_entity,
)
from backend.services.messaging.template_vars.registry import (
    TEMPLATE_VARIABLES,
    VARIABLE_BY_KEY,
    list_variable_catalog,
)
from backend.services.messaging.template_vars.render import render_template, render_template_string
from backend.services.messaging.templates import (
    create_email_template,
    list_email_templates,
    migrate_legacy_entity_scopes,
    template_to_dict,
    update_email_template,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, OrderUiStatus, Product, Order, OrderItem, MessageTemplate):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="Sklep Demo", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        OrderUiStatus(
            id=10,
            tenant_id=1,
            warehouse_id=1,
            name="Wysłane",
            sort_order=1,
            main_group="DONE",
        )
    )
    session.add(
        Product(id=1, tenant_id=1, name="Kubek", sku="K1", weight=0.25, length=10, width=10, height=10)
    )
    session.add(
        Order(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            number="ZAM-100",
            external_id="EXT-9",
            order_ui_status_id=10,
            value=199.5,
            currency="PLN",
            shipping_method="DPD",
            addresses_json=json.dumps(
                {
                    "billing": {
                        "first_name": "Jan",
                        "last_name": "Kowalski",
                        "street": "Lipowa",
                        "house_number": "12",
                        "postal_code": "00-001",
                        "city": "Warszawa",
                        "email": "jan@example.com",
                    },
                    "shipping": {
                        "first_name": "Anna",
                        "last_name": "Nowak",
                        "street": "Kwiatowa",
                        "house_number": "3",
                        "postal_code": "30-001",
                        "city": "Kraków",
                    },
                },
                ensure_ascii=False,
            ),
            order_date=datetime(2026, 1, 15, 12, 0, 0),
            created_at=datetime(2026, 1, 15, 12, 0, 0),
        )
    )
    session.add(
        OrderItem(
            id=1,
            order_id=100,
            product_id=1,
            quantity=2,
            unit_price=10,
            total_price=20,
            offer_name_snapshot="Kubek",
        )
    )
    session.commit()
    yield session
    session.close()


def test_registry_no_duplicate_keys():
    keys = [d.key for d in TEMPLATE_VARIABLES]
    assert len(keys) == len(set(keys))
    assert "order_id" in VARIABLE_BY_KEY
    assert VARIABLE_BY_KEY["order_number"].key == "order_id"


def test_catalog_api_shape():
    items = list_variable_catalog()
    assert any(i["key"] == "order_id" and i["token"] == "{order_id}" for i in items)
    assert any(i["value_kind"] == "HTML" and i["key"] == "cart" for i in items)


def test_render_resolved_no_gaps():
    ctx = {"order_id": "ZAM-1", "status_name": "OK"}
    r = render_template_string("Zamówienie {order_id}", ctx)
    assert r.text == "Zamówienie ZAM-1"
    assert r.missing_variables == []
    assert r.unknown_variables == []
    assert render_template_string("Status {{status_name}}", ctx).text == "Status OK"


def test_known_missing_variable():
    r = render_template_string("Zamówienie {order_id} wysłane", {})
    assert r.text == "Zamówienie  wysłane"
    assert r.missing_variables == ["order_id"]
    assert r.unknown_variables == []


def test_unknown_placeholder_kept():
    r = render_template_string("X {waybill} Y", {"order_id": "1"})
    assert r.text == "X {waybill} Y"
    assert r.unknown_variables == ["waybill"]
    assert r.missing_variables == []


def test_multiple_missing_deduped_subject_and_body():
    rendered = render_template(
        subject_template="{order_id} / {order_id}",
        body_template="{order_email} {order_id} {nope}",
        context={},
        body_is_html=True,
    )
    assert rendered.missing_variables == ["order_id", "order_email"]
    assert rendered.unknown_variables == ["nope"]
    assert "{nope}" in rendered.body


def test_text_escaping_in_html_mode():
    ctx = {"order_id": "<script>"}
    out = render_template_string("Hi {order_id}", ctx, for_html=True)
    assert "<script>" not in out.text
    assert "&lt;script&gt;" in out.text


def test_html_variable_not_escaped():
    ctx = {"cart": "<table><tr><td>A</td></tr></table>"}
    out = render_template_string("X {cart}", ctx, for_html=True)
    assert "<table>" in out.text


def test_order_context_and_render(db):
    ctx = build_entity_email_context(db, tenant_id=1, entity_type="ORDER", entity_id=100)
    assert ctx["order_id"] == "ZAM-100"
    assert ctx["external_order_id"] == "EXT-9"
    assert ctx["bill_address_city"] == "Warszawa"
    assert ctx["shipment_address_city"] == "Kraków"
    assert "Kubek" in ctx["products_with_quantity"]
    assert "<table" in ctx["cart"]
    assert ctx["shop_name"] == "Sklep Demo"
    rendered = render_template(
        subject_template="Zamówienie {order_id} — {status}",
        body_template="<p>Witaj, {bill_address_name}. {cart}</p>",
        context=ctx,
        body_is_html=True,
    )
    assert rendered.subject == "Zamówienie ZAM-100 — Wysłane"
    assert "Jan" in rendered.body
    assert "<table" in rendered.body
    assert rendered.missing_variables == []


def test_legacy_scope_normalize():
    assert normalize_supported_contexts("ORDER") == ["ORDER"]
    assert normalize_supported_contexts("RETURN") == ["RETURN"]
    assert normalize_supported_contexts("COMPLAINT") == ["COMPLAINT"]
    assert normalize_supported_contexts("ALL") == ["ORDER", "RETURN", "COMPLAINT"]
    assert normalize_supported_contexts("ORDER,RETURN") == ["ORDER", "RETURN"]
    assert serialize_supported_contexts(["RETURN", "ORDER"]) == "ORDER,RETURN"


def test_supported_contexts_persist_and_filter(db):
    a = create_email_template(
        db,
        tenant_id=1,
        name="OR",
        subject_template="s",
        body_template="b",
        supported_contexts=["ORDER", "RETURN"],
        code="or_tpl",
    )
    b = create_email_template(
        db,
        tenant_id=1,
        name="RC",
        subject_template="s",
        body_template="b",
        supported_contexts=["RETURN", "COMPLAINT"],
        code="rc_tpl",
    )
    db.commit()
    assert template_to_dict(a)["supported_contexts"] == ["ORDER", "RETURN"]
    assert template_to_dict(b)["supported_contexts"] == ["RETURN", "COMPLAINT"]

    update_email_template(db, a, supported_contexts=["ORDER", "RETURN"])
    db.commit()
    db.refresh(a)
    assert a.entity_scope == "ORDER,RETURN"
    assert template_to_dict(a)["supported_contexts"] == ["ORDER", "RETURN"]

    assert {t.code for t in list_email_templates(db, tenant_id=1, entity_type="ORDER")} == {"or_tpl"}
    assert {t.code for t in list_email_templates(db, tenant_id=1, entity_type="RETURN")} == {"or_tpl", "rc_tpl"}
    assert {t.code for t in list_email_templates(db, tenant_id=1, entity_type="COMPLAINT")} == {"rc_tpl"}


def test_migrate_legacy_all_and_singles(db):
    db.add(
        MessageTemplate(
            tenant_id=1,
            code="legacy_all",
            name="All",
            channel="email",
            entity_scope="ALL",
            subject_template="",
            body_template="",
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
    )
    db.add(
        MessageTemplate(
            tenant_id=1,
            code="legacy_order",
            name="Order",
            channel="email",
            entity_scope="ORDER",
            subject_template="",
            body_template="",
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
    )
    db.commit()
    n = migrate_legacy_entity_scopes(db)
    db.commit()
    assert n >= 1
    rows = {r.code: r.entity_scope for r in db.query(MessageTemplate).all()}
    assert rows["legacy_all"] == "ORDER,RETURN,COMPLAINT"
    assert rows["legacy_order"] == "ORDER"
    assert template_supports_entity(rows["legacy_all"], "COMPLAINT")
    assert not template_supports_entity(rows["legacy_order"], "RETURN")
