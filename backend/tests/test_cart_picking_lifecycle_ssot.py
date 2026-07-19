"""
SSOT CartLifecycleService — nowy model:
AVAILABLE → claim → ASSIGNED → startPicking(skan) → PICKING → finish → READY_FOR_PACKING
→ startPacking → PACKING → finishPacking → AVAILABLE

  python -m pytest backend/tests/test_cart_picking_lifecycle_ssot.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_capacity import CartCapacityExceeded
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.services.cart_picking_lifecycle_service import (
    InvalidCartStateError,
    InvalidCartTransitionError,
    SessionNotFoundError,
    admin_release_cart,
    assert_cart_ready_for_quick_pick,
    cancel_picking,
    claim_cart,
    finish_packing,
    finish_picking,
    get_cart_current_task,
    get_cart_status,
    list_cart_lifecycle_history,
    release_cart,
    start_packing,
    start_picking,
)
from backend.services.order_fulfillment_state import PACKING, PICKING
from backend.services.wms_audit_service import (
    WmsOperationSessionNotFound,
    touch_wms_operation_session,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, Cart, CartBasket, Order, WmsOperationSession, CartLifecycleHistory, CartLifecycleEvent):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _bypass_wms_validation_gate_for_lifecycle_unit_tests(monkeypatch):
    """CartLifecycle SSOT tests nie budują Inventory — walidacja jest osobnym pakietem testów."""

    def _pass_through(db, *, orders, tenant_id, warehouse_id, operator_user_id=None):
        return list(orders)

    monkeypatch.setattr(
        "backend.services.wms_order_validation.gate.gate_orders_before_capacity",
        _pass_through,
    )


def _cart(db, *, capacity_orders=None, capacity_strategy="LIMIT_VOLUME", code: str = "CART-001") -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="WOZ-001",
        code=code,
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_strategy=capacity_strategy,
        capacity_orders=capacity_orders,
    )
    db.add(c)
    db.flush()
    return c


def _order(db, *, number: str, status: str = "NEW") -> Order:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status=status,
        fulfillment_state=None,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
    )
    db.add(o)
    db.flush()
    return o


def test_claim_has_no_orders_or_session(db):
    cart = _cart(db)
    o1 = _order(db, number="A-1")
    db.commit()

    claim_cart(db, cart=cart, operator_user_id=7)
    db.commit()

    assert get_cart_status(cart) == CartStatus.ASSIGNED
    assert cart.assigned_user_id == 7
    assert cart.current_session_id is None
    task = get_cart_current_task(db, cart, enrich=False)
    assert task is not None
    assert task["task_type"] == "CLAIMED"
    assert task["operator_id"] == 7
    hist = list_cart_lifecycle_history(db, cart_id=int(cart.id))
    assert any(h["from_status"] == "AVAILABLE" and h["to_status"] == "ASSIGNED" for h in hist)
    db.refresh(o1)
    assert o1.cart_id is None


def test_full_lifecycle_scan_assigns_orders(db):
    cart = _cart(db)
    o1 = _order(db, number="A-1")
    o2 = _order(db, number="A-2")
    db.commit()

    claim_cart(db, cart=cart, operator_user_id=7)
    db.commit()
    assert o1.cart_id is None

    sess = start_picking(
        db,
        cart=cart,
        orders=[o1, o2],
        operator_user_id=7,
        source_status_id=10,
    )
    db.commit()

    assert sess.id is not None
    assert cart.current_session_id == sess.id
    assert cart.assigned_user_id == 7
    assert get_cart_status(cart) == CartStatus.PICKING
    task = get_cart_current_task(db, cart, enrich=False)
    assert task is not None
    assert task["task_type"] == "PICKING"
    assert task["task_id"] == sess.id
    assert task["total_orders"] == 2
    for o in (o1, o2):
        db.refresh(o)
        assert o.cart_id == cart.id
        assert (o.fulfillment_state or "").upper() == PICKING

    finish_picking(db, cart=cart, orders=[o1, o2], operator_user_id=7)
    db.commit()
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.READY_FOR_PACKING
    assert cart.assigned_user_id == 7
    assert cart.current_session_id is None
    assert o1.cart_id == cart.id
    task_r = get_cart_current_task(db, cart, enrich=False)
    assert task_r is not None
    assert task_r["task_type"] == "READY_FOR_PACKING"
    assert float(task_r["progress"]) == 100.0

    start_packing(db, cart=cart, operator_user_id=99)
    db.commit()
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.PACKING
    assert cart.assigned_user_id is None
    assert getattr(cart, "packing_user_id", None) == 99
    task_p = get_cart_current_task(db, cart, enrich=False)
    assert task_p is not None
    assert task_p["task_type"] == "PACKING"
    assert task_p["operator_id"] == 99

    hist = list_cart_lifecycle_history(db, cart_id=int(cart.id), limit=20)
    transitions = [(h["from_status"], h["to_status"]) for h in hist]
    assert ("AVAILABLE", "ASSIGNED") in transitions
    assert ("ASSIGNED", "PICKING") in transitions
    assert ("PICKING", "READY_FOR_PACKING") in transitions
    assert ("READY_FOR_PACKING", "PACKING") in transitions

    released = finish_packing(db, cart=cart, packed_order_id=int(o1.id))
    db.commit()
    assert released is False
    assert o2.cart_id == cart.id

    released2 = finish_packing(db, cart=cart, packed_order_id=int(o2.id))
    db.commit()
    assert released2 is True
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert cart.assigned_user_id is None
    assert cart.current_session_id is None
    assert getattr(cart, "packing_user_id", None) is None


def test_capacity_truncate_on_start_picking(db):
    cart = _cart(db, capacity_orders=2, capacity_strategy="LIMIT_ORDERS")
    orders = [_order(db, number=f"C-{i}") for i in range(5)]
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    sess = start_picking(db, cart=cart, orders=orders, operator_user_id=1, on_capacity="truncate")
    db.commit()
    on_cart = db.query(Order).filter(Order.cart_id == cart.id).count()
    assert on_cart == 2
    assert get_cart_status(cart) == CartStatus.PICKING
    assert sess is not None


def test_capacity_error_on_start_picking(db):
    cart = _cart(db, capacity_strategy="LIMIT_VOLUME")
    cart.capacity_volume = 1.0
    cart.total_volume = 1.0
    o1 = _order(db, number="E-1")
    o1.total_volume_dm3 = 5.0
    db.add(o1)
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    with pytest.raises(CartCapacityExceeded):
        start_picking(db, cart=cart, orders=[o1], operator_user_id=1, on_capacity="error")


def test_cancel_only_assigned_or_picking(db):
    cart = _cart(db)
    o1 = _order(db, number="B-1")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=3)
    start_picking(db, cart=cart, orders=[o1], operator_user_id=3)
    db.commit()

    out = cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1, operator_user_id=3)
    db.commit()
    db.refresh(o1)
    assert out["cart_status"] == CartStatus.AVAILABLE.value
    assert o1.cart_id is None

    # READY_FOR_PACKING cannot cancel
    cart2 = _cart(db, code="CART-002")
    o2 = _order(db, number="B-2")
    db.commit()
    claim_cart(db, cart=cart2, operator_user_id=3)
    start_picking(db, cart=cart2, orders=[o2], operator_user_id=3)
    finish_picking(db, cart=cart2, orders=[o2])
    db.commit()
    with pytest.raises(InvalidCartTransitionError):
        cancel_picking(db, cart_id=int(cart2.id), tenant_id=1, warehouse_id=1)


def test_touch_never_creates_session(db):
    with pytest.raises(WmsOperationSessionNotFound):
        touch_wms_operation_session(
            db,
            tenant_id=1,
            warehouse_id=1,
            session_kind="picking_active",
            operator_user_id=7,
            cart_id=1,
        )


def test_quick_pick_requires_picking(db):
    cart = _cart(db)
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    db.commit()
    with pytest.raises(InvalidCartStateError):
        assert_cart_ready_for_quick_pick(db, cart)

    o1 = _order(db, number="Q-1")
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()
    sess = assert_cart_ready_for_quick_pick(db, cart)
    assert sess is not None


def test_ensure_picking_session_forbidden(db):
    from backend.services.cart_picking_lifecycle_service import (
        CartLifecycleError,
        ensure_picking_session_for_cart,
    )

    cart = _cart(db)
    o1 = _order(db, number="X-1")
    db.commit()
    with pytest.raises(CartLifecycleError) as ei:
        ensure_picking_session_for_cart(db, cart=cart, orders=[o1], operator_user_id=1)
    assert ei.value.code == "legacy_ensure_forbidden"


def test_start_picking_from_available_atomic(db):
    """Scenariusz B: AVAILABLE → skan → claim+start atomowo."""
    cart = _cart(db)
    o1 = _order(db, number="S-1")
    db.commit()
    sess = start_picking(db, cart=cart, orders=[o1], operator_user_id=5)
    db.commit()
    assert get_cart_status(cart) == CartStatus.PICKING
    assert cart.assigned_user_id == 5
    assert cart.current_session_id == sess.id
    assert getattr(cart, "claimed_at", None) is None
    db.refresh(o1)
    assert o1.cart_id == cart.id


def test_cart_already_claimed(db):
    from backend.services.cart_picking_lifecycle_service import CartAlreadyClaimedError

    cart = _cart(db)
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    db.commit()
    with pytest.raises(CartAlreadyClaimedError) as ei:
        claim_cart(db, cart=cart, operator_user_id=2)
    assert ei.value.code == "CartAlreadyClaimed"


def test_assigned_timeout_releases(db):
    from datetime import datetime, timedelta

    from backend.services.cart_picking_lifecycle_service import release_stale_assigned_carts

    cart = _cart(db)
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    cart.claimed_at = datetime.utcnow() - timedelta(minutes=45)
    db.commit()
    n = release_stale_assigned_carts(db, timeout_minutes=30)
    db.commit()
    assert n == 1
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert cart.assigned_user_id is None


def test_auto_release_no_picks_vs_blocked(db):
    from datetime import datetime, timedelta

    from backend.models.pick import Pick
    from backend.services.cart_picking_lifecycle_service import (
        auto_release_picking_without_confirmed_picks,
    )

    Pick.__table__.create(db.bind, checkfirst=True)

    cart = _cart(db)
    o1 = _order(db, number="AR-1")
    db.commit()
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    sess = db.query(WmsOperationSession).filter(WmsOperationSession.id == cart.current_session_id).one()
    sess.last_activity_at = datetime.utcnow() - timedelta(minutes=30)
    cart.started_at = sess.last_activity_at
    db.commit()

    n = auto_release_picking_without_confirmed_picks(db, idle_minutes=15)
    db.commit()
    assert n == 1
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.AVAILABLE

    # Drugi przebieg: po pierwszym picku — brak auto-release
    cart2 = _cart(db, code="CART-AR2")
    o2 = _order(db, number="AR-2")
    db.commit()
    start_picking(db, cart=cart2, orders=[o2], operator_user_id=1)
    db.add(
        Pick(
            tenant_id=1,
            warehouse_id=1,
            order_id=int(o2.id),
            cart_id=int(cart2.id),
            product_id=1,
            location_id=1,
            quantity=1.0,
        )
    )
    sess2 = db.query(WmsOperationSession).filter(WmsOperationSession.id == cart2.current_session_id).one()
    sess2.last_activity_at = datetime.utcnow() - timedelta(minutes=30)
    cart2.started_at = sess2.last_activity_at
    db.commit()
    n2 = auto_release_picking_without_confirmed_picks(db, idle_minutes=15)
    db.commit()
    assert n2 == 0
    db.refresh(cart2)
    assert get_cart_status(cart2) == CartStatus.PICKING


def test_current_task_has_picked_remaining_fields(db):
    cart = _cart(db)
    o1 = _order(db, number="CT-1")
    db.commit()
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()
    task = get_cart_current_task(db, cart, enrich=False)
    assert task is not None
    assert "picked_count" in task
    assert "remaining_count" in task
    assert task["picked_count"] == 0


def test_atomic_available_start_single_history_entry(db):
    """AVAILABLE→PICKING: jedna historia, bez pośredniego ASSIGNED."""
    cart = _cart(db)
    o1 = _order(db, number="H-1")
    db.commit()
    start_picking(db, cart=cart, orders=[o1], operator_user_id=3)
    db.commit()
    hist = list_cart_lifecycle_history(db, cart_id=int(cart.id), limit=20)
    transitions = [(h["from_status"], h["to_status"]) for h in hist]
    assert transitions.count(("AVAILABLE", "PICKING")) == 1
    assert ("AVAILABLE", "ASSIGNED") not in transitions
    assert ("ASSIGNED", "PICKING") not in transitions


def test_start_picking_idempotent_no_second_session(db):
    cart = _cart(db)
    o1 = _order(db, number="ID-1")
    db.commit()
    s1 = start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()
    s2 = start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()
    assert s1.id == s2.id
    open_n = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.cart_id == cart.id,
            WmsOperationSession.completed_at.is_(None),
        )
        .count()
    )
    assert open_n == 1
    hist = list_cart_lifecycle_history(db, cart_id=int(cart.id), limit=50)
    assert sum(1 for h in hist if h["to_status"] == "PICKING" and h["from_status"] == "AVAILABLE") == 1


def test_cancel_finish_release_idempotent(db):
    from backend.services.cart_picking_lifecycle_service import assert_cart_lifecycle_invariants

    cart = _cart(db)
    o1 = _order(db, number="IDM-1")
    db.commit()
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()
    cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1)
    db.commit()
    out2 = cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1)
    assert out2.get("idempotent") is True
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    release_cart(db, cart=cart, reason="again")
    db.commit()
    assert assert_cart_lifecycle_invariants(db, cart, strict=True) == []

    cart2 = _cart(db, code="CART-IDM2")
    o2 = _order(db, number="IDM-2")
    db.commit()
    start_picking(db, cart=cart2, orders=[o2], operator_user_id=1)
    finish_picking(db, cart=cart2, orders=[o2], operator_user_id=1)
    db.commit()
    finish_picking(db, cart=cart2, orders=[o2], operator_user_id=1)  # idempotent
    db.commit()
    assert get_cart_status(cart2) == CartStatus.READY_FOR_PACKING
    hist = list_cart_lifecycle_history(db, cart_id=int(cart2.id), limit=20)
    assert sum(1 for h in hist if h["from_status"] == "PICKING" and h["to_status"] == "READY_FOR_PACKING") == 1


def test_event_log_full_cycle_polish(db):
    from backend.services.cart_picking_lifecycle_service import (
        list_cart_lifecycle_events,
        notify_first_product_confirmed,
    )
    from backend.models.pick import Pick

    Pick.__table__.create(db.bind, checkfirst=True)

    cart = _cart(db)
    o1 = _order(db, number="EV-1")
    o2 = _order(db, number="EV-2")
    db.commit()

    claim_cart(db, cart=cart, operator_user_id=7)
    db.commit()
    start_picking(db, cart=cart, orders=[o1, o2], operator_user_id=7)
    db.commit()
    db.add(
        Pick(
            tenant_id=1,
            warehouse_id=1,
            order_id=int(o1.id),
            cart_id=int(cart.id),
            product_id=1,
            location_id=1,
            quantity=1.0,
        )
    )
    db.flush()
    assert notify_first_product_confirmed(db, cart=cart, operator_user_id=7, order_id=int(o1.id)) is True
    assert notify_first_product_confirmed(db, cart=cart, operator_user_id=7) is False
    db.commit()

    finish_picking(db, cart=cart, orders=[o1, o2], operator_user_id=7)
    start_packing(db, cart=cart, operator_user_id=99)
    finish_packing(db, cart=cart, packed_order_id=int(o1.id))
    finish_packing(db, cart=cart, packed_order_id=int(o2.id))
    db.commit()

    events = list_cart_lifecycle_events(db, cart_id=int(cart.id), limit=50)
    codes = [e["event_code"] for e in events]
    descs = [e["description"] for e in events]
    assert "cart_claimed" in codes
    assert "picking_started" in codes
    assert "first_product_confirmed" in codes
    assert "picking_finished" in codes
    assert "packing_started" in codes
    assert "packing_finished" in codes
    assert "cart_released" in codes
    assert "Zarezerwowano wózek." in descs
    assert "Rozpoczęto kompletację." in descs
    by_code = {e["event_code"]: e for e in events}
    assert by_code["picking_started"]["severity"] == "INFO"
    assert by_code["first_product_confirmed"]["severity"] == "SUCCESS"
    assert by_code["cart_released"]["severity"] == "AUDIT"
    assert by_code["picking_finished"]["description"] == "Zakończono kompletację."
    assert "orders_assigned" in codes
    # Logika nie opiera się na opisie — filtrujemy po event_code
    assert all(isinstance(c, str) and "_" in c or c.isascii() for c in codes)


def test_admin_release_assigned(db):
    from backend.services.cart_picking_lifecycle_service import list_cart_lifecycle_events

    cart = _cart(db, code="CART-ADM1")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=5)
    db.commit()
    assert get_cart_status(cart) == CartStatus.ASSIGNED

    out = admin_release_cart(
        db,
        cart_id=int(cart.id),
        tenant_id=1,
        warehouse_id=1,
        admin_user_id=99,
        acknowledge=True,
    )
    db.commit()
    db.refresh(cart)
    assert out["cart_status"] == CartStatus.AVAILABLE.value
    assert out["picking_cancelled"] is False
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert cart.assigned_user_id is None
    assert cart.current_session_id is None
    codes = [e["event_code"] for e in list_cart_lifecycle_events(db, cart_id=int(cart.id), limit=20)]
    assert "admin_cart_released" in codes
    descs = [e["description"] for e in list_cart_lifecycle_events(db, cart_id=int(cart.id), limit=20)]
    assert "Zwolniono wózek." in descs


def test_admin_release_blocks_ready_and_packing(db):
    cart = _cart(db, code="CART-ADM2")
    o1 = _order(db, number="ADM-R1")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    finish_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()
    assert get_cart_status(cart) == CartStatus.READY_FOR_PACKING

    with pytest.raises(InvalidCartTransitionError) as ei:
        admin_release_cart(
            db,
            cart_id=int(cart.id),
            tenant_id=1,
            warehouse_id=1,
            admin_user_id=99,
            acknowledge=True,
        )
    assert "pakowanie" in str(ei.value.message).lower()

    start_packing(db, cart=cart, operator_user_id=2)
    db.commit()
    with pytest.raises(InvalidCartTransitionError):
        admin_release_cart(
            db,
            cart_id=int(cart.id),
            tenant_id=1,
            warehouse_id=1,
            admin_user_id=99,
            acknowledge=True,
        )


def test_admin_release_picking_with_confirmed_cancels(db):
    from backend.models.pick import Pick
    from backend.services.cart_picking_lifecycle_service import list_cart_lifecycle_events

    Pick.__table__.create(db.bind, checkfirst=True)
    cart = _cart(db, code="CART-ADM3")
    o1 = _order(db, number="ADM-P1")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()
    db.add(
        Pick(
            tenant_id=1,
            warehouse_id=1,
            order_id=int(o1.id),
            cart_id=int(cart.id),
            product_id=1,
            location_id=1,
            quantity=1.0,
        )
    )
    db.flush()
    db.commit()

    out = admin_release_cart(
        db,
        cart_id=int(cart.id),
        tenant_id=1,
        warehouse_id=1,
        admin_user_id=42,
        acknowledge=True,
    )
    db.commit()
    db.refresh(o1)
    db.refresh(cart)
    assert out["picking_cancelled"] is True
    assert out["orders_detached"] >= 1
    assert o1.cart_id is None
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    codes = [e["event_code"] for e in list_cart_lifecycle_events(db, cart_id=int(cart.id), limit=30)]
    assert "admin_cart_released" in codes
    assert "admin_picking_cancelled" in codes
    assert "admin_orders_detached" in codes


def test_admin_release_requires_acknowledge(db):
    cart = _cart(db, code="CART-ADM4")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    db.commit()
    with pytest.raises(Exception) as ei:
        admin_release_cart(
            db,
            cart_id=int(cart.id),
            tenant_id=1,
            warehouse_id=1,
            admin_user_id=1,
            acknowledge=False,
        )
    assert "konsekwencje" in str(ei.value).lower()


def test_finish_packing_partial_multi_frees_basket_slot(db):
    """Po spakowaniu jednego zamówienia MULTI: zwolnij CartBasket; cart nie AVAILABLE."""
    cart = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="MULTI-1",
        code="CART-MULTI-1",
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
    b1 = CartBasket(
        warehouse_id=1,
        cart_id=int(cart.id),
        name="B1",
        barcode="S-1-1",
        scan_code="S-1-1",
        row=1,
        column=1,
        inner_length=30,
        inner_width=20,
        inner_height=15,
        usable_volume=9.0,
        used_volume=1.0,
    )
    b2 = CartBasket(
        warehouse_id=1,
        cart_id=int(cart.id),
        name="B2",
        barcode="S-1-2",
        scan_code="S-1-2",
        row=1,
        column=2,
        inner_length=30,
        inner_width=20,
        inner_height=15,
        usable_volume=9.0,
        used_volume=1.0,
    )
    db.add_all([b1, b2])
    o1 = _order(db, number="M-1")
    o2 = _order(db, number="M-2")
    db.commit()

    claim_cart(db, cart=cart, operator_user_id=7)
    start_picking(db, cart=cart, orders=[o1, o2], operator_user_id=7)
    o1.basket_id = int(b1.id)
    o2.basket_id = int(b2.id)
    b1.order_id = int(o1.id)
    b2.order_id = int(o2.id)
    db.add_all([o1, o2, b1, b2])
    db.commit()

    finish_picking(db, cart=cart, orders=[o1, o2], operator_user_id=7)
    start_packing(db, cart=cart, operator_user_id=99)
    released = finish_packing(db, cart=cart, packed_order_id=int(o1.id))
    db.commit()
    db.refresh(b1)
    db.refresh(b2)
    db.refresh(o2)
    db.refresh(cart)

    assert released is False
    assert b1.order_id is None
    assert b2.order_id == int(o2.id)
    assert o2.cart_id == cart.id
    assert get_cart_status(cart) == CartStatus.PACKING


def test_finish_packing_last_order_releases_even_if_cart_id_already_null(db):
    """
    Regression: clear skipped when cart_id already NULL → session-heal counted order →
    order_packed + stuck PACKING. Remaining must use cart_id-only; always clear custody.
    """
    cart = _cart(db, code="CART-ORPH-PACK")
    o1 = _order(db, number="ORPH-1")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    finish_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    start_packing(db, cart=cart, operator_user_id=2)
    db.commit()

    # Symuluj drift: cart_id już NULL, ale picking_session_id + current_session_id zostają.
    sess_id = getattr(o1, "picking_session_id", None) or 1
    o1.cart_id = None
    o1.picking_session_id = int(sess_id)
    cart.current_session_id = int(sess_id)
    cart.status = CartStatus.PACKING.value
    db.add_all([o1, cart])
    db.commit()

    released = finish_packing(db, cart=cart, packed_order_id=int(o1.id))
    db.commit()
    db.refresh(o1)
    db.refresh(cart)

    assert released is True
    assert o1.cart_id is None
    assert o1.picking_session_id is None
    assert get_cart_status(cart) == CartStatus.AVAILABLE


def test_admin_release_empty_orphan_packing(db):
    cart = _cart(db, code="CART-ORPH-ADM")
    db.commit()
    cart.status = CartStatus.PACKING.value
    cart.packing_user_id = 9
    db.add(cart)
    db.commit()

    out = admin_release_cart(
        db,
        cart_id=int(cart.id),
        tenant_id=1,
        warehouse_id=1,
        admin_user_id=99,
        acknowledge=True,
    )
    db.commit()
    db.refresh(cart)
    assert out.get("empty_orphan_released") is True
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert cart.packing_user_id is None


def test_admin_release_still_blocks_packing_with_attached_order(db):
    cart = _cart(db, code="CART-ORPH-BLOCK")
    o1 = _order(db, number="BLK-1")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    finish_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    start_packing(db, cart=cart, operator_user_id=2)
    db.commit()
    assert get_cart_status(cart) == CartStatus.PACKING
    assert o1.cart_id == cart.id

    with pytest.raises(InvalidCartTransitionError) as ei:
        admin_release_cart(
            db,
            cart_id=int(cart.id),
            tenant_id=1,
            warehouse_id=1,
            admin_user_id=99,
            acknowledge=True,
        )
    assert "pakowania" in str(ei.value.message).lower() or "pakowanie" in str(ei.value.message).lower()


def test_release_empty_orphan_blocked_by_open_picking_session(db):
    from backend.services.cart_picking_lifecycle_service import release_empty_orphan_cart

    cart = _cart(db, code="CART-ORPH-SESS")
    o1 = _order(db, number="SESS-1")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    # Detach order custody without closing session — not a valid empty orphan.
    o1.cart_id = None
    o1.picking_session_id = None
    db.add(o1)
    cart.status = CartStatus.PACKING.value
    db.add(cart)
    db.commit()

    with pytest.raises(InvalidCartTransitionError):
        release_empty_orphan_cart(
            db,
            cart_id=int(cart.id),
            tenant_id=1,
            warehouse_id=1,
            operator_user_id=1,
        )


def test_cancel_picking_still_blocks_ready_and_packing(db):
    cart = _cart(db, code="CART-CXL-R")
    o1 = _order(db, number="CXL-1")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    finish_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()
    with pytest.raises(InvalidCartTransitionError):
        cancel_picking(
            db,
            cart_id=int(cart.id),
            tenant_id=1,
            warehouse_id=1,
            operator_user_id=1,
        )
    start_packing(db, cart=cart, operator_user_id=2)
    db.commit()
    with pytest.raises(InvalidCartTransitionError):
        cancel_picking(
            db,
            cart_id=int(cart.id),
            tenant_id=1,
            warehouse_id=1,
            operator_user_id=1,
        )
