"""
Active packing queue SSOT — BASKET ghost count regressions.

  python -m pytest backend/tests/test_packing_active_queue_ssot.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.order_ui_status import OrderUiStatus
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.order_fulfillment_state import READY_TO_PACK, PACKING
from backend.services.picking_handoff_service import HANDOFF_BASKET, HANDOFF_CART, HANDOFF_CARTLESS
from backend.services.wms_packing_service import (
    _packing_orders_base_query,
    packing_mode_distribution,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for m in (Tenant, Warehouse, Cart, CartBasket, Order, OrderUiStatus):
        m.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        OrderUiStatus(
            id=8,
            tenant_id=1,
            warehouse_id=1,
            main_group="TO_PACK",
            name="Pakowanie",
            color="#000",
            sort_order=1,
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _bypass_eligibility(monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_fulfillment_mode_clauses",
        lambda **kwargs: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_consolidation_phase_clauses",
        lambda **kwargs: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_consolidation_plan_clauses",
        lambda **kwargs: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_consolidation_packing_clauses",
        lambda **kwargs: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service._packing_queue_status_ids",
        lambda db, *, tenant_id, warehouse_id, primary_status_id: [int(primary_status_id)],
    )
    monkeypatch.setattr(
        "backend.services.picking_handoff_service.reconcile_picking_handoff_modes",
        lambda *a, **k: {},
    )


def _cart(db) -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="MULTI",
        code="brck1",
        type=CartType.MULTI,
        status=CartStatus.PACKING.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
    )
    db.add(c)
    db.flush()
    return c


def _basket(db, cart: Cart, *, scan: str = "brck1-B01", col: int = 1) -> CartBasket:
    b = CartBasket(
        warehouse_id=1,
        cart_id=int(cart.id),
        name=scan,
        barcode=scan,
        scan_code=scan,
        row=1,
        column=col,
        inner_length=30,
        inner_width=20,
        inner_height=15,
        usable_volume=9.0,
        used_volume=0.0,
    )
    db.add(b)
    db.flush()
    return b


def _order(
    db,
    *,
    number: str,
    handoff: str = HANDOFF_BASKET,
    cart_id=None,
    basket_id=None,
    fs=READY_TO_PACK,
    automation_finished: bool = False,
) -> Order:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="PACKING",
        fulfillment_state=fs,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        order_ui_status_id=8,
        picking_handoff_mode=handoff,
        cart_id=cart_id,
        basket_id=basket_id,
        wms_packing_automation_finished_at=datetime.utcnow() if automation_finished else None,
    )
    db.add(o)
    db.flush()
    return o


def _bind(db, cart: Cart, basket: CartBasket, order: Order) -> None:
    order.cart_id = int(cart.id)
    order.basket_id = int(basket.id)
    basket.order_id = int(order.id)
    db.add_all([order, basket])


def test_case1_active_basket_count_and_queue(db):
    cart = _cart(db)
    b = _basket(db, cart)
    o = _order(db, number="A1")
    _bind(db, cart, b, o)
    db.commit()

    _, _, baskets = packing_mode_distribution(db, tenant_id=1, warehouse_id=1, status_id=8)
    assert baskets == 1
    row = (
        _packing_orders_base_query(
            db, tenant_id=1, warehouse_id=1, status_id=8, mode="baskets", cart_id=None
        )
        .filter(Order.id == int(o.id))
        .first()
    )
    assert row is not None


def test_case2_finalized_handoff_history_not_counted(db):
    cart = _cart(db)
    b = _basket(db, cart)
    o = _order(db, number="FIN", automation_finished=True)
    o.picking_handoff_mode = HANDOFF_BASKET
    o.cart_id = None
    o.basket_id = None
    b.order_id = None
    db.add_all([o, b])
    db.commit()

    _, _, baskets = packing_mode_distribution(db, tenant_id=1, warehouse_id=1, status_id=8)
    assert baskets == 0
    assert (
        _packing_orders_base_query(
            db, tenant_id=1, warehouse_id=1, status_id=8, mode="baskets", cart_id=None
        )
        .filter(Order.id == int(o.id))
        .first()
        is None
    )


def test_case3_handoff_basket_null_basket_id_rejected(db):
    o = _order(db, number="NOB", cart_id=None, basket_id=None, fs=PACKING)
    db.commit()
    _, _, baskets = packing_mode_distribution(db, tenant_id=1, warehouse_id=1, status_id=8)
    assert baskets == 0


def test_case4_basket_custody_inconsistent(db):
    cart = _cart(db)
    b = _basket(db, cart)
    o = _order(db, number="INC")
    o.cart_id = int(cart.id)
    o.basket_id = int(b.id)
    b.order_id = None  # slot released / mismatch
    db.add_all([o, b])
    db.commit()

    _, _, baskets = packing_mode_distribution(db, tenant_id=1, warehouse_id=1, status_id=8)
    assert baskets == 0


def test_case5_partial_multi_one_released(db):
    cart = _cart(db)
    b1 = _basket(db, cart, scan="S-1", col=1)
    b2 = _basket(db, cart, scan="S-2", col=2)
    o1 = _order(db, number="P1")
    o2 = _order(db, number="P2")
    _bind(db, cart, b1, o1)
    _bind(db, cart, b2, o2)
    db.commit()

    # release o1 (finish packing style) — keep handoff provenance
    o1.cart_id = None
    o1.basket_id = None
    b1.order_id = None
    db.add_all([o1, b1])
    db.commit()

    _, _, baskets = packing_mode_distribution(db, tenant_id=1, warehouse_id=1, status_id=8)
    assert baskets == 1
    ids = {
        int(r.id)
        for r in _packing_orders_base_query(
            db, tenant_id=1, warehouse_id=1, status_id=8, mode="baskets", cart_id=None
        ).all()
    }
    assert ids == {int(o2.id)}


def test_case6_cart_and_cartless_unchanged(db):
    o_cl = _order(db, number="CL", handoff=HANDOFF_CARTLESS, cart_id=None, basket_id=None)
    cart = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="BULK",
        code="BULK-1",
        type=CartType.BULK,
        status=CartStatus.READY_FOR_PACKING.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
    )
    db.add(cart)
    db.flush()
    o_cart = _order(db, number="CT", handoff=HANDOFF_CART, cart_id=int(cart.id), basket_id=None)
    db.commit()

    no_cart, bulk, baskets = packing_mode_distribution(db, tenant_id=1, warehouse_id=1, status_id=8)
    assert no_cart == 1
    assert bulk == 1
    assert baskets == 0
    assert o_cl.id and o_cart.id


def test_case7_ui_status_packing_but_automation_finished(db):
    cart = _cart(db)
    b = _basket(db, cart)
    o = _order(db, number="UI8", automation_finished=True)
    # still looks packing in UI / fulfillment, but finished
    o.fulfillment_state = PACKING
    o.order_ui_status_id = 8
    _bind(db, cart, b, o)
    db.commit()

    _, _, baskets = packing_mode_distribution(db, tenant_id=1, warehouse_id=1, status_id=8)
    assert baskets == 0
