"""
Cartless session membership vs panel status + hub unit semantics.

  python -m pytest backend/tests/test_wms_cartless_session_membership.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.pick import Pick
from backend.models.picking_config import PickingConfig
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_picking_lifecycle_service import (
    CartLifecycleError,
    compute_session_stats_from_product_lines,
)
from backend.services.order_panel_ui_status_service import apply_order_panel_ui_status
from backend.services.wms_cartless_picking import (
    start_cartless_picking,
)
from backend.services.wms_cartless_picking.membership_service import (
    order_belongs_to_picking_session_source,
    revalidate_cartless_session_membership,
)
from backend.services.wms_picking_product_list_service import (
    build_picking_order_type_hub,
    resolve_wms_picking_order_ids,
)


PILNE = 5
NOWE = 10


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Order,
        OrderItem,
        Pick,
        WmsOperationSession,
        PickingConfig,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        PickingConfig(
            tenant_id=1,
            warehouse_id=1,
            source_status_id=PILNE,
            target_status_id=7,
            strategy="by_products",
            single_mode="bulk",
            multi_mode="bulk",
            max_single_orders=50,
            max_multi_orders=50,
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _bypass_gate(monkeypatch):
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
                Order.cart_id.is_(None),
            )
            .order_by(Order.id.asc())
            .all()
        )
        return [int(r[0]) for r in rows]

    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.start_service._query_order_ids_for_status",
        _simple_query,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service._query_order_ids_for_status",
        _simple_query,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.membership_service._emit_removed_from_session_activity",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.order_panel_ui_status_service._should_run_wms_fulfillment_status_hooks",
        lambda order: False,
    )


def _order(db, *, number: str, status_id: int = PILNE, qty_a: float = 4, qty_b: float = 0) -> Order:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="NEW",
        order_ui_status_id=status_id,
        fulfillment_state=None,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        cart_id=None,
        picking_session_id=None,
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(order_id=int(o.id), product_id=101, quantity=qty_a))
    if qty_b > 0:
        db.add(OrderItem(order_id=int(o.id), product_id=102, quantity=qty_b))
    db.flush()
    return o


def test_pilne_seed_status_to_nowe_releases_membership_without_picks(db):
    """Pilne → seed session → Nowe → order leaves session; cannot resolve in Pilne scope."""
    o = _order(db, number="1276", status_id=PILNE, qty_a=2)
    other = _order(db, number="1277", status_id=PILNE, qty_a=1)
    db.commit()

    sess, msg = start_cartless_picking(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=PILNE,
        order_type="all",
        operator_user_id=9,
    )
    assert msg is None and sess is not None
    sid = int(sess.id)
    db.refresh(o)
    assert int(o.picking_session_id) == sid
    assert o.order_ui_status_id == PILNE

    out = apply_order_panel_ui_status(
        db, order=o, sub_status_id=NOWE, operator_user_id=9
    )
    db.flush()
    db.refresh(o)
    assert o.order_ui_status_id == NOWE
    assert o.picking_session_id is None
    assert out.get("detached") is True
    assert out.get("cartless_membership", {}).get("action") == "released"

    members = resolve_wms_picking_order_ids(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=PILNE,
        order_type="all",
        picking_session_id=sid,
    )
    assert int(o.id) not in members
    assert int(other.id) in members
    assert order_belongs_to_picking_session_source(
        o, session_id=sid, source_status_id=PILNE
    ) is False


def test_status_change_blocked_when_cartless_picks_exist(db):
    o = _order(db, number="2001", status_id=PILNE)
    db.commit()
    sess, _ = start_cartless_picking(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=PILNE,
        order_type="all",
        operator_user_id=9,
    )
    assert sess is not None
    db.add(
        Pick(
            tenant_id=1,
            warehouse_id=1,
            order_id=int(o.id),
            order_item_id=int(db.query(OrderItem).filter_by(order_id=int(o.id)).first().id),
            product_id=101,
            location_id=1,
            quantity=1.0,
            status="picking",
            cart_id=None,
            created_at=datetime.utcnow(),
        )
    )
    db.flush()

    with pytest.raises(CartLifecycleError) as ei:
        apply_order_panel_ui_status(db, order=o, sub_status_id=NOWE, operator_user_id=9)
    assert ei.value.code == "CartlessPickingInProgress"
    db.refresh(o)
    assert o.order_ui_status_id == PILNE
    assert o.picking_session_id == int(sess.id)


def test_revalidate_heals_already_stale_member_without_picks(db):
    """Defense for rows already off-source before the status hook existed."""
    o = _order(db, number="3001", status_id=NOWE)
    sess = WmsOperationSession(
        tenant_id=1,
        warehouse_id=1,
        cart_id=None,
        order_id=None,
        session_kind="picking_active",
        operator_user_id=9,
        started_at=datetime.utcnow(),
        last_activity_at=datetime.utcnow(),
        completed_at=None,
        paused_duration_seconds=0,
        metadata_json='{"cartless":true,"source_status_id":5,"assigned_order_ids":[]}',
    )
    db.add(sess)
    db.flush()
    o.picking_session_id = int(sess.id)
    db.add(o)
    db.flush()

    kept = revalidate_cartless_session_membership(
        db,
        session_id=int(sess.id),
        tenant_id=1,
        warehouse_id=1,
        source_status_id=PILNE,
    )
    db.refresh(o)
    assert kept == []
    assert o.picking_session_id is None
    assert o.order_ui_status_id == NOWE


def test_after_status_leave_resolve_excludes_order_from_old_session(db):
    o = _order(db, number="1276b", status_id=PILNE)
    db.commit()
    sess, _ = start_cartless_picking(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=PILNE,
        order_type="all",
        operator_user_id=9,
    )
    assert sess is not None
    sid = int(sess.id)
    apply_order_panel_ui_status(db, order=o, sub_status_id=NOWE, operator_user_id=9)
    db.flush()
    ids = resolve_wms_picking_order_ids(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=PILNE,
        order_type="all",
        picking_session_id=sid,
    )
    assert ids == []


def test_hub_products_are_sku_units_are_pieces(db):
    """2 SKU with qty 4+2 → products_total=2, units_total=6 (not «2 szt.»)."""
    o = _order(db, number="4001", status_id=PILNE, qty_a=4, qty_b=2)
    db.commit()

    # Hub uses product-lines; stub lines via stats helper for metric contract.
    class _Ln:
        def __init__(self, total, picked, rem, missing=0.0, status="ACTIVE"):
            self.total_quantity = total
            self.picked_quantity = picked
            self.remaining_to_pick = rem
            self.missing_quantity = missing
            self.resolution_status = status
            self.allocations = []
            self.has_draft_stock_conflict = False

    stats = compute_session_stats_from_product_lines(
        [_Ln(4, 0, 4), _Ln(2, 0, 2)]
    )
    assert int(stats["do_zebrania"]) == 2
    assert float(stats["units_total"]) == 6.0
    assert float(stats["units_remaining"]) == 6.0

    # Free hub with real orders: monkeypatch product lines builder.
    from types import SimpleNamespace

    def _fake_lines(*a, **k):
        return SimpleNamespace(
            products=[
                _Ln(4, 0, 4),
                _Ln(2, 0, 2),
            ]
        )

    import backend.services.wms_picking_product_list_service as pls

    orig = pls.build_wms_picking_product_lines
    pls.build_wms_picking_product_lines = _fake_lines  # type: ignore[assignment]
    try:
        hub = build_picking_order_type_hub(
            db, tenant_id=1, warehouse_id=1, source_status_id=PILNE
        )
    finally:
        pls.build_wms_picking_product_lines = orig  # type: ignore[assignment]

    multi = hub["multi"]
    assert multi["products_total"] == 2
    assert multi["units_total"] == 6
    assert multi["units_remaining"] == 6
    assert multi["order_count"] >= 1
    _ = o
