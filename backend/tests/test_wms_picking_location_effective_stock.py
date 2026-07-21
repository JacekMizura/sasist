"""
Effective location stock projection for MULTI picking (SSOT).

Cases A–E + basket barcode mapping for S-1-2 / brck1-B02.

  python -m pytest backend/tests/test_wms_picking_location_effective_stock.py -q
"""

from __future__ import annotations

from datetime import date, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartType
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.pick import Pick
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_basket_put.basket_match import basket_scan_matches, primary_basket_label
from backend.services.wms_basket_put.location_stock import (
    effective_pickable_qty_at_location,
    location_pick_stock_projection_map,
    on_hand_qty_at_location,
    pending_pick_qty_at_location,
)
from backend.services.wms_basket_put.resolve import resolve_allocation_for_basket_scan
from backend.services.wms_basket_put.scan_service import BasketPutError, confirm_basket_put
from backend.services.wms_basket_put import error_codes as ec


LOC_A10 = 101
LOC_A23 = 102
PRODUCT_ID = 192


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Product,
        Location,
        Inventory,
        Cart,
        CartBasket,
        Order,
        OrderItem,
        Pick,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Product(id=PRODUCT_ID, tenant_id=1, name="X", sku="CAT", ean="5905450181208"))
    session.add(Location(id=LOC_A10, warehouse_id=1, name="A10-A-1", is_active=True))
    session.add(Location(id=LOC_A23, warehouse_id=1, name="A23-A-2", is_active=True))
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _inv(db, loc_id: int, qty: float):
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=PRODUCT_ID,
            location_id=loc_id,
            quantity=float(qty),
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )


def _draft_pick(db, *, loc_id: int, qty: float, cart_id: int = 1, pick_id: int | None = None):
    kwargs = dict(
        tenant_id=1,
        warehouse_id=1,
        order_id=1,
        order_item_id=10,
        product_id=PRODUCT_ID,
        location_id=loc_id,
        cart_id=cart_id,
        quantity=float(qty),
        picked_at=None,
        status="picking",
    )
    if pick_id is not None:
        kwargs["id"] = pick_id
    db.add(Pick(**kwargs))


def test_case_a_inventory_2_draft_2_effective_0(db):
    _inv(db, LOC_A10, 2.0)
    _draft_pick(db, loc_id=LOC_A10, qty=2.0)
    db.commit()
    proj = location_pick_stock_projection_map(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_ids=[LOC_A10]
    )
    assert proj[LOC_A10]["physical"] == pytest.approx(2.0)
    assert proj[LOC_A10]["pending"] == pytest.approx(2.0)
    assert proj[LOC_A10]["effective"] == pytest.approx(0.0)
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A10, for_update=False
    ) == pytest.approx(0.0)


def test_case_b_inventory_10_draft_6_effective_4(db):
    _inv(db, LOC_A23, 10.0)
    _draft_pick(db, loc_id=LOC_A23, qty=6.0)
    db.commit()
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A23, for_update=False
    ) == pytest.approx(4.0)


def test_case_c_finalized_not_double_deducted(db):
    """Inventory already reduced by finalize; finalized Pick must not subtract again."""
    _inv(db, LOC_A10, 4.0)
    db.add(
        Pick(
            tenant_id=1,
            warehouse_id=1,
            order_id=1,
            order_item_id=10,
            product_id=PRODUCT_ID,
            location_id=LOC_A10,
            cart_id=1,
            quantity=6.0,
            picked_at=datetime.utcnow(),
            status="picked",
        )
    )
    db.commit()
    assert on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A10
    ) == pytest.approx(4.0)
    assert pending_pick_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A10
    ) == pytest.approx(0.0)
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A10, for_update=False
    ) == pytest.approx(4.0)


def test_case_d_undo_draft_restores_effective(db):
    _inv(db, LOC_A10, 2.0)
    _draft_pick(db, loc_id=LOC_A10, qty=2.0, pick_id=50)
    db.commit()
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A10, for_update=False
    ) == pytest.approx(0.0)
    db.query(Pick).filter(Pick.id == 50).delete()
    db.commit()
    assert on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A10
    ) == pytest.approx(2.0)
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A10, for_update=False
    ) == pytest.approx(2.0)


def test_case_e_cancel_session_drafts_restores_effective(db):
    _inv(db, LOC_A23, 10.0)
    _draft_pick(db, loc_id=LOC_A23, qty=6.0, pick_id=51)
    _draft_pick(db, loc_id=LOC_A23, qty=1.0, pick_id=52)
    db.commit()
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A23, for_update=False
    ) == pytest.approx(3.0)
    db.query(Pick).filter(Pick.picked_at.is_(None), Pick.product_id == PRODUCT_ID).delete()
    db.commit()
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A23, for_update=False
    ) == pytest.approx(10.0)


def test_hard_gate_zero_effective_blocks_overpick(db):
    _inv(db, LOC_A10, 2.0)
    _draft_pick(db, loc_id=LOC_A10, qty=2.0)
    db.commit()
    avail = effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A10, for_update=False
    )
    assert avail == 0.0
    assert 1.0 > avail + 1e-9


def test_s12_barcode_maps_to_same_basket_as_label(db):
    cart = Cart(
        id=2,
        tenant_id=1,
        warehouse_id=1,
        name="brck1",
        code="brck1",
        type=CartType.MULTI,
        status="PICKING",
    )
    b2 = CartBasket(
        id=11,
        cart_id=2,
        warehouse_id=1,
        row=0,
        column=1,
        name="S-1-2",
        barcode="brck1-B02",
        scan_code="brck1-B02",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    db.add_all([cart, b2])
    db.commit()
    assert primary_basket_label(b2) == "S-1-2"
    assert basket_scan_matches(b2, "brck1-B02")
    assert basket_scan_matches(b2, "S-1-2")


def test_confirm_brck1_b02_ok_when_order_on_s12(db, monkeypatch):
    from backend.models.wms_operation_session import WmsOperationSession

    WmsOperationSession.__table__.create(db.get_bind(), checkfirst=True)
    now = datetime.utcnow()
    cart = Cart(
        id=2,
        tenant_id=1,
        warehouse_id=1,
        name="brck1",
        code="brck1",
        type=CartType.MULTI,
        status="PICKING",
    )
    b1 = CartBasket(
        id=10,
        cart_id=2,
        warehouse_id=1,
        row=0,
        column=0,
        name="S-1-1",
        barcode="brck1-B01",
        scan_code="brck1-B01",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    b2 = CartBasket(
        id=11,
        cart_id=2,
        warehouse_id=1,
        row=0,
        column=1,
        name="S-1-2",
        barcode="brck1-B02",
        scan_code="brck1-B02",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    sess = WmsOperationSession(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        cart_id=2,
        session_kind="picking_active",
        operator_user_id=1,
        started_at=now,
        last_activity_at=now,
        metadata_json="{}",
    )
    db.add_all([cart, b1, b2, sess])
    cart.current_session_id = 1
    o = Order(
        id=1235,
        tenant_id=1,
        warehouse_id=1,
        number="1235",
        status="PICKING",
        fulfillment_state="PICKING",
        cart_id=2,
        basket_id=11,
        picking_session_id=1,
        total_volume_dm3=1.0,
        created_at=now,
        picking_started_at=now,
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(id=12350, order_id=1235, product_id=PRODUCT_ID, quantity=1.0, unit_price=1.0))
    b2.order_id = 1235
    _inv(db, LOC_A23, 10.0)
    db.commit()

    monkeypatch.setattr(
        "backend.services.wms_basket_put.scan_service.assert_cart_ready_for_quick_pick",
        lambda db, cart: sess,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.ensure_order_basket_for_wms_pick",
        lambda db, cart, order: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        lambda _db, _oi, _cid: 0.0,
    )

    alloc, err = resolve_allocation_for_basket_scan(
        db, cart=cart, order_ids=[1235], product_id=PRODUCT_ID, basket=b2
    )
    assert err is None
    assert alloc is not None
    assert int(alloc.basket_id) == 11
    assert alloc.basket_label == "S-1-2"

    calls: list[float] = []

    def record_pick_fn(*, quantity: float, fixed_order_id=None, scope_order_id=None):
        calls.append(float(quantity))
        return 1235, 12350

    r = confirm_basket_put(
        db,
        cart=cart,
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=record_pick_fn,
        order_ids=[1235],
        product_id=PRODUCT_ID,
        location_id=LOC_A23,
        quantity=1.0,
    )
    assert r.phase == "PUT_CONFIRMED"
    assert calls == [1.0]


def test_confirm_wrong_basket_mismatch(db, monkeypatch):
    from backend.models.wms_operation_session import WmsOperationSession

    WmsOperationSession.__table__.create(db.get_bind(), checkfirst=True)
    now = datetime.utcnow()
    db.add(Product(id=191, tenant_id=1, name="Other", sku="OTH", ean="111"))
    cart = Cart(
        id=2,
        tenant_id=1,
        warehouse_id=1,
        name="brck1",
        code="brck1",
        type=CartType.MULTI,
        status="PICKING",
    )
    b1 = CartBasket(
        id=10,
        cart_id=2,
        warehouse_id=1,
        row=0,
        column=0,
        name="S-1-1",
        barcode="brck1-B01",
        scan_code="brck1-B01",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    b2 = CartBasket(
        id=11,
        cart_id=2,
        warehouse_id=1,
        row=0,
        column=1,
        name="S-1-2",
        barcode="brck1-B02",
        scan_code="brck1-B02",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    sess = WmsOperationSession(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        cart_id=2,
        session_kind="picking_active",
        operator_user_id=1,
        started_at=now,
        last_activity_at=now,
        metadata_json="{}",
    )
    db.add_all([cart, b1, b2, sess])
    cart.current_session_id = 1
    # Remaining for PRODUCT_ID only on S-1-1; S-1-2 has another SKU assigned
    o1 = Order(
        id=1234,
        tenant_id=1,
        warehouse_id=1,
        number="1234",
        status="PICKING",
        fulfillment_state="PICKING",
        cart_id=2,
        basket_id=10,
        picking_session_id=1,
        total_volume_dm3=1.0,
        created_at=now,
        picking_started_at=now,
    )
    o2 = Order(
        id=1235,
        tenant_id=1,
        warehouse_id=1,
        number="1235",
        status="PICKING",
        fulfillment_state="PICKING",
        cart_id=2,
        basket_id=11,
        picking_session_id=1,
        total_volume_dm3=1.0,
        created_at=now,
        picking_started_at=now,
    )
    db.add_all([o1, o2])
    db.flush()
    db.add(OrderItem(id=12340, order_id=1234, product_id=PRODUCT_ID, quantity=1.0, unit_price=1.0))
    db.add(OrderItem(id=12350, order_id=1235, product_id=191, quantity=1.0, unit_price=1.0))
    b1.order_id = 1234
    b2.order_id = 1235
    _inv(db, LOC_A23, 10.0)
    db.commit()

    monkeypatch.setattr(
        "backend.services.wms_basket_put.scan_service.assert_cart_ready_for_quick_pick",
        lambda db, cart: sess,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.ensure_order_basket_for_wms_pick",
        lambda db, cart, order: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        lambda _db, _oi, _cid: 0.0,
    )

    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=cart,
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=lambda **kw: (0, 0),
            order_ids=[1234, 1235],
            product_id=PRODUCT_ID,
            location_id=LOC_A23,
            quantity=1.0,
        )
    assert ei.value.code == ec.BASKET_PRODUCT_MISMATCH
