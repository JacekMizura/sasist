"""
Hardening Walidacji WMS — integration: race (G), active session (H),
multi-tenant (J), Activity Log (L), performance, System detach SSOT.

  python -m pytest backend/tests/test_wms_order_validation_hardening.py -q
"""

from __future__ import annotations

import json
import time

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.enums import CartStatus, CartType
from backend.models.inventory import Inventory
from backend.models.inventory_count.audit_event import InventoryAuditEvent
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.inventory_count.location_lock import InventoryLocationLock
from backend.models.capacity_analytics import CapacityAnalyticsDetail, CapacityAnalyticsRun
from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_activity_log import OrderActivityLog
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.pick import Pick
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.models.wms_order_event import EVT_WMS_VALIDATION_FAILED, EVT_WMS_VALIDATION_PASSED, WmsOrderEvent
from backend.models.wms_picking_shortage_settings import WmsPickingShortageSettings
from backend.services.cart_picking_lifecycle_service import (
    claim_cart,
    detach_order_from_cart,
    get_cart_status,
    start_picking,
)
from backend.services.cart_stats_service import list_orders_on_cart
from backend.services.inventory_count.picking_empty_location_pending import (
    create_picking_empty_location_pending_correction,
)
from backend.services.wms_order_validation.gate import (
    defensive_revalidate_cart_orders_without_picks,
    gate_orders_before_capacity,
)
from backend.services.wms_order_validation.lifecycle import (
    apply_wms_validation_fail,
    apply_wms_validation_pass_revalidate,
)
from backend.services.wms_order_validation.reasons import REASON_LOCATION_BLOCKED
from backend.services.wms_order_validation.service import (
    validate_order_for_picking,
    validate_orders_for_picking,
)
from backend.services.wms_order_validation.types import ERROR_ORDER_NOT_FOUND


MODELS = (
    Tenant,
    Warehouse,
    TenantWarehouse,
    Cart,
    CartBasket,
    Order,
    OrderItem,
    Product,
    Location,
    Inventory,
    Pick,
    WmsOperationSession,
    CartLifecycleHistory,
    CartLifecycleEvent,
    OrderUiStatus,
    WmsPickingShortageSettings,
    WmsOrderEvent,
    OrderActivityLog,
    InventoryDocument,
    InventoryDocumentLine,
    InventoryLocationLock,
    InventoryAuditEvent,
    CapacityAnalyticsRun,
    CapacityAnalyticsDetail,
    ActivityEvent,
    ActivityEventLink,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in MODELS:
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="TA", default_warehouse_id=1))
    session.add(Tenant(id=2, name="TB", default_warehouse_id=2))
    session.add(Warehouse(id=1, tenant_id=1, name="WH-A", requires_putaway=False))
    session.add(Warehouse(id=2, tenant_id=2, name="WH-B", requires_putaway=False))
    session.add(TenantWarehouse(tenant_id=1, warehouse_id=1, role="owner", is_default=1))
    session.add(TenantWarehouse(tenant_id=2, warehouse_id=2, role="owner", is_default=1))
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _status(db, *, tenant_id: int, warehouse_id: int, name: str) -> OrderUiStatus:
    s = OrderUiStatus(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        main_group="PROBLEM",
        name=name,
        color="#f59e0b",
    )
    db.add(s)
    db.flush()
    return s


def _settings(db, *, tenant_id: int, warehouse_id: int, fail_status_id: int) -> None:
    db.add(
        WmsPickingShortageSettings(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            wms_validation_failed_order_ui_status_id=int(fail_status_id),
        )
    )
    db.flush()


def _cart(db, *, tenant_id=1, warehouse_id=1, code="C1") -> Cart:
    c = Cart(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        name=code,
        code=code,
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        total_volume=9999.0,
        used_volume=0.0,
        capacity_strategy="LIMIT_ORDERS",
        capacity_orders=50,
    )
    db.add(c)
    db.flush()
    return c


def _product(db, *, tenant_id: int, ean: str, name: str = "P") -> Product:
    p = Product(tenant_id=tenant_id, name=name, sku=f"SKU-{ean[-4:]}", ean=ean, volume=0.1)
    db.add(p)
    db.flush()
    return p


def _loc(db, *, warehouse_id: int, name: str) -> Location:
    loc = Location(
        warehouse_id=warehouse_id,
        name=name,
        type="pick",
        location_type="NORMAL",
        is_active=True,
    )
    db.add(loc)
    db.flush()
    return loc


def _stock(db, *, tenant_id: int, warehouse_id: int, product_id: int, location_id: int, qty: float) -> Inventory:
    inv = Inventory(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        location_id=location_id,
        quantity=float(qty),
    )
    db.add(inv)
    db.flush()
    return inv


def _order_with_item(
    db,
    *,
    tenant_id: int,
    warehouse_id: int,
    number: str,
    product: Product,
    qty: float = 1.0,
    ui_status_id: int | None = None,
) -> tuple[Order, OrderItem]:
    o = Order(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        number=number,
        status="NEW",
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        order_ui_status_id=ui_status_id,
        total_volume_dm3=0.1,
    )
    db.add(o)
    db.flush()
    oi = OrderItem(order_id=int(o.id), product_id=int(product.id), quantity=float(qty))
    db.add(oi)
    db.flush()
    return o, oi


def test_order_not_found_is_technical_error_not_product_issue(db):
    res = validate_order_for_picking(db, order_id=999999, tenant_id=1, warehouse_id=1)
    assert res.validation_status == "ERROR"
    assert res.error_code == ERROR_ORDER_NOT_FOUND
    assert res.issues == []
    out = apply_wms_validation_fail(
        db,
        order=Order(id=999999, tenant_id=1, warehouse_id=1, order_ui_status_id=1),
        result=res,
        tenant_id=1,
        warehouse_id=1,
    )
    assert out.get("skipped") == "technical_error"
    assert db.query(WmsOrderEvent).filter(WmsOrderEvent.event_type == EVT_WMS_VALIDATION_FAILED).count() == 0


def test_g_race_lock_before_first_pick_detaches_via_cart_lifecycle(db):
    fail_st = _status(db, tenant_id=1, warehouse_id=1, name="Blad WMS A")
    ok_st = _status(db, tenant_id=1, warehouse_id=1, name="Do zbierania")
    _settings(db, tenant_id=1, warehouse_id=1, fail_status_id=int(fail_st.id))

    pa = _product(db, tenant_id=1, ean="5905108775698", name="Sznur")
    pb = _product(db, tenant_id=1, ean="5905108775000", name="Inny")
    loc_a = _loc(db, warehouse_id=1, name="A13-B-1")
    loc_b = _loc(db, warehouse_id=1, name="A14-C-2")
    _stock(db, tenant_id=1, warehouse_id=1, product_id=int(pa.id), location_id=int(loc_a.id), qty=99)
    _stock(db, tenant_id=1, warehouse_id=1, product_id=int(pb.id), location_id=int(loc_b.id), qty=5)

    o_bad, _ = _order_with_item(
        db, tenant_id=1, warehouse_id=1, number="1214", product=pa, qty=1, ui_status_id=int(ok_st.id)
    )
    o_ok, _ = _order_with_item(
        db, tenant_id=1, warehouse_id=1, number="1215", product=pb, qty=1, ui_status_id=int(ok_st.id)
    )
    db.commit()

    assert validate_order_for_picking(db, order_id=int(o_bad.id), tenant_id=1, warehouse_id=1).ok

    cart = _cart(db)
    claim_cart(db, cart=cart, operator_user_id=7)
    start_picking(db, cart=cart, orders=[o_bad, o_ok], operator_user_id=7)
    db.commit()
    db.refresh(o_bad)
    db.refresh(o_ok)
    assert o_bad.cart_id == cart.id
    assert o_ok.cart_id == cart.id

    create_picking_empty_location_pending_correction(
        db,
        tenant_id=1,
        warehouse_id=1,
        location_id=int(loc_a.id),
        product_id=int(pa.id),
        expected_quantity=99.0,
        cart_id=int(cart.id),
        operator_user_id=None,
        location_code=loc_a.name,
    )
    db.commit()

    live = validate_order_for_picking(db, order_id=int(o_bad.id), tenant_id=1, warehouse_id=1)
    assert not live.ok
    assert live.issues[0].reason_code == REASON_LOCATION_BLOCKED

    actions = defensive_revalidate_cart_orders_without_picks(
        db,
        cart_id=int(cart.id),
        tenant_id=1,
        warehouse_id=1,
        orders=[o_bad, o_ok],
        operator_user_id=None,
    )
    db.commit()

    assert any(a["order_id"] == int(o_bad.id) and a["detached"] for a in actions)
    assert not any(a["order_id"] == int(o_ok.id) for a in actions)

    db.refresh(o_bad)
    db.refresh(o_ok)
    db.refresh(cart)
    assert o_bad.cart_id is None
    assert o_bad.picking_session_id is None
    assert o_bad.order_ui_status_id == int(fail_st.id)
    assert o_ok.cart_id == cart.id
    assert len(list_orders_on_cart(db, cart)) == 1
    assert get_cart_status(cart) == CartStatus.PICKING

    detach_ev = (
        db.query(CartLifecycleEvent)
        .filter(
            CartLifecycleEvent.cart_id == int(cart.id),
            CartLifecycleEvent.event_code == "order_detached",
            CartLifecycleEvent.order_id == int(o_bad.id),
        )
        .first()
    )
    assert detach_ev is not None
    assert detach_ev.operator_user_id is None
    meta = json.loads(detach_ev.metadata_json or "{}")
    assert meta.get("actor") == "system"

    fail_events = (
        db.query(WmsOrderEvent)
        .filter(
            WmsOrderEvent.order_id == int(o_bad.id),
            WmsOrderEvent.event_type == EVT_WMS_VALIDATION_FAILED,
        )
        .all()
    )
    assert len(fail_events) == 1
    assert fail_events[0].operator_user_id is None
    payload = json.loads(fail_events[0].metadata_json or "{}")
    assert len(payload.get("issues") or []) >= 1


def test_h_active_session_with_picks_not_auto_failed_by_validation(db):
    fail_st = _status(db, tenant_id=1, warehouse_id=1, name="Blad WMS")
    ok_st = _status(db, tenant_id=1, warehouse_id=1, name="Zbieranie")
    _settings(db, tenant_id=1, warehouse_id=1, fail_status_id=int(fail_st.id))

    pa = _product(db, tenant_id=1, ean="111", name="A")
    pb = _product(db, tenant_id=1, ean="222", name="B")
    loc_a = _loc(db, warehouse_id=1, name="L-A")
    loc_b = _loc(db, warehouse_id=1, name="L-B")
    _stock(db, tenant_id=1, warehouse_id=1, product_id=int(pa.id), location_id=int(loc_a.id), qty=1)
    _stock(db, tenant_id=1, warehouse_id=1, product_id=int(pb.id), location_id=int(loc_b.id), qty=1)

    o, oi_a = _order_with_item(
        db, tenant_id=1, warehouse_id=1, number="H-1", product=pa, qty=1, ui_status_id=int(ok_st.id)
    )
    oi_b = OrderItem(order_id=int(o.id), product_id=int(pb.id), quantity=1.0)
    db.add(oi_b)
    db.flush()

    cart = _cart(db, code="H-CART")
    claim_cart(db, cart=cart, operator_user_id=3)
    start_picking(db, cart=cart, orders=[o], operator_user_id=3)
    db.commit()
    db.refresh(o)
    assert o.cart_id == cart.id
    prev_status = o.order_ui_status_id

    pick_a = Pick(
        tenant_id=1,
        warehouse_id=1,
        order_id=int(o.id),
        order_item_id=int(oi_a.id),
        product_id=int(pa.id),
        location_id=int(loc_a.id),
        cart_id=int(cart.id),
        quantity=1.0,
    )
    db.add(pick_a)
    db.commit()

    create_picking_empty_location_pending_correction(
        db,
        tenant_id=1,
        warehouse_id=1,
        location_id=int(loc_b.id),
        product_id=int(pb.id),
        expected_quantity=1.0,
        cart_id=int(cart.id),
        location_code=loc_b.name,
    )
    db.commit()

    actions = defensive_revalidate_cart_orders_without_picks(
        db,
        cart_id=int(cart.id),
        tenant_id=1,
        warehouse_id=1,
        orders=[o],
        operator_user_id=None,
    )
    db.commit()
    assert actions == []

    db.refresh(o)
    assert o.cart_id == cart.id
    assert o.order_ui_status_id == prev_status
    assert o.order_ui_status_id != int(fail_st.id)
    assert db.query(Pick).filter(Pick.id == int(pick_a.id)).count() == 1
    assert (
        db.query(InventoryLocationLock)
        .filter(InventoryLocationLock.location_id == int(loc_b.id), InventoryLocationLock.released_at.is_(None))
        .count()
        == 1
    )
    assert (
        db.query(WmsOrderEvent)
        .filter(
            WmsOrderEvent.order_id == int(o.id),
            WmsOrderEvent.event_type == EVT_WMS_VALIDATION_FAILED,
        )
        .count()
        == 0
    )


def test_j_multi_tenant_status_and_inventory_isolation(db):
    st_a = _status(db, tenant_id=1, warehouse_id=1, name="Fail-A")
    st_b = _status(db, tenant_id=2, warehouse_id=2, name="Fail-B")
    _settings(db, tenant_id=1, warehouse_id=1, fail_status_id=int(st_a.id))
    _settings(db, tenant_id=2, warehouse_id=2, fail_status_id=int(st_b.id))

    p_a = _product(db, tenant_id=1, ean="AAA")
    p_b = _product(db, tenant_id=2, ean="BBB")
    loc_b = _loc(db, warehouse_id=2, name="TB-LOC")
    _stock(db, tenant_id=2, warehouse_id=2, product_id=int(p_b.id), location_id=int(loc_b.id), qty=10)

    o_a, _ = _order_with_item(db, tenant_id=1, warehouse_id=1, number="TA-1", product=p_a, qty=1, ui_status_id=50)
    o_b, _ = _order_with_item(db, tenant_id=2, warehouse_id=2, number="TB-1", product=p_b, qty=1, ui_status_id=60)
    db.commit()

    ra = validate_order_for_picking(db, order_id=int(o_a.id), tenant_id=1, warehouse_id=1)
    rb = validate_order_for_picking(db, order_id=int(o_b.id), tenant_id=2, warehouse_id=2)
    assert not ra.ok
    assert rb.ok

    cross = validate_order_for_picking(db, order_id=int(o_b.id), tenant_id=1, warehouse_id=1)
    assert cross.validation_status == "ERROR"
    assert cross.error_code == ERROR_ORDER_NOT_FOUND

    apply_wms_validation_fail(db, order=o_a, result=ra, tenant_id=1, warehouse_id=1)
    db.commit()
    db.refresh(o_a)
    assert o_a.order_ui_status_id == int(st_a.id)
    assert o_a.order_ui_status_id != int(st_b.id)

    loc_a = _loc(db, warehouse_id=1, name="TA-LOC")
    _stock(db, tenant_id=1, warehouse_id=1, product_id=int(p_a.id), location_id=int(loc_a.id), qty=1)
    db.commit()
    pass_res = validate_order_for_picking(db, order_id=int(o_a.id), tenant_id=1, warehouse_id=1)
    assert pass_res.ok
    out = apply_wms_validation_pass_revalidate(
        db, order=o_a, result=pass_res, tenant_id=1, warehouse_id=1, operator_user_id=9
    )
    db.commit()
    db.refresh(o_a)
    assert out["status_changed"] is True
    assert o_a.order_ui_status_id == 50
    assert o_a.order_ui_status_id != int(st_b.id)


def test_l_one_fail_event_five_issues_no_pass_spam_on_gate(db):
    fail_st = _status(db, tenant_id=1, warehouse_id=1, name="Problem")
    _settings(db, tenant_id=1, warehouse_id=1, fail_status_id=int(fail_st.id))

    products = [_product(db, tenant_id=1, ean=str(1000 + i), name=f"P{i}") for i in range(5)]
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number="L-5",
        status="NEW",
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        order_ui_status_id=7,
        total_volume_dm3=1.0,
    )
    db.add(o)
    db.flush()
    for p in products:
        db.add(OrderItem(order_id=int(o.id), product_id=int(p.id), quantity=1.0))
    db.commit()

    res = validate_order_for_picking(db, order_id=int(o.id), tenant_id=1, warehouse_id=1)
    assert not res.ok
    assert len(res.issues) == 5

    passed = gate_orders_before_capacity(db, orders=[o], tenant_id=1, warehouse_id=1, operator_user_id=None)
    db.commit()
    assert passed == []

    fails = (
        db.query(WmsOrderEvent)
        .filter(WmsOrderEvent.order_id == int(o.id), WmsOrderEvent.event_type == EVT_WMS_VALIDATION_FAILED)
        .all()
    )
    assert len(fails) == 1
    assert fails[0].operator_user_id is None
    meta = json.loads(fails[0].metadata_json or "{}")
    assert len(meta.get("issues") or []) == 5

    assert (
        db.query(WmsOrderEvent)
        .filter(WmsOrderEvent.order_id == int(o.id), WmsOrderEvent.event_type == EVT_WMS_VALIDATION_PASSED)
        .count()
        == 0
    )

    gate_orders_before_capacity(db, orders=[o], tenant_id=1, warehouse_id=1, operator_user_id=None)
    db.commit()
    assert (
        db.query(WmsOrderEvent)
        .filter(WmsOrderEvent.order_id == int(o.id), WmsOrderEvent.event_type == EVT_WMS_VALIDATION_FAILED)
        .count()
        == 1
    )


def test_system_detach_uses_same_lifecycle_path(db):
    cart = _cart(db, code="SYS")
    p = _product(db, tenant_id=1, ean="SYS1")
    loc = _loc(db, warehouse_id=1, name="S1")
    _stock(db, tenant_id=1, warehouse_id=1, product_id=int(p.id), location_id=int(loc.id), qty=1)
    o1, _ = _order_with_item(db, tenant_id=1, warehouse_id=1, number="S-1", product=p)
    p2 = _product(db, tenant_id=1, ean="SYS2")
    loc2 = _loc(db, warehouse_id=1, name="S2")
    _stock(db, tenant_id=1, warehouse_id=1, product_id=int(p2.id), location_id=int(loc2.id), qty=1)
    o2, _ = _order_with_item(db, tenant_id=1, warehouse_id=1, number="S-2", product=p2)
    db.commit()

    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o1, o2], operator_user_id=1)
    db.commit()

    out = detach_order_from_cart(
        db,
        cart_id=int(cart.id),
        order_id=int(o1.id),
        tenant_id=1,
        warehouse_id=1,
        operator_user_id=None,
        reason="System unit test",
    )
    db.commit()
    assert out["orders_detached"] == 1
    db.refresh(o1)
    assert o1.cart_id is None
    ev = (
        db.query(CartLifecycleEvent)
        .filter(CartLifecycleEvent.event_code == "order_detached", CartLifecycleEvent.order_id == int(o1.id))
        .one()
    )
    assert ev.operator_user_id is None


def test_performance_batch_validate_scales_sublinear_in_routing_calls(db):
    loc = _loc(db, warehouse_id=1, name="PERF")
    products = []
    for i in range(20):
        p = _product(db, tenant_id=1, ean=f"P{i:04d}")
        products.append(p)
        _stock(db, tenant_id=1, warehouse_id=1, product_id=int(p.id), location_id=int(loc.id), qty=100)

    def _make_orders(n: int) -> list[int]:
        ids = []
        for i in range(n):
            o, _ = _order_with_item(
                db,
                tenant_id=1,
                warehouse_id=1,
                number=f"PERF-{n}-{i}",
                product=products[i % len(products)],
                qty=1,
            )
            ids.append(int(o.id))
        db.commit()
        return ids

    from backend.services import picking_routing_service as prs_mod

    results = {}
    for n in (10, 100, 1000):
        ids = _make_orders(n)
        call_count = {"n": 0}
        real_cls = prs_mod.PickingRoutingService

        class CountingRouting(real_cls):
            def build_location_pick_list(self, *a, **k):
                call_count["n"] += 1
                return super().build_location_pick_list(*a, **k)

        engine = db.get_bind()
        qcount = {"n": 0}

        def _before(*_a, **_k):
            qcount["n"] += 1

        event.listen(engine, "before_cursor_execute", _before)
        t0 = time.perf_counter()
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(
                "backend.services.wms_order_validation.service.PickingRoutingService",
                CountingRouting,
            )
            out = validate_orders_for_picking(db, order_ids=ids, tenant_id=1, warehouse_id=1)
        elapsed = time.perf_counter() - t0
        event.remove(engine, "before_cursor_execute", _before)

        assert len(out) == n
        assert all(r.ok for r in out)
        assert call_count["n"] == 1, f"N={n}: expected 1 routing call, got {call_count['n']}"
        results[n] = {
            "queries": qcount["n"],
            "seconds": round(elapsed, 4),
            "routing_calls": call_count["n"],
        }

    assert results[1000]["queries"] < results[10]["queries"] * 25
    print("PERF", results)


def test_gate_excludes_fail_before_capacity_not_as_capacity_reject(db, monkeypatch):
    fail_st = _status(db, tenant_id=1, warehouse_id=1, name="Fail")
    _settings(db, tenant_id=1, warehouse_id=1, fail_status_id=int(fail_st.id))
    p_ok = _product(db, tenant_id=1, ean="OK1")
    p_bad = _product(db, tenant_id=1, ean="BAD1")
    loc = _loc(db, warehouse_id=1, name="G1")
    _stock(db, tenant_id=1, warehouse_id=1, product_id=int(p_ok.id), location_id=int(loc.id), qty=1)
    o_ok, _ = _order_with_item(db, tenant_id=1, warehouse_id=1, number="CAP-OK", product=p_ok)
    o_bad, _ = _order_with_item(db, tenant_id=1, warehouse_id=1, number="CAP-BAD", product=p_bad)
    db.commit()

    seen_capacity = {"orders": None}

    def _fake_slice(db_s, cart, free_candidates, on_capacity=None):
        seen_capacity["orders"] = [int(o.id) for o in free_candidates]
        return list(free_candidates), {}, []

    monkeypatch.setattr(
        "backend.services.cart_picking_lifecycle_service._apply_capacity_slice",
        _fake_slice,
    )

    cart = _cart(db, code="CAP")
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o_ok, o_bad], operator_user_id=1)
    db.commit()

    assert seen_capacity["orders"] == [int(o_ok.id)]
    db.refresh(o_bad)
    assert o_bad.cart_id is None
    assert o_bad.order_ui_status_id == int(fail_st.id)
