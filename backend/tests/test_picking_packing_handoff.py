"""
Pick→pack handoff provenance + scoped packing (CASE 1–12, unit).

  python -m pytest backend/tests/test_picking_packing_handoff.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch, call

from backend.services.picking_handoff_service import (
    HANDOFF_BASKET,
    HANDOFF_CART,
    HANDOFF_CARTLESS,
    apply_cart_picking_handoff,
    apply_cartless_picking_handoff,
    handoff_mode_for_cart_order,
    normalize_handoff_mode,
    packing_ui_mode_for_handoff,
    set_picking_handoff_mode,
)
from backend.services.wms_packing_service import PackingScanError


class TestHandoffModeHelpers(unittest.TestCase):
    def test_cart_vs_basket_from_execution(self):
        bulk = SimpleNamespace(type=SimpleNamespace(value="BULK"))
        multi = SimpleNamespace(type=SimpleNamespace(value="MULTI"))
        o_cart = SimpleNamespace(basket_id=None)
        o_basket = SimpleNamespace(basket_id=5)
        self.assertEqual(handoff_mode_for_cart_order(o_cart, bulk), HANDOFF_CART)
        self.assertEqual(handoff_mode_for_cart_order(o_cart, multi), HANDOFF_BASKET)
        self.assertEqual(handoff_mode_for_cart_order(o_basket, bulk), HANDOFF_BASKET)

    def test_immutable_no_overwrite(self):
        o = SimpleNamespace(picking_handoff_mode=HANDOFF_CART)
        set_picking_handoff_mode(o, HANDOFF_CARTLESS)
        self.assertEqual(o.picking_handoff_mode, HANDOFF_CART)

    def test_case7_config_drift_ui_mode_from_handoff_not_config(self):
        mode, cid = packing_ui_mode_for_handoff(HANDOFF_CART, 42)
        self.assertEqual(mode, "bulk")
        self.assertEqual(cid, 42)
        mode2, _ = packing_ui_mode_for_handoff(HANDOFF_CARTLESS, None)
        self.assertEqual(mode2, "no_cart")


class TestScopedResolveEan(unittest.TestCase):
    def test_case1_cross_cart_no_leak(self):
        from backend.services import wms_packing_service as svc

        db = MagicMock()
        fake = SimpleNamespace(detail=SimpleNamespace(order_id=101, packed_quantity=1))
        with (
            patch.object(svc, "find_first_packing_order_id_for_ean", return_value=101) as find,
            patch.object(svc, "packing_scan_increment", return_value=fake) as scan,
        ):
            out = svc.packing_resolve_and_scan_ean(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=5,
                mode="bulk",
                cart_id=2,
                ean_raw="EAN-X",
                handoff_scope="CART",
            )
        find.assert_called_once()
        self.assertEqual(find.call_args.kwargs["cart_id"], 2)
        self.assertEqual(find.call_args.kwargs["mode"], "bulk")
        self.assertEqual(out.detail.order_id, 101)
        scan.assert_called_once()

    def test_scope_required_without_cart_for_cart(self):
        from backend.services import wms_packing_service as svc

        db = MagicMock()
        with self.assertRaises(PackingScanError) as ctx:
            svc.packing_resolve_and_scan_ean(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=5,
                mode="bulk",
                cart_id=None,
                ean_raw="EAN-X",
                handoff_scope="CART",
            )
        self.assertEqual(ctx.exception.code, "SCOPE_REQUIRED")

    def test_case5_cartless_fifo_scope(self):
        from backend.services import wms_packing_service as svc

        db = MagicMock()
        fake = SimpleNamespace(detail=SimpleNamespace(order_id=300))
        with (
            patch.object(svc, "find_first_packing_order_id_for_ean", return_value=300) as find,
            patch.object(svc, "packing_scan_increment", return_value=fake),
        ):
            svc.packing_resolve_and_scan_ean(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=5,
                mode="no_cart",
                cart_id=None,
                ean_raw="EAN-X",
                handoff_scope="CARTLESS",
            )
        self.assertEqual(find.call_args.kwargs["mode"], "no_cart")
        self.assertIsNone(find.call_args.kwargs["cart_id"])

    def test_basket_scope_requires_order_id(self):
        from backend.services import wms_packing_service as svc

        db = MagicMock()
        with self.assertRaises(PackingScanError) as ctx:
            svc.packing_resolve_and_scan_ean(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=5,
                mode="baskets",
                cart_id=None,
                ean_raw="EAN-X",
                handoff_scope="BASKET",
                order_id=None,
            )
        self.assertEqual(ctx.exception.code, "SCOPE_REQUIRED")

    def test_case8_resolve_calls_increment_once(self):
        from backend.services import wms_packing_service as svc

        db = MagicMock()
        fake = SimpleNamespace(detail=SimpleNamespace(order_id=1))
        with (
            patch.object(svc, "find_first_packing_order_id_for_ean", return_value=1),
            patch.object(svc, "packing_scan_increment", return_value=fake) as scan,
        ):
            svc.packing_resolve_and_scan_ean(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=5,
                mode="no_cart",
                cart_id=None,
                ean_raw="EAN",
                handoff_scope="CARTLESS",
            )
        self.assertEqual(scan.call_count, 1)


class TestBasketFirstResolve(unittest.TestCase):
    def test_case2_warehouse_global_exact_order(self):
        from backend.services import wms_packing_service as svc
        from backend.models.enums import CartType

        basket = SimpleNamespace(
            id=10,
            order_id=200,
            cart_id=9,
            barcode="S-1-1",
            name=None,
            row=1,
            column=1,
            cart=SimpleNamespace(type=CartType.MULTI),
        )
        order = SimpleNamespace(
            id=200,
            basket_id=10,
            picking_handoff_mode=HANDOFF_BASKET,
            tenant_id=1,
            warehouse_id=1,
        )
        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.join.return_value = q
        q.options.return_value = q
        q.filter.return_value = q
        q.all.return_value = [basket]
        q.first.side_effect = [order, None]

        with (
            patch.object(svc, "_basket_scan_matches", return_value=True),
            patch.object(
                svc,
                "get_packing_order_detail_for_queue",
                return_value=SimpleNamespace(order_id=200),
            ),
            patch.object(svc, "_cart_basket_display_code", return_value="S-1-1"),
        ):
            out = svc.resolve_packing_order_for_basket_scan(
                db,
                tenant_id=1,
                warehouse_id=1,
                cart_id=None,
                basket_scan="S-1-1",
                status_id=5,
                mode="baskets",
            )
        self.assertEqual(out.order_id, 200)

    def test_case4_ambiguous_never_first(self):
        from backend.services import wms_packing_service as svc
        from backend.models.enums import CartType

        b1 = SimpleNamespace(id=1, order_id=1, cart_id=1, barcode=None, name=None, row=1, column=1, cart=None)
        b2 = SimpleNamespace(id=2, order_id=2, cart_id=2, barcode=None, name=None, row=1, column=1, cart=None)
        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.join.return_value = q
        q.options.return_value = q
        q.filter.return_value = q
        q.all.return_value = [b1, b2]

        with patch.object(svc, "_basket_scan_matches", return_value=True):
            with self.assertRaises(PackingScanError) as ctx:
                svc.resolve_packing_order_for_basket_scan(
                    db,
                    tenant_id=1,
                    warehouse_id=1,
                    cart_id=None,
                    basket_scan="S-1-1",
                    status_id=5,
                    mode="baskets",
                )
        self.assertEqual(ctx.exception.code, "AMBIGUOUS_BASKET_CODE")

    def test_case3_empty_basket_no_mutation(self):
        from backend.services import wms_packing_service as svc

        basket = SimpleNamespace(
            id=10, order_id=None, cart_id=9, barcode="X", name=None, row=1, column=1, cart=None
        )
        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.join.return_value = q
        q.options.return_value = q
        q.filter.return_value = q
        q.all.return_value = [basket]
        q.first.return_value = None

        with patch.object(svc, "_basket_scan_matches", return_value=True):
            with self.assertRaises(PackingScanError) as ctx:
                svc.resolve_packing_order_for_basket_scan(
                    db,
                    tenant_id=1,
                    warehouse_id=1,
                    cart_id=None,
                    basket_scan="X",
                    status_id=5,
                    mode="baskets",
                )
        self.assertEqual(ctx.exception.code, "BASKET_EMPTY")


class TestCartlessNotBareNull(unittest.TestCase):
    def test_case6_detached_null_not_cartless_marker(self):
        o = SimpleNamespace(picking_handoff_mode=None, cart_id=None)
        self.assertIsNone(normalize_handoff_mode(o.picking_handoff_mode))
        apply_cartless_picking_handoff(SimpleNamespace(picking_handoff_mode=None))
        # apply sets on new object
        o2 = SimpleNamespace(picking_handoff_mode=None)
        apply_cartless_picking_handoff(o2)
        self.assertEqual(o2.picking_handoff_mode, HANDOFF_CARTLESS)

    def test_apply_cart_sets_cart(self):
        o = SimpleNamespace(picking_handoff_mode=None, basket_id=None)
        cart = SimpleNamespace(type=SimpleNamespace(value="BULK"))
        apply_cart_picking_handoff(o, cart)
        self.assertEqual(o.picking_handoff_mode, HANDOFF_CART)


class TestPackingModeDistribution(unittest.TestCase):
    def test_counts_from_handoff_not_triplicated_total(self):
        from backend.services import wms_packing_service as svc

        db = MagicMock()
        # count queries return different values
        counts = iter([3, 7, 2])

        def _scalar():
            return next(counts)

        q = MagicMock()
        db.query.return_value = q
        q.filter.return_value = q
        q.scalar.side_effect = _scalar

        with (
            patch.object(svc, "_packing_queue_status_ids", return_value=[5]),
            patch(
                "backend.services.wms_queue_eligibility.wms_queue_fulfillment_mode_clauses",
                return_value=[],
            ),
            patch(
                "backend.services.wms_queue_eligibility.wms_queue_consolidation_phase_clauses",
                return_value=[],
            ),
            patch(
                "backend.services.wms_queue_eligibility.wms_queue_consolidation_plan_clauses",
                return_value=[],
            ),
            patch(
                "backend.services.wms_queue_eligibility.wms_queue_consolidation_packing_clauses",
                return_value=[],
            ),
            patch(
                "backend.services.picking_handoff_service.reconcile_picking_handoff_modes",
                return_value={},
            ),
        ):
            no_cart, bulk, baskets = svc.packing_mode_distribution(
                db, tenant_id=1, warehouse_id=1, status_id=5
            )
        self.assertEqual((no_cart, bulk, baskets), (3, 7, 2))
        self.assertNotEqual(no_cart, bulk)


if __name__ == "__main__":
    unittest.main()
