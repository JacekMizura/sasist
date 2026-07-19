"""
MULTI 20-qty scenario: quantity puts + per-order_item shortage (no product FIFO close).

CASE coverage maps to operator brief:
  #1–#5 baskets with required 1,1,2,8,8 → total 20
  picks 1+1+2+4+0, shortages 0+0+0+4+8 → picked=8 shortage=12 unresolved=0

  python -m pytest backend/tests/test_wms_multi_basket_allocation_scenario.py -q
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
from backend.models.enums import CartType
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.wms_basket_put import error_codes as ec
from backend.services.wms_basket_put.scan_service import BasketPutError, confirm_basket_put
from backend.services.wms_picking_product_list_service import report_wms_picking_product_shortage


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Product,
        Cart,
        CartBasket,
        Order,
        OrderItem,
        WmsOperationSession,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Product(id=50, tenant_id=1, name="A", sku="A", ean="5900000000050"))
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def multi_env(db, monkeypatch):
    now = datetime.utcnow()
    cart = Cart(
        id=9,
        tenant_id=1,
        warehouse_id=1,
        name="brck1",
        code="brck1",
        type=CartType.MULTI,
        status="PICKING",
    )
    db.add(cart)
    baskets = []
    for i, (bid, name, code) in enumerate(
        (
            (101, "S-1-1", "brck1-B01"),
            (102, "S-1-2", "brck1-B02"),
            (103, "S-1-3", "brck1-B03"),
            (104, "S-1-4", "brck1-B04"),
            (105, "S-1-5", "brck1-B05"),
        )
    ):
        b = CartBasket(
            id=bid,
            cart_id=9,
            warehouse_id=1,
            row=0,
            column=i,
            name=name,
            barcode=code,
            scan_code=code,
            inner_length=1,
            inner_width=1,
            inner_height=1,
            usable_volume=100,
            used_volume=0,
        )
        baskets.append(b)
        db.add(b)
    sess = WmsOperationSession(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        cart_id=9,
        session_kind="picking_active",
        operator_user_id=1,
        started_at=now,
        last_activity_at=now,
        metadata_json="{}",
    )
    db.add(sess)
    cart.current_session_id = 1
    db.commit()

    monkeypatch.setattr(
        "backend.services.wms_basket_put.scan_service.assert_cart_ready_for_quick_pick",
        lambda db, cart: sess,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.ensure_order_basket_for_wms_pick",
        lambda db, cart, order: None,
    )

    picked: dict[int, float] = {}
    missing: dict[int, float] = {}

    def _sum(_db, oi_id, _cid):
        return float(picked.get(int(oi_id), 0.0))

    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        _sum,
    )

    # resolve._line_remaining also reads oi.wms_picking_line_missing_qty from ORM
    pick_calls: list[tuple[float, int]] = []

    def record_pick_fn(*, quantity: float, fixed_order_id=None, scope_order_id=None):
        oid = int(scope_order_id if scope_order_id is not None else (fixed_order_id or 0))
        oiid = oid * 10
        pick_calls.append((float(quantity), oid))
        picked[oiid] = float(picked.get(oiid, 0.0)) + float(quantity)
        return oid, oiid

    # Orders #1..#5 with qty 1,1,2,8,8
    order_defs = (
        (1001, 101, 1.0),
        (1002, 102, 1.0),
        (1003, 103, 2.0),
        (1004, 104, 8.0),
        (1005, 105, 8.0),
    )
    for oid, bid, qty in order_defs:
        o = Order(
            id=oid,
            tenant_id=1,
            warehouse_id=1,
            number=str(oid),
            status="PICKING",
            fulfillment_state="PICKING",
            cart_id=9,
            basket_id=bid,
            picking_session_id=1,
            total_volume_dm3=1.0,
            created_at=now,
            picking_started_at=now,
        )
        db.add(o)
        db.flush()
        oi = OrderItem(
            id=oid * 10,
            order_id=oid,
            product_id=50,
            quantity=qty,
            unit_price=1.0,
            wms_picking_line_missing_qty=0.0,
            wms_shortage_declared_qty=0.0,
        )
        db.add(oi)
        db.get(CartBasket, bid).order_id = oid
    db.commit()

    order_ids = [1001, 1002, 1003, 1004, 1005]

    def confirm(basket: str, *, quantity=None):
        return confirm_basket_put(
            db,
            cart=cart,
            basket_scan=basket,
            operator_user_id=1,
            record_pick_fn=record_pick_fn,
            order_ids=order_ids,
            product_id=50,
            location_id=100,
            quantity=quantity,
        )

    def line_state(oi_id: int):
        oi = db.get(OrderItem, oi_id)
        req = float(oi.quantity)
        p = float(picked.get(oi_id, 0.0))
        s = float(oi.wms_picking_line_missing_qty or 0.0)
        return {
            "required": req,
            "picked": p,
            "shortage": s,
            "unresolved": max(0.0, req - p - s),
        }

    return {
        "cart": cart,
        "confirm": confirm,
        "pick_calls": pick_calls,
        "picked": picked,
        "missing": missing,
        "line_state": line_state,
        "order_ids": order_ids,
    }


def test_case1_any_eligible_basket_not_fifo(multi_env):
    r = multi_env["confirm"]("brck1-B04")  # middle basket, not first
    assert r.phase == "QUANTITY_REQUIRED"
    assert int(r.order_id) == 1004
    assert multi_env["pick_calls"] == []


def test_case2_basket_scan_pick_zero_until_qty_confirm(multi_env):
    r0 = multi_env["confirm"]("brck1-B04")
    assert r0.phase == "QUANTITY_REQUIRED"
    assert float(r0.quantity_put) == 0
    assert multi_env["pick_calls"] == []
    r1 = multi_env["confirm"]("brck1-B04", quantity=4)
    assert float(r1.quantity_put) == 4
    assert multi_env["pick_calls"] == [(4.0, 1004)]


def test_case3_remaining_unresolved_after_partial(multi_env):
    multi_env["confirm"]("brck1-B04", quantity=4)
    st = multi_env["line_state"](10040)
    assert st == {"required": 8.0, "picked": 4.0, "shortage": 0.0, "unresolved": 4.0}


def test_case7_wrong_basket_zero_mutation(multi_env):
    from sqlalchemy.orm import object_session

    cart = multi_env["cart"]
    session = object_session(cart)
    session.add(
        CartBasket(
            id=199,
            cart_id=9,
            warehouse_id=1,
            row=1,
            column=0,
            name="S-1-9",
            barcode="brck1-B09",
            scan_code="brck1-B09",
            inner_length=1,
            inner_width=1,
            inner_height=1,
            usable_volume=100,
            used_volume=0,
            order_id=None,
        )
    )
    session.commit()
    with pytest.raises(BasketPutError) as cm:
        multi_env["confirm"]("brck1-B09")
    assert cm.value.code == ec.BASKET_EMPTY
    assert multi_env["pick_calls"] == []


def test_case9_overpick_blocked(multi_env):
    with pytest.raises(BasketPutError) as cm:
        multi_env["confirm"]("brck1-B04", quantity=9)
    assert cm.value.code == ec.QUANTITY_EXCEEDS_REMAINING
    assert multi_env["pick_calls"] == []


def test_case11_retry_quantity_confirm_idempotent_cap(multi_env):
    multi_env["confirm"]("brck1-B01", quantity=1)
    assert multi_env["pick_calls"] == [(1.0, 1001)]
    with pytest.raises(BasketPutError) as cm:
        multi_env["confirm"]("brck1-B01", quantity=1)
    assert cm.value.code in (
        ec.QUANTITY_EXCEEDS_REMAINING,
        ec.PRODUCT_ALREADY_COMPLETE,
        ec.BASKET_PRODUCT_ALREADY_COMPLETE,
        ec.BASKET_PRODUCT_MISMATCH,
        "PRODUCT_ALREADY_COMPLETE",
        "BASKET_PRODUCT_ALREADY_COMPLETE",
        "BASKET_PRODUCT_MISMATCH",
    )
    assert multi_env["pick_calls"] == [(1.0, 1001)]


def _shortage_report_for_line(*, oi, order, cart, missing_qty: float, picked_by_line: dict):
    """Drive report_wms_picking_product_shortage with MagicMock DB scoped to one line."""
    missing_events: list[tuple[int, float]] = []
    db = MagicMock()

    def query_side(model):
        q = MagicMock()
        q.filter.return_value = q
        q.options.return_value = q
        q.order_by.return_value = q
        q.with_for_update.return_value = q
        from backend.models.cart import Cart as CartModel
        from backend.models.order import Order as OrderModel
        from backend.models.order_item import OrderItem as OIModel

        if model is OIModel:
            q.first.return_value = oi
            q.all.return_value = [oi]
        elif model is CartModel:
            q.first.return_value = cart
        elif model is OrderModel:
            q.all.return_value = [order]
            q.first.return_value = order
        else:
            q.first.return_value = None
            q.all.return_value = []
        return q

    db.query.side_effect = query_side

    def sum_pick(_db, line_id, _cid):
        return float(picked_by_line.get(int(line_id), 0.0))

    with patch(
        "backend.services.picking_config_query.resolve_picking_config_for_shortage_report",
        return_value=(
            MagicMock(),
            {
                "workflow_scoped": True,
                "workflow_type": "line",
                "resolved_source_status_id": 1,
                "order_id": int(order.id),
            },
        ),
    ), patch(
        "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
        side_effect=sum_pick,
    ), patch(
        "backend.services.wms_picking_product_list_service.sum_line_events",
        return_value=0.0,
    ), patch(
        "backend.services.wms_picking_product_list_service.append_event",
        side_effect=lambda db, **kw: missing_events.append(
            (int(kw["order_item_id"]), float(kw["quantity"]))
        ),
    ), patch(
        "backend.services.wms_picking_product_list_service.sync_declared_shortage_column_from_missing_events",
    ), patch(
        "backend.services.wms_picking_product_list_service.recompute_order_fulfillment",
    ), patch(
        "backend.services.wms_picking_product_list_service.touch_picking_in_progress",
    ), patch(
        "backend.services.wms_audit_service.emit_line_shortage_reported",
    ), patch(
        "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
        return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
    ), patch(
        "backend.services.wms_picking_product_list_service.upsert_order_issue_tasks_from_shortage",
        return_value=[],
    ), patch(
        "backend.services.wms_picking_product_list_service._allowed_pick_location_ids_for_product",
        return_value=set(),
    ), patch(
        "backend.services.wms_basket_put.clear_basket_put_state",
    ):
        out = report_wms_picking_product_shortage(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            order_type="all",
            product_id=50,
            location_id=None,
            missing_qty=float(missing_qty),
            cart_id=9,
            order_item_id=int(oi.id),
        )
    return out, missing_events


def test_case4_and_5_partial_and_full_shortage_scoped(multi_env):
    multi_env["confirm"]("brck1-B04", quantity=4)
    oi4 = SimpleNamespace(
        id=10040,
        order_id=1004,
        product_id=50,
        quantity=8.0,
        wms_picking_line_missing_qty=0.0,
        wms_shortage_declared_qty=0.0,
        wms_picking_line_status=None,
        replaced_from_order_item_id=None,
        oms_line_status=None,
        product=SimpleNamespace(name="A", sku="A", symbol=None, ean=None),
    )
    o4 = SimpleNamespace(id=1004, items=[oi4], cart_id=9, warehouse_id=1, tenant_id=1)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    out, ev = _shortage_report_for_line(
        oi=oi4, order=o4, cart=cart, missing_qty=4.0, picked_by_line={10040: 4.0}
    )
    assert out["ok"]
    assert ev == [(10040, 4.0)]
    assert float(oi4.wms_picking_line_missing_qty) == 4.0

    oi5 = SimpleNamespace(
        id=10050,
        order_id=1005,
        product_id=50,
        quantity=8.0,
        wms_picking_line_missing_qty=0.0,
        wms_shortage_declared_qty=0.0,
        wms_picking_line_status=None,
        replaced_from_order_item_id=None,
        oms_line_status=None,
        product=SimpleNamespace(name="A", sku="A", symbol=None, ean=None),
    )
    o5 = SimpleNamespace(id=1005, items=[oi5], cart_id=9, warehouse_id=1, tenant_id=1)
    out5, ev5 = _shortage_report_for_line(
        oi=oi5, order=o5, cart=cart, missing_qty=8.0, picked_by_line={10050: 0.0}
    )
    assert out5["ok"]
    assert ev5 == [(10050, 8.0)]
    assert float(oi5.wms_picking_line_missing_qty) == 8.0
    # #4 shortage must not touch #5 and vice versa
    assert float(oi4.wms_picking_line_missing_qty) == 4.0


def test_case6_full_20_qty_scenario(multi_env):
    # #1 #2 #3 full pick
    multi_env["confirm"]("brck1-B01", quantity=1)
    multi_env["confirm"]("brck1-B02", quantity=1)
    multi_env["confirm"]("brck1-B03", quantity=2)
    # #4 partial pick 4
    multi_env["confirm"]("brck1-B04", quantity=4)
    # #5 no pick

    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    picked = multi_env["picked"]

    oi4 = SimpleNamespace(
        id=10040,
        order_id=1004,
        product_id=50,
        quantity=8.0,
        wms_picking_line_missing_qty=0.0,
        wms_shortage_declared_qty=0.0,
        wms_picking_line_status=None,
        replaced_from_order_item_id=None,
        oms_line_status=None,
        product=SimpleNamespace(name="A", sku=None, symbol=None, ean=None),
    )
    o4 = SimpleNamespace(id=1004, items=[oi4], cart_id=9, warehouse_id=1, tenant_id=1)
    _shortage_report_for_line(oi=oi4, order=o4, cart=cart, missing_qty=4.0, picked_by_line=picked)

    oi5 = SimpleNamespace(
        id=10050,
        order_id=1005,
        product_id=50,
        quantity=8.0,
        wms_picking_line_missing_qty=0.0,
        wms_shortage_declared_qty=0.0,
        wms_picking_line_status=None,
        replaced_from_order_item_id=None,
        oms_line_status=None,
        product=SimpleNamespace(name="A", sku=None, symbol=None, ean=None),
    )
    o5 = SimpleNamespace(id=1005, items=[oi5], cart_id=9, warehouse_id=1, tenant_id=1)
    _shortage_report_for_line(oi=oi5, order=o5, cart=cart, missing_qty=8.0, picked_by_line=picked)

    # Sync ORM missing onto fixture lines for aggregate read
    states = {
        1: multi_env["line_state"](10010),
        2: multi_env["line_state"](10020),
        3: multi_env["line_state"](10030),
        4: {
            "required": 8.0,
            "picked": float(picked.get(10040, 0)),
            "shortage": float(oi4.wms_picking_line_missing_qty),
            "unresolved": 0.0,
        },
        5: {
            "required": 8.0,
            "picked": float(picked.get(10050, 0)),
            "shortage": float(oi5.wms_picking_line_missing_qty),
            "unresolved": 0.0,
        },
    }
    assert states[1] == {"required": 1.0, "picked": 1.0, "shortage": 0.0, "unresolved": 0.0}
    assert states[2] == {"required": 1.0, "picked": 1.0, "shortage": 0.0, "unresolved": 0.0}
    assert states[3] == {"required": 2.0, "picked": 2.0, "shortage": 0.0, "unresolved": 0.0}
    assert states[4] == {"required": 8.0, "picked": 4.0, "shortage": 4.0, "unresolved": 0.0}
    assert states[5] == {"required": 8.0, "picked": 0.0, "shortage": 8.0, "unresolved": 0.0}

    total_req = sum(s["required"] for s in states.values())
    total_p = sum(s["picked"] for s in states.values())
    total_s = sum(s["shortage"] for s in states.values())
    total_u = sum(s["unresolved"] for s in states.values())
    assert (total_req, total_p, total_s, total_u) == (20.0, 8.0, 12.0, 0.0)


def test_case10_overshortage_blocked():
    oi = SimpleNamespace(
        id=10040,
        order_id=1004,
        product_id=50,
        quantity=8.0,
        wms_picking_line_missing_qty=0.0,
        wms_shortage_declared_qty=0.0,
        wms_picking_line_status=None,
        replaced_from_order_item_id=None,
        oms_line_status=None,
        product=SimpleNamespace(name="A", sku=None, symbol=None, ean=None),
    )
    order = SimpleNamespace(id=1004, items=[oi], cart_id=9, warehouse_id=1, tenant_id=1)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    with pytest.raises(ValueError) as ctx:
        _shortage_report_for_line(
            oi=oi, order=order, cart=cart, missing_qty=9.0, picked_by_line={10040: 4.0}
        )
    assert "4" in str(ctx.value) or "braku" in str(ctx.value).lower()


def test_case12_retry_shortage_idempotent_noop():
    oi = SimpleNamespace(
        id=10050,
        order_id=1005,
        product_id=50,
        quantity=8.0,
        wms_picking_line_missing_qty=8.0,
        wms_shortage_declared_qty=8.0,
        wms_picking_line_status="missing",
        replaced_from_order_item_id=None,
        oms_line_status=None,
        product=SimpleNamespace(name="A", sku=None, symbol=None, ean=None),
    )
    order = SimpleNamespace(id=1005, items=[oi], cart_id=9, warehouse_id=1, tenant_id=1)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    out, ev = _shortage_report_for_line(
        oi=oi, order=order, cart=cart, missing_qty=8.0, picked_by_line={10050: 0.0}
    )
    assert out.get("already_resolved") is True
    assert ev == []


def test_multi_rejects_product_level_shortage_without_order_item_id():
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db = MagicMock()

    def query_side(model):
        q = MagicMock()
        q.filter.return_value = q
        q.options.return_value = q
        from backend.models.cart import Cart as CartModel

        if model is CartModel:
            q.first.return_value = cart
        else:
            q.first.return_value = None
        return q

    db.query.side_effect = query_side
    with patch(
        "backend.services.picking_config_query.resolve_picking_config_for_shortage_report",
        return_value=(MagicMock(), {"workflow_scoped": False, "workflow_type": "cohort", "resolved_source_status_id": 1}),
    ), patch(
        "backend.services.wms_basket_put.clear_basket_put_state",
    ):
        with pytest.raises(ValueError) as ctx:
            report_wms_picking_product_shortage(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=1,
                order_type="all",
                product_id=50,
                location_id=None,
                missing_qty=12.0,
                cart_id=9,
            )
    assert "order_item_id" in str(ctx.value)
