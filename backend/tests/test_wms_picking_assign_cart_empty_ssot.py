"""
Regresja: kafel Wózki vs assignment do pustego wózka + PICK_ASSIGN_TRACE.

CASE 1: pickable orders + AVAILABLE cart → assign ≥1
CASE 2: wszystkie niekwalifikowalne → assign=0, licznik kafelka=0 (nie surowy 8)
CASE 3: shortage/MISSING po finalize → poza candidates
CASE 4: pusty CART po failed assign → AVAILABLE (nie PRZYPISANY/ASSIGNED)

  python -m pytest backend/tests/test_wms_picking_assign_cart_empty_ssot.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_picking_lifecycle_service import (
    claim_cart,
    get_cart_status,
    release_cart,
)
from backend.services.order_fulfillment_state import MISSING
from backend.services.wms_picking_assign_trace import (
    classify_order_pick_rejection_reasons,
    log_pick_assign_trace,
)
from backend.services.wms_picking_product_list_service import (
    bootstrap_start_picking_if_needed,
    count_assignable_orders_for_picking_statuses,
)


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
        WmsOperationSession,
        CartLifecycleHistory,
        CartLifecycleEvent,
    ):
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
def _bypass_validation_gate(monkeypatch):
    from sqlalchemy import func, or_

    def _pass(db, *, orders, tenant_id, warehouse_id, operator_user_id=None):
        return list(orders)

    monkeypatch.setattr(
        "backend.services.wms_order_validation.gate.gate_orders_before_capacity",
        _pass,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_assign_trace.validate_orders_for_picking",
        lambda *a, **k: [],
    )

    def _simple_eligibility(*_a, **_k):
        return (
            Order.picking_finished_at.is_(None),
            Order.deleted_at.is_(None),
            or_(
                Order.fulfillment_state.is_(None),
                func.trim(Order.fulfillment_state) == "",
                Order.fulfillment_state.in_(("PICKING", "PARTIAL")),
            ),
        )

    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service._picking_queue_eligibility_clauses",
        _simple_eligibility,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_assign_trace.order_eligible_for_wms_queues",
        lambda *a, **k: True,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_assign_trace.assert_order_wms_fulfillment_not_blocked",
        lambda *a, **k: None,
    )


def _cart(db, *, code: str = "CART-0001") -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name=code,
        code=code,
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_strategy="LIMIT_VOLUME",
        capacity_orders=50,
    )
    db.add(c)
    db.flush()
    return c


def _order(
    db,
    *,
    number: str,
    status_id: int = 6,
    fulfillment_state: str | None = None,
    cart_id: int | None = None,
    picking_finished_at: datetime | None = None,
    with_line: bool = True,
) -> Order:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="NEW",
        order_ui_status_id=status_id,
        fulfillment_state=fulfillment_state,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        cart_id=cart_id,
        picking_finished_at=picking_finished_at,
    )
    db.add(o)
    db.flush()
    if with_line:
        db.add(OrderItem(order_id=int(o.id), product_id=1, quantity=1))
        db.flush()
    return o


def test_case1_pickable_orders_assign_to_empty_cart(db):
    cart = _cart(db)
    for i in range(8):
        _order(db, number=f"P-{i}", fulfillment_state=None)
    db.commit()

    assert count_assignable_orders_for_picking_statuses(
        db, tenant_id=1, warehouse_id=1, source_status_ids=[6]
    ).get(6, 0) == 8

    sess, _op_msg = bootstrap_start_picking_if_needed(
        db,
        tenant_id=1,
        warehouse_id=1,
        cart_id=int(cart.id),
        source_status_id=6,
        order_type="all",
        operator_user_id=7,
    )
    db.commit()
    assert sess is not None
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.PICKING
    on_cart = db.query(Order).filter(Order.cart_id == int(cart.id)).count()
    assert on_cart >= 1


def test_case2_non_eligible_dashboard_count_zero(db):
    cart = _cart(db)
    # 8 w statusie, ale wszystkie MISSING + picking_finished — nie assignable
    for i in range(8):
        _order(
            db,
            number=f"M-{i}",
            fulfillment_state=MISSING,
            picking_finished_at=datetime.utcnow(),
        )
    db.commit()

    raw = db.query(Order).filter(Order.order_ui_status_id == 6).count()
    assert raw == 8
    assert count_assignable_orders_for_picking_statuses(
        db, tenant_id=1, warehouse_id=1, source_status_ids=[6]
    ).get(6, 0) == 0

    sess, op_msg = bootstrap_start_picking_if_needed(
        db,
        tenant_id=1,
        warehouse_id=1,
        cart_id=int(cart.id),
        source_status_id=6,
        order_type="all",
        operator_user_id=7,
    )
    db.commit()
    assert sess is None
    assert op_msg is None  # brak preliminary — nie komunikat o walidacji
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert db.query(Order).filter(Order.cart_id == int(cart.id)).count() == 0

    trace = log_pick_assign_trace(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="all",
        cart_id=int(cart.id),
        cart_code="CART-0001",
        commit_result="test",
        run_validation=False,
    )
    assert trace["STATUS_COUNT"] == 8
    assert trace["ELIGIBLE_COUNT"] == 0
    for row in trace["orders"]:
        assert row["ELIGIBLE"] == "NO"
        assert "SHORTAGE_ORDER" in row["REJECTION_REASON"] or "OTHER:picking_finished" in row[
            "REJECTION_REASON"
        ]


def test_case3_shortage_orders_excluded_from_candidates(db):
    _order(db, number="OK-1", fulfillment_state=None)
    miss = _order(
        db,
        number="SH-1",
        fulfillment_state=MISSING,
        picking_finished_at=datetime.utcnow(),
    )
    db.commit()
    reasons = classify_order_pick_rejection_reasons(
        db,
        order=miss,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="all",
        validation_by_id={},
    )
    assert "SHORTAGE_ORDER" in reasons
    assert count_assignable_orders_for_picking_statuses(
        db, tenant_id=1, warehouse_id=1, source_status_ids=[6]
    ).get(6, 0) == 1


def test_case4_empty_cart_stays_available_not_assigned(db):
    cart = _cart(db)
    # Operator wcześniej claimował — skan bez pracy musi zwolnić.
    claim_cart(db, cart=cart, operator_user_id=7)
    db.commit()
    assert get_cart_status(cart) == CartStatus.ASSIGNED

    sess, _op_msg = bootstrap_start_picking_if_needed(
        db,
        tenant_id=1,
        warehouse_id=1,
        cart_id=int(cart.id),
        source_status_id=6,
        order_type="all",
        operator_user_id=7,
    )
    db.commit()
    assert sess is None
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert cart.assigned_user_id is None
    assert float(cart.used_volume or 0) == 0.0


def test_release_empty_assigned_cart_ssot(db):
    cart = _cart(db)
    claim_cart(db, cart=cart, operator_user_id=3)
    db.commit()
    release_cart(db, cart=cart, reason="test_empty")
    db.commit()
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert cart.assigned_user_id is None


def test_case5_preliminary_ok_gate_rejects_all_cart_available(db, monkeypatch):
    """
    CASE 5: PRELIMINARY_ELIGIBLE > 0, gate odrzuca 8/8 → assigned=0, cart AVAILABLE.
    (Nie claim / nie zostawiać ASSIGNED z orders=0.)
    """
    cart = _cart(db)
    for i in range(8):
        _order(db, number=f"G-{i}", fulfillment_state=None)
    db.commit()

    assert count_assignable_orders_for_picking_statuses(
        db, tenant_id=1, warehouse_id=1, source_status_ids=[6]
    ).get(6, 0) == 8

    claim_cart(db, cart=cart, operator_user_id=7)
    db.commit()
    assert get_cart_status(cart) == CartStatus.ASSIGNED

    monkeypatch.setattr(
        "backend.services.wms_order_validation.gate.gate_orders_before_capacity",
        lambda *a, **k: [],
    )

    sess, op_msg = bootstrap_start_picking_if_needed(
        db,
        tenant_id=1,
        warehouse_id=1,
        cart_id=int(cart.id),
        source_status_id=6,
        order_type="all",
        operator_user_id=7,
    )
    db.commit()
    assert sess is None
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert cart.assigned_user_id is None
    assert db.query(Order).filter(Order.cart_id == int(cart.id)).count() == 0
    assert db.query(WmsOperationSession).filter(
        WmsOperationSession.cart_id == int(cart.id),
        WmsOperationSession.completed_at.is_(None),
    ).count() == 0

    from backend.services.wms_picking_product_list_service import (
        OPERATOR_MSG_NO_ASSIGNABLE_AFTER_VALIDATION,
    )

    assert op_msg == OPERATOR_MSG_NO_ASSIGNABLE_AFTER_VALIDATION
    assert "walidacji" in (op_msg or "").lower()
    assert "REJECTION" not in (op_msg or "")
    assert "NO_STOCK" not in (op_msg or "")
