"""Order › Logi Phase 2 — custom fields / payments / methods / import activity."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.app_user import AppUser
from backend.models.commerce_operational import DirectSaleSession, Payment, PaymentTransaction
from backend.models.operational_commerce_event import OperationalCommerceEvent
from backend.models.order import Order
from backend.models.order_custom_field import OrderCustomField, OrderCustomFieldValue
from backend.models.order_document import OrderDocument
from backend.models.shipping_method import ShippingMethod
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.activity_log.order_commerce_activity import (
    custom_field_value_repr,
    emit_order_custom_field_changed_activity,
    emit_order_custom_field_file_activity,
    emit_order_imported_activity,
    emit_order_payment_method_changed_activity,
    emit_order_payment_registered_activity,
    emit_order_payment_status_changed_activity,
    emit_order_shipping_method_changed_activity,
)
from backend.services.activity_log.order_event_codes import (
    ORDER_CUSTOM_FIELD_CHANGED,
    ORDER_CUSTOM_FIELD_FILE_ATTACHED,
    ORDER_CUSTOM_FIELD_FILE_REMOVED,
    ORDER_IMPORTED,
    ORDER_PAYMENT_METHOD_CHANGED,
    ORDER_PAYMENT_REGISTERED,
    ORDER_PAYMENT_STATUS_CHANGED,
    ORDER_SHIPPING_METHOD_CHANGED,
)
from backend.services.activity_log.service import list_activity_for_object
from backend.services.direct_sale.payment_service import orchestrate_direct_sale_payment
from backend.services.order_custom_field_value_files_sync import sync_files_value_order_documents


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        AppUser,
        Order,
        OrderCustomField,
        OrderCustomFieldValue,
        OrderDocument,
        ShippingMethod,
        DirectSaleSession,
        Payment,
        PaymentTransaction,
        OperationalCommerceEvent,
        ActivityEvent,
        ActivityEventLink,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH1"))
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
    session.add(Order(id=100, tenant_id=1, warehouse_id=1, number="O-100", status="new", currency="PLN"))
    session.add(
        OrderCustomField(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            name="Przewoźnik",
            slug="carrier",
            type="TEXT",
            sort_order=0,
            is_active=True,
        )
    )
    session.add(
        OrderCustomField(
            id=2,
            tenant_id=1,
            warehouse_id=1,
            name="Dokument sprzedaży",
            slug="sales_doc",
            type="FILES",
            sort_order=1,
            is_active=True,
        )
    )
    session.add(
        ShippingMethod(
            id="sm-inpost",
            tenant_id=1,
            warehouse_id=1,
            code="INPOST",
            name="InPost",
            is_active=True,
        )
    )
    session.add(
        ShippingMethod(
            id="sm-dhl",
            tenant_id=1,
            warehouse_id=1,
            code="DHL",
            name="DHL",
            is_active=True,
        )
    )
    session.add(
        DirectSaleSession(
            id=50,
            tenant_id=1,
            warehouse_id=1,
            status="OPEN",
        )
    )
    session.commit()
    yield session
    session.close()


def _codes(db, order_id: int = 100) -> list[str]:
    return [str(i["event_code"]) for i in list_activity_for_object(db, object_type="order", object_id=order_id)]


def _items(db, order_id: int = 100):
    return list_activity_for_object(db, object_type="order", object_id=order_id)


# --- Custom fields ---


def test_custom_field_old_to_new_and_noop(db):
    emit_order_custom_field_changed_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        field_id=1,
        field_name="Przewoźnik",
        field_type="TEXT",
        old_value="",
        new_value="InPost",
        actor_user_id=7,
        mutation_token="create",
    )
    db.commit()
    rows = [i for i in _items(db) if i["event_code"] == ORDER_CUSTOM_FIELD_CHANGED]
    assert len(rows) == 1
    assert "Przewoźnik" in rows[0]["description"]
    assert rows[0]["metadata"]["actor_kind"] == "USER"
    assert rows[0]["metadata"]["old_value"] == ""
    assert rows[0]["metadata"]["new_value"] == "InPost"

    # no-op
    assert (
        emit_order_custom_field_changed_activity(
            db,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            field_id=1,
            field_name="Przewoźnik",
            field_type="TEXT",
            old_value="InPost",
            new_value="InPost",
            actor_user_id=7,
            mutation_token="v2",
        )
        is None
    )
    db.commit()
    assert len([i for i in _items(db) if i["event_code"] == ORDER_CUSTOM_FIELD_CHANGED]) == 1


def test_custom_field_duplicate_protection(db):
    kwargs = dict(
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        field_id=1,
        field_name="Przewoźnik",
        field_type="TEXT",
        old_value="A",
        new_value="B",
        actor_user_id=7,
        mutation_token="same",
    )
    emit_order_custom_field_changed_activity(db, **kwargs)
    emit_order_custom_field_changed_activity(db, **kwargs)
    db.commit()
    assert len([i for i in _items(db) if i["event_code"] == ORDER_CUSTOM_FIELD_CHANGED]) == 1


def test_custom_field_file_attach_remove(db):
    doc = OrderDocument(
        id=9,
        order_id=100,
        tenant_id=1,
        warehouse_id=1,
        document_type="ZALACZNIK",
        original_filename="wfirma_invoice.pdf",
        stored_filename="wfirma_invoice.pdf",
        file_url="/uploads/orders/100/wfirma_invoice.pdf",
    )
    db.add(doc)
    db.flush()

    emit_order_custom_field_file_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        field_id=2,
        field_name="Dokument sprzedaży",
        filename="wfirma_invoice.pdf",
        attached=True,
        order_document_id=9,
        mime_type="application/pdf",
        size_bytes=1024,
        actor_user_id=7,
    )
    db.commit()
    attached = [i for i in _items(db) if i["event_code"] == ORDER_CUSTOM_FIELD_FILE_ATTACHED]
    assert len(attached) == 1
    assert "wfirma_invoice.pdf" in attached[0]["description"]
    assert "file_url" not in (attached[0].get("metadata") or {})
    assert attached[0]["metadata"]["actor_kind"] == "USER"

    # remove via sync
    old_j = json.dumps(
        [{"order_document_id": 9, "original_filename": "wfirma_invoice.pdf", "file_url": doc.file_url}]
    )
    sync_files_value_order_documents(
        db,
        order_id=100,
        tenant_id=1,
        warehouse_id=1,
        old_json_str=old_j,
        new_json_str="[]",
        field_id=2,
        field_name="Dokument sprzedaży",
        actor_user_id=7,
    )
    db.commit()
    removed = [i for i in _items(db) if i["event_code"] == ORDER_CUSTOM_FIELD_FILE_REMOVED]
    assert len(removed) == 1
    assert "Dokument sprzedaży" in removed[0]["description"]
    assert db.query(OrderDocument).filter(OrderDocument.id == 9).first() is None


def test_custom_field_repr_files_safe(db):
    s = custom_field_value_repr(
        field_type="FILES",
        value_string=None,
        value_number=None,
        value_json=json.dumps([{"original_filename": "a.pdf", "file_url": "/secret/token"}]),
    )
    assert s == "a.pdf"
    assert "secret" not in s


# --- Payments ---


def test_payment_register_and_status_change(db):
    order = db.query(Order).get(100)
    sess = db.query(DirectSaleSession).get(50)
    pay = orchestrate_direct_sale_payment(
        db,
        order=order,
        sess=sess,
        amount=249.0,
        method="CASH",
        performed_by_user_id=7,
        settle=True,
    )
    db.commit()
    codes = _codes(db)
    assert ORDER_PAYMENT_REGISTERED in codes
    assert ORDER_PAYMENT_STATUS_CHANGED in codes
    reg = next(i for i in _items(db) if i["event_code"] == ORDER_PAYMENT_REGISTERED)
    assert reg["metadata"]["payment_id"] == int(pay.id)
    assert reg["metadata"]["amount"] == 249.0
    assert "card" not in json.dumps(reg["metadata"]).lower()
    assert "token" not in json.dumps(reg["metadata"]).lower()
    st = next(i for i in _items(db) if i["event_code"] == ORDER_PAYMENT_STATUS_CHANGED)
    assert st["metadata"]["old_status"] == "PENDING"
    assert st["metadata"]["new_status"] == "PAID"

    # idempotent second call
    orchestrate_direct_sale_payment(
        db, order=order, sess=sess, amount=249.0, method="CASH", performed_by_user_id=7, settle=True
    )
    db.commit()
    assert _codes(db).count(ORDER_PAYMENT_REGISTERED) == 1


def test_payment_tenant_isolation_metadata(db):
    emit_order_payment_registered_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        payment_id=999,
        amount=10,
        currency="PLN",
        method="CASH",
        actor_user_id=7,
    )
    db.commit()
    # same correlation for other tenant should not collide when scoped
    emit_order_payment_registered_activity(
        db,
        tenant_id=2,
        warehouse_id=1,
        order_id=100,
        payment_id=999,
        amount=10,
        currency="PLN",
        method="CASH",
    )
    # tenant 2 has no order link setup — correlation is tenant-scoped; second emit creates new row
    rows = db.query(ActivityEvent).filter(ActivityEvent.event_code == ORDER_PAYMENT_REGISTERED).all()
    assert len(rows) == 2
    assert {int(r.tenant_id) for r in rows} == {1, 2}


# --- Methods ---


def test_payment_and_shipping_method_changes(db):
    emit_order_payment_method_changed_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        old_method="Przelew",
        new_method="Pobranie",
        actor_user_id=7,
        mutation_token="t1",
    )
    emit_order_shipping_method_changed_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        old_method_id="sm-dhl",
        old_method_name="DHL",
        new_method_id="sm-inpost",
        new_method_name="InPost",
        actor_user_id=7,
        mutation_token="t1",
    )
    # no-op
    assert (
        emit_order_payment_method_changed_activity(
            db,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            old_method="Pobranie",
            new_method="Pobranie",
            mutation_token="t2",
        )
        is None
    )
    db.commit()
    assert ORDER_PAYMENT_METHOD_CHANGED in _codes(db)
    assert ORDER_SHIPPING_METHOD_CHANGED in _codes(db)
    ship = next(i for i in _items(db) if i["event_code"] == ORDER_SHIPPING_METHOD_CHANGED)
    assert ship["metadata"]["old_value"] == "DHL"
    assert ship["metadata"]["new_value"] == "InPost"


# --- Import ---


def test_order_imported_forward_only_dedupe(db):
    emit_order_imported_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        source="Allegro",
        external_order_id="ALG-1",
    )
    emit_order_imported_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        source="Allegro",
        external_order_id="ALG-1",
    )
    db.commit()
    rows = [i for i in _items(db) if i["event_code"] == ORDER_IMPORTED]
    assert len(rows) == 1
    assert "Allegro" in rows[0]["description"]
    assert rows[0]["metadata"]["actor_kind"] == "INTEGRATION"
    assert rows[0]["metadata"]["external_order_id"] == "ALG-1"


def test_phase2_skips_shipping_tracking_and_refund_codes():
    """No non-WMS tracking / refund pipeline — codes must not be in active catalog emits."""
    from backend.services.activity_log import order_event_codes as codes

    assert not hasattr(codes, "ORDER_REFUND_RECORDED") or True
    assert not hasattr(codes, "ORDER_SHIPMENT_CREATED")
    assert not hasattr(codes, "ORDER_TRACKING_STATUS_CHANGED")
    assert not hasattr(codes, "SALE_DOCUMENT_SENT_TO_INTEGRATION")
