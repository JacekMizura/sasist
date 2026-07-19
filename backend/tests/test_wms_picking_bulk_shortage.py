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


def _mock_db_for_lines(ois: list, cart):
    by_id = {int(o.id): o for o in ois}
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
                # After .filter(OrderItem.id.in_(...)).with_for_update().all()
                return q

            q.filter.side_effect = _filter
            # Direct first() for single-line SSOT path uses separate query — handled by patches
        elif model is Cart:
            q.first.return_value = cart
        elif model is Order:
            q.all.return_value = []
            q.first.return_value = None
        else:
            q.first.return_value = None
            q.all.return_value = []
        return q

    db.query.side_effect = query_side
    return db, by_id


def test_case1_select_all_assigns_per_order_item():
    """10 unresolved → each shortage on correct order_item."""
    pid = 50
    ois = [_oi(oid=100 + i, order_id=1000 + i, product_id=pid, qty=float(i + 1)) for i in range(10)]
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _ = _mock_db_for_lines(ois, cart)
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
            "order_ids": [oiid // 1],  # noop
            "order_issue_task_ids": [],
            "allow_continue_other_lines_after_shortage": True,
        }

    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        side_effect=lambda db, oi, cid: {
            "remaining_qty": float(oi.quantity) - float(oi.wms_picking_line_missing_qty or 0),
            "required_qty": float(oi.quantity),
            "picked_qty": 0.0,
            "declarable_qty": float(oi.quantity),
            "missing_qty_line": 0.0,
        },
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=fake_report,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
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


def test_case2_mix_full_partial_unselected():
    pid = 50
    oi_a = _oi(oid=11, order_id=1, product_id=pid, qty=1.0)
    oi_b = _oi(oid=12, order_id=2, product_id=pid, qty=8.0)
    oi_c = _oi(oid=13, order_id=3, product_id=pid, qty=5.0)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _ = _mock_db_for_lines([oi_a, oi_b], cart)  # only selected locked
    applied: list[tuple[int, float]] = []

    def fake_report(db, **kw):
        applied.append((int(kw["order_item_id"]), float(kw["missing_qty"])))
        return {
            "ok": True,
            "already_resolved": False,
            "orders_updated": 1,
            "order_ids": [int(kw["order_item_id"])],
            "order_issue_task_ids": [],
            "allow_continue_other_lines_after_shortage": True,
        }

    rem = {11: 1.0, 12: 8.0, 13: 5.0}

    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        side_effect=lambda db, oi, cid: {
            "remaining_qty": rem[int(oi.id)],
            "required_qty": float(oi.quantity),
            "picked_qty": 0.0,
            "declarable_qty": rem[int(oi.id)],
            "missing_qty_line": 0.0,
        },
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=fake_report,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ):
        out = report_wms_picking_bulk_product_shortage(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            order_type="all",
            product_id=pid,
            cart_id=9,
            items=[
                {"order_item_id": 11, "missing_qty": 1.0},
                {"order_item_id": 12, "missing_qty": 4.0},
            ],
        )

    assert applied == [(11, 1.0), (12, 4.0)]
    assert 13 not in [a[0] for a in applied]
    assert out["total_shortage_qty"] == 5.0
    _ = oi_c


def test_case3_20_qty_scenario_bulk():
    pid = 50
    oi4 = _oi(oid=10040, order_id=1004, product_id=pid, qty=8.0)
    oi5 = _oi(oid=10050, order_id=1005, product_id=pid, qty=8.0)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _ = _mock_db_for_lines([oi4, oi5], cart)
    rem = {10040: 4.0, 10050: 8.0}
    applied: list[tuple[int, float]] = []

    def fake_report(db, **kw):
        applied.append((int(kw["order_item_id"]), float(kw["missing_qty"])))
        return {
            "ok": True,
            "already_resolved": False,
            "orders_updated": 1,
            "order_ids": [int(kw.get("order_item_id"))],
            "order_issue_task_ids": [],
            "allow_continue_other_lines_after_shortage": True,
        }

    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        side_effect=lambda db, oi, cid: {
            "remaining_qty": rem[int(oi.id)],
            "required_qty": float(oi.quantity),
            "picked_qty": 8.0 - rem[int(oi.id)],
            "declarable_qty": rem[int(oi.id)],
            "missing_qty_line": 0.0,
        },
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=fake_report,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ):
        out = report_wms_picking_bulk_product_shortage(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            order_type="all",
            product_id=pid,
            cart_id=9,
            items=[
                {"order_item_id": 10040, "missing_qty": 4.0},
                {"order_item_id": 10050, "missing_qty": 8.0},
            ],
        )

    assert applied == [(10040, 4.0), (10050, 8.0)]
    assert out["total_shortage_qty"] == 12.0


def test_case4_stale_rolls_back_before_any_write():
    pid = 50
    oi4 = _oi(oid=10040, order_id=1004, product_id=pid, qty=8.0)
    oi5 = _oi(oid=10050, order_id=1005, product_id=pid, qty=8.0)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _ = _mock_db_for_lines([oi4, oi5], cart)
    rem = {10040: 4.0, 10050: 4.0}  # live #5 only 4 left
    calls = []

    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        side_effect=lambda db, oi, cid: {
            "remaining_qty": rem[int(oi.id)],
            "required_qty": 8.0,
            "picked_qty": 0.0,
            "declarable_qty": rem[int(oi.id)],
            "missing_qty_line": 0.0,
        },
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=lambda *a, **k: calls.append(k) or {"ok": True, "order_ids": [], "already_resolved": False},
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
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
                items=[
                    {"order_item_id": 10040, "missing_qty": 4.0},
                    {"order_item_id": 10050, "missing_qty": 8.0},
                ],
            )
    assert ctx.value.code == "SHORTAGE_STALE"
    assert ctx.value.order_item_id == 10050
    assert calls == []  # nothing written


def test_case5_retry_already_resolved_noop():
    pid = 50
    oi = _oi(oid=10050, order_id=1005, product_id=pid, qty=8.0, missing=8.0)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _ = _mock_db_for_lines([oi], cart)
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
        side_effect=lambda *a, **k: writes.append(k) or {
            "ok": True,
            "already_resolved": True,
            "orders_updated": 0,
            "order_ids": [1005],
            "order_issue_task_ids": [],
            "allow_continue_other_lines_after_shortage": True,
        },
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
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
    assert writes == []  # no second FE_MISSING


def test_case7_no_cross_allocation():
    """Bulk of one line never mentions another order_item."""
    pid = 50
    oi4 = _oi(oid=10040, order_id=1004, product_id=pid, qty=8.0)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _ = _mock_db_for_lines([oi4], cart)
    seen = []

    def fake_report(db, **kw):
        seen.append(int(kw["order_item_id"]))
        assert int(kw["order_item_id"]) == 10040
        return {
            "ok": True,
            "already_resolved": False,
            "orders_updated": 1,
            "order_ids": [1004],
            "order_issue_task_ids": [],
            "allow_continue_other_lines_after_shortage": True,
        }

    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        return_value={
            "remaining_qty": 4.0,
            "required_qty": 8.0,
            "picked_qty": 4.0,
            "declarable_qty": 4.0,
            "missing_qty_line": 0.0,
        },
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=fake_report,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ):
        report_wms_picking_bulk_product_shortage(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            order_type="all",
            product_id=pid,
            cart_id=9,
            items=[{"order_item_id": 10040, "missing_qty": 4.0}],
        )
    assert seen == [10040]


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
    assert ctx.value.code == "BULK_NOT_BASKETS_CART"


def test_no_global_sku_fifo_path():
    """Items always carry order_item_id — bulk never calls report without it."""
    pid = 50
    oi = _oi(oid=11, order_id=1, product_id=pid, qty=2.0)
    cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, type=CartType.MULTI)
    db, _ = _mock_db_for_lines([oi], cart)
    kwargs_seen = []

    def fake_report(db, **kw):
        kwargs_seen.append(kw)
        assert kw.get("order_item_id") == 11
        return {
            "ok": True,
            "already_resolved": False,
            "orders_updated": 1,
            "order_ids": [1],
            "order_issue_task_ids": [],
            "allow_continue_other_lines_after_shortage": True,
        }

    with patch(
        "backend.services.wms_picking_shortage.bulk_report_service._line_shortage_report_quantities",
        return_value={
            "remaining_qty": 2.0,
            "required_qty": 2.0,
            "picked_qty": 0.0,
            "declarable_qty": 2.0,
            "missing_qty_line": 0.0,
        },
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.report_wms_picking_product_shortage",
        side_effect=fake_report,
    ), patch(
        "backend.services.wms_picking_shortage.bulk_report_service.cart_is_baskets_mode",
        return_value=True,
    ):
        report_wms_picking_bulk_product_shortage(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            order_type="all",
            product_id=pid,
            cart_id=9,
            items=[{"order_item_id": 11, "missing_qty": 2.0}],
        )
    assert all(k.get("order_item_id") for k in kwargs_seen)
