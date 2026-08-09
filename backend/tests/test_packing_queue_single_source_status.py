"""
Packing queue must honour configured source status only — no name heuristics,
no fulfillment-only bypass across other UI statuses.

  python -m pytest backend/tests/test_packing_queue_single_source_status.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.order import Order
from backend.models.order_ui_status import OrderUiStatus
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.order_fulfillment_state import PACKING, READY_TO_PACK
from backend.services.picking_handoff_service import HANDOFF_CARTLESS
from backend.services.wms_packing_service import (
    _active_packing_eligibility_clauses,
    _packing_orders_base_query,
    _packing_queue_status_ids,
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
    # Skonfigurowany JEDEN status źródłowy pakowania
    session.add(
        OrderUiStatus(
            id=8,
            tenant_id=1,
            warehouse_id=1,
            main_group="IN_PROGRESS",
            name="Pakowanie",
            color="#000",
            sort_order=1,
        )
    )
    # Inne statusy z „pak” w nazwie — dawniej wciągane heurystyką
    session.add(
        OrderUiStatus(
            id=9,
            tenant_id=1,
            warehouse_id=1,
            main_group="IN_PROGRESS",
            name="Do spakowania (inne)",
            color="#111",
            sort_order=2,
        )
    )
    session.add(
        OrderUiStatus(
            id=10,
            tenant_id=1,
            warehouse_id=1,
            main_group="IN_PROGRESS",
            name="Spakowane",
            color="#222",
            sort_order=3,
        )
    )
    session.add(
        OrderUiStatus(
            id=11,
            tenant_id=1,
            warehouse_id=1,
            main_group="NEW",
            name="Nowe",
            color="#333",
            sort_order=0,
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
        "backend.services.picking_handoff_service.reconcile_picking_handoff_modes",
        lambda *a, **k: {},
    )


def _order(
    db,
    *,
    number: str,
    ui_status_id: int,
    fs: str = READY_TO_PACK,
) -> Order:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="PACKING",
        fulfillment_state=fs,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        order_ui_status_id=int(ui_status_id),
        picking_handoff_mode=HANDOFF_CARTLESS,
        cart_id=None,
        basket_id=None,
    )
    db.add(o)
    db.flush()
    return o


def test_packing_queue_status_ids_only_primary_no_name_heuristic(db):
    ids = _packing_queue_status_ids(db, tenant_id=1, warehouse_id=1, primary_status_id=8)
    assert ids == [8]


def test_single_source_status_excludes_other_ui_statuses(db):
    in_queue = _order(db, number="Q1", ui_status_id=8)
    other_pak_name = _order(db, number="Q2", ui_status_id=9)
    packed_status = _order(db, number="Q3", ui_status_id=10)
    new_status = _order(db, number="Q4", ui_status_id=11)
    # READY_TO_PACK + obcy UI status — dawny bypass fulfillment bez filtra statusu
    fs_only = _order(db, number="Q5", ui_status_id=11, fs=PACKING)
    db.commit()

    rows = (
        _packing_orders_base_query(
            db, tenant_id=1, warehouse_id=1, status_id=8, mode="all", cart_id=None
        )
        .all()
    )
    ids = {int(r.id) for r in rows}
    assert ids == {int(in_queue.id)}
    assert int(other_pak_name.id) not in ids
    assert int(packed_status.id) not in ids
    assert int(new_status.id) not in ids
    assert int(fs_only.id) not in ids


def test_queue_counters_match_same_source_list(db):
    """Distribution / count z tej samej eligibility co lista — tylko status 8."""
    for i in range(3):
        _order(db, number=f"P{i}", ui_status_id=8)
    for i in range(5):
        _order(db, number=f"X{i}", ui_status_id=9)
    for i in range(4):
        _order(db, number=f"N{i}", ui_status_id=11, fs=PACKING)
    db.commit()

    list_ids = {
        int(r.id)
        for r in _packing_orders_base_query(
            db, tenant_id=1, warehouse_id=1, status_id=8, mode="all", cart_id=None
        ).all()
    }
    assert len(list_ids) == 3

    cartless, cart, baskets, single, multi = packing_mode_distribution(
        db, tenant_id=1, warehouse_id=1, status_id=8
    )
    # Wszystkie 3 to CARTLESS bez pozycji → single/multi mogą być 0 przy braku items
    assert cartless == 3
    assert cart == 0
    assert baskets == 0
    assert cartless + cart + baskets == len(list_ids)

    status_ids = _packing_queue_status_ids(db, tenant_id=1, warehouse_id=1, primary_status_id=8)
    eligibility = _active_packing_eligibility_clauses(
        db, tenant_id=1, warehouse_id=1, status_ids=status_ids
    )
    counted = int(
        db.query(func.count(Order.id))
        .filter(
            Order.tenant_id == 1,
            Order.warehouse_id == 1,
            *eligibility,
        )
        .scalar()
        or 0
    )
    assert counted == len(list_ids) == 3


def test_eligibility_requires_ui_status_even_when_fulfillment_ready(db):
    clauses = _active_packing_eligibility_clauses(
        db, tenant_id=1, warehouse_id=1, status_ids=[8]
    )
    _order(db, number="OK", ui_status_id=8)
    _order(db, number="BAD", ui_status_id=9, fs=READY_TO_PACK)
    db.commit()
    n = int(
        db.query(func.count(Order.id))
        .filter(Order.tenant_id == 1, Order.warehouse_id == 1, *clauses)
        .scalar()
        or 0
    )
    assert n == 1
