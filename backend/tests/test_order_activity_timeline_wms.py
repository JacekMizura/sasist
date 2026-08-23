"""Order › Logi — WMS business projection (dual-write + spam policy)."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.app_user import AppUser
from backend.models.order import Order
from backend.models.order_activity_log import OrderActivityLog
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_event import (
    EVT_CARTON_SELECTED,
    EVT_ORDER_ITEM_REMOVED,
    EVT_ORDER_LINE_REMOVED,
    EVT_PACKED_ITEM,
    EVT_PACKING_STARTED,
    EVT_PICKED_ITEM,
    EVT_PICKING_STARTED,
    WmsOrderEvent,
)
from backend.services.activity_log.service import list_activity_for_object
from backend.services.activity_log.wms_order_activity import (
    EVT_PACK_ALL_USED,
    EVT_SMART_MATCHING_MATCHED,
    EVT_THREE_D_MATCHING_NO_FIT,
    correlation_for_wms_event,
    wms_activity_should_project,
)
from backend.services.wms_audit_service import (
    append_order_activity_for_wms,
    emit_wms_matching_outcome,
    emit_wms_pack_all_used,
    emit_wms_packing_started,
    emit_wms_picking_started,
    insert_wms_order_event,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        AppUser,
        Order,
        Product,
        WmsOrderEvent,
        OrderActivityLog,
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
    session.add(Order(id=100, tenant_id=1, warehouse_id=1, number="O-100", status="new"))
    session.add(Product(id=50, tenant_id=1, name="P", sku="SKU-XYZ", ean="590000"))
    session.commit()
    yield session
    session.close()


def test_technical_events_not_projected():
    assert wms_activity_should_project(EVT_PICKED_ITEM) is False
    assert wms_activity_should_project(EVT_PACKED_ITEM) is False
    assert wms_activity_should_project(EVT_PICKING_STARTED) is True
    assert wms_activity_should_project(EVT_SMART_MATCHING_MATCHED) is True


def test_picking_start_projects_once(db):
    order = db.get(Order, 100)
    emit_wms_picking_started(
        db, tenant_id=1, warehouse_id=1, order=order, cart=None, operator_user_id=7
    )
    emit_wms_picking_started(
        db, tenant_id=1, warehouse_id=1, order=order, cart=None, operator_user_id=7
    )
    db.commit()
    wms_rows = db.query(WmsOrderEvent).filter(WmsOrderEvent.event_type == EVT_PICKING_STARTED).all()
    assert len(wms_rows) == 2  # two real starts → two SSOT rows
    # Activity deduped per wms_order_event.id — two distinct projections
    items = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == EVT_PICKING_STARTED
    ]
    assert len(items) == 2
    assert "zbieranie" in items[0]["description"].lower()
    assert items[0]["metadata"].get("actor_kind") == "USER"
    assert items[0]["category"] == "wms"


def test_picked_item_skips_activity(db):
    row = insert_wms_order_event(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_PICKED_ITEM,
        product_id=50,
        quantity=1,
        metadata={"sku": "SKU-XYZ"},
    )
    append_order_activity_for_wms(
        db,
        order_id=100,
        tenant_id=1,
        warehouse_id=1,
        event_type=EVT_PICKED_ITEM,
        message="Zebrano 1× SKU-XYZ",
        operator_user_id=7,
        wms_order_event_id=int(row.id),
    )
    db.commit()
    assert db.query(WmsOrderEvent).filter(WmsOrderEvent.event_type == EVT_PICKED_ITEM).count() == 1
    codes = [i["event_code"] for i in list_activity_for_object(db, object_type="order", object_id=100)]
    assert EVT_PICKED_ITEM not in codes


def test_idempotent_retry_same_wms_event(db):
    row = insert_wms_order_event(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_PACKING_STARTED,
        metadata={},
    )
    for _ in range(3):
        append_order_activity_for_wms(
            db,
            order_id=100,
            tenant_id=1,
            warehouse_id=1,
            event_type=EVT_PACKING_STARTED,
            message="Rozpoczęto pakowanie zamówienia.",
            operator_user_id=7,
            wms_order_event_id=int(row.id),
        )
    db.commit()
    items = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == EVT_PACKING_STARTED
    ]
    assert len(items) == 1
    from backend.models.activity_event import ActivityEvent

    ae = db.query(ActivityEvent).filter(ActivityEvent.event_code == EVT_PACKING_STARTED).all()
    assert len(ae) == 1
    assert ae[0].correlation_id == correlation_for_wms_event(int(row.id))


def test_smart_and_3d_matching(db):
    emit_wms_matching_outcome(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        source="SMART",
        matched=True,
        carton_id="c1",
        carton_name="A/S 64×38×8 cm",
        operator_user_id=7,
    )
    emit_wms_matching_outcome(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        source="THREE_D",
        matched=False,
        operator_user_id=None,
    )
    db.commit()
    codes = [i["event_code"] for i in list_activity_for_object(db, object_type="order", object_id=100)]
    assert EVT_SMART_MATCHING_MATCHED in codes
    assert EVT_THREE_D_MATCHING_NO_FIT in codes
    smart = next(i for i in list_activity_for_object(db, object_type="order", object_id=100) if i["event_code"] == EVT_SMART_MATCHING_MATCHED)
    assert "Smart Matching" in smart["description"]
    assert smart["metadata"]["source"] == "SMART"


def test_pack_all_and_tenant_isolation(db):
    emit_wms_pack_all_used(db, tenant_id=1, warehouse_id=1, order_id=100, operator_user_id=7, lines_packed=3)
    emit_wms_pack_all_used(db, tenant_id=1, warehouse_id=1, order_id=100, operator_user_id=7, lines_packed=3)
    db.commit()
    # Two pack-all actions → two wms events → two activity rows (distinct ids)
    assert (
        len([i for i in list_activity_for_object(db, object_type="order", object_id=100) if i["event_code"] == EVT_PACK_ALL_USED])
        == 2
    )
    # Other order isolation
    assert list_activity_for_object(db, object_type="order", object_id=999) == []


def test_line_removed_not_projected_item_removed_is(db):
    """OMS delete writes ITEM + LINE to WMS SSOT; Order › Logi shows ITEM only."""
    assert wms_activity_should_project(EVT_ORDER_LINE_REMOVED) is False
    assert wms_activity_should_project(EVT_ORDER_ITEM_REMOVED) is True
    assert wms_activity_should_project(EVT_CARTON_SELECTED) is True

    line_row = insert_wms_order_event(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_ORDER_LINE_REMOVED,
        product_id=50,
        quantity=1,
        metadata={"product_name": "P"},
    )
    item_row = insert_wms_order_event(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        operator_user_id=7,
        event_type=EVT_ORDER_ITEM_REMOVED,
        product_id=50,
        quantity=1,
        metadata={"product_name": "P"},
    )
    append_order_activity_for_wms(
        db,
        order_id=100,
        tenant_id=1,
        warehouse_id=1,
        event_type=EVT_ORDER_LINE_REMOVED,
        message="Usunięto linię",
        operator_user_id=7,
        wms_order_event_id=int(line_row.id),
    )
    append_order_activity_for_wms(
        db,
        order_id=100,
        tenant_id=1,
        warehouse_id=1,
        event_type=EVT_ORDER_ITEM_REMOVED,
        message="Usunięto pozycję",
        operator_user_id=7,
        wms_order_event_id=int(item_row.id),
    )
    db.commit()
    codes = [i["event_code"] for i in list_activity_for_object(db, object_type="order", object_id=100)]
    assert codes.count(EVT_ORDER_ITEM_REMOVED) == 1
    assert EVT_ORDER_LINE_REMOVED not in codes
    assert db.query(WmsOrderEvent).filter(WmsOrderEvent.event_type == EVT_ORDER_LINE_REMOVED).count() == 1
    assert db.query(WmsOrderEvent).filter(WmsOrderEvent.event_type == EVT_ORDER_ITEM_REMOVED).count() == 1
