"""
Regresje Walidacji WMS (pre-Capacity).

  python -m pytest backend/tests/test_wms_order_validation.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.schemas.picking_routing import PickingRoutingAllocationShortfall, PickingRoutingResult
from backend.services.wms_order_validation.lifecycle import (
    apply_wms_validation_fail,
    apply_wms_validation_pass_revalidate,
)
from backend.services.wms_order_validation.reasons import (
    REASON_INSUFFICIENT_PICKABLE_STOCK,
    REASON_LOCATION_BLOCKED,
    REASON_MISSING_PICKING_LOCATION,
)
from backend.services.wms_order_validation.service import validate_order_for_picking
from backend.services.wms_order_validation.types import WmsOrderValidationIssue, WmsOrderValidationResult


def _oi(pid: int, qty: float, *, oid: int = 1, ean: str = "5905108775698"):
    return SimpleNamespace(
        id=oid,
        product_id=pid,
        quantity=qty,
        product=SimpleNamespace(id=pid, name=f"P{pid}", ean=ean, sku=f"SKU{pid}", symbol=None),
        replaced_from_order_item_id=None,
        parent_bundle_order_item_id=None,
        oms_line_status=None,
    )


class ValidateOrderForPickingTests(unittest.TestCase):
    def _run(self, *, shortfalls, inv_presence=None, items=None):
        order = SimpleNamespace(
            id=1214,
            tenant_id=1,
            warehouse_id=1,
            items=items or [_oi(10, 1.0)],
            import_metadata_json=None,
            order_ui_status_id=5,
        )
        routing = PickingRoutingResult(pick_list=[], shortfalls=shortfalls, warnings=[])
        db = MagicMock()
        q = MagicMock()
        q.options.return_value = q
        q.filter.return_value = q
        q.all.return_value = [order]
        db.query.return_value = q

        with patch(
            "backend.services.wms_order_validation.service.PickingRoutingService",
            return_value=MagicMock(build_location_pick_list=MagicMock(return_value=routing)),
        ), patch(
            "backend.services.wms_order_validation.service._inventory_presence_by_warehouse_product",
            return_value=inv_presence or {},
        ), patch(
            "backend.services.wms_order_validation.service.order_item_is_replaced_line",
            return_value=False,
        ), patch(
            "backend.services.wms_order_validation.service.order_item_skip_bundle_commercial_header_for_ops",
            return_value=False,
        ):
            return validate_order_for_picking(db, order_id=1214, tenant_id=1, warehouse_id=1)

    def test_a_missing_location_fail(self):
        res = self._run(
            shortfalls=[
                PickingRoutingAllocationShortfall(order_id=1214, product_id=10, requested=1.0, allocated=0.0)
            ],
            inv_presence={},
        )
        self.assertEqual(res.validation_status, "FAIL")
        self.assertEqual(res.issues[0].reason_code, REASON_MISSING_PICKING_LOCATION)

    def test_b_pass_when_no_shortfalls(self):
        res = self._run(shortfalls=[])
        self.assertEqual(res.validation_status, "PASS")
        self.assertEqual(res.issues, [])

    def test_c_multi_location_covered_is_pass(self):
        # routing already aggregated allocatable — no shortfall means A+B cover required
        res = self._run(shortfalls=[])
        self.assertTrue(res.ok)

    def test_d_insufficient_stock(self):
        res = self._run(
            shortfalls=[
                PickingRoutingAllocationShortfall(order_id=1214, product_id=10, requested=5.0, allocated=4.0)
            ],
            inv_presence={(1, 10): 4.0},
        )
        self.assertEqual(res.validation_status, "FAIL")
        self.assertEqual(res.issues[0].reason_code, REASON_INSUFFICIENT_PICKABLE_STOCK)
        self.assertEqual(res.issues[0].allocatable_qty, 4.0)

    def test_e_location_blocked_when_on_hand_but_not_allocatable(self):
        res = self._run(
            shortfalls=[
                PickingRoutingAllocationShortfall(order_id=1214, product_id=10, requested=1.0, allocated=0.0)
            ],
            inv_presence={(1, 10): 99.0},
        )
        self.assertEqual(res.issues[0].reason_code, REASON_LOCATION_BLOCKED)

    def test_f_bundle_component_shortfall_fails_whole_order(self):
        items = [_oi(1, 1.0, oid=1), _oi(2, 2.0, oid=2), _oi(3, 1.0, oid=3, ean="C")]
        res = self._run(
            shortfalls=[
                PickingRoutingAllocationShortfall(order_id=1214, product_id=3, requested=1.0, allocated=0.0)
            ],
            items=items,
        )
        self.assertEqual(res.validation_status, "FAIL")
        self.assertEqual(res.issues[0].product_id, 3)


class ApplyFailStatusTests(unittest.TestCase):
    def test_k_no_config_no_status_change(self):
        order = SimpleNamespace(id=1, order_ui_status_id=10, import_metadata_json=None)
        db = MagicMock()
        result = WmsOrderValidationResult(
            order_id=1,
            validation_status="FAIL",
            issues=[
                WmsOrderValidationIssue(
                    reason_code=REASON_MISSING_PICKING_LOCATION,
                    reason_label="Brak lokalizacji pickingowej",
                    product_id=10,
                    ean="X",
                )
            ],
        )
        with patch(
            "backend.services.wms_order_validation.lifecycle.get_configured_validation_fail_status_id",
            return_value=None,
        ), patch(
            "backend.services.wms_order_validation.lifecycle._emit_validation_failed_activity",
        ) as emit:
            out = apply_wms_validation_fail(
                db,
                order=order,
                result=result,
                tenant_id=1,
                warehouse_id=1,
                operator_user_id=None,
            )
        self.assertTrue(out["config_missing"])
        self.assertFalse(out["status_changed"])
        self.assertEqual(order.order_ui_status_id, 10)
        emit.assert_called_once()

    def test_a_status_change_and_previous_stored(self):
        order = SimpleNamespace(id=7, order_ui_status_id=10, import_metadata_json=None)
        db = MagicMock()
        result = WmsOrderValidationResult(
            order_id=7,
            validation_status="FAIL",
            issues=[
                WmsOrderValidationIssue(
                    reason_code=REASON_MISSING_PICKING_LOCATION,
                    reason_label="Brak lokalizacji pickingowej",
                    product_id=1,
                )
            ],
        )
        with patch(
            "backend.services.wms_order_validation.lifecycle.get_configured_validation_fail_status_id",
            return_value=99,
        ), patch(
            "backend.services.wms_order_validation.lifecycle._emit_validation_failed_activity",
        ):
            out = apply_wms_validation_fail(
                db, order=order, result=result, tenant_id=1, warehouse_id=1
            )
        self.assertTrue(out["status_changed"])
        self.assertEqual(order.order_ui_status_id, 99)
        self.assertIn("wms_validation_previous_ui_status_id", order.import_metadata_json)

    def test_i_revalidate_pass_restores_previous(self):
        import json

        meta = json.dumps({"wms_validation_previous_ui_status_id": 10, "wms_validation_issues": [{"x": 1}]})
        order = SimpleNamespace(id=7, order_ui_status_id=99, import_metadata_json=meta)
        db = MagicMock()
        result = WmsOrderValidationResult(order_id=7, validation_status="PASS", issues=[])
        with patch(
            "backend.services.wms_audit_service.insert_wms_order_event",
        ), patch(
            "backend.services.wms_audit_service.append_order_activity_for_wms",
        ), patch(
            "backend.services.wms_order_validation.lifecycle._status_name",
            return_value="X",
        ):
            out = apply_wms_validation_pass_revalidate(
                db, order=order, result=result, tenant_id=1, warehouse_id=1, operator_user_id=3
            )
        self.assertTrue(out["status_changed"])
        self.assertEqual(order.order_ui_status_id, 10)
        self.assertFalse(out["needs_manual_status"])


class GateFilterTests(unittest.TestCase):
    def test_failed_orders_excluded_from_capacity_candidates(self):
        from backend.services.wms_order_validation.gate import gate_orders_before_capacity

        o_ok = SimpleNamespace(id=1, warehouse_id=1)
        o_bad = SimpleNamespace(id=2, warehouse_id=1)
        db = MagicMock()

        def fake_validate(db, *, order_ids, tenant_id, warehouse_id=None):
            out = []
            for oid in order_ids:
                if oid == 1:
                    out.append(WmsOrderValidationResult(order_id=1, validation_status="PASS", issues=[]))
                else:
                    out.append(
                        WmsOrderValidationResult(
                            order_id=2,
                            validation_status="FAIL",
                            issues=[
                                WmsOrderValidationIssue(
                                    reason_code=REASON_MISSING_PICKING_LOCATION,
                                    reason_label="x",
                                )
                            ],
                        )
                    )
            return out

        with patch(
            "backend.services.wms_order_validation.service.validate_orders_for_picking",
            side_effect=fake_validate,
        ), patch(
            "backend.services.wms_order_validation.gate.apply_wms_validation_fail",
        ) as apply_fail:
            passed = gate_orders_before_capacity(
                db, orders=[o_ok, o_bad], tenant_id=1, warehouse_id=1
            )
        self.assertEqual([o.id for o in passed], [1])
        apply_fail.assert_called_once()


if __name__ == "__main__":
    unittest.main()
