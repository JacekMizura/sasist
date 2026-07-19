"""
Real finalize shortage detach — fresh DB session + boolean setting.

  python -m pytest backend/tests/test_wms_picking_finalize_cart_shortage_detach_integration.py -q
"""

from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

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
from backend.models.pick import Pick
from backend.models.picking_config import PickingConfig
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.models.wms_picking_shortage_settings import WmsPickingShortageSettings
from backend.services.cart_picking_lifecycle_service import (
    finish_picking_after_wms_finalize,
    get_cart_status,
)
from backend.services.cart_stats_service import list_orders_on_cart
from backend.services.wms_picking_shortage_settings_service import is_shortage_auto_detach_enabled


@pytest.fixture
def engine():
    eng = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Product,
        Cart,
        CartBasket,
        Order,
        OrderItem,
        Pick,
        PickingConfig,
        WmsOperationSession,
        CartLifecycleHistory,
        CartLifecycleEvent,
        WmsPickingShortageSettings,
    ):
        model.__table__.create(eng, checkfirst=True)
    return eng


@pytest.fixture
def SessionLocal(engine):
    return sessionmaker(bind=engine)


@pytest.fixture
def db(SessionLocal):
    session = SessionLocal()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Product(id=1, tenant_id=1, name="P1", sku="P1", ean="5900000000001"))
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _seed_cart_with_shortage_orders(db, *, cart_status=CartStatus.PICKING.value):
    from datetime import datetime

    now = datetime.utcnow()
    cart = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="CART-0001",
        code="CART-0001",
        type=CartType.BULK,
        status=cart_status,
        total_volume=480.0,
        used_volume=2.0,
        capacity_strategy="LIMIT_ORDERS",
        capacity_orders=20,
        assigned_user_id=7,
    )
    db.add(cart)
    db.flush()
    sess = WmsOperationSession(
        tenant_id=1,
        warehouse_id=1,
        cart_id=int(cart.id),
        order_id=None,
        session_kind="picking_active",
        operator_user_id=7,
        started_at=now,
        last_activity_at=now,
        completed_at=None,
    )
    db.add(sess)
    db.flush()
    cart.current_session_id = int(sess.id)

    orders = []
    for num in ("1215", "1231"):
        o = Order(
            tenant_id=1,
            warehouse_id=1,
            number=num,
            status="MISSING",
            fulfillment_state="MISSING",
            cart_id=int(cart.id),
            picking_session_id=int(sess.id),
            total_volume_dm3=1.0,
            order_ui_status_id=1,
        )
        db.add(o)
        db.flush()
        db.add(
            OrderItem(
                order_id=int(o.id),
                product_id=1,
                quantity=2.0,
                wms_picking_line_missing_qty=2.0,
                wms_shortage_declared_qty=2.0,
                wms_picking_line_status="missing",
            )
        )
        orders.append(o)
    db.commit()
    db.refresh(cart)
    for o in orders:
        db.refresh(o)
    return cart, orders


@contextmanager
def _silence_activity_side_effects():
    with (
        patch("backend.services.cart_picking_lifecycle_service._record_event"),
        patch("backend.services.wms_audit_service.append_order_activity_for_wms"),
        patch("backend.services.cart_lifecycle_extensions.append_lifecycle_event"),
        patch("backend.services.cart_lifecycle_extensions.append_lifecycle_history"),
        patch("backend.services.wms_picking_shortage_settings_service.assert_tenant_warehouse_scope"),
    ):
        yield


def _seed_picking_config_and_settings(db, *, disable_auto_detach: bool):
    db.add(
        PickingConfig(
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            target_status_id=2,
            strategy="products",
            pick_unit="products",
            order_sort="date",
            single_mode="bulk",
            multi_mode="bulk",
        )
    )
    ss = WmsPickingShortageSettings(
        tenant_id=1,
        warehouse_id=1,
        disable_auto_detach_missing_orders_from_carts=bool(disable_auto_detach),
    )
    db.add(ss)
    db.commit()
    return ss


@contextmanager
def _finalize_stubs():
    rec = SimpleNamespace(
        packing_allowed=False,
        has_relocation_work=False,
        state_hash="h",
        can_finalize=True,
        totals=SimpleNamespace(relocation_lines=0),
    )
    patches = [
        patch("backend.services.wms_picking_product_list_service.recompute_order_fulfillment"),
        patch(
            "backend.services.recovery_workflow_service.resolve_order_recovery_state",
            return_value=rec,
        ),
        patch("backend.services.recovery_workflow_service.validate_order_finalize_allowed"),
        patch(
            "backend.services.wms_picking_product_list_service._classify_order_after_picking_session",
            return_value="all_missing",
        ),
        patch(
            "backend.services.wms_picking_product_list_service._picking_line_resolved_for_finalize",
            return_value=(True, "ok"),
        ),
        patch(
            "backend.services.wms_picking_product_list_service.line_shortage_qty_for_picking_finalize",
            return_value=2.0,
        ),
        patch(
            "backend.services.wms_picking_product_list_service._picked_qty_for_order_item_on_cart",
            return_value=0.0,
        ),
        patch(
            "backend.services.wms_picking_product_list_service._panel_status_after_picking_finalize",
            return_value=9,
        ),
        patch("backend.services.wms_picking_product_list_service.emit_wms_picking_finished"),
        patch("backend.services.recovery_workflow_service.sync_relocation_tasks_from_recovery_state"),
        patch("backend.services.wms_recovery_pick_service.ensure_recovery_pick_task"),
        patch(
            "backend.services.wms_recovery_pick_service.get_open_recovery_task_for_order",
            return_value=None,
        ),
        patch("backend.services.wms_picking_product_list_service.ensure_open_issue_task_for_order"),
        patch("backend.services.wms_picking_product_list_service.record_picking_cart_finalize_session"),
        patch(
            "backend.services.wms_picking_product_list_service._finalize_recovery_state_summaries",
            return_value={},
        ),
        patch(
            "backend.services.wms_picking_product_list_service._finalize_cohort_snapshot",
            return_value={},
        ),
        patch("backend.services.order_shipping_fk_service.sanitize_order_orphan_shipping_method_id"),
        patch("backend.services.wms_picking_product_list_service.mark_pick_events_finalized_for_pick_ids"),
        patch(
            "backend.services.bundles.bundle_lot_snapshot_service.persist_bundle_lot_snapshots_for_picks",
        ),
        patch(
            "backend.services.wms_picking_product_list_service._decrement_inventory_for_wms_pick",
            return_value=[],
        ),
        patch(
            "backend.services.wms_picking_product_list_service._sync_order_operational_state_after_picking_finalize",
        ),
        patch(
            "backend.services.wms_picking_shortage_settings_service.assert_tenant_warehouse_scope",
        ),
        patch(
            "backend.services.order_fulfillment_lifecycle_service.on_packing_started",
        ),
        patch(
            "backend.services.order_consolidation.staging_service.release_rack_segments_for_order",
        ),
    ]
    for p in patches:
        p.start()
    try:
        yield
    finally:
        for p in reversed(patches):
            p.stop()


class TestShortageAutoDetachHelper:
    def test_unchecked_means_auto_detach_on(self):
        s = SimpleNamespace(disable_auto_detach_missing_orders_from_carts=False)
        assert is_shortage_auto_detach_enabled(s) is True

    def test_checked_means_auto_detach_off(self):
        s = SimpleNamespace(disable_auto_detach_missing_orders_from_carts=True)
        assert is_shortage_auto_detach_enabled(s) is False

    def test_none_defaults_on(self):
        assert is_shortage_auto_detach_enabled(None) is True


class TestFinishAfterFinalizeRealDb:
    def test_all_shortage_detaches_and_releases_fresh_session(self, db, SessionLocal):
        cart, orders = _seed_cart_with_shortage_orders(db)
        o1, o2 = orders
        cid = int(cart.id)

        with _silence_activity_side_effects():
            out = finish_picking_after_wms_finalize(
                db,
                cart=cart,
                orders=orders,
                packing_bound_order_ids=[],
                shortage_detach_order_ids=[int(o1.id), int(o2.id)],
                operator_user_id=7,
            )
            db.commit()

        assert out["cart_released"] is True
        assert set(out["detached_order_ids"]) == {int(o1.id), int(o2.id)}

        fresh = SessionLocal()
        try:
            c = fresh.query(Cart).filter(Cart.id == cid).one()
            assert get_cart_status(c) == CartStatus.AVAILABLE
            assert list_orders_on_cart(fresh, c) == []
            assert float(c.used_volume or 0) == 0.0
            for oid in (int(o1.id), int(o2.id)):
                o = fresh.query(Order).filter(Order.id == oid).one()
                assert o.cart_id is None
                assert o.picking_session_id is None
                assert o.basket_id is None
        finally:
            fresh.close()

    def test_heal_ready_for_packing_all_shortage(self, db, SessionLocal):
        cart, orders = _seed_cart_with_shortage_orders(
            db, cart_status=CartStatus.READY_FOR_PACKING.value
        )
        o1, o2 = orders
        cid = int(cart.id)

        with _silence_activity_side_effects():
            out = finish_picking_after_wms_finalize(
                db,
                cart=cart,
                orders=orders,
                packing_bound_order_ids=[],
                shortage_detach_order_ids=[int(o1.id), int(o2.id)],
                operator_user_id=7,
            )
            db.commit()

        assert out.get("healed_ready_for_packing") is True
        assert out["cart_released"] is True

        fresh = SessionLocal()
        try:
            c = fresh.query(Cart).filter(Cart.id == cid).one()
            assert get_cart_status(c) == CartStatus.AVAILABLE
            assert list_orders_on_cart(fresh, c) == []
            for oid in (int(o1.id), int(o2.id)):
                o = fresh.query(Order).filter(Order.id == oid).one()
                assert o.cart_id is None
        finally:
            fresh.close()

    def test_mixed_keeps_picked_on_cart(self, db, SessionLocal):
        cart, orders = _seed_cart_with_shortage_orders(db)
        picked, shortage = orders
        picked.fulfillment_state = "PACKING"
        picked.status = "PICKING_IN_PROGRESS"
        db.commit()

        with _silence_activity_side_effects():
            out = finish_picking_after_wms_finalize(
                db,
                cart=cart,
                orders=orders,
                packing_bound_order_ids=[int(picked.id)],
                shortage_detach_order_ids=[int(shortage.id)],
                operator_user_id=7,
            )
            db.commit()

        assert out["cart_released"] is False
        assert out["detached_order_ids"] == [int(shortage.id)]
        assert out["packing_order_ids"] == [int(picked.id)]

        fresh = SessionLocal()
        try:
            c = fresh.query(Cart).filter(Cart.id == int(cart.id)).one()
            assert get_cart_status(c) == CartStatus.READY_FOR_PACKING
            on = list_orders_on_cart(fresh, c)
            assert [int(o.id) for o in on] == [int(picked.id)]
            s = fresh.query(Order).filter(Order.id == int(shortage.id)).one()
            assert s.cart_id is None
            p = fresh.query(Order).filter(Order.id == int(picked.id)).one()
            assert int(p.cart_id) == int(cart.id)
        finally:
            fresh.close()


class TestFinalizeSettingDrivesDetachCandidates:
    """Setting → shortage_detach_ids → real CartLifecycle detach (fresh session)."""

    def test_auto_detach_on_via_setting_then_finish(self, db, SessionLocal):
        cart, orders = _seed_cart_with_shortage_orders(db)
        ss = _seed_picking_config_and_settings(db, disable_auto_detach=False)
        cid = int(cart.id)
        oids = [int(o.id) for o in orders]
        order_kinds = {oid: "all_missing" for oid in oids}

        auto_detach_on = is_shortage_auto_detach_enabled(ss)
        assert auto_detach_on is True
        packing_bound_ids = [oid for oid, k in order_kinds.items() if k == "all_picked"]
        shortage_detach_ids = (
            [oid for oid, k in order_kinds.items() if k != "all_picked"] if auto_detach_on else []
        )
        assert shortage_detach_ids == oids

        with _silence_activity_side_effects():
            finish_picking_after_wms_finalize(
                db,
                cart=cart,
                orders=orders,
                packing_bound_order_ids=packing_bound_ids,
                shortage_detach_order_ids=shortage_detach_ids,
                operator_user_id=7,
            )
            db.commit()

        fresh = SessionLocal()
        try:
            c = fresh.query(Cart).filter(Cart.id == cid).one()
            assert get_cart_status(c) == CartStatus.AVAILABLE
            assert list_orders_on_cart(fresh, c) == []
            for oid in oids:
                o = fresh.query(Order).filter(Order.id == oid).one()
                assert o.cart_id is None
                assert o.picking_session_id is None
        finally:
            fresh.close()

    def test_auto_detach_off_keeps_orders_on_cart(self, db, SessionLocal):
        cart, orders = _seed_cart_with_shortage_orders(db)
        ss = _seed_picking_config_and_settings(db, disable_auto_detach=True)
        cid = int(cart.id)
        oids = [int(o.id) for o in orders]
        order_kinds = {oid: "all_missing" for oid in oids}

        auto_detach_on = is_shortage_auto_detach_enabled(ss)
        assert auto_detach_on is False
        shortage_detach_ids = (
            [oid for oid, k in order_kinds.items() if k != "all_picked"] if auto_detach_on else []
        )
        packing_bound_ids = oids  # finalize keeps all on cart when auto-detach OFF
        assert shortage_detach_ids == []

        with _silence_activity_side_effects():
            finish_picking_after_wms_finalize(
                db,
                cart=cart,
                orders=orders,
                packing_bound_order_ids=packing_bound_ids,
                shortage_detach_order_ids=shortage_detach_ids,
                operator_user_id=7,
            )
            db.commit()

        fresh = SessionLocal()
        try:
            c = fresh.query(Cart).filter(Cart.id == cid).one()
            on = list_orders_on_cart(fresh, c)
            assert sorted(int(o.id) for o in on) == sorted(oids)
            for oid in oids:
                o = fresh.query(Order).filter(Order.id == oid).one()
                assert int(o.cart_id) == cid
        finally:
            fresh.close()
