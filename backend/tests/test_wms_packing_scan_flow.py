"""
Pakowanie WMS — regressje scan/finalize (CASE 1–10, bez DB).

  python -m pytest backend/tests/test_wms_packing_scan_flow.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_packing_service import (
    PackingScanError,
    _is_order_fully_packed_db,
    _packing_finish_validation_snapshot,
    find_first_packing_order_id_for_ean,
    order_item_required_pack_qty,
)


def _line(**kwargs):
    defaults = {
        "id": 1,
        "product_id": 10,
        "quantity": 1,
        "packing_quantity_packed": 0,
        "oms_removed_qty": 0.0,
        "oms_replaced_qty": 0.0,
        "oms_line_status": None,
        "replaced_from_order_item_id": None,
        "parent_bundle_order_item_id": None,
        "metadata_json": None,
        "wms_shortage_declared_qty": 0.0,
        "wms_picking_line_missing_qty": 0.0,
        "is_bundle_parent": False,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _order(**kwargs):
    defaults = {
        "id": 1226,
        "tenant_id": 1,
        "warehouse_id": 1,
        "picking_finished_at": "2026-07-15T12:00:00",
        "items": [],
        "created_at": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _recovery_ok():
    return SimpleNamespace(
        totals=SimpleNamespace(oms_decision_lines=0, recovery_lines=0),
        packing_allowed=True,
        has_recovery_work=False,
        has_relocation_work=False,
    )


class TestPackingCompletenessSsot(unittest.TestCase):
    """CASE 1/2/5 — required>0 i packed=0 ⇒ nie complete / nie FINALIZED."""

    def test_case1_single_item_0_of_1_not_complete(self):
        order = _order(items=[_line(quantity=1, packing_quantity_packed=0)])
        db = MagicMock()
        with (
            patch(
                "backend.services.fulfillment_event_service.line_picked_sum_for_order",
                return_value=1.0,
            ),
            patch(
                "backend.services.wms_packing_service._order_item_operational_missing_qty",
                return_value=0.0,
            ),
            patch(
                "backend.services.recovery_workflow_service.resolve_order_recovery_state",
                return_value=_recovery_ok(),
            ),
            patch(
                "backend.services.recovery_workflow_service.can_order_be_packed",
                return_value=True,
            ),
        ):
            snap = _packing_finish_validation_snapshot(db, order, log=False)
            self.assertEqual(snap["total_required_qty"], 1)
            self.assertFalse(snap["lines_packed_complete"])
            self.assertFalse(snap["packable"])

    def test_case1_after_pack_1_of_1_complete(self):
        order = _order(items=[_line(quantity=1, packing_quantity_packed=1)])
        db = MagicMock()
        with (
            patch(
                "backend.services.fulfillment_event_service.line_picked_sum_for_order",
                return_value=1.0,
            ),
            patch(
                "backend.services.wms_packing_service._order_item_operational_missing_qty",
                return_value=0.0,
            ),
            patch(
                "backend.services.recovery_workflow_service.resolve_order_recovery_state",
                return_value=_recovery_ok(),
            ),
            patch(
                "backend.services.recovery_workflow_service.can_order_be_packed",
                return_value=True,
            ),
        ):
            snap = _packing_finish_validation_snapshot(db, order, log=False)
            self.assertTrue(snap["lines_packed_complete"])
            self.assertTrue(snap["packable"])

    def test_case2_multi_partial_not_finalize(self):
        """A×1 + B×2: po skanie A → 1/3, nie complete."""
        order = _order(
            items=[
                _line(id=1, product_id=1, quantity=1, packing_quantity_packed=1),
                _line(id=2, product_id=2, quantity=2, packing_quantity_packed=0),
            ]
        )
        db = MagicMock()
        with (
            patch(
                "backend.services.fulfillment_event_service.line_picked_sum_for_order",
                side_effect=lambda *_a, **_k: 2.0,
            ),
            patch(
                "backend.services.wms_packing_service._order_item_operational_missing_qty",
                return_value=0.0,
            ),
            patch(
                "backend.services.recovery_workflow_service.resolve_order_recovery_state",
                return_value=_recovery_ok(),
            ),
            patch(
                "backend.services.recovery_workflow_service.can_order_be_packed",
                return_value=True,
            ),
        ):
            snap = _packing_finish_validation_snapshot(db, order, log=False)
            self.assertEqual(snap["total_required_qty"], 3)
            self.assertFalse(snap["lines_packed_complete"])

    def test_case3_multi_full_then_complete(self):
        order = _order(
            items=[
                _line(id=1, product_id=1, quantity=1, packing_quantity_packed=1),
                _line(id=2, product_id=2, quantity=2, packing_quantity_packed=2),
            ]
        )
        db = MagicMock()
        with (
            patch(
                "backend.services.fulfillment_event_service.line_picked_sum_for_order",
                side_effect=lambda *_a, **_k: 2.0,
            ),
            patch(
                "backend.services.wms_packing_service._order_item_operational_missing_qty",
                return_value=0.0,
            ),
            patch(
                "backend.services.recovery_workflow_service.resolve_order_recovery_state",
                return_value=_recovery_ok(),
            ),
            patch(
                "backend.services.recovery_workflow_service.can_order_be_packed",
                return_value=True,
            ),
        ):
            snap = _packing_finish_validation_snapshot(db, order, log=False)
            self.assertTrue(snap["lines_packed_complete"])

    def test_case5_zero_required_not_fake_complete(self):
        """required=0 (substitute bez picków) + qty=1 ⇒ NIE lines_packed_complete."""
        order = _order(
            items=[
                _line(
                    quantity=1,
                    packing_quantity_packed=0,
                    replaced_from_order_item_id=99,
                    oms_line_status="TO_PICK",
                )
            ]
        )
        db = MagicMock()
        with (
            patch(
                "backend.services.fulfillment_event_service.line_picked_sum_for_order",
                return_value=0.0,
            ),
            patch(
                "backend.services.wms_packing_service._order_item_operational_missing_qty",
                return_value=0.0,
            ),
            patch(
                "backend.services.recovery_workflow_service.resolve_order_recovery_state",
                return_value=_recovery_ok(),
            ),
            patch(
                "backend.services.recovery_workflow_service.can_order_be_packed",
                return_value=True,
            ),
        ):
            self.assertEqual(order_item_required_pack_qty(db, order, order.items[0]), 0)
            snap = _packing_finish_validation_snapshot(db, order, log=False)
            self.assertEqual(snap["total_required_qty"], 0)
            self.assertFalse(snap["lines_packed_complete"])


class TestPackingResolveAndScan(unittest.TestCase):
    """CASE 4/7/8 — resolve+scan atomowo; FIFO; brak podwójnego +1."""

    def test_resolve_and_scan_calls_increment_once(self):
        from backend.services import wms_packing_service as svc

        db = MagicMock()
        fake_out = SimpleNamespace(detail=SimpleNamespace(order_id=1226, packed_quantity=1, total_quantity=1))
        with (
            patch.object(svc, "find_first_packing_order_id_for_ean", return_value=1226) as find,
            patch.object(svc, "packing_scan_increment", return_value=fake_out) as scan,
        ):
            out = svc.packing_resolve_and_scan_ean(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=5,
                mode="no_cart",
                cart_id=None,
                ean_raw="5905450181192",
                operator_user_id=7,
            )
        find.assert_called_once()
        scan.assert_called_once()
        self.assertEqual(scan.call_args.kwargs["order_id"], 1226)
        self.assertEqual(scan.call_args.kwargs["ean_raw"], "5905450181192")
        self.assertEqual(out.detail.order_id, 1226)

    def test_resolve_and_scan_product_not_found(self):
        from backend.services import wms_packing_service as svc

        db = MagicMock()
        with patch.object(svc, "find_first_packing_order_id_for_ean", return_value=None):
            with self.assertRaises(PackingScanError) as ctx:
                svc.packing_resolve_and_scan_ean(
                    db,
                    tenant_id=1,
                    warehouse_id=1,
                    status_id=5,
                    mode="no_cart",
                    cart_id=None,
                    ean_raw="000",
                )
            self.assertEqual(ctx.exception.code, "PRODUCT_NOT_FOUND")

    def test_find_first_uses_fifo_order(self):
        """CASE 7 — ten sam EAN: order_by created_at, id (deterministyczny FIFO)."""
        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.options.return_value = q
        q.filter.return_value = q
        q.join.return_value = q
        q.order_by.return_value = q
        q.first.return_value = SimpleNamespace(id=100)

        with (
            patch(
                "backend.services.wms_packing_service.resolve_receiving_scan",
                return_value=SimpleNamespace(found=True, product_id=55),
            ),
            patch(
                "backend.services.wms_packing_service._packing_orders_base_query",
                return_value=q,
            ),
        ):
            oid = find_first_packing_order_id_for_ean(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=5,
                mode="no_cart",
                cart_id=None,
                ean_raw="5905450181192",
            )
        self.assertEqual(oid, 100)
        q.order_by.assert_called()


class TestIsOrderFullyPackedDb(unittest.TestCase):
    def test_delegates_to_snapshot(self):
        db = MagicMock()
        order = _order(items=[_line(packing_quantity_packed=0)])
        db.query.return_value.options.return_value.filter.return_value.first.return_value = order
        with patch(
            "backend.services.wms_packing_service._packing_finish_validation_snapshot",
            return_value={"lines_packed_complete": False},
        ) as snap:
            self.assertFalse(_is_order_fully_packed_db(db, 1226))
            snap.assert_called_once()


if __name__ == "__main__":
    unittest.main()
