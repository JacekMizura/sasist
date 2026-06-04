"""
Walidacja domknięcia linii przy finalize wózka (shortage workflow).

  python -m pytest backend/tests/test_wms_picking_finalize_line_resolution.py -q
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.order_fulfillment_recompute import (
    line_closed_for_picking_finalize,
    line_shortage_qty_for_picking_finalize,
)
from backend.services.wms_picking_product_list_service import (
    _classify_order_after_picking_session,
    _picking_line_resolved_for_finalize,
)


def _oi(**kwargs):
    defaults = {
        "id": 1,
        "product_id": 197,
        "quantity": 1.0,
        "oms_line_status": None,
        "wms_picking_line_missing_qty": 0.0,
        "wms_shortage_declared_qty": 0.0,
        "wms_picking_line_status": None,
        "replaced_from_order_item_id": None,
        "is_bundle_parent": False,
        "oms_removed_qty": 0.0,
        "oms_replaced_qty": 0.0,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _order(items):
    return SimpleNamespace(id=1201, number="1201", warehouse_id=1, items=items, cart_id=None)


class TestLineClosedForPickingFinalize:
    """picked + shortage >= required (brak bez rozwiązania OMS)."""

    def _run(self, *, required, picked, shortage, **oi_kw):
        oi = _oi(quantity=float(required), wms_shortage_declared_qty=float(shortage), **oi_kw)
        order = _order([oi])
        db = MagicMock()
        with patch(
            "backend.services.order_fulfillment_recompute.sum_pick_events_for_line_cart",
            return_value=float(picked),
        ), patch(
            "backend.services.order_fulfillment_recompute.sum_missing_events_for_line_cart",
            return_value=float(shortage),
        ):
            return line_closed_for_picking_finalize(db, order, oi, session_cart_id=9)

    def test_case1_picked0_shortage1_required1(self):
        assert self._run(required=1, picked=0, shortage=1) is True

    def test_case2_picked1_shortage1_required2(self):
        assert self._run(required=2, picked=1, shortage=1) is True

    def test_case3_picked1_shortage0_required2_fail(self):
        assert self._run(required=2, picked=1, shortage=0) is False

    def test_case4_picked0_shortage2_required2(self):
        assert self._run(required=2, picked=0, shortage=2) is True

    def test_waiting_oms_does_not_block_when_shortage_declared(self):
        oi = _oi(
            quantity=1.0,
            wms_shortage_declared_qty=1.0,
            wms_picking_line_status="missing",
            metadata_json='{"oms_waiting_for_stock": true}',
        )
        order = _order([oi])
        db = MagicMock()
        with patch(
            "backend.services.order_fulfillment_recompute.sum_pick_events_for_line_cart",
            return_value=0.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.sum_missing_events_for_line_cart",
            return_value=1.0,
        ):
            assert line_shortage_qty_for_picking_finalize(db, order, oi, session_cart_id=9, picked=0.0) >= 1.0
            assert line_closed_for_picking_finalize(db, order, oi, session_cart_id=9) is True


class TestPickingLineResolvedForFinalize:
    def test_replaced_archive_skipped(self):
        oi = _oi(oms_line_status="REPLACED", quantity=1.0)
        order = _order([oi])
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_product_list_service._picked_qty_for_order_item_on_cart",
            return_value=0.0,
        ):
            ok, reason = _picking_line_resolved_for_finalize(
                db, order, oi, tenant_id=1, warehouse_id=1, cart_id=9
            )
        assert ok is True
        assert reason == "replaced_archive_skip"

    def test_picked_plus_shortage_closes_line(self):
        oi = _oi(quantity=1.0, wms_shortage_declared_qty=1.0, wms_picking_line_status="missing")
        order = _order([oi])
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_product_list_service._picked_qty_for_order_item_on_cart",
            return_value=0.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.sum_missing_events_for_line_cart",
            return_value=1.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.sum_pick_events_for_line_cart",
            return_value=0.0,
        ):
            ok, reason = _picking_line_resolved_for_finalize(
                db, order, oi, tenant_id=1, warehouse_id=1, cart_id=9
            )
        assert ok is True
        assert reason == "picked_plus_shortage"

    def test_classify_some_missing_with_shortage(self):
        oi = _oi(quantity=1.0, wms_shortage_declared_qty=1.0, wms_picking_line_status="missing")
        order = _order([oi])
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_product_list_service._picked_qty_for_order_item_on_cart",
            return_value=0.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.sum_missing_events_for_line_cart",
            return_value=1.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.sum_pick_events_for_line_cart",
            return_value=0.0,
        ):
            kind = _classify_order_after_picking_session(
                order, db=db, tenant_id=1, warehouse_id=1, cart_id=9
            )
        assert kind == "all_missing"
