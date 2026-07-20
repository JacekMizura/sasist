"""
Confirm remaining product picks (Zatwierdź i wróć) — multi-location allocation.

  python -m pytest backend/tests/test_wms_confirm_remaining_picks.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartType
from backend.models.fulfillment_event import FulfillmentEvent
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.pick import Pick
from backend.models.picking_config import PickingConfig
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.schemas.wms_picking_products import WmsPickingOrderTypeFilter  # noqa: F401 — type hint docs
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_basket_put.location_stock import (
    effective_pickable_qty_at_location,
    on_hand_qty_at_location,
)
from backend.services.wms_picking_confirm_remaining_service import (
    ConfirmRemainingError,
    confirm_remaining_product_picks,
)


LOC_A = 100
LOC_B = 101
LOC_C = 102


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
        FulfillmentEvent,
        PickingConfig,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=False))
    session.add(Product(id=10, tenant_id=1, name="Produkt A", sku="A", ean="590"))
    # Names enforce routing order: A before B before C
    session.add(Location(id=LOC_A, warehouse_id=1, name="A10-A-1", type="pick", is_active=True))
    session.add(Location(id=LOC_B, warehouse_id=1, name="A23-A-2", type="pick", is_active=True))
    session.add(Location(id=LOC_C, warehouse_id=1, name="A30-A-3", type="pick", is_active=True))
    session.commit()

    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service.emit_wms_picked_item",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service.emit_wms_picking_started",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service.recompute_order_fulfillment",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service.notify_first_product_confirmed",
        lambda *a, **k: None,
        raising=False,
    )
    # notify is imported inside record_wms_quick_pick
    monkeypatch.setattr(
        "backend.services.cart_picking_lifecycle_service.notify_first_product_confirmed",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.inventory_count.inventory_movement_guard_service.locked_location_ids_for_picking",
        lambda *a, **k: set(),
    )
    try:
        yield session
    finally:
        session.close()


def _seed(
    db,
    *,
    need: float = 20.0,
    stocks: tuple[tuple[int, float], ...] = ((LOC_A, 8.0), (LOC_B, 7.0), (LOC_C, 12.0)),
    pre_picks: list[tuple[int, float]] | None = None,
):
    now = datetime.utcnow()
    cart = Cart(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        name="BULK-1",
        code="BULK-1",
        type=CartType.BULK,
        status="PICKING",
    )
    db.add(cart)
    db.add(
        WmsOperationSession(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            cart_id=1,
            session_kind="picking_active",
            operator_user_id=1,
            started_at=now,
            last_activity_at=now,
            metadata_json="{}",
        )
    )
    cart.current_session_id = 1
    order = Order(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        number="1001",
        cart_id=1,
        status="picking",
        picking_session_id=1,
        picking_started_at=now,
        order_ui_status_id=1,
    )
    db.add(order)
    oi = OrderItem(id=1, order_id=1, product_id=10, quantity=float(need))
    db.add(oi)
    for lid, qty in stocks:
        db.add(
            Inventory(
                tenant_id=1,
                warehouse_id=1,
                product_id=10,
                location_id=int(lid),
                quantity=float(qty),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
    if pre_picks:
        for lid, qty in pre_picks:
            p = Pick(
                tenant_id=1,
                warehouse_id=1,
                order_id=1,
                order_item_id=1,
                product_id=10,
                location_id=int(lid),
                cart_id=1,
                quantity=float(qty),
                picked_at=None,
                status="picking",
            )
            db.add(p)
            db.flush()
            from backend.services.fulfillment_event_service import record_pick_event_for_wms_pick

            record_pick_event_for_wms_pick(db, p)
    db.commit()
    return cart


def _run(db, **kwargs):
    return confirm_remaining_product_picks(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=1,
        order_type="all",
        product_id=10,
        cart_id=1,
        operator_user_id=1,
        **kwargs,
    )


def _pick_by_loc(db) -> dict[int, float]:
    rows = (
        db.query(Pick.location_id, func.coalesce(func.sum(Pick.quantity), 0.0))
        .filter(Pick.product_id == 10, Pick.cart_id == 1)
        .group_by(Pick.location_id)
        .all()
    )
    return {int(r[0]): float(r[1]) for r in rows}


def test_confirm_remaining_single_location(db):
    _seed(db, need=5.0, stocks=((LOC_A, 10.0),))
    out = _run(db)
    db.commit()
    assert out["quantity_put"] == 5.0
    assert out["locations"] == [{"location_id": LOC_A, "quantity": 5.0}]
    assert _pick_by_loc(db) == {LOC_A: 5.0}
    # Inventory unchanged until finalize
    assert on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=10, location_id=LOC_A
    ) == 10.0
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=10, location_id=LOC_A, for_update=False
    ) == 5.0


def test_confirm_remaining_splits_across_locations(db):
    _seed(db, need=20.0, stocks=((LOC_A, 8.0), (LOC_B, 7.0), (LOC_C, 12.0)))
    out = _run(db)
    db.commit()
    assert out["quantity_put"] == 20.0
    by_loc = {r["location_id"]: r["quantity"] for r in out["locations"]}
    assert by_loc == {LOC_A: 8.0, LOC_B: 7.0, LOC_C: 5.0}
    assert _pick_by_loc(db) == {LOC_A: 8.0, LOC_B: 7.0, LOC_C: 5.0}
    # Never A+20
    assert by_loc[LOC_A] == 8.0


def test_confirm_remaining_partial_already_scanned(db):
    _seed(
        db,
        need=20.0,
        stocks=((LOC_A, 8.0), (LOC_B, 7.0), (LOC_C, 12.0)),
        pre_picks=[(LOC_A, 6.0)],
    )
    # After 6 from A: effective A=2
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=10, location_id=LOC_A, for_update=False
    ) == pytest.approx(2.0)
    out = _run(db)
    db.commit()
    assert out["quantity_requested"] == pytest.approx(14.0)
    assert out["quantity_put"] == pytest.approx(14.0)
    by_loc = _pick_by_loc(db)
    assert by_loc[LOC_A] == pytest.approx(8.0)  # 6 pre + 2
    assert by_loc[LOC_B] == pytest.approx(7.0)
    assert by_loc[LOC_C] == pytest.approx(5.0)


def test_confirm_remaining_insufficient_stock_atomic(db):
    _seed(db, need=20.0, stocks=((LOC_A, 3.0), (LOC_B, 2.0)))
    with pytest.raises(ConfirmRemainingError) as ei:
        _run(db)
    assert ei.value.code == "INSUFFICIENT_LOCATION_STOCK"
    db.rollback()
    assert db.query(Pick).count() == 0


def test_confirm_remaining_exact_location_zero_effective(db):
    _seed(db, need=8.0, stocks=((LOC_A, 8.0), (LOC_B, 5.0)))
    out = _run(db)
    db.commit()
    assert out["locations"] == [{"location_id": LOC_A, "quantity": 8.0}]
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=10, location_id=LOC_A, for_update=False
    ) == pytest.approx(0.0)
    assert on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=10, location_id=LOC_A
    ) == 8.0


def test_confirm_remaining_no_negative_effective_on_conflict(db):
    _seed(db, need=10.0, stocks=((LOC_A, 10.0),))
    # Concurrent reservation: draft pick already consumes all stock
    p = Pick(
        tenant_id=1,
        warehouse_id=1,
        order_id=1,
        order_item_id=1,
        product_id=10,
        location_id=LOC_A,
        cart_id=99,
        quantity=10.0,
        picked_at=None,
        status="picking",
    )
    db.add(p)
    db.commit()
    with pytest.raises(ConfirmRemainingError) as ei:
        _run(db)
    assert ei.value.code == "INSUFFICIENT_LOCATION_STOCK"
    db.rollback()
    # Our cart still has no picks; on-hand unchanged; effective stays 0 (other cart's draft)
    assert db.query(Pick).filter(Pick.cart_id == 1).count() == 0
    assert on_hand_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=10, location_id=LOC_A
    ) == 10.0
    assert effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=10, location_id=LOC_A, for_update=False
    ) == pytest.approx(0.0)


def test_confirm_remaining_already_complete_idempotent(db):
    _seed(db, need=5.0, stocks=((LOC_A, 10.0),), pre_picks=[(LOC_A, 5.0)])
    out = _run(db)
    assert out["already_complete"] is True
    assert out["quantity_put"] == 0.0
    assert db.query(Pick).filter(Pick.cart_id == 1).count() == 1
