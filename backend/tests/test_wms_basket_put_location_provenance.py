"""
MULTI location provenance write-path (LIVE finalize 409 class).

Reproduces: FE can stamp locations[0] + qty > stock at that location → pending Pick
that later fails finalize. After fix: write-time reject QUANTITY_EXCEEDS_LOCATION_STOCK /
PICK_LOCATION_REQUIRED; pending picks reserve effective stock.

  python -m pytest backend/tests/test_wms_basket_put_location_provenance.py -q
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
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_basket_put import error_codes as ec
from backend.services.wms_basket_put.location_stock import effective_pickable_qty_at_location
from backend.services.wms_basket_put.scan_service import BasketPutError, confirm_basket_put
from backend.services.wms_basket_put.source_lock import accept_source_location


LOC_A = 100
LOC_B = 101


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
        WmsOperationSession,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Product(id=192, tenant_id=1, name="X", sku="ST-003", ean="5905450181208"))
    session.add(Location(id=LOC_A, warehouse_id=1, name="A10-A-1", is_active=True))
    session.add(Location(id=LOC_B, warehouse_id=1, name="A23-A-2", is_active=True))
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
    db.add_all([b1, b2])
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
    created_picks: list[dict] = []

    def _sum(_db, oi_id, _cid):
        return float(picked.get(int(oi_id), 0.0))

    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        _sum,
    )

    def record_pick_fn(*, quantity: float, fixed_order_id=None, scope_order_id=None, location_id=None):
        # location comes from outer confirm via closure in real API; here we record qty only
        # and create a real pending Pick when location_id kw is injected by wrapper.
        oid = int(scope_order_id if scope_order_id is not None else (fixed_order_id or 0))
        oiid = oid * 10
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

    def seed_stock(*, loc_a: float = 4.0, loc_b: float = 10.0):
        db.query(Inventory).delete()
        db.flush()
        if loc_a > 0:
            db.add(
                Inventory(
                    tenant_id=1,
                    warehouse_id=1,
                    product_id=192,
                    location_id=LOC_A,
                    quantity=float(loc_a),
                    batch_number="",
                    expiry_date=date(9999, 12, 31),
                    stock_disposition=STOCK_DISPOSITION_SALEABLE,
                )
            )
        if loc_b > 0:
            db.add(
                Inventory(
                    tenant_id=1,
                    warehouse_id=1,
                    product_id=192,
                    location_id=LOC_B,
                    quantity=float(loc_b),
                    batch_number="",
                    expiry_date=date(9999, 12, 31),
                    stock_disposition=STOCK_DISPOSITION_SALEABLE,
                )
            )
        db.commit()

    def confirm(basket: str, *, quantity=None, location_id=None, product_id=192):
        """Simulate FE: accept source_lock then confirm (location_id optional compatibility)."""
        if location_id is not None and int(location_id) > 0:
            accept_source_location(
                db,
                cart=cart,
                sess=sess,
                product_id=int(product_id),
                location_id=int(location_id),
                operator_user_id=1,
            )
        return confirm_basket_put(
            db,
            cart=cart,
            basket_scan=basket,
            operator_user_id=1,
            record_pick_fn=record_pick_fn,
            order_ids=[1234, 1235],
            product_id=product_id,
            location_id=location_id,
            quantity=quantity,
        )

    def write_pending_pick(*, location_id: int, quantity: float, order_id: int = 1234):
        p = Pick(
            tenant_id=1,
            warehouse_id=1,
            order_id=order_id,
            order_item_id=order_id * 10,
            product_id=192,
            location_id=int(location_id),
            cart_id=2,
            quantity=float(quantity),
            picked_at=None,
            status="picking",
        )
        db.add(p)
        db.commit()
        created_picks.append(p)
        return p

    return {
        "cart": cart,
        "sess": sess,
        "picked": picked,
        "record_pick_fn": record_pick_fn,
        "add_orders": add_orders,
        "seed_stock": seed_stock,
        "confirm": confirm,
        "write_pending_pick": write_pending_pick,
        "created_picks": created_picks,
    }


def test_live_class_locations0_qty5_vs_stock1_rejected(db, env):
    """
    LIVE class: FE fallback locations[0]=LOC-A (stock 1) + quantity confirm 5
    must NOT create Pick — write-time QUANTITY_EXCEEDS_LOCATION_STOCK.
    (Before fix this created Pick qty=5 @ LOC-A → finalize wymagane 5 dostępne 1.)
    """
    env["add_orders"]()
    env["seed_stock"](loc_a=1.0, loc_b=10.0)
    with pytest.raises(BasketPutError) as ei:
        env["confirm"]("brck1-B01", quantity=5, location_id=LOC_A)
    assert ei.value.code == ec.QUANTITY_EXCEEDS_LOCATION_STOCK
    assert env["picked"] == {}


def test_no_location_rejected_even_for_quantity_preview(db, env):
    env["add_orders"]()
    env["seed_stock"]()
    with pytest.raises(BasketPutError) as ei:
        env["confirm"]("brck1-B01", quantity=None, location_id=None)
    assert ei.value.code == ec.NO_PENDING_SOURCE_LOCATION


def test_quantity_max_uses_location_stock(db, env):
    env["add_orders"]()
    env["seed_stock"](loc_a=4.0, loc_b=10.0)
    r = env["confirm"]("brck1-B01", quantity=None, location_id=LOC_A)
    assert r.phase == "QUANTITY_REQUIRED"
    row = r.eligible_baskets[0]
    assert float(row["line_remaining"]) == 8.0
    assert float(row["location_available"]) == 4.0
    assert float(row["quantity_max"]) == 4.0


def test_pending_picks_reduce_effective_available(db, env):
    env["add_orders"]()
    env["seed_stock"](loc_a=4.0, loc_b=10.0)
    env["write_pending_pick"](location_id=LOC_A, quantity=3.0)
    avail = effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=192, location_id=LOC_A, for_update=False
    )
    assert avail == 1.0
    with pytest.raises(BasketPutError) as ei:
        env["confirm"]("brck1-B01", quantity=4, location_id=LOC_A)
    assert ei.value.code == ec.QUANTITY_EXCEEDS_LOCATION_STOCK
    # qty=1 still OK
    r = env["confirm"]("brck1-B01", quantity=1, location_id=LOC_A)
    assert r.phase == "PUT_CONFIRMED"
    assert float(r.quantity_put) == 1.0


def test_multi_location_two_puts_ok(db, env):
    """Operator takes 4 from LOC-A then 4 from LOC-B → two provenance-correct puts."""
    env["add_orders"]()
    env["seed_stock"](loc_a=4.0, loc_b=10.0)
    r1 = env["confirm"]("brck1-B01", quantity=4, location_id=LOC_A)
    assert float(r1.quantity_put) == 4.0
    # Simulate pending Pick reservation after first put (API would write Pick via record_wms_quick_pick)
    env["write_pending_pick"](location_id=LOC_A, quantity=4.0)
    # Same location exhausted (Inventory 4 − pending 4 = 0)
    with pytest.raises(BasketPutError) as ei:
        env["confirm"]("brck1-B01", quantity=1, location_id=LOC_A)
    assert ei.value.code == ec.QUANTITY_EXCEEDS_LOCATION_STOCK
    r2 = env["confirm"]("brck1-B01", quantity=4, location_id=LOC_B)
    assert float(r2.quantity_put) == 4.0


def test_single_location_full_line_ok(db, env):
    env["add_orders"]()
    env["seed_stock"](loc_a=20.0, loc_b=0.0)
    r = env["confirm"]("brck1-B01", quantity=8, location_id=LOC_A)
    assert float(r.quantity_put) == 8.0
