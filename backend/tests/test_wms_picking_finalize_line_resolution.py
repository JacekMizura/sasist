"""
Walidacja domknięcia linii przy finalize wózka (shortage workflow).

  python -m pytest backend/tests/test_wms_picking_finalize_line_resolution.py -q
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

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
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _order(items):
    return SimpleNamespace(id=1201, number="1201", items=items)


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

    def test_picked_plus_declared_shortage(self):
        oi = _oi(wms_shortage_declared_qty=1.0, wms_picking_line_status="missing")
        order = _order([oi])
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_product_list_service._picked_qty_for_order_item_on_cart",
            return_value=0.0,
        ), patch(
            "backend.services.wms_picking_product_list_service.compute_line_missing_qty",
            return_value=0.0,
        ):
            ok, reason = _picking_line_resolved_for_finalize(
                db, order, oi, tenant_id=1, warehouse_id=1, cart_id=9
            )
        assert ok is True
        assert reason in ("shortage_declared_workflow", "picked_plus_shortage")

    def test_classify_some_missing_with_shortage(self):
        oi = _oi(wms_shortage_declared_qty=1.0)
        order = _order([oi])
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_product_list_service._picked_qty_for_order_item_on_cart",
            return_value=0.0,
        ), patch(
            "backend.services.wms_picking_product_list_service.compute_line_missing_qty",
            return_value=1.0,
        ), patch(
            "backend.services.wms_picking_product_list_service._effective_shortage_qty_for_finalize",
            return_value=1.0,
        ):
            kind = _classify_order_after_picking_session(
                order, db=db, tenant_id=1, warehouse_id=1, cart_id=9
            )
        assert kind == "all_missing"
