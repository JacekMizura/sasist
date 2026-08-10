"""
Liczniki kafelka statusu zbierania: dostępne / realizowane przez Ciebie / innych.

  python -m pytest backend/tests/test_wms_picking_status_realization_counts.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine, func, or_
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_picking_lifecycle_service import SESSION_KIND_PICKING_ACTIVE
from backend.services.wms_picking_product_list_service import (
    count_assignable_orders_for_picking_statuses,
    count_picking_status_realization_for_operator,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, Cart, Order, WmsOperationSession):
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
def _simple_eligibility(monkeypatch):
    def _clauses(*_a, **_k):
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
        _clauses,
    )


def _order(db, *, number: str, status_id: int = 6, cart_id=None, picking_session_id=None):
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="NEW",
        order_ui_status_id=status_id,
        fulfillment_state="PICKING",
        cart_id=cart_id,
        picking_session_id=picking_session_id,
    )
    db.add(o)
    db.flush()
    return o


def _cart(db, *, code: str, assigned_user_id: int, status: str = CartStatus.PICKING.value):
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name=code,
        code=code,
        type=CartType.BULK,
        status=status,
        assigned_user_id=assigned_user_id,
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


def test_realization_split_available_me_others(db):
    me = 10
    other = 20

    for i in range(3):
        _order(db, number=f"FREE-{i}")

    my_cart = _cart(db, code="C-ME", assigned_user_id=me)
    for i in range(4):
        _order(db, number=f"ME-{i}", cart_id=int(my_cart.id))

    other_cart = _cart(db, code="C-OT", assigned_user_id=other)
    for i in range(2):
        _order(db, number=f"OT-{i}", cart_id=int(other_cart.id))

    # Finished picking on cart (READY_FOR_PACKING) must not count as realizowane.
    done_cart = _cart(db, code="C-DONE", assigned_user_id=me, status=CartStatus.READY_FOR_PACKING.value)
    _order(db, number="DONE-1", cart_id=int(done_cart.id))

    db.commit()

    assert count_assignable_orders_for_picking_statuses(
        db, tenant_id=1, warehouse_id=1, source_status_ids=[6]
    ).get(6, 0) == 3

    counts = count_picking_status_realization_for_operator(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_ids=[6],
        operator_user_id=me,
    )[6]
    assert counts["order_count"] == 3
    assert counts["in_progress_by_me"] == 4
    assert counts["in_progress_by_others"] == 2


def test_realization_filters_by_status_cart_type(db):
    """BULK vs MULTI — statusy nie dzielą się wzajemnie realizacją wózka."""
    me = 10
    bulk = _cart(db, code="BULK-1", assigned_user_id=me)
    multi = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="MULTI-1",
        code="MULTI-1",
        type=CartType.MULTI,
        status=CartStatus.PICKING.value,
        assigned_user_id=me,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_strategy="BASKETS",
    )
    db.add(multi)
    db.flush()
    for i in range(2):
        _order(db, number=f"B-{i}", status_id=6, cart_id=int(bulk.id))
    for i in range(3):
        _order(db, number=f"M-{i}", status_id=7, cart_id=int(multi.id))
    db.commit()

    counts = count_picking_status_realization_for_operator(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_ids=[6, 7],
        operator_user_id=me,
        status_cart_types={6: "BULK", 7: "BASKETS"},
    )
    assert counts[6]["in_progress_by_me"] == 2
    assert counts[7]["in_progress_by_me"] == 3
    # Bez filtra typu — obie kohorty widoczne na „obcym” statusie nie powinny mieszać typów.
    assert counts[6]["in_progress_by_others"] == 0
    assert counts[7]["in_progress_by_others"] == 0


def test_cartless_session_counts_as_in_progress_not_available(db):
    me = 10
    other = 20
    now = datetime.utcnow()

    my_sess = WmsOperationSession(
        tenant_id=1,
        warehouse_id=1,
        cart_id=None,
        session_kind=SESSION_KIND_PICKING_ACTIVE,
        operator_user_id=me,
        started_at=now,
        completed_at=None,
        paused_duration_seconds=0,
    )
    other_sess = WmsOperationSession(
        tenant_id=1,
        warehouse_id=1,
        cart_id=None,
        session_kind=SESSION_KIND_PICKING_ACTIVE,
        operator_user_id=other,
        started_at=now,
        completed_at=None,
        paused_duration_seconds=0,
    )
    db.add_all([my_sess, other_sess])
    db.flush()

    _order(db, number="FREE-1")
    _order(db, number="ME-CL", picking_session_id=int(my_sess.id))
    _order(db, number="OT-CL", picking_session_id=int(other_sess.id))
    db.commit()

    counts = count_picking_status_realization_for_operator(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_ids=[6],
        operator_user_id=me,
    )[6]
    assert counts["order_count"] == 1
    assert counts["in_progress_by_me"] == 1
    assert counts["in_progress_by_others"] == 1
