"""
DEFAULT QUANTITY MODE: EAN/CLICK → basket → quantity modal → confirm Pick.

Also covers live BASKET_PRODUCT_MISMATCH: foreign series must not block
product-context resolve for another SKU.

  python -m pytest backend/tests/test_wms_basket_put_quantity_mode.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartType
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.wms_basket_put import error_codes as ec
from backend.services.wms_basket_put.scan_service import BasketPutError, confirm_basket_put
from backend.services.wms_basket_put import state as put_state


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Product,
        Cart,
        CartBasket,
        Order,
        OrderItem,
        WmsOperationSession,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Product(id=192, tenant_id=1, name="X", sku="ST-003", ean="5905450181208"))
    session.add(Product(id=191, tenant_id=1, name="Y", sku="Y", ean="5905450189999"))
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def env(db, monkeypatch):
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
    db.add(cart)
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
    empty = CartBasket(
        id=12,
        cart_id=2,
        warehouse_id=1,
        row=0,
        column=2,
        name="S-1-3",
        barcode="brck1-B03",
        scan_code="brck1-B03",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
        order_id=None,
    )
    db.add_all([b1, b2, empty])
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
    db.add(sess)
    cart.current_session_id = 1
    db.commit()

    monkeypatch.setattr(
        "backend.services.wms_basket_put.scan_service.assert_cart_ready_for_quick_pick",
        lambda db, cart: sess,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.ensure_order_basket_for_wms_pick",
        lambda db, cart, order: None,
    )
    picked: dict[int, float] = {}

    def _sum(_db, oi_id, _cid):
        return float(picked.get(int(oi_id), 0.0))

    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        _sum,
    )
    pick_calls: list[tuple[float, int]] = []

    def record_pick_fn(*, quantity: float, fixed_order_id=None, scope_order_id=None):
        oid = int(scope_order_id if scope_order_id is not None else (fixed_order_id or 0))
        oiid = oid * 10
        pick_calls.append((float(quantity), oid))
        picked[oiid] = float(picked.get(oiid, 0.0)) + float(quantity)
        return oid, oiid

    def add_orders():
        for oid, bid, qty in ((1234, 10, 8.0), (1235, 11, 1.0)):
            o = Order(
                id=oid,
                tenant_id=1,
                warehouse_id=1,
                number=str(oid),
                status="PICKING",
                fulfillment_state="PICKING",
                cart_id=2,
                basket_id=bid,
                picking_session_id=1,
                total_volume_dm3=1.0,
                created_at=now,
                picking_started_at=now,
            )
            db.add(o)
            db.flush()
            db.add(
                OrderItem(
                    id=oid * 10,
                    order_id=oid,
                    product_id=192,
                    quantity=qty,
                    unit_price=1.0,
                )
            )
            db.get(CartBasket, bid).order_id = oid
        db.commit()

    return {
        "cart": cart,
        "sess": sess,
        "pick_calls": pick_calls,
        "picked": picked,
        "record_pick_fn": record_pick_fn,
        "add_orders": add_orders,
    }


def _confirm(db, env, basket: str, *, quantity=None, product_id=192, location_id=100):
    return confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan=basket,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=[1234, 1235],
        product_id=product_id,
        location_id=location_id,
        quantity=quantity,
    )


def test_case1_basket_opens_quantity_modal_no_pick(db, env):
    env["add_orders"]()
    r = _confirm(db, env, "brck1-B01")
    assert r.phase == "QUANTITY_REQUIRED"
    assert float(r.quantity_put) == 0
    assert env["pick_calls"] == []
    assert r.eligible_baskets[0]["line_remaining"] == 8.0
    assert int(r.order_id) == 1234
    r2 = _confirm(db, env, "brck1-B01", quantity=8)
    assert r2.phase == "PUT_CONFIRMED"
    assert env["pick_calls"] == [(8.0, 1234)]


def test_case2_partial_quantity(db, env):
    env["add_orders"]()
    _confirm(db, env, "brck1-B01")
    r = _confirm(db, env, "brck1-B01", quantity=5)
    assert float(r.quantity_put) == 5
    assert env["pick_calls"] == [(5.0, 1234)]
    again = _confirm(db, env, "brck1-B01")
    assert again.phase == "QUANTITY_REQUIRED"
    assert again.eligible_baskets[0]["line_remaining"] == 3.0


def test_case3_click_path_s12_without_prior_ean(db, env):
    env["add_orders"]()
    r = _confirm(db, env, "brck1-B02")
    assert r.phase == "QUANTITY_REQUIRED"
    assert int(r.order_id) == 1235
    assert float(r.eligible_baskets[0]["line_remaining"]) == 1.0
    assert env["pick_calls"] == []
    r2 = _confirm(db, env, "brck1-B02", quantity=1)
    assert env["pick_calls"] == [(1.0, 1235)]


def test_case4_both_baskets_resolve(db, env):
    env["add_orders"]()
    a = _confirm(db, env, "brck1-B01")
    b = _confirm(db, env, "brck1-B02")
    assert a.phase == "QUANTITY_REQUIRED" and int(a.order_id) == 1234
    assert b.phase == "QUANTITY_REQUIRED" and int(b.order_id) == 1235


def test_case5_wrong_basket(db, env):
    env["add_orders"]()
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "brck1-B03")
    assert cm.value.code == ec.BASKET_EMPTY
    assert env["pick_calls"] == []


def test_case6_quantity_zero_rejected(db, env):
    env["add_orders"]()
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "brck1-B01", quantity=0)
    # schema/gt may block; service also rejects <=0
    assert cm.value.code in (ec.QUANTITY_INVALID, "QUANTITY_INVALID")
    assert env["pick_calls"] == []


def test_case8_over_remaining(db, env):
    env["add_orders"]()
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "brck1-B02", quantity=2)
    assert cm.value.code == ec.QUANTITY_EXCEEDS_REMAINING
    assert env["pick_calls"] == []


def test_case9_stale_remaining(db, env):
    env["add_orders"]()
    preview = _confirm(db, env, "brck1-B01")
    assert float(preview.eligible_baskets[0]["line_remaining"]) == 8.0
    # Simulate concurrent pick reducing remaining before confirm
    env["picked"][12340] = 6.0
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "brck1-B01", quantity=8)
    assert cm.value.code == ec.QUANTITY_EXCEEDS_REMAINING
    assert env["pick_calls"] == []


def test_case10_cancel_is_preview_only(db, env):
    env["add_orders"]()
    _confirm(db, env, "brck1-B01")
    assert env["pick_calls"] == []
    # operator scans other basket instead
    r = _confirm(db, env, "brck1-B02")
    assert r.phase == "QUANTITY_REQUIRED"
    assert int(r.order_id) == 1235


def test_case11_partial_then_rescan(db, env):
    env["add_orders"]()
    _confirm(db, env, "brck1-B01", quantity=5)
    r = _confirm(db, env, "brck1-B01")
    assert float(r.eligible_baskets[0]["line_remaining"]) == 3.0
    _confirm(db, env, "brck1-B01", quantity=3)
    assert env["pick_calls"] == [(5.0, 1234), (3.0, 1234)]


def test_case12_multi_basket_arbitrary_order(db, env):
    env["add_orders"]()
    _confirm(db, env, "brck1-B01", quantity=5)
    _confirm(db, env, "brck1-B02", quantity=1)
    _confirm(db, env, "brck1-B01", quantity=3)
    assert env["pick_calls"] == [(5.0, 1234), (1.0, 1235), (3.0, 1234)]


def test_foreign_series_cleared_for_product_context(db, env):
    """LIVE mismatch root: leftover series for SKU Y must not block product X + S-1-2."""
    env["add_orders"]()
    # Foreign leftover series (product 191) still "valid" metadata-wise
    put_state.set_active_series(
        db,
        env["sess"],
        {
            "operator_user_id": 1,
            "product_id": 191,
            "order_id": 999,
            "order_item_id": 9990,
            "basket_id": 10,
            "basket_label": "S-1-1",
            "location_id": 100,
            "activated_at": "Z",
        },
    )
    r = _confirm(db, env, "brck1-B02", product_id=192)
    assert r.phase == "QUANTITY_REQUIRED"
    assert int(r.order_id) == 1235
    assert env["pick_calls"] == []
