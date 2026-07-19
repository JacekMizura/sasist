"""
Packing handoff hardening — CASE 13–19.

  python -m pytest backend/tests/test_packing_handoff_hardening.py -q
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.carton import Carton, carton_shipping_method_links
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.order_ui_status import OrderUiStatus
from backend.models.order_consolidation_plan import OrderConsolidationPlan
from backend.models.order_item import OrderItem
from backend.models.pick import Pick
from backend.models.picking_config import PickingConfig
from backend.models.product import Product
from backend.models.wm_price_tier import WmPriceTier
from backend.models.consolidation_rack import RackSegment
from backend.models.fulfillment_event import FulfillmentEvent
from backend.models.shipping_method import ShippingMethod
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_picking_lifecycle_service import (
    claim_cart,
    finish_packing,
    finish_picking,
    get_cart_status,
    start_packing,
    start_picking,
)
from backend.services.order_consolidation.constants import PLAN_STATUS_COMPLETED
from backend.services.order_fulfillment_state import READY_TO_PACK
from backend.services.picking_handoff_service import (
    HANDOFF_CART,
    HANDOFF_CARTLESS,
    ensure_handoff_from_live_cart_custody,
    normalize_handoff_mode,
    reconcile_picking_handoff_modes,
)
from backend.services.wms_cartless_picking import finalize_cartless_picking_session, start_cartless_picking
from backend.services.wms_packing_service import apply_order_selected_carton, packing_mode_distribution


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
        Pick,
        WmsOperationSession,
        CartLifecycleHistory,
        CartLifecycleEvent,
        PickingConfig,
        ShippingMethod,
        Carton,
        WmPriceTier,
        OrderConsolidationPlan,
        RackSegment,
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
            id=7,
            tenant_id=1,
            warehouse_id=1,
            main_group="TO_PACK",
            name="Do pakowania",
            color="#000",
            sort_order=1,
        )
    )
    session.add(
        OrderUiStatus(
            id=6,
            tenant_id=1,
            warehouse_id=1,
            main_group="NEW",
            name="Nowe",
            color="#000",
            sort_order=0,
        )
    )
    session.add(
        PickingConfig(
            tenant_id=1,
            warehouse_id=1,
            source_status_id=6,
            target_status_id=7,
            strategy="by_products",
            single_mode="bulk",
            multi_mode="bulk",
            max_single_orders=50,
            max_multi_orders=50,
        )
    )
    session.add(
        Carton(
            id="carton-a",
            tenant_id=1,
            warehouse_id=1,
            name="A",
            length_cm=30,
            width_cm=20,
            height_cm=15,
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
        "backend.services.wms_cartless_picking.start_service.gate_orders_before_capacity",
        lambda db, *, orders, tenant_id, warehouse_id, operator_user_id=None: list(orders),
    )

    def _simple_query(db, *, tenant_id, warehouse_id, source_status_id, order_type):
        rows = (
            db.query(Order.id)
            .filter(
                Order.tenant_id == int(tenant_id),
                Order.warehouse_id == int(warehouse_id),
                Order.order_ui_status_id == int(source_status_id),
                Order.deleted_at.is_(None),
            )
            .all()
        )
        return [int(r[0]) for r in rows]

    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.start_service._query_order_ids_for_status",
        _simple_query,
        raising=False,
    )


def _order(db, *, number: str, status_id: int = 7, handoff=None, cart_id=None, fs=READY_TO_PACK):
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="PACKING",
        fulfillment_state=fs,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        order_ui_status_id=status_id,
        picking_handoff_mode=handoff,
        cart_id=cart_id,
        selected_carton_id=None,
    )
    db.add(o)
    db.flush()
    return o


def _cart(db, *, code: str, ctype=CartType.BULK) -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name=code,
        code=code,
        type=ctype,
        status=CartStatus.AVAILABLE.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_strategy="LIMIT_VOLUME",
    )
    db.add(c)
    db.flush()
    return c


def test_case13_carton_cross_cart_rejected(db):
    c1 = _cart(db, code="CART-1")
    c2 = _cart(db, code="CART-2")
    o100 = _order(db, number="100", handoff=HANDOFF_CART, cart_id=int(c1.id))
    o101 = _order(db, number="101", handoff=HANDOFF_CART, cart_id=int(c2.id))
    o101.selected_carton_id = None
    db.commit()

    with pytest.raises(ValueError) as ei:
        apply_order_selected_carton(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=7,
            mode="bulk",
            cart_id=int(c1.id),
            order_id=int(o101.id),
            carton_id="carton-a",
        )
    assert str(ei.value) == "ORDER_NOT_IN_QUEUE"
    db.refresh(o101)
    assert o101.selected_carton_id is None

    apply_order_selected_carton(
        db,
        tenant_id=1,
        warehouse_id=1,
        status_id=7,
        mode="bulk",
        cart_id=int(c1.id),
        order_id=int(o100.id),
        carton_id="carton-a",
    )
    db.refresh(o100)
    assert o100.selected_carton_id == "carton-a"


@pytest.fixture(autouse=True)
def _bypass_packing_eligibility(monkeypatch):
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
    from backend.schemas.wms_packing import WmsPackingRecommendedCarton

    monkeypatch.setattr(
        "backend.services.wms_packing_service.emit_wms_carton_selected_or_changed",
        lambda *a, **k: None,
        raising=False,
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service._carton_row_to_recommended",
        lambda row, *, is_best=False: WmsPackingRecommendedCarton(
            id=str(row.id),
            name=str(row.name or ""),
            dimensions="30×20×15 cm",
            image_url=None,
            is_best=is_best,
        ),
    )


def test_case14_carton_basket_other_order_rejected(db):
    c = _cart(db, code="MULTI-1", ctype=CartType.MULTI)
    c2 = _cart(db, code="MULTI-2", ctype=CartType.MULTI)
    o200 = _order(db, number="200", handoff="BASKET", cart_id=int(c.id))
    o201 = _order(db, number="201", handoff="BASKET", cart_id=int(c2.id))
    db.commit()
    with pytest.raises(ValueError) as ei:
        apply_order_selected_carton(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=7,
            mode="baskets",
            cart_id=int(c.id),
            order_id=int(o201.id),
            carton_id="carton-a",
        )
    assert str(ei.value) == "ORDER_NOT_IN_QUEUE"
    db.refresh(o201)
    assert o201.selected_carton_id is None
    apply_order_selected_carton(
        db,
        tenant_id=1,
        warehouse_id=1,
        status_id=7,
        mode="baskets",
        cart_id=int(c.id),
        order_id=int(o200.id),
        carton_id="carton-a",
    )
    db.refresh(o200)
    assert o200.selected_carton_id == "carton-a"


def test_case15_carton_cartless_scope(db):
    o_cl = _order(db, number="CL-1", handoff=HANDOFF_CARTLESS, cart_id=None)
    o_cart = _order(db, number="C-1", handoff=HANDOFF_CART, cart_id=None)
    db.commit()
    with pytest.raises(ValueError):
        apply_order_selected_carton(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=7,
            mode="no_cart",
            cart_id=None,
            order_id=int(o_cart.id),
            carton_id="carton-a",
        )
    apply_order_selected_carton(
        db,
        tenant_id=1,
        warehouse_id=1,
        status_id=7,
        mode="no_cart",
        cart_id=None,
        order_id=int(o_cl.id),
        carton_id="carton-a",
    )
    db.refresh(o_cl)
    assert o_cl.selected_carton_id == "carton-a"


def test_case16_real_cartless_finalize_handoff_and_cohort(db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.recompute_order_fulfillment",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.emit_wms_picking_finished",
        lambda *a, **k: None,
        raising=False,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.ensure_open_issue_task_for_order",
        lambda *a, **k: None,
        raising=False,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service._picked_qty_for_order_item_cartless",
        lambda db, *, order_item_id: 1.0,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.get_or_create_wms_picking_shortage_settings",
        lambda db, *, tenant_id, warehouse_id: SimpleNamespace(shortage_reported_order_ui_status_id=None),
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service._panel_status_after_picking_finalize",
        lambda **kwargs: 7,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.mark_pick_events_finalized_for_pick_ids",
        lambda *a, **k: None,
        raising=False,
    )
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number="FIN-CL",
        status="NEW",
        fulfillment_state=None,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        order_ui_status_id=6,
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(order_id=int(o.id), product_id=1, quantity=1, packing_quantity_packed=0))
    db.commit()

    sess, _ = start_cartless_picking(
        db, tenant_id=1, warehouse_id=1, source_status_id=6, order_type="all", operator_user_id=5
    )
    assert sess is not None
    out = finalize_cartless_picking_session(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="all",
        picking_session_id=int(sess.id),
        operator_user_id=5,
    )
    db.commit()
    assert out["ok"] is True
    db.refresh(o)
    assert o.cart_id is None
    assert o.picking_handoff_mode == HANDOFF_CARTLESS
    assert str(o.fulfillment_state or "").upper() in ("READY_TO_PACK", "PACKING")

    from backend.services.wms_packing_service import _packing_orders_base_query

    o.order_ui_status_id = 7
    o.fulfillment_state = READY_TO_PACK
    db.commit()
    row = (
        _packing_orders_base_query(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=7,
            mode="no_cart",
            cart_id=None,
        )
        .filter(Order.id == int(o.id))
        .first()
    )
    assert row is not None
    assert row.picking_handoff_mode == HANDOFF_CARTLESS


def test_case17_partial_multi_frees_one_basket(db):
    cart = _cart(db, code="CART-MULTI", ctype=CartType.MULTI)
    baskets = []
    for i, code in enumerate(("S-1-1", "S-1-2", "S-1-3"), start=1):
        b = CartBasket(
            warehouse_id=1,
            cart_id=int(cart.id),
            name=code,
            barcode=code,
            scan_code=code,
            row=1,
            column=i,
            inner_length=30,
            inner_width=20,
            inner_height=15,
            usable_volume=9.0,
            used_volume=1.0,
        )
        db.add(b)
        baskets.append(b)
    orders = [_order(db, number=f"M-{i}", status_id=6, fs=None, handoff=None) for i in range(1, 4)]
    for o in orders:
        o.order_ui_status_id = 6
        o.fulfillment_state = None
        o.status = "NEW"
    db.commit()

    claim_cart(db, cart=cart, operator_user_id=7)
    start_picking(db, cart=cart, orders=orders, operator_user_id=7)
    for o, b in zip(orders, baskets):
        o.basket_id = int(b.id)
        b.order_id = int(o.id)
        db.add_all([o, b])
    db.commit()

    finish_picking(db, cart=cart, orders=orders, operator_user_id=7)
    start_packing(db, cart=cart, operator_user_id=99)
    mid = orders[1]
    released = finish_packing(db, cart=cart, packed_order_id=int(mid.id))
    db.commit()
    for b in baskets:
        db.refresh(b)
    assert released is False
    assert baskets[1].order_id is None
    assert baskets[0].order_id == int(orders[0].id)
    assert baskets[2].order_id == int(orders[2].id)
    assert get_cart_status(cart) == CartStatus.PACKING


def test_case18_last_multi_releases_cart(db):
    cart = _cart(db, code="CART-MULTI-L", ctype=CartType.MULTI)
    b = CartBasket(
        warehouse_id=1,
        cart_id=int(cart.id),
        name="B1",
        barcode="L-1",
        scan_code="L-1",
        row=1,
        column=1,
        inner_length=30,
        inner_width=20,
        inner_height=15,
        usable_volume=9.0,
        used_volume=1.0,
    )
    db.add(b)
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number="LAST-1",
        status="NEW",
        fulfillment_state=None,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        order_ui_status_id=6,
    )
    db.add(o)
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o], operator_user_id=1)
    o.basket_id = int(b.id)
    b.order_id = int(o.id)
    db.commit()
    finish_picking(db, cart=cart, orders=[o], operator_user_id=1)
    start_packing(db, cart=cart, operator_user_id=2)
    released = finish_packing(db, cart=cart, packed_order_id=int(o.id))
    db.commit()
    db.refresh(cart)
    db.refresh(b)
    assert released is True
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert b.order_id is None


def test_case19_recovery_fills_handoff_from_cart_not_cartless(db):
    c = _cart(db, code="CART-R")
    o = _order(db, number="REC-1", handoff=None, cart_id=int(c.id), fs="NEEDS_DECISION")
    db.commit()
    mode = ensure_handoff_from_live_cart_custody(db, o)
    assert mode == HANDOFF_CART
    assert o.picking_handoff_mode == HANDOFF_CART


def test_case19_consolidation_ready_stays_null_not_cartless(db):
    o = _order(db, number="CONS-1", handoff=None, cart_id=None, fs=READY_TO_PACK)
    db.add(
        OrderConsolidationPlan(
            order_id=int(o.id),
            target_warehouse_id=1,
            status=PLAN_STATUS_COMPLETED,
        )
    )
    db.commit()
    # reconcile must NOT invent CARTLESS
    stats = reconcile_picking_handoff_modes(db, tenant_id=1, warehouse_id=1)
    db.refresh(o)
    assert o.picking_handoff_mode is None
    assert stats["cartless"] == 0
    assert normalize_handoff_mode(o.picking_handoff_mode) is None


def test_reconcile_skips_when_no_null_candidates():
    """Performance: zero NULL → no session history scan."""
    from backend.services import picking_handoff_service as hs

    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.options.return_value = q
    q.filter.return_value = q
    q.all.return_value = []
    with patch.object(hs, "_deterministic_cartless_order_ids_from_sessions") as sess_scan:
        stats = hs.reconcile_picking_handoff_modes(db, tenant_id=1, warehouse_id=1)
        sess_scan.assert_not_called()
    assert stats["candidates"] == 0
