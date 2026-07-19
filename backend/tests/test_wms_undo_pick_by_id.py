"""
Granular draft Pick undo (MULTI legacy location recovery).

  python -m pytest backend/tests/test_wms_undo_pick_by_id.py -q
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
from backend.services.wms_basket_put.location_stock import (
    effective_pickable_qty_at_location,
    on_hand_qty_at_location,
)
from backend.services.wms_picking_corrections import (
    list_draft_picks_for_product_on_cart,
    undo_wms_pick_by_id,
)
from backend.services.wms_picking_corrections.undo_pick_service import UndoPickError


LOC_A = 100
LOC_B = 101


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
        WmsOperationSession,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Product(id=192, tenant_id=1, name="Sznurowadła CAT", sku="ST", ean="1"))
    session.add(Location(id=LOC_A, warehouse_id=1, name="A10-A-1", is_active=True))
    session.add(Location(id=LOC_B, warehouse_id=1, name="A23-A-2", is_active=True))
    session.commit()

    monkeypatch.setattr(
        "backend.services.wms_picking_corrections.undo_pick_service.delete_pick_events_for_pick_ids",
        lambda db, ids: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_corrections.undo_pick_service.recompute_order_fulfillment",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_audit_service.emit_wms_pick_undone",
        lambda *a, **k: None,
    )
    try:
        yield session
    finally:
        session.close()


def _seed(db, *, shortage_1235: float = 1.0):
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
    db.add(
        WmsOperationSession(
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
    )
    cart.current_session_id = 1
    for oid, bid, qty, miss in ((1234, 10, 8.0, 0.0), (1235, 11, 1.0, shortage_1235)):
        db.add(
            Order(
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
        )
        db.flush()
        db.add(
            OrderItem(
                id=oid * 10,
                order_id=oid,
                product_id=192,
                quantity=qty,
                unit_price=1.0,
                wms_picking_line_missing_qty=miss,
            )
        )
        db.get(CartBasket, bid).order_id = oid
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=192,
            location_id=LOC_A,
            quantity=4.0,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=192,
            location_id=LOC_B,
            quantity=10.0,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.commit()
    return now


def _pick(db, *, order_id: int, location_id: int, quantity: float) -> Pick:
    p = Pick(
        tenant_id=1,
        warehouse_id=1,
        order_id=order_id,
        order_item_id=order_id * 10,
        product_id=192,
        location_id=location_id,
        cart_id=2,
        quantity=float(quantity),
        picked_at=None,
        status="picking",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_case1_undo_s11_does_not_touch_s12(db):
    _seed(db)
    p_s11 = _pick(db, order_id=1234, location_id=LOC_A, quantity=8)
    p_s12 = _pick(db, order_id=1235, location_id=LOC_B, quantity=1)
    out = undo_wms_pick_by_id(db, tenant_id=1, warehouse_id=1, pick_id=int(p_s11.id), cart_id=2)
    db.commit()
    assert float(out["undone_qty"]) == 8.0
    assert db.get(Pick, p_s11.id) is None
    assert db.get(Pick, p_s12.id) is not None
    assert float(db.get(Pick, p_s12.id).quantity) == 1.0
    assert float(db.get(OrderItem, 12350).wms_picking_line_missing_qty) == 1.0


def test_case2_3_undo_qty5_updates_progress_math(db, monkeypatch):
    """required9 picked8 shortage1 → undo 5 → picked3 shortage1 unresolved5 (per aggregate)."""
    _seed(db)
    p1 = _pick(db, order_id=1234, location_id=LOC_A, quantity=3)
    p2 = _pick(db, order_id=1234, location_id=LOC_A, quantity=5)
    # Simulate FE event sums via remaining draft picks after undo
    undo_wms_pick_by_id(db, tenant_id=1, warehouse_id=1, pick_id=int(p2.id), cart_id=2)
    db.commit()
    assert db.get(Pick, p2.id) is None
    assert db.get(Pick, p1.id) is not None
    drafts = list_draft_picks_for_product_on_cart(
        db, tenant_id=1, warehouse_id=1, cart_id=2, product_id=192
    )
    picked_1234 = sum(float(x["quantity"]) for x in drafts if x["order_id"] == 1234)
    shortage_1235 = float(db.get(OrderItem, 12350).wms_picking_line_missing_qty)
    # Product aggregate: required 9, picked 3 (+0 for 1235), shortage 1 → unresolved 5
    required = 9.0
    picked = picked_1234  # 3
    shortage = shortage_1235  # 1 on other line; product unresolved = 9-3-1=5
    unresolved = max(0.0, required - picked - shortage)
    assert picked == 3.0
    assert shortage == 1.0
    assert unresolved == 5.0


def test_case4_inventory_unchanged_on_undo(db):
    _seed(db)
    p = _pick(db, order_id=1234, location_id=LOC_A, quantity=5)
    before = on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=192, location_id=LOC_A, for_update=False
    )
    out = undo_wms_pick_by_id(db, tenant_id=1, warehouse_id=1, pick_id=int(p.id), cart_id=2)
    db.commit()
    after = on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=192, location_id=LOC_A, for_update=False
    )
    assert out["inventory_unchanged"] is True
    assert before == after == 4.0


def test_case5_reject_finalized(db):
    _seed(db)
    p = _pick(db, order_id=1234, location_id=LOC_A, quantity=3)
    p.picked_at = datetime.utcnow()
    db.commit()
    with pytest.raises(UndoPickError) as ei:
        undo_wms_pick_by_id(db, tenant_id=1, warehouse_id=1, pick_id=int(p.id), cart_id=2)
    assert ei.value.code == "PICK_ALREADY_FINALIZED"


def test_case6_reject_wrong_cart(db):
    _seed(db)
    p = _pick(db, order_id=1234, location_id=LOC_A, quantity=3)
    with pytest.raises(UndoPickError) as ei:
        undo_wms_pick_by_id(db, tenant_id=1, warehouse_id=1, pick_id=int(p.id), cart_id=999)
    assert ei.value.code == "PICK_WRONG_CART"


def test_case7_effective_stock_increases_after_undo(db):
    _seed(db)
    p = _pick(db, order_id=1234, location_id=LOC_A, quantity=3)
    assert (
        effective_pickable_qty_at_location(
            db, tenant_id=1, warehouse_id=1, product_id=192, location_id=LOC_A, for_update=False
        )
        == 1.0
    )
    undo_wms_pick_by_id(db, tenant_id=1, warehouse_id=1, pick_id=int(p.id), cart_id=2)
    db.commit()
    assert (
        effective_pickable_qty_at_location(
            db, tenant_id=1, warehouse_id=1, product_id=192, location_id=LOC_A, for_update=False
        )
        == 4.0
    )


def test_case8_list_picks_and_new_pick_other_location(db):
    _seed(db)
    p_bad = _pick(db, order_id=1234, location_id=LOC_A, quantity=5)
    undo_wms_pick_by_id(db, tenant_id=1, warehouse_id=1, pick_id=int(p_bad.id), cart_id=2)
    db.commit()
    p_ok = _pick(db, order_id=1234, location_id=LOC_B, quantity=5)
    rows = list_draft_picks_for_product_on_cart(
        db, tenant_id=1, warehouse_id=1, cart_id=2, product_id=192
    )
    assert len(rows) == 1
    assert int(rows[0]["pick_id"]) == int(p_ok.id)
    assert int(rows[0]["location_id"]) == LOC_B
    assert rows[0]["basket_label"] == "S-1-1"


def test_case10_ten_orders_undo_one(db):
    now = datetime.utcnow()
    cart = Cart(
        id=2, tenant_id=1, warehouse_id=1, name="c", code="c", type=CartType.MULTI, status="PICKING"
    )
    db.add(cart)
    db.add(
        WmsOperationSession(
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
    )
    cart.current_session_id = 1
    pick_ids = []
    for i in range(10):
        oid = 2000 + i
        bid = 50 + i
        db.add(
            CartBasket(
                id=bid,
                cart_id=2,
                warehouse_id=1,
                row=0,
                column=i,
                name=f"S-1-{i+1}",
                barcode=f"B{i}",
                scan_code=f"B{i}",
                inner_length=1,
                inner_width=1,
                inner_height=1,
                usable_volume=100,
                used_volume=0,
                order_id=oid,
            )
        )
        db.add(
            Order(
                id=oid,
                tenant_id=1,
                warehouse_id=1,
                number=str(oid),
                status="PICKING",
                fulfillment_state="PICKING",
                cart_id=2,
                basket_id=bid,
                picking_session_id=1,
                total_volume_dm3=1,
                created_at=now,
                picking_started_at=now,
            )
        )
        db.flush()
        db.add(OrderItem(id=oid * 10, order_id=oid, product_id=192, quantity=1.0, unit_price=1.0))
        p = Pick(
            tenant_id=1,
            warehouse_id=1,
            order_id=oid,
            order_item_id=oid * 10,
            product_id=192,
            location_id=LOC_A,
            cart_id=2,
            quantity=1.0,
            picked_at=None,
            status="picking",
        )
        db.add(p)
        db.flush()
        pick_ids.append(int(p.id))
    db.commit()
    target = pick_ids[3]
    undo_wms_pick_by_id(db, tenant_id=1, warehouse_id=1, pick_id=target, cart_id=2)
    db.commit()
    remaining = db.query(Pick).filter(Pick.cart_id == 2, Pick.picked_at.is_(None)).count()
    assert remaining == 9
    assert db.get(Pick, target) is None
    for pid in pick_ids:
        if pid == target:
            continue
        assert db.get(Pick, pid) is not None
