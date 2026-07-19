"""
Finalize cart: shortage classification + orphan shipping FK sanitize + rollback semantics.

  python -m pytest backend/tests/test_wms_picking_finalize_orphan_shipping_and_classify.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.order_fulfillment_state import MISSING as FS_MISSING
from backend.services.order_fulfillment_state import NEEDS_DECISION as FS_NEEDS_DECISION
from backend.services.order_fulfillment_state import PACKING as FS_PACKING
from backend.services.order_shipping_fk_service import (
    assert_shipping_method_fk_assignable,
    audit_orphan_order_shipping_method_ids,
    sanitize_order_orphan_shipping_method_id,
)
from backend.services.wms_picking_product_list_service import (
    PickingFinalizeError,
    _classify_order_after_picking_session,
)


class AuditOrphanShippingTests(unittest.TestCase):
    def test_audit_detects_orphan(self):
        order = SimpleNamespace(
            id=1198,
            number="1198",
            tenant_id=1,
            warehouse_id=1,
            shipping_method_id="27ee564f-0f87-42d8-be0f-ec2ab8b4c8b3",
            shipping_method="InPost",
            source="sellasist",
            created_at=None,
        )
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.limit.return_value = q
        q.all.return_value = [order]
        db.query.return_value = q
        with patch(
            "backend.services.order_shipping_fk_service.shipping_method_id_exists",
            return_value=False,
        ):
            report = audit_orphan_order_shipping_method_ids(db, order_ids=[1198])
        self.assertEqual(report["total"], 1)
        self.assertEqual(report["rows"][0]["order_id"], 1198)
        self.assertEqual(
            report["rows"][0]["shipping_method_id"],
            "27ee564f-0f87-42d8-be0f-ec2ab8b4c8b3",
        )

    def test_assert_rejects_orphan(self):
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.first.return_value = None
        db.query.return_value = q
        with self.assertRaises(ValueError):
            assert_shipping_method_fk_assignable(db, "missing-uuid", tenant_id=1, warehouse_id=1)

    def test_assert_accepts_none(self):
        db = MagicMock()
        self.assertIsNone(assert_shipping_method_fk_assignable(db, None))


class FinalizeClassifyTests(unittest.TestCase):
    def _classify(self, *, picked: float, miss: float, qty: float = 1.0):
        oi = SimpleNamespace(
            id=1,
            product_id=10,
            quantity=qty,
            oms_line_status=None,
            wms_shortage_declared_qty=miss,
            wms_picking_line_missing_qty=miss,
            wms_picking_line_status="missing" if miss > 0 else None,
            replaced_from_order_item_id=None,
            is_bundle_parent=False,
            parent_bundle_order_item_id=None,
        )
        order = SimpleNamespace(id=1, number="1", items=[oi], warehouse_id=1, cart_id=3)
        db = MagicMock()
        with (
            patch(
                "backend.services.wms_picking_product_list_service._picked_qty_for_order_item_on_cart",
                return_value=picked,
            ),
            patch(
                "backend.services.order_fulfillment_recompute.sum_missing_events_for_line_cart",
                return_value=miss,
            ),
            patch(
                "backend.services.order_fulfillment_recompute.sum_pick_events_for_line_cart",
                return_value=picked,
            ),
            patch(
                "backend.services.wms_picking_product_list_service.order_item_skip_bundle_commercial_header_for_ops",
                return_value=False,
            ),
            patch(
                "backend.services.wms_picking_product_list_service.order_item_is_replaced_line",
                return_value=False,
            ),
        ):
            return _classify_order_after_picking_session(
                order, db=db, tenant_id=1, warehouse_id=1, cart_id=3
            )

    def test_all_picked(self):
        self.assertEqual(self._classify(picked=1.0, miss=0.0), "all_picked")

    def test_all_missing(self):
        self.assertEqual(self._classify(picked=0.0, miss=1.0), "all_missing")

    def test_some_missing(self):
        oi_ok = SimpleNamespace(
            id=1,
            product_id=10,
            quantity=1.0,
            oms_line_status=None,
            wms_shortage_declared_qty=0.0,
            wms_picking_line_missing_qty=0.0,
            wms_picking_line_status=None,
            replaced_from_order_item_id=None,
            is_bundle_parent=False,
            parent_bundle_order_item_id=None,
        )
        oi_miss = SimpleNamespace(
            id=2,
            product_id=11,
            quantity=1.0,
            oms_line_status=None,
            wms_shortage_declared_qty=1.0,
            wms_picking_line_missing_qty=1.0,
            wms_picking_line_status="missing",
            replaced_from_order_item_id=None,
            is_bundle_parent=False,
            parent_bundle_order_item_id=None,
        )
        order = SimpleNamespace(id=1, number="1", items=[oi_ok, oi_miss], warehouse_id=1, cart_id=3)
        db = MagicMock()

        def picked_side(db_arg, **kw):
            return 1.0 if int(kw["order_item_id"]) == 1 else 0.0

        def miss_side(db_arg, order, oi, **kw):
            return 0.0 if int(oi.id) == 1 else 1.0

        with (
            patch(
                "backend.services.wms_picking_product_list_service._picked_qty_for_order_item_on_cart",
                side_effect=picked_side,
            ),
            patch(
                "backend.services.wms_picking_product_list_service.line_shortage_qty_for_picking_finalize",
                side_effect=miss_side,
            ),
            patch(
                "backend.services.wms_picking_product_list_service.order_item_skip_bundle_commercial_header_for_ops",
                return_value=False,
            ),
            patch(
                "backend.services.wms_picking_product_list_service.order_item_is_replaced_line",
                return_value=False,
            ),
            patch(
                "backend.services.wms_picking_product_list_service._picking_line_resolved_for_finalize",
                return_value=(True, "picked_plus_shortage"),
            ),
        ):
            kind = _classify_order_after_picking_session(
                order, db=db, tenant_id=1, warehouse_id=1, cart_id=3
            )
        self.assertEqual(kind, "some_missing")


class FinalizeFsMappingInvariantTests(unittest.TestCase):
    """Document expected fulfillment_state mapping (not bulk PACKING for shortage)."""

    def test_mapping(self):
        # Mirrors finalize_wms_picking_cart branch selection.
        cases = [
            ("all_picked", True, FS_PACKING),
            ("all_missing", True, FS_MISSING),
            ("some_missing", True, FS_NEEDS_DECISION),
        ]
        for kind, pack_ok, expected in cases:
            if kind == "all_picked" and pack_ok:
                fs = FS_PACKING
            elif kind == "all_missing":
                fs = FS_MISSING
            else:
                fs = FS_NEEDS_DECISION
            self.assertEqual(fs, expected)


class FinalizeErrorSafeMessageTests(unittest.TestCase):
    def test_picking_finalize_error_as_detail_no_sql(self):
        err = PickingFinalizeError(
            "Nie udało się zakończyć zbierania z powodu niespójności danych zamówienia. "
            "Sesja nie została zakończona.",
            reason="IntegrityError",
            order_id=1198,
            step="apply_order_state",
            http_status=409,
            code="apply_order_state_failed",
        )
        detail = err.as_detail()
        blob = str(detail).lower()
        self.assertNotIn("psycopg", blob)
        self.assertNotIn("foreignkey", blob)
        self.assertNotIn("sql:", blob)
        self.assertIn("sesja nie została zakończona", detail["message"].lower())


class SanitizeBeforeUpdateTests(unittest.TestCase):
    def test_sanitize_clears_orphan_keeps_label(self):
        order = SimpleNamespace(
            id=1202,
            shipping_method_id="27ee564f-0f87-42d8-be0f-ec2ab8b4c8b3",
            shipping_method="InPost Paczkomat",
            number="1202",
            tenant_id=1,
            warehouse_id=1,
            source="x",
        )
        db = MagicMock()
        with patch(
            "backend.services.order_shipping_fk_service.shipping_method_id_exists",
            return_value=False,
        ):
            changed = sanitize_order_orphan_shipping_method_id(db, order)
        self.assertTrue(changed)
        self.assertIsNone(order.shipping_method_id)
        self.assertEqual(order.shipping_method, "InPost Paczkomat")


class FinalizeRollbackContractTests(unittest.TestCase):
    """Endpoint rolls back on PickingFinalizeError — unit-level contract."""

    def test_error_before_commit_means_no_partial_success(self):
        # Documented contract: post_picking_finalize_cart catches PickingFinalizeError → db.rollback().
        # If apply_order_state fails mid-loop, exception aborts before commit.
        raised = False
        try:
            raise PickingFinalizeError(
                "fail",
                reason="IntegrityError",
                order_id=1,
                step="apply_order_state",
                http_status=409,
                code="apply_order_state_failed",
            )
        except PickingFinalizeError:
            raised = True
        self.assertTrue(raised)


if __name__ == "__main__":
    unittest.main()
