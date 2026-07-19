"""
Packing finish — BASKET / MULTI cart (CASE 1–10).

  python -m pytest backend/tests/test_packing_finish_baskets.py -q
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.bundle import Bundle
from backend.models.capacity_analytics import (
    CapacityAnalyticsDetail,
    CapacityAnalyticsReasonAgg,
    CapacityAnalyticsRun,
)
from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.carton import Carton, carton_shipping_method_links
from backend.models.enums import CartStatus, CartType
from backend.models.fulfillment_event import FulfillmentEvent
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.pick import Pick
from backend.models.picking_config import PickingConfig
from backend.models.product import Product
from backend.models.shipping_method import ShippingMethod
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.models.wms_packing_settings import WmsPackingSettings
from backend.services.cart_picking_lifecycle_service import (
    claim_cart,
    finish_picking,
    get_cart_status,
    start_packing,
    start_picking,
)
from backend.services.picking_handoff_service import HANDOFF_BASKET, HANDOFF_CART, HANDOFF_CARTLESS
from backend.services.wms_packing_service import PackingScanError, packing_finish_order


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Cart,
        CartBasket,
        Order,
        OrderItem,
        OrderUiStatus,
        Product,
        Bundle,
        Pick,
        WmsOperationSession,
        CartLifecycleHistory,
        CartLifecycleEvent,
        PickingConfig,
        ShippingMethod,
        Carton,
        WmsPackingSettings,
        ActivityEvent,
        ActivityEventLink,
        CapacityAnalyticsRun,
        CapacityAnalyticsReasonAgg,
        CapacityAnalyticsDetail,
        FulfillmentEvent,
    ):
        model.__table__.create(engine, checkfirst=True)
    carton_shipping_method_links.create(engine, checkfirst=True)
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
            name="Do pakowania",
            color="#000",
            sort_order=1,
        )
    )
    session.add(
        Carton(
            id="carton-a",
            tenant_id=1,
            warehouse_id=1,
            name="A",
            length_cm=64,
            width_cm=38,
            height_cm=8,
            weight_kg=0.1,
            is_active=True,
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _bypass_gates(monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_order_validation.gate.gate_orders_before_capacity",
        lambda db, *, orders, tenant_id, warehouse_id, operator_user_id=None: list(orders),
    )
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_fulfillment_mode_clauses",
        lambda **kwargs: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_consolidation_phase_clauses",
        lambda: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_consolidation_plan_clauses",
        lambda: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_consolidation_packing_clauses",
        lambda: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service.emit_wms_packing_automation_finished",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service.emit_wms_packing_finished",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service._packing_build_scan_out_after_commit",
        lambda db, **kwargs: SimpleNamespace(
            fully_packed=True,
            packing_after_finish_action=kwargs.get("packing_after_finish_action") or "STAY",
            next_order_id=kwargs.get("next_order_id"),
            last_packed_order_item_id=None,
            post_pack_pipeline=kwargs.get("post_pack_pipeline") or [],
            detail=SimpleNamespace(order_id=kwargs.get("order_id")),
        ),
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service.find_next_fifo_packing_order_id",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service._run_wms_packing_post_pack_pipeline",
        lambda *a, **k: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service.order_item_required_pack_qty",
        lambda db, order, it: int(getattr(it, "quantity", 0) or 0),
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service._order_item_operational_missing_qty",
        lambda *a, **k: 0.0,
    )
    monkeypatch.setattr(
        "backend.services.order_fulfillment_lifecycle_service.on_order_shipped",
        lambda *a, **k: None,
    )


def _product(db, *, ean: str = "5900001") -> Product:
    p = Product(tenant_id=1, name="P", sku=ean, ean=ean)
    db.add(p)
    db.flush()
    return p


def _multi_cart(db, *, code: str = "CART-MULTI") -> Cart:
    cart = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="MULTI",
        code=code,
        type=CartType.MULTI,
        status=CartStatus.AVAILABLE.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_strategy="LIMIT_VOLUME",
    )
    db.add(cart)
    db.flush()
    return cart


def _basket(db, cart: Cart, *, name: str, scan: str, col: int) -> CartBasket:
    b = CartBasket(
        warehouse_id=1,
        cart_id=int(cart.id),
        name=name,
        barcode=scan,
        scan_code=scan,
        row=1,
        column=col,
        inner_length=30,
        inner_width=20,
        inner_height=15,
        usable_volume=9.0,
        used_volume=1.0,
    )
    db.add(b)
    db.flush()
    return b


def _packable_order(
    db,
    *,
    number: str,
    handoff: str = HANDOFF_BASKET,
    packed: int = 1,
    qty: int = 1,
    carton: str | None = "carton-a",
) -> Order:
    p = _product(db, ean=f"EAN-{number}")
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="TO_PACK",
        fulfillment_state="READY_TO_PACK",
        order_ui_status_id=8,
        picking_handoff_mode=handoff,
        selected_carton_id=carton,
    )
    db.add(o)
    db.flush()
    db.add(
        OrderItem(
            order_id=int(o.id),
            product_id=int(p.id),
            quantity=qty,
            packing_quantity_packed=packed,
        )
    )
    db.flush()
    return o


def _bind_basket_order(db, cart: Cart, basket: CartBasket, order: Order) -> None:
    order.cart_id = int(cart.id)
    order.basket_id = int(basket.id)
    basket.order_id = int(order.id)
    db.add_all([order, basket])


def _ready_multi_with_orders(db, n: int = 1, *, start_pack: bool = False):
    cart = _multi_cart(db)
    baskets = [_basket(db, cart, name=f"B{i}", scan=f"S-{i}", col=i) for i in range(1, n + 1)]
    orders = [_packable_order(db, number=f"O-{i}") for i in range(1, n + 1)]
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=7)
    start_picking(db, cart=cart, orders=orders, operator_user_id=7)
    for o, b in zip(orders, baskets):
        _bind_basket_order(db, cart, b, o)
        o.picking_handoff_mode = HANDOFF_BASKET
        db.add(o)
    db.commit()
    finish_picking(db, cart=cart, orders=orders, operator_user_id=7)
    db.commit()
    if start_pack:
        start_packing(db, cart=cart, operator_user_id=99)
        db.commit()
    for o in orders:
        db.refresh(o)
    db.refresh(cart)
    for b in baskets:
        db.refresh(b)
    return cart, baskets, orders


_PACKABLE_STATE = SimpleNamespace(
    totals=SimpleNamespace(oms_decision_lines=0, recovery_lines=0),
    packing_allowed=True,
    has_recovery_work=False,
    has_relocation_work=False,
)


def _patch_packable():
    return patch.multiple(
        "backend.services.recovery_workflow_service",
        resolve_order_recovery_state=lambda *a, **k: _PACKABLE_STATE,
        can_order_be_packed=lambda *a, **k: True,
        log_recovery_state_snapshot=lambda *a, **k: None,
    )


def test_case1_basket_finish_without_cart_scan(db):
    """CASE 1+3: BASKET handoff, basket-first, cart READY_FOR_PACKING → finish 200."""
    cart, baskets, orders = _ready_multi_with_orders(db, 1, start_pack=False)
    o = orders[0]
    assert get_cart_status(cart) == CartStatus.READY_FOR_PACKING
    assert o.basket_id == baskets[0].id

    with _patch_packable():
        out = packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            mode="baskets",
            cart_id=None,
            order_id=int(o.id),
            operator_user_id=99,
        )

    assert out.fully_packed is True
    db.refresh(o)
    db.refresh(baskets[0])
    db.refresh(cart)
    assert o.wms_packing_automation_finished_at is not None
    assert baskets[0].order_id is None
    assert get_cart_status(cart) == CartStatus.AVAILABLE


def test_case1b_basket_finish_while_packing(db):
    """BASKET + PACKING (po startPacking) → finish PASS."""
    cart, baskets, orders = _ready_multi_with_orders(db, 1, start_pack=True)
    assert get_cart_status(cart) == CartStatus.PACKING
    with _patch_packable():
        out = packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            mode="baskets",
            cart_id=None,
            order_id=int(orders[0].id),
        )
    assert out.fully_packed is True
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    db.refresh(baskets[0])
    assert baskets[0].order_id is None


def test_case3_available_with_active_custody_fails_before_pipeline(db, monkeypatch):
    """
    BASKET + AVAILABLE + nadal order.cart_id/basket → lifecycle breach.
    Nie maskować: FAIL przed pipeline.
    """
    cart, baskets, orders = _ready_multi_with_orders(db, 1, start_pack=False)
    o = orders[0]
    # Symuluj za wczesny release statusu bez clear custody.
    cart.status = CartStatus.AVAILABLE.value
    cart.assigned_user_id = None
    cart.packing_user_id = None
    db.add(cart)
    db.commit()
    db.refresh(o)
    assert o.cart_id == cart.id
    assert baskets[0].order_id == o.id
    assert get_cart_status(cart) == CartStatus.AVAILABLE

    pipeline_calls: list[int] = []

    def _pipeline_spy(*a, **k):
        pipeline_calls.append(1)
        return []

    monkeypatch.setattr(
        "backend.services.wms_packing_service._run_wms_packing_post_pack_pipeline",
        _pipeline_spy,
    )

    with _patch_packable():
        with pytest.raises(PackingScanError) as ei:
            packing_finish_order(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=8,
                mode="baskets",
                cart_id=None,
                order_id=int(o.id),
            )
    assert ei.value.code == "CART_LIFECYCLE_INCONSISTENT"
    assert pipeline_calls == []
    db.refresh(o)
    db.refresh(baskets[0])
    assert o.wms_packing_automation_finished_at is None
    assert baskets[0].order_id == int(o.id)
    assert o.cart_id == cart.id


def test_case8_local_4xx_before_pipeline(db, monkeypatch):
    """CARTON_REQUIRED i underpack wykrywane przed pipeline."""
    cart, baskets, orders = _ready_multi_with_orders(db, 1, start_pack=False)
    o = orders[0]
    o.selected_carton_id = None
    db.add(o)
    db.commit()

    pipeline_calls: list[int] = []
    monkeypatch.setattr(
        "backend.services.wms_packing_service._run_wms_packing_post_pack_pipeline",
        lambda *a, **k: pipeline_calls.append(1) or [],
    )

    with _patch_packable():
        with pytest.raises(PackingScanError) as ei:
            packing_finish_order(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=8,
                mode="baskets",
                cart_id=None,
                order_id=int(o.id),
            )
    assert ei.value.code == "CARTON_REQUIRED"
    assert pipeline_calls == []
    db.refresh(baskets[0])
    assert baskets[0].order_id == int(o.id)

def test_case2_partial_then_last_multi_release(db):
    """CASE 2: first finish frees only its basket; second releases cart."""
    cart, baskets, orders = _ready_multi_with_orders(db, 2, start_pack=False)
    o1, o2 = orders
    b1, b2 = baskets

    with _patch_packable():
        packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            mode="baskets",
            cart_id=None,
            order_id=int(o1.id),
            operator_user_id=99,
        )
    db.refresh(b1)
    db.refresh(b2)
    db.refresh(cart)
    db.refresh(o2)
    assert b1.order_id is None
    assert b2.order_id == int(o2.id)
    assert o2.cart_id == cart.id
    assert get_cart_status(cart) in (CartStatus.PACKING, CartStatus.READY_FOR_PACKING)

    with _patch_packable():
        packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            mode="baskets",
            cart_id=None,
            order_id=int(o2.id),
            operator_user_id=99,
        )
    db.refresh(b2)
    db.refresh(cart)
    assert b2.order_id is None
    assert get_cart_status(cart) == CartStatus.AVAILABLE


def test_case4_wrong_scope_before_mutation(db):
    """CASE 4: CART handoff order + mode=baskets → 4xx before mutation."""
    cart, baskets, orders = _ready_multi_with_orders(db, 1, start_pack=False)
    o = orders[0]
    o.picking_handoff_mode = HANDOFF_CART
    db.add(o)
    db.commit()

    with _patch_packable():
        with pytest.raises(PackingScanError) as ei:
            packing_finish_order(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=8,
                mode="baskets",
                cart_id=None,
                order_id=int(o.id),
            )
    assert ei.value.code == "ORDER_NOT_IN_QUEUE"
    db.refresh(baskets[0])
    assert baskets[0].order_id == int(o.id)
    assert o.wms_packing_automation_finished_at is None


def test_case5_underpacked_rejects_no_release(db):
    """CASE 5: packed 0/1 → reject, no basket release."""
    cart, baskets, orders = _ready_multi_with_orders(db, 1, start_pack=False)
    o = orders[0]
    item = db.query(OrderItem).filter(OrderItem.order_id == int(o.id)).one()
    item.packing_quantity_packed = 0
    db.add(item)
    db.commit()

    with patch(
        "backend.services.recovery_workflow_service.resolve_order_recovery_state",
        return_value=_PACKABLE_STATE,
    ), patch(
        "backend.services.recovery_workflow_service.can_order_be_packed",
        return_value=False,
    ), patch(
        "backend.services.recovery_workflow_service.log_recovery_state_snapshot",
        lambda *a, **k: None,
    ):
        with pytest.raises(PackingScanError) as ei:
            packing_finish_order(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=8,
                mode="baskets",
                cart_id=None,
                order_id=int(o.id),
            )
    assert ei.value.code in ("ORDER_NOT_FULLY_PACKED", "UNRESOLVED_SHORTAGES")
    db.refresh(baskets[0])
    assert baskets[0].order_id == int(o.id)
    assert get_cart_status(cart) == CartStatus.READY_FOR_PACKING


def test_case6_carton_required(db):
    """CASE 6 negative: gabaryt UI without selected_carton_id → CARTON_REQUIRED."""
    cart, baskets, orders = _ready_multi_with_orders(db, 1, start_pack=False)
    o = orders[0]
    o.selected_carton_id = None
    db.add(o)
    db.commit()

    with _patch_packable():
        with pytest.raises(PackingScanError) as ei:
            packing_finish_order(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=8,
                mode="baskets",
                cart_id=None,
                order_id=int(o.id),
            )
    assert ei.value.code == "CARTON_REQUIRED"
    db.refresh(baskets[0])
    assert baskets[0].order_id == int(o.id)


def test_case6_with_carton_ok(db):
    """CASE 6 positive: selected_carton_id set → finish works."""
    cart, _baskets, orders = _ready_multi_with_orders(db, 1, start_pack=True)
    with _patch_packable():
        out = packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            mode="baskets",
            cart_id=int(cart.id),
            order_id=int(orders[0].id),
        )
    assert out.fully_packed is True


def test_case7_retry_idempotent(db):
    """CASE 7: second finish after success is safe (no double release crash)."""
    cart, baskets, orders = _ready_multi_with_orders(db, 1, start_pack=False)
    o = orders[0]
    with _patch_packable():
        packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            mode="baskets",
            cart_id=None,
            order_id=int(o.id),
        )
        out2 = packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            mode="baskets",
            cart_id=None,
            order_id=int(o.id),
        )
    assert out2.fully_packed is True
    db.refresh(baskets[0])
    assert baskets[0].order_id is None
    assert get_cart_status(cart) == CartStatus.AVAILABLE


def test_case8_cart_handoff_still_finishes(db):
    """CASE 8 regression: CART (bulk) finish with startPacking."""
    cart = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="BULK",
        code="CART-BULK",
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_strategy="LIMIT_VOLUME",
    )
    db.add(cart)
    db.flush()
    o = _packable_order(db, number="CART-1", handoff=HANDOFF_CART)
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=7)
    start_picking(db, cart=cart, orders=[o], operator_user_id=7)
    o.picking_handoff_mode = HANDOFF_CART
    db.add(o)
    db.commit()
    finish_picking(db, cart=cart, orders=[o], operator_user_id=7)
    start_packing(db, cart=cart, operator_user_id=99)
    db.commit()

    with _patch_packable():
        out = packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            mode="bulk",
            cart_id=int(cart.id),
            order_id=int(o.id),
        )
    assert out.fully_packed is True
    assert get_cart_status(cart) == CartStatus.AVAILABLE


def test_case8_cartless_finish(db):
    """CASE 8: CARTLESS finish without cart."""
    o = _packable_order(db, number="CL-1", handoff=HANDOFF_CARTLESS)
    o.cart_id = None
    o.basket_id = None
    db.add(o)
    db.commit()
    with _patch_packable():
        out = packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            mode="no_cart",
            cart_id=None,
            order_id=int(o.id),
        )
    assert out.fully_packed is True
    db.refresh(o)
    assert o.wms_packing_automation_finished_at is not None


def test_case9_config_change_after_pick_ignored(db):
    """CASE 9: picking config change does not affect finish routing (handoff SSOT)."""
    cart, _baskets, orders = _ready_multi_with_orders(db, 1, start_pack=False)
    o = orders[0]
    assert o.picking_handoff_mode == HANDOFF_BASKET
    # Simulate config flip to bulk — finish still uses order handoff via mode=baskets scope.
    db.add(
        PickingConfig(
            tenant_id=1,
            warehouse_id=1,
            source_status_id=6,
            target_status_id=8,
            strategy="by_products",
            single_mode="bulk",
            multi_mode="bulk",
            max_single_orders=50,
            max_multi_orders=50,
        )
    )
    db.commit()
    with _patch_packable():
        out = packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            mode="baskets",
            cart_id=None,
            order_id=int(o.id),
        )
    assert out.fully_packed is True


def test_case10_null_handoff_controlled_reject(db):
    """CASE 10: legacy NULL handoff → ORDER_NOT_IN_QUEUE, no silent BASKET assign."""
    o = _packable_order(db, number="LEG-1", handoff=None)
    o.picking_handoff_mode = None
    db.add(o)
    db.commit()
    with _patch_packable():
        with pytest.raises(PackingScanError) as ei:
            packing_finish_order(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=8,
                mode="baskets",
                cart_id=None,
                order_id=int(o.id),
            )
    assert ei.value.code == "ORDER_NOT_IN_QUEUE"
    db.refresh(o)
    assert o.picking_handoff_mode is None
    assert o.wms_packing_automation_finished_at is None
