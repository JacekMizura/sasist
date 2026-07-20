"""
Bulk shortage orchestration — same SSOT as single report, atomic all-or-nothing.

  python -m pytest backend/tests/test_wms_picking_bulk_shortage.py -q
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend.models.enums import CartType
from backend.services.wms_picking_shortage.bulk_report_service import (
    BulkShortageError,
    report_wms_picking_bulk_product_shortage,
)


def _oi(*, oid: int, order_id: int, product_id: int, qty: float, missing: float = 0.0):
    return SimpleNamespace(
        id=oid,
        order_id=order_id,
        product_id=product_id,
        quantity=qty,
        wms_picking_line_missing_qty=missing,
        wms_shortage_declared_qty=missing,
        wms_picking_line_status=None,
        replaced_from_order_item_id=None,
        oms_line_status=None,
        product=SimpleNamespace(name="A", sku="A", symbol=None, ean=None),
    )


def _order(*, oid: int, cart_id: int = 9, warehouse_id: int = 1, tenant_id: int = 1, number: str | None = None):
    return SimpleNamespace(
        id=oid,
        cart_id=cart_id,
        warehouse_id=warehouse_id,
        tenant_id=tenant_id,
        number=number or str(oid),
        basket_id=oid,
    )


def _mock_db_for_lines(ois: list, cart, orders: list | None = None):
    by_id = {int(o.id): o for o in ois}
    if orders is None:
        orders = [
            _order(oid=int(oi.order_id), cart_id=int(cart.id), warehouse_id=int(cart.warehouse_id))
            for oi in ois
        ]
        # unique by id
        seen = {}
        for o in orders:
            seen[int(o.id)] = o
        orders = list(seen.values())
    orders_by_id = {int(o.id): o for o in orders}
    db = MagicMock()

    def query_side(model):
        q = MagicMock()
        q.filter.return_value = q
        q.options.return_value = q
        q.order_by.return_value = q
        q.with_for_update.return_value = q
        from backend.models.cart import Cart
        from backend.models.order import Order
        from backend.models.order_item import OrderItem

        if model is OrderItem:
            q.all.return_value = list(ois)
            q.first.side_effect = lambda: None

            def _filter(*args, **kwargs):
                return q

            q.filter.side_effect = _filter
        elif model is Cart:
            q.first.return_value = cart
        elif model is Order:
            q.all.return_value = list(orders)
            q.first.return_value = None
        else:
            q.first.return_value = None
            q.all.return_value = []
        return q

    db.query.side_effect = query_side
    return db, by_id, orders_by_id


def _qty_side(rem_map: dict[int, float]):
    def _fn(db, oi, cid):
        rem = float(rem_map[int(oi.id)])
        return {
            "remaining_qty": rem,
            "required_qty": float(oi.quantity),
            "picked_qty": max(0.0, float(oi.quantity) - rem - float(oi.wms_picking_line_missing_qty or 0)),
            "declarable_qty": rem,
            "missing_qty_line": float(oi.wms_picking_line_missing_qty or 0),
        }

    return _fn


def test_case1_live_repro_one_allocation_1235():
    """LIVE: #1234 ready, #1235 unresolved 1 → bulk only #1235 shortage +1."""
    pid = 192
    oi1234 = _oi(oid=501, order_id=1234, product_id=pid, qty=4.0)
    oi1235 = _oi(oid=502, order_id=1235, product_id=pid, qty=1.0)
    cart = SimpleNamespace(id=2, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _, _ = _mock_db_for_lines(
        [oi1235],
        cart,
        orders=[_order(oid=1235, cart_id=2)],
    )
    applied: list[tuple[int, float]] = []

    def fake_report(db, **kw):
        applied.append((int(kw["order_item_id"]), float(kw["missing_qty"])))
        assert int(kw["order_item_id"]) == 502
        return {
            "ok": True,
            "already_resolved": False,
            "orders_updated": 1,
            "order_ids": [1235],
            "order_issue_task_ids": [],
            "allow_continue_other_lines_after_shortage": True,
        }

    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        side_effect=_qty_side({502: 1.0}),
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=fake_report,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_is_replaced_line",
        return_value=False,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_skip_bundle_commercial_header_for_ops",
        return_value=False,
    ):
        out = report_wms_picking_bulk_product_shortage(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=7,
            order_type="all",
            product_id=pid,
            cart_id=2,
            items=[{"order_item_id": 502, "missing_qty": 1.0}],
        )

    assert applied == [(502, 1.0)]
    assert out["total_shortage_qty"] == 1.0
    assert 1234 not in out["order_ids"]
    _ = oi1234


def test_case2_ten_valid_atomic():
    pid = 50
    ois = [_oi(oid=100 + i, order_id=1000 + i, product_id=pid, qty=float(i + 1)) for i in range(10)]
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _, _ = _mock_db_for_lines(ois, cart)
    items = [{"order_item_id": oi.id, "missing_qty": float(oi.quantity)} for oi in ois]
    applied: list[tuple[int, float]] = []

    def fake_report(db, **kw):
        oiid = int(kw["order_item_id"])
        mq = float(kw["missing_qty"])
        applied.append((oiid, mq))
        return {
            "ok": True,
            "already_resolved": False,
            "orders_updated": 1,
            "order_ids": [1000 + (oiid - 100)],
            "order_issue_task_ids": [],
            "allow_continue_other_lines_after_shortage": True,
        }

    rem = {oi.id: float(oi.quantity) for oi in ois}
    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        side_effect=_qty_side(rem),
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=fake_report,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_is_replaced_line",
        return_value=False,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_skip_bundle_commercial_header_for_ops",
        return_value=False,
    ):
        out = report_wms_picking_bulk_product_shortage(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            order_type="all",
            product_id=pid,
            cart_id=9,
            items=items,
        )

    assert out["ok"]
    assert out["lines_count"] == 10
    assert out["total_shortage_qty"] == sum(float(i + 1) for i in range(10))
    assert applied == [(100 + i, float(i + 1)) for i in range(10)]


def test_case3_middle_invalid_full_rollback_no_writes():
    pid = 50
    ois = [_oi(oid=100 + i, order_id=1000 + i, product_id=pid, qty=2.0) for i in range(5)]
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _, _ = _mock_db_for_lines(ois, cart)
    # item index 2 exceeds unresolved
    rem = {100: 2.0, 101: 2.0, 102: 1.0, 103: 2.0, 104: 2.0}
    calls = []

    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        side_effect=_qty_side(rem),
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=lambda *a, **k: calls.append(k) or {"ok": True, "order_ids": [], "already_resolved": False},
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_is_replaced_line",
        return_value=False,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_skip_bundle_commercial_header_for_ops",
        return_value=False,
    ):
        with pytest.raises(BulkShortageError) as ctx:
            report_wms_picking_bulk_product_shortage(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=1,
                order_type="all",
                product_id=pid,
                cart_id=9,
                items=[{"order_item_id": oi.id, "missing_qty": 2.0} for oi in ois],
            )
    assert ctx.value.code == "SHORTAGE_EXCEEDS_UNRESOLVED"
    assert ctx.value.order_item_id == 102
    assert calls == []


def test_case4_duplicate_order_item_reject():
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db = MagicMock()
    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ):
        # fails before cart query if we raise on duplicate first — actually duplicate check is before cart
        with pytest.raises(BulkShortageError) as ctx:
            report_wms_picking_bulk_product_shortage(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=1,
                order_type="all",
                product_id=50,
                cart_id=9,
                items=[
                    {"order_item_id": 11, "missing_qty": 1.0},
                    {"order_item_id": 11, "missing_qty": 1.0},
                ],
            )
    assert ctx.value.code == "SHORTAGE_DUPLICATE_ALLOCATION"
    assert ctx.value.order_item_id == 11


def test_case5_exceeds_unresolved_409_semantics():
    pid = 50
    oi = _oi(oid=502, order_id=1235, product_id=pid, qty=1.0)
    cart = SimpleNamespace(id=2, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _, _ = _mock_db_for_lines([oi], cart)
    calls = []
    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        side_effect=_qty_side({502: 1.0}),
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=lambda *a, **k: calls.append(1),
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_is_replaced_line",
        return_value=False,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_skip_bundle_commercial_header_for_ops",
        return_value=False,
    ):
        with pytest.raises(BulkShortageError) as ctx:
            report_wms_picking_bulk_product_shortage(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=7,
                order_type="all",
                product_id=pid,
                cart_id=2,
                items=[{"order_item_id": 502, "missing_qty": 5.0}],
            )
    assert ctx.value.code == "SHORTAGE_EXCEEDS_UNRESOLVED"
    assert calls == []


def test_case6_already_resolved_controlled_noop():
    pid = 50
    oi = _oi(oid=10050, order_id=1005, product_id=pid, qty=8.0, missing=8.0)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _, _ = _mock_db_for_lines([oi], cart)
    writes = []

    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        return_value={
            "remaining_qty": 0.0,
            "required_qty": 8.0,
            "picked_qty": 0.0,
            "declarable_qty": 0.0,
            "missing_qty_line": 8.0,
        },
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=lambda *a, **k: writes.append(k),
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_is_replaced_line",
        return_value=False,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_skip_bundle_commercial_header_for_ops",
        return_value=False,
    ):
        out = report_wms_picking_bulk_product_shortage(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            order_type="all",
            product_id=pid,
            cart_id=9,
            items=[{"order_item_id": 10050, "missing_qty": 8.0}],
        )
    assert out["already_resolved"] is True
    assert out["lines"][0]["already_resolved"] is True
    assert writes == []


def test_case7_cross_product_reject():
    oi = _oi(oid=11, order_id=1, product_id=99, qty=1.0)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _, _ = _mock_db_for_lines([oi], cart)
    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_is_replaced_line",
        return_value=False,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_skip_bundle_commercial_header_for_ops",
        return_value=False,
    ):
        with pytest.raises(BulkShortageError) as ctx:
            report_wms_picking_bulk_product_shortage(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=1,
                order_type="all",
                product_id=50,
                cart_id=9,
                items=[{"order_item_id": 11, "missing_qty": 1.0}],
            )
    assert ctx.value.code == "SHORTAGE_BULK_INVALID_ALLOCATION"


def test_case8_cross_cart_reject():
    oi = _oi(oid=11, order_id=1, product_id=50, qty=1.0)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _, _ = _mock_db_for_lines(
        [oi],
        cart,
        orders=[_order(oid=1, cart_id=99)],  # other cart
    )
    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_is_replaced_line",
        return_value=False,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_skip_bundle_commercial_header_for_ops",
        return_value=False,
    ):
        with pytest.raises(BulkShortageError) as ctx:
            report_wms_picking_bulk_product_shortage(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=1,
                order_type="all",
                product_id=50,
                cart_id=9,
                items=[{"order_item_id": 11, "missing_qty": 1.0}],
            )
    assert ctx.value.code == "SHORTAGE_ALLOCATION_NOT_IN_CART"


def test_case9_retry_no_double_shortage():
    pid = 50
    oi = _oi(oid=502, order_id=1235, product_id=pid, qty=1.0, missing=1.0)
    cart = SimpleNamespace(id=2, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _, _ = _mock_db_for_lines([oi], cart)
    writes = []
    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        return_value={
            "remaining_qty": 0.0,
            "required_qty": 1.0,
            "picked_qty": 0.0,
            "declarable_qty": 0.0,
            "missing_qty_line": 1.0,
        },
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=lambda *a, **k: writes.append(k),
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_is_replaced_line",
        return_value=False,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_skip_bundle_commercial_header_for_ops",
        return_value=False,
    ):
        out = report_wms_picking_bulk_product_shortage(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=7,
            order_type="all",
            product_id=pid,
            cart_id=2,
            items=[{"order_item_id": 502, "missing_qty": 1.0}],
        )
    assert out["already_resolved"] is True
    assert writes == []


def test_lock_query_never_uses_joinedload_with_for_update():
    """Regression: joinedload+with_for_update → Postgres ProgrammingError → HTTP 500."""
    pid = 50
    oi = _oi(oid=11, order_id=1, product_id=pid, qty=1.0)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _, _ = _mock_db_for_lines([oi], cart)
    options_calls = []

    real_query = db.query.side_effect

    def tracking_query(model):
        q = real_query(model)
        orig_options = q.options

        def opts(*a, **k):
            options_calls.append(a)
            return orig_options(*a, **k)

        q.options.side_effect = opts
        return q

    db.query.side_effect = tracking_query

    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        side_effect=_qty_side({11: 1.0}),
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        return_value={
            "ok": True,
            "already_resolved": False,
            "orders_updated": 1,
            "order_ids": [1],
            "order_issue_task_ids": [],
            "allow_continue_other_lines_after_shortage": True,
        },
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_is_replaced_line",
        return_value=False,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.order_item_skip_bundle_commercial_header_for_ops",
        return_value=False,
    ):
        report_wms_picking_bulk_product_shortage(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            order_type="all",
            product_id=pid,
            cart_id=9,
            items=[{"order_item_id": 11, "missing_qty": 1.0}],
        )
    # Lock path must not call .options(joinedload(...))
    assert options_calls == []


def test_rejects_non_baskets_cart():
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type="BULK")
    db = MagicMock()
    q = MagicMock()
    q.filter.return_value = q
    q.first.return_value = cart
    db.query.return_value = q
    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=False,
    ):
        with pytest.raises(BulkShortageError) as ctx:
            report_wms_picking_bulk_product_shortage(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=1,
                order_type="all",
                product_id=50,
                cart_id=9,
                items=[{"order_item_id": 1, "missing_qty": 1}],
            )
    assert ctx.value.code == "SHORTAGE_BULK_INVALID_ALLOCATION"
