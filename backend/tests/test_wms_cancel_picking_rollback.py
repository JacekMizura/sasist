"""
Cancel picking = full operational rollback (MULTI).

  python -m pytest backend/tests/test_wms_cancel_picking_rollback.py -q
"""

from __future__ import annotations

from datetime import date, datetime

import pytest
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.enums import CartStatus, CartType
from backend.models.fulfillment_event import FE_MISSING, FulfillmentEvent
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.pick import Pick
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_picking_lifecycle_service import cancel_picking, start_picking
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_picking_corrections.cancel_session_rollback_service import (
    rollback_wms_picking_session_mutations,
)

LOC_A = 10
LOC_B = 11


@pytest.fixture
def db(monkeypatch):
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
        FulfillmentEvent,
        WmsOperationSession,
        CartLifecycleHistory,
        CartLifecycleEvent,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Product(id=1, tenant_id=1, name="Produkt A", sku="A", ean="EAN-A"))
    session.add(Product(id=2, tenant_id=1, name="Produkt B", sku="B", ean="EAN-B"))
    session.add(Location(id=LOC_A, warehouse_id=1, name="A10-A-1", is_active=True))
    session.add(Location(id=LOC_B, warehouse_id=1, name="A23-A-2", is_active=True))
    session.commit()

    monkeypatch.setattr(
        "backend.services.wms_order_validation.gate.gate_orders_before_capacity",
        lambda db, *, orders, tenant_id, warehouse_id, operator_user_id=None: list(orders),
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_corrections.cancel_session_rollback_service.delete_pick_events_for_pick_ids",
        lambda db, ids: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_corrections.cancel_session_rollback_service.recompute_order_fulfillment",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.fulfillment_event_service.sync_declared_shortage_column_from_missing_events",
        lambda db, oiid: _sync_missing_col(db, oiid),
    )
    monkeypatch.setattr(
        "backend.services.wms_audit_service.emit_wms_picking_cancelled",
        lambda *a, **k: None,
    )
    # Avoid issue-task schema / heavy sync in unit tests
    monkeypatch.setattr(
        "backend.services.wms_picking_corrections.cancel_session_rollback_service._cancel_issue_items_for_cart",
        lambda *a, **k: [],
    )
    monkeypatch.setattr(
        "backend.services.cart_picking_lifecycle_service._after_mutation",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.cart_capacity.analytics_service.persist_capacity_run",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.activity_log.record_from_cart_lifecycle",
        lambda *a, **k: None,
    )
    try:
        yield session
    finally:
        session.close()


def _sync_missing_col(db, oiid: int) -> None:
    import json

    rows = (
        db.query(FulfillmentEvent)
        .filter(FulfillmentEvent.order_item_id == int(oiid), FulfillmentEvent.type == FE_MISSING)
        .all()
    )
    total = sum(float(r.quantity or 0) for r in rows)
    oi = db.query(OrderItem).filter(OrderItem.id == int(oiid)).first()
    if oi is not None:
        oi.wms_picking_line_missing_qty = round(total, 6)
        oi.wms_shortage_declared_qty = round(total, 6)
        if total <= 1e-9:
            oi.wms_picking_line_status = None


def _inv_sum(db, product_id: int = 1) -> float:
    return float(
        db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(Inventory.product_id == int(product_id), Inventory.warehouse_id == 1)
        .scalar()
        or 0
    )


def _loc_qty(db, location_id: int, product_id: int = 1) -> float:
    return float(
        db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(
            Inventory.product_id == int(product_id),
            Inventory.location_id == int(location_id),
            Inventory.warehouse_id == 1,
        )
        .scalar()
        or 0
    )


def _seed_stock(db, *, a: float = 40.0, b: float = 60.0) -> None:
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=1,
            location_id=LOC_A,
            quantity=a,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=1,
            location_id=LOC_B,
            quantity=b,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.flush()


def _multi_cart(db) -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="8X8X4X4",
        code="8X8X4X4",
        type=CartType.MULTI,
        status=CartStatus.AVAILABLE.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_orders=10,
    )
    db.add(c)
    db.flush()
    for i, (r, col, name) in enumerate(
        [(1, 1, "S-1-1"), (1, 2, "S-1-2"), (1, 3, "S-1-3"), (1, 4, "S-1-4"), (1, 5, "S-1-5")]
    ):
        db.add(
            CartBasket(
                cart_id=int(c.id),
                warehouse_id=1,
                row=r,
                column=col,
                name=name,
                barcode=f"B{i}",
                scan_code=f"B{i}",
                inner_length=1,
                inner_width=1,
                inner_height=1,
                usable_volume=50,
                used_volume=0,
            )
        )
    db.flush()
    return c


def _order_with_item(db, *, number: str, qty: float = 8.0, product_id: int = 1) -> tuple[Order, OrderItem]:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="NEW",
        fulfillment_state=None,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
    )
    db.add(o)
    db.flush()
    oi = OrderItem(
        order_id=int(o.id),
        product_id=int(product_id),
        quantity=qty,
        wms_picking_line_missing_qty=0.0,
        wms_shortage_declared_qty=0.0,
    )
    db.add(oi)
    db.flush()
    return o, oi


def _draft_pick(db, *, order: Order, oi: OrderItem, cart_id: int, loc: int, qty: float) -> Pick:
    p = Pick(
        tenant_id=1,
        warehouse_id=1,
        order_id=int(order.id),
        order_item_id=int(oi.id),
        product_id=int(oi.product_id),
        location_id=int(loc),
        cart_id=int(cart_id),
        quantity=float(qty),
        batch_number="",
        expiry_date=date(9999, 12, 31),
        picked_at=None,
        status="picking",
    )
    db.add(p)
    db.flush()
    return p


def _shortage_event(db, *, oi: OrderItem, cart_id: int, qty: float, order_id: int) -> None:
    import json

    db.add(
        FulfillmentEvent(
            order_item_id=int(oi.id),
            type=FE_MISSING,
            quantity=float(qty),
            metadata_json=json.dumps(
                {
                    "cart_id": int(cart_id),
                    "source": "wms_report_shortage",
                    "order_id": int(order_id),
                    "product_id": int(oi.product_id),
                }
            ),
        )
    )
    oi.wms_picking_line_missing_qty = float(getattr(oi, "wms_picking_line_missing_qty", 0) or 0) + float(qty)
    oi.wms_shortage_declared_qty = float(getattr(oi, "wms_shortage_declared_qty", 0) or 0) + float(qty)
    db.flush()


# --- CASE 1: no picks ---
def test_case1_cancel_no_picks_cleans_cart(db):
    _seed_stock(db)
    cart = _multi_cart(db)
    o1, _ = _order_with_item(db, number="1234")
    o2, _ = _order_with_item(db, number="1235")
    db.commit()
    start_picking(db, cart=cart, orders=[o1, o2], operator_user_id=3)
    db.commit()
    assert o1.cart_id == cart.id

    out = cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1, operator_user_id=3)
    db.commit()
    db.refresh(cart)
    db.refresh(o1)
    db.refresh(o2)
    assert out["cart_status"] == CartStatus.AVAILABLE.value
    assert o1.cart_id is None and o2.cart_id is None
    assert o1.basket_id is None
    for b in cart.baskets:
        assert b.order_id is None
    assert cart.assigned_user_id is None
    assert cart.current_session_id is None
    assert _inv_sum(db) == 100.0


# --- CASE 2: draft pick, location unchanged ---
def test_case2_draft_pick_no_location_mutation(db):
    _seed_stock(db)
    cart = _multi_cart(db)
    o1, oi1 = _order_with_item(db, number="1234")
    db.commit()
    start_picking(db, cart=cart, orders=[o1], operator_user_id=3)
    db.flush()
    _draft_pick(db, order=o1, oi=oi1, cart_id=int(cart.id), loc=LOC_A, qty=3)
    _draft_pick(db, order=o1, oi=oi1, cart_id=int(cart.id), loc=LOC_B, qty=5)
    before_a, before_b, before_g = _loc_qty(db, LOC_A), _loc_qty(db, LOC_B), _inv_sum(db)
    assert before_g == 100.0
    db.commit()

    out = cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1, operator_user_id=3)
    db.commit()
    assert out["rollback"]["draft_picks_deleted"] == 2
    assert out["rollback"]["location_qty_restored"] == 0.0
    assert _loc_qty(db, LOC_A) == before_a
    assert _loc_qty(db, LOC_B) == before_b
    assert _inv_sum(db) == 100.0
    assert db.query(Pick).filter(Pick.cart_id == int(cart.id)).count() == 0
    put_back = out["rollback"]["put_back_required"]
    assert len(put_back) >= 1
    assert all(not r.get("location_stock_restored") for r in out["rollback"]["undone_picks"])


# --- CASE 3: finalized pick restores exact locations ---
def test_case3_finalized_pick_restores_location_not_global_doc(db):
    _seed_stock(db, a=10.0, b=60.0)
    cart = _multi_cart(db)
    o1, oi1 = _order_with_item(db, number="F-1")
    cart.status = CartStatus.PICKING.value
    o1.cart_id = int(cart.id)
    db.flush()
    p = _draft_pick(db, order=o1, oi=oi1, cart_id=int(cart.id), loc=LOC_A, qty=4)
    inv = (
        db.query(Inventory)
        .filter(Inventory.location_id == LOC_A, Inventory.product_id == 1)
        .first()
    )
    inv.quantity = 6.0
    p.picked_at = datetime.utcnow()
    db.commit()
    assert _loc_qty(db, LOC_A) == 6.0
    assert _inv_sum(db) == 66.0

    rb = rollback_wms_picking_session_mutations(
        db,
        tenant_id=1,
        warehouse_id=1,
        cart_id=int(cart.id),
        picking_session_id=None,
        orders=[o1],
        operator_user_id=3,
        cart=cart,
        sess=None,
    )
    db.commit()
    assert rb["location_qty_restored"] == 4.0
    assert _loc_qty(db, LOC_A) == 10.0
    assert _inv_sum(db) == 70.0  # 10+60 — global sum restored via location only
    assert rb["global_stock_mutated"] is False


# --- CASE 4: provenance A+3 B+5 never A+8 ---
def test_case4_location_provenance(db):
    _seed_stock(db, a=10.0, b=10.0)
    cart = _multi_cart(db)
    o1, oi1 = _order_with_item(db, number="P-1")
    cart.status = CartStatus.PICKING.value
    o1.cart_id = int(cart.id)
    db.flush()
    for loc, qty in ((LOC_A, 3.0), (LOC_B, 5.0)):
        p = _draft_pick(db, order=o1, oi=oi1, cart_id=int(cart.id), loc=loc, qty=qty)
        inv = db.query(Inventory).filter(Inventory.location_id == loc, Inventory.product_id == 1).first()
        inv.quantity = float(inv.quantity) - qty
        p.picked_at = datetime.utcnow()
    db.commit()
    assert _loc_qty(db, LOC_A) == 7.0
    assert _loc_qty(db, LOC_B) == 5.0

    rb = rollback_wms_picking_session_mutations(
        db,
        tenant_id=1,
        warehouse_id=1,
        cart_id=int(cart.id),
        picking_session_id=None,
        orders=[o1],
        cart=cart,
        sess=None,
    )
    db.commit()
    assert _loc_qty(db, LOC_A) == 10.0
    assert _loc_qty(db, LOC_B) == 10.0
    assert rb["location_qty_restored"] == 8.0
    # Must not have dumped both onto A
    assert _loc_qty(db, LOC_A) != 18.0


# --- CASE 5: MULTI mixed contributions ---
def test_case5_multi_session_contributions(db):
    _seed_stock(db)
    cart = _multi_cart(db)
    orders_items = []
    for n in ("#1", "#2", "#3", "#4", "#5"):
        orders_items.append(_order_with_item(db, number=n))
    db.commit()
    orders = [x[0] for x in orders_items]
    start_picking(db, cart=cart, orders=orders, operator_user_id=3)
    db.flush()
    # #1 picked
    _draft_pick(db, order=orders_items[0][0], oi=orders_items[0][1], cart_id=int(cart.id), loc=LOC_A, qty=2)
    # #2 partial
    _draft_pick(db, order=orders_items[1][0], oi=orders_items[1][1], cart_id=int(cart.id), loc=LOC_A, qty=1)
    # #3 shortage only
    _shortage_event(db, oi=orders_items[2][1], cart_id=int(cart.id), qty=5, order_id=int(orders_items[2][0].id))
    # #4 pick + shortage
    _draft_pick(db, order=orders_items[3][0], oi=orders_items[3][1], cart_id=int(cart.id), loc=LOC_B, qty=2)
    _shortage_event(db, oi=orders_items[3][1], cart_id=int(cart.id), qty=1, order_id=int(orders_items[3][0].id))
    # #5 unresolved = no pick no shortage
    db.commit()

    out = cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1, operator_user_id=3)
    db.commit()
    assert out["rollback"]["draft_picks_deleted"] == 3
    assert len(out["rollback"]["shortages_rolled_back"]) == 2
    for o, oi in orders_items:
        db.refresh(o)
        db.refresh(oi)
        assert o.cart_id is None
        assert float(oi.wms_picking_line_missing_qty or 0) == 0.0
    assert db.query(Pick).count() == 0
    assert _inv_sum(db) == 100.0


# --- CASE 8: double cancel idempotent ---
def test_case8_double_cancel_idempotent(db):
    _seed_stock(db)
    cart = _multi_cart(db)
    o1, oi1 = _order_with_item(db, number="D-1")
    db.commit()
    start_picking(db, cart=cart, orders=[o1], operator_user_id=3)
    db.flush()
    _draft_pick(db, order=o1, oi=oi1, cart_id=int(cart.id), loc=LOC_A, qty=4)
    db.commit()
    cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1, operator_user_id=3)
    db.commit()
    g1 = _inv_sum(db)
    out2 = cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1, operator_user_id=3)
    db.commit()
    assert out2.get("idempotent") is True
    assert _inv_sum(db) == g1 == 100.0
    assert db.query(Pick).count() == 0


# --- CASE 9/10: cart clean + restart ---
def test_case9_10_restart_after_cancel(db):
    _seed_stock(db)
    cart = _multi_cart(db)
    o1, oi1 = _order_with_item(db, number="R-1")
    db.commit()
    start_picking(db, cart=cart, orders=[o1], operator_user_id=3)
    db.flush()
    _draft_pick(db, order=o1, oi=oi1, cart_id=int(cart.id), loc=LOC_A, qty=2)
    _shortage_event(db, oi=oi1, cart_id=int(cart.id), qty=3, order_id=int(o1.id))
    db.commit()
    cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1, operator_user_id=3)
    db.commit()
    db.refresh(cart)
    db.refresh(o1)
    assert cart.status == CartStatus.AVAILABLE.value
    assert all(b.order_id is None for b in cart.baskets)
    assert o1.cart_id is None
    assert float(oi1.wms_picking_line_missing_qty or 0) == 0.0

    start_picking(db, cart=cart, orders=[o1], operator_user_id=3)
    db.commit()
    db.refresh(o1)
    assert o1.cart_id == cart.id
    assert db.query(Pick).filter(Pick.cart_id == int(cart.id)).count() == 0


# --- CASE 12: global stock constant ---
def test_case12_global_stock_separation(db):
    _seed_stock(db, a=40.0, b=60.0)
    assert _inv_sum(db) == 100.0
    cart = _multi_cart(db)
    o1, oi1 = _order_with_item(db, number="G-1")
    db.commit()
    start_picking(db, cart=cart, orders=[o1], operator_user_id=3)
    db.flush()
    _draft_pick(db, order=o1, oi=oi1, cart_id=int(cart.id), loc=LOC_A, qty=3)
    _draft_pick(db, order=o1, oi=oi1, cart_id=int(cart.id), loc=LOC_B, qty=5)
    db.commit()
    assert _inv_sum(db) == 100.0  # drafts do not touch location stock
    cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1, operator_user_id=3)
    db.commit()
    assert _inv_sum(db) == 100.0
    assert _loc_qty(db, LOC_A) == 40.0
    assert _loc_qty(db, LOC_B) == 60.0


# --- Shortage from other cart must survive ---
def test_shortage_other_session_preserved(db):
    _seed_stock(db)
    cart = _multi_cart(db)
    o1, oi1 = _order_with_item(db, number="S-1")
    db.commit()
    start_picking(db, cart=cart, orders=[o1], operator_user_id=3)
    db.flush()
    # Older shortage from another cart
    import json

    db.add(
        FulfillmentEvent(
            order_item_id=int(oi1.id),
            type=FE_MISSING,
            quantity=2.0,
            metadata_json=json.dumps({"cart_id": 999, "order_id": int(o1.id), "product_id": 1}),
        )
    )
    oi1.wms_picking_line_missing_qty = 2.0
    # Session shortage
    _shortage_event(db, oi=oi1, cart_id=int(cart.id), qty=5, order_id=int(o1.id))
    db.commit()
    assert float(oi1.wms_picking_line_missing_qty) == 7.0

    cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1, operator_user_id=3)
    db.commit()
    db.refresh(oi1)
    assert float(oi1.wms_picking_line_missing_qty or 0) == 2.0
    remaining = (
        db.query(FulfillmentEvent)
        .filter(FulfillmentEvent.order_item_id == int(oi1.id), FulfillmentEvent.type == FE_MISSING)
        .all()
    )
    assert len(remaining) == 1
    assert float(remaining[0].quantity) == 2.0
