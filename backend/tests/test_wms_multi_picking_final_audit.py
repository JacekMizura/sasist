"""
Final MULTI picking regression: effective stock flow, parallel carts, basket SSOT.

Proves UI destination list must match confirm-basket-put (list_eligible).

  python -m pytest backend/tests/test_wms_multi_picking_final_audit.py -q
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
from backend.services.wms_basket_put.basket_match import primary_basket_label
from backend.services.wms_basket_put.location_stock import (
    effective_pickable_qty_at_location,
    location_pick_stock_projection_map,
    on_hand_qty_at_location,
)
from backend.services.wms_basket_put.resolve import (
    eligible_baskets_payload,
    list_eligible_basket_allocations,
    resolve_allocation_for_basket_scan,
)
from backend.services.wms_basket_put.scan_service import _find_scanned_basket


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
    row = (
        db.query(Inventory)
        .filter(
            Inventory.product_id == PRODUCT_ID,
            Inventory.location_id == loc_id,
            Inventory.warehouse_id == 1,
        )
        .first()
    )
    if row is None:
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
    else:
        row.quantity = float(qty)


def _draft(db, *, loc_id: int, qty: float, cart_id: int, pick_id: int):
    db.add(
        Pick(
            id=pick_id,
            tenant_id=1,
            warehouse_id=1,
            order_id=cart_id * 100,
            order_item_id=cart_id * 1000,
            product_id=PRODUCT_ID,
            location_id=loc_id,
            cart_id=cart_id,
            quantity=float(qty),
            picked_at=None,
            status="picking",
        )
    )


def test_effective_stock_flow_a10_then_a23_no_inventory_mutate(db):
    _inv(db, LOC_A10, 2.0)
    _inv(db, LOC_A23, 10.0)
    db.commit()

    proj0 = location_pick_stock_projection_map(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_ids=[LOC_A10, LOC_A23]
    )
    assert proj0[LOC_A10]["effective"] == pytest.approx(2.0)
    assert proj0[LOC_A23]["effective"] == pytest.approx(10.0)

    _draft(db, loc_id=LOC_A10, qty=2.0, cart_id=1, pick_id=1)
    db.commit()
    # Inventory unchanged
    assert on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A10
    ) == pytest.approx(2.0)
    proj1 = location_pick_stock_projection_map(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_ids=[LOC_A10, LOC_A23]
    )
    assert proj1[LOC_A10]["effective"] == pytest.approx(0.0)
    assert proj1[LOC_A23]["effective"] == pytest.approx(10.0)

    _draft(db, loc_id=LOC_A23, qty=8.0, cart_id=1, pick_id=2)
    db.commit()
    assert on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A23
    ) == pytest.approx(10.0)
    proj2 = location_pick_stock_projection_map(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_ids=[LOC_A10, LOC_A23]
    )
    assert proj2[LOC_A10]["effective"] == pytest.approx(0.0)
    assert proj2[LOC_A23]["effective"] == pytest.approx(2.0)

    # Simulate finalize: mutate Inventory by draft amounts, stamp picked_at
    for p in db.query(Pick).filter(Pick.picked_at.is_(None)).all():
        inv = (
            db.query(Inventory)
            .filter(Inventory.location_id == p.location_id, Inventory.product_id == PRODUCT_ID)
            .first()
        )
        inv.quantity = float(inv.quantity) - float(p.quantity)
        p.picked_at = datetime.utcnow()
        p.status = "picked"
    db.commit()

    assert on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A10
    ) == pytest.approx(0.0)
    assert on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A23
    ) == pytest.approx(2.0)
    proj3 = location_pick_stock_projection_map(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_ids=[LOC_A10, LOC_A23]
    )
    # No double deduction
    assert proj3[LOC_A10]["effective"] == pytest.approx(0.0)
    assert proj3[LOC_A23]["effective"] == pytest.approx(2.0)
    assert proj3[LOC_A10]["pending"] == pytest.approx(0.0)
    assert proj3[LOC_A23]["pending"] == pytest.approx(0.0)


def test_parallel_cart_sees_reduced_effective_and_cancel_restores(db):
    _inv(db, LOC_A23, 10.0)
    _draft(db, loc_id=LOC_A23, qty=6.0, cart_id=1, pick_id=10)
    db.commit()

    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A23, for_update=False
    ) == pytest.approx(4.0)

    # Cart B hard-gate: cannot take more than 4
    avail = effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A23, for_update=False
    )
    assert 5.0 > avail + 1e-9

    # Cancel Cart A drafts
    db.query(Pick).filter(Pick.cart_id == 1, Pick.picked_at.is_(None)).delete()
    db.commit()
    assert on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A23
    ) == pytest.approx(10.0)
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=PRODUCT_ID, location_id=LOC_A23, for_update=False
    ) == pytest.approx(10.0)


def test_foreign_basket_label_not_in_eligible_same_ssot(db, monkeypatch):
    """
    ROOT CAUSE repro: Order.basket points at S-1-2 on ANOTHER cart.
    orders[].basket_slot historically showed S-1-2, but confirm of this cart's
    brck1-B02 (also labeled S-1-2) → BASKET_PRODUCT_MISMATCH.

    eligible list must NOT include that foreign basket.
    """
    now = datetime.utcnow()
    cart_a = Cart(
        id=2,
        tenant_id=1,
        warehouse_id=1,
        name="brck1",
        code="brck1",
        type=CartType.MULTI,
        status="PICKING",
    )
    cart_b = Cart(
        id=9,
        tenant_id=1,
        warehouse_id=1,
        name="other",
        code="other",
        type=CartType.MULTI,
        status="PICKING",
    )
    # Active cart basket — physical brck1-B02 / S-1-2 (no open line for product)
    b_local = CartBasket(
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
    # Foreign cart basket — also labeled S-1-2; Order wrongly points here
    b_foreign = CartBasket(
        id=99,
        cart_id=9,
        warehouse_id=1,
        row=0,
        column=1,
        name="S-1-2",
        barcode="other-B02",
        scan_code="other-B02",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    db.add_all([cart_a, cart_b, b_local, b_foreign])
    o = Order(
        id=1235,
        tenant_id=1,
        warehouse_id=1,
        number="1235",
        status="PICKING",
        fulfillment_state="PICKING",
        cart_id=2,
        basket_id=99,  # foreign!
        total_volume_dm3=1.0,
        created_at=now,
        picking_started_at=now,
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(id=12350, order_id=1235, product_id=PRODUCT_ID, quantity=1.0, unit_price=1.0))
    b_foreign.order_id = 1235
    db.commit()

    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.ensure_order_basket_for_wms_pick",
        lambda db, cart, order: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        lambda _db, _oi, _cid: 0.0,
    )

    # Misleading: foreign basket primary label is also S-1-2
    assert primary_basket_label(b_foreign) == "S-1-2"
    assert primary_basket_label(b_local) == "S-1-2"

    live = list_eligible_basket_allocations(
        db, cart=cart_a, order_ids=[1235], product_id=PRODUCT_ID
    )
    # Confirm SSOT: empty — foreign basket not on cart
    assert live == []
    payload = eligible_baskets_payload(live, db=db)
    assert payload == []

    scanned = _find_scanned_basket(db, cart=cart_a, basket_scan="brck1-B02")
    assert scanned is not None
    assert int(scanned.id) == 11
    alloc, err = resolve_allocation_for_basket_scan(
        db, cart=cart_a, order_ids=[1235], product_id=PRODUCT_ID, basket=scanned
    )
    assert alloc is None
    assert err == "BASKET_PRODUCT_MISMATCH"


def test_eligible_includes_local_s12_when_order_on_local_basket(db, monkeypatch):
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
    o = Order(
        id=1235,
        tenant_id=1,
        warehouse_id=1,
        number="1235",
        status="PICKING",
        fulfillment_state="PICKING",
        cart_id=2,
        basket_id=11,
        total_volume_dm3=1.0,
        created_at=now,
        picking_started_at=now,
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(id=12350, order_id=1235, product_id=PRODUCT_ID, quantity=1.0, unit_price=1.0))
    b2.order_id = 1235
    db.commit()

    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.ensure_order_basket_for_wms_pick",
        lambda db, cart, order: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        lambda _db, _oi, _cid: 0.0,
    )

    live = list_eligible_basket_allocations(db, cart=cart, order_ids=[1235], product_id=PRODUCT_ID)
    assert len(live) == 1
    assert int(live[0].basket_id) == 11
    assert live[0].basket_label == "S-1-2"
    row = eligible_baskets_payload(live, db=db)[0]
    assert row["barcode"] == "brck1-B02"
    assert row["order_item_id"] == 12350
    assert float(row["line_remaining"]) == pytest.approx(1.0)

    scanned = _find_scanned_basket(db, cart=cart, basket_scan="brck1-B02")
    alloc, err = resolve_allocation_for_basket_scan(
        db, cart=cart, order_ids=[1235], product_id=PRODUCT_ID, basket=scanned
    )
    assert err is None
    assert alloc is not None
    assert int(alloc.basket_id) == 11


def test_find_scanned_prefers_barcode_over_alias(db):
    """S-1-2 alias on another basket must not steal brck1-B02 barcode resolve."""
    cart = Cart(
        id=2,
        tenant_id=1,
        warehouse_id=1,
        name="brck1",
        code="brck1",
        type=CartType.MULTI,
        status="PICKING",
    )
    # Lower id — 0-based alias S-1-2 via row=1,col=2
    alias = CartBasket(
        id=10,
        cart_id=2,
        warehouse_id=1,
        row=1,
        column=2,
        name=None,
        barcode="brck1-B99",
        scan_code="brck1-B99",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    target = CartBasket(
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
    db.add_all([cart, alias, target])
    db.commit()

    by_barcode = _find_scanned_basket(db, cart=cart, basket_scan="brck1-B02")
    assert int(by_barcode.id) == 11
    by_label = _find_scanned_basket(db, cart=cart, basket_scan="S-1-2")
    # Primary label / name of target wins over 0-based alias on basket 10
    assert int(by_label.id) == 11
