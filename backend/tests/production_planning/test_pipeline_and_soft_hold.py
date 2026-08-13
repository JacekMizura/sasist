"""Pipeline ORDERS vs free-stock + soft-hold formula tests."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.models.production import (
    PRODUCTION_ORDER_SOURCE_MANUAL,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    PRODUCTION_ORDER_SOURCE_PLANNING,
)
from backend.services.production_planning.pipeline_service import (
    free_stock_pipeline_qty_by_product,
    is_free_stock_mo_pipeline,
    is_order_driven_mo_pipeline,
    order_driven_pipeline_qty_by_product,
    pipeline_qty_breakdown_from_batches_and_orders,
)
from backend.services.production_planning.production_recommendation_service import (
    forecast_stock_need,
)
from backend.services.production_planning.stock_replenishment_service import (
    component_soft_hold_qty,
    max_producible_after_orders_hold,
    soft_hold_components_for_orders,
    _SoftHoldState,
)
from backend.services.production_order_trigger.trigger_service import (
    historical_fulfilled_production_qty,
    outstanding_production_need_qty,
)


class TestPipelineSemantics(unittest.TestCase):
    def test_source_type_helpers(self):
        self.assertTrue(is_order_driven_mo_pipeline("ORDERS"))
        self.assertFalse(is_free_stock_mo_pipeline("ORDERS"))
        self.assertTrue(is_free_stock_mo_pipeline("PLANNING"))
        self.assertTrue(is_free_stock_mo_pipeline("MANUAL"))
        self.assertTrue(is_free_stock_mo_pipeline(None))

    def test_orders_pipeline_does_not_cover_free_stock_target(self):
        # daily=5, coverage=2 → target=10; on_hand=0; ORDERS pipeline=10; PLANNING=0
        # free-stock pipeline must be 0 → replenishment need = 10
        free_pipeline = 0.0
        need = forecast_stock_need(
            daily_rate=5,
            coverage_days=2,
            min_stock=None,
            max_stock=None,
            on_hand=0,
            in_pipeline=free_pipeline,
        )
        self.assertEqual(need, 10)

        # Regression: using combined (incl. ORDERS) would wrongly yield 0
        wrong = forecast_stock_need(
            daily_rate=5,
            coverage_days=2,
            min_stock=None,
            max_stock=None,
            on_hand=0,
            in_pipeline=10,
        )
        self.assertEqual(wrong, 0)

    def test_planning_pipeline_covers_free_stock_target(self):
        need = forecast_stock_need(
            daily_rate=5,
            coverage_days=2,
            min_stock=None,
            max_stock=None,
            on_hand=0,
            in_pipeline=6,  # PLANNING free-stock pipeline
        )
        # target 10 − 6 = 4
        self.assertEqual(need, 4)

    def test_breakdown_splits_orders_and_planning(self):
        orders_mo = MagicMock()
        orders_mo.product_id = 100
        orders_mo.planned_quantity = 10.0
        orders_mo.produced_quantity = 0.0
        orders_mo.status = "planned"
        orders_mo.source_type = PRODUCTION_ORDER_SOURCE_ORDERS

        planning_mo = MagicMock()
        planning_mo.product_id = 100
        planning_mo.planned_quantity = 6.0
        planning_mo.produced_quantity = 0.0
        planning_mo.status = "planned"
        planning_mo.source_type = PRODUCTION_ORDER_SOURCE_PLANNING

        db = MagicMock()
        batch_q = MagicMock()
        batch_q.options.return_value = batch_q
        batch_q.filter.return_value = batch_q
        batch_q.all.return_value = []

        mo_q = MagicMock()
        mo_q.filter.return_value = mo_q
        mo_q.all.return_value = [orders_mo, planning_mo]

        def _query(model):
            name = getattr(model, "__name__", str(model))
            if "ProductionBatch" in name or model.__name__ == "ProductionBatch":
                return batch_q
            return mo_q

        db.query.side_effect = _query

        breakdown = pipeline_qty_breakdown_from_batches_and_orders(
            db, tenant_id=1, warehouse_id=1, product_ids=[100]
        )
        self.assertEqual(breakdown.order_driven.get(100), 10.0)
        self.assertEqual(breakdown.free_stock.get(100), 6.0)
        self.assertEqual(breakdown.total().get(100), 16.0)

        # free_stock helper includes PW only when no active free putaway — here 6
        with patch(
            "backend.services.production_planning.pipeline_service.pipeline_qty_from_production_pw_putaway",
            return_value={},
        ):
            free = free_stock_pipeline_qty_by_product(db, tenant_id=1, warehouse_id=1, product_ids=[100])
            orders = order_driven_pipeline_qty_by_product(
                db, tenant_id=1, warehouse_id=1, product_ids=[100]
            )
        self.assertEqual(free.get(100), 6.0)
        self.assertEqual(orders.get(100), 10.0)
        # ORDERS + PLANNING: replenishment uses free only → need 4 vs target 10
        self.assertEqual(
            forecast_stock_need(
                daily_rate=5,
                coverage_days=2,
                min_stock=None,
                max_stock=None,
                on_hand=0,
                in_pipeline=free.get(100, 0),
            ),
            4,
        )


class TestSoftHoldFormula(unittest.TestCase):
    def test_required_32_reserved_24_hold_8(self):
        self.assertEqual(
            component_soft_hold_qty(outstanding_order_need=32, active_order_reserved=24),
            8,
        )

    def test_required_32_reserved_32_hold_0(self):
        self.assertEqual(
            component_soft_hold_qty(outstanding_order_need=32, active_order_reserved=32),
            0,
        )

    def test_soft_hold_aggregates_per_component_across_mos(self):
        mo1 = MagicMock()
        mo1.id = 1
        snap1 = MagicMock()
        snap1.component_product_id = 50  # noga
        snap1.total_required_quantity = 20.0
        mo1.line_snapshots = [snap1]

        mo2 = MagicMock()
        mo2.id = 2
        snap2 = MagicMock()
        snap2.component_product_id = 50
        snap2.total_required_quantity = 12.0
        mo2.line_snapshots = [snap2]

        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.options.return_value = q
        q.filter.return_value = q
        # MOs then reservations for mo1 then mo2
        q.all.side_effect = [
            [mo1, mo2],
            [],  # mo1 reservations empty → hold 20
            [],  # mo2 reservations empty → hold 12
        ]
        hold = soft_hold_components_for_orders(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(hold.by_component.get(50), 32.0)

    def test_two_products_share_component_respect_combined_hold(self):
        composition = MagicMock()
        composition.yield_quantity = 1.0
        line = MagicMock()
        line.component_product_id = 50
        composition.lines = [line]

        with (
            patch(
                "backend.services.production_planning.stock_replenishment_service.effective_line_qty",
                return_value=1.0,
            ),
            patch(
                "backend.services.production_planning.stock_replenishment_service.warehouse_net_available",
                return_value=40.0,
            ),
        ):
            # ORDERS soft-hold 32 of 40 → PLANNING sees 8
            max_p = max_producible_after_orders_hold(
                MagicMock(),
                tenant_id=1,
                warehouse_id=1,
                composition=composition,
                soft_hold=_SoftHoldState(by_component={50: 32.0}),
            )
        self.assertEqual(max_p, 8.0)

    def test_full_reservation_no_double_count(self):
        mo = MagicMock()
        mo.id = 7
        snap = MagicMock()
        snap.component_product_id = 50
        snap.total_required_quantity = 32.0
        mo.line_snapshots = [snap]

        res = MagicMock()
        res.product_id = 50
        res.quantity = 32.0

        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.options.return_value = q
        q.filter.return_value = q
        q.all.side_effect = [[mo], [res]]

        hold = soft_hold_components_for_orders(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(hold.by_component.get(50, 0.0), 0.0)


class TestFulfilledReentryHelpers(unittest.TestCase):
    def test_outstanding_zero_when_fully_fulfilled(self):
        self.assertEqual(
            outstanding_production_need_qty(order_item_quantity=1, historical_fulfilled_qty=1),
            0,
        )

    def test_outstanding_delta_when_qty_increased(self):
        self.assertEqual(
            outstanding_production_need_qty(order_item_quantity=2, historical_fulfilled_qty=1),
            1,
        )

    def test_historical_sums_fulfilled_qty(self):
        row = MagicMock()
        row.fulfilled_quantity = 1.0
        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.filter.return_value = q
        q.all.return_value = [row]
        self.assertEqual(
            historical_fulfilled_production_qty(db, tenant_id=1, order_item_id=99),
            1.0,
        )


if __name__ == "__main__":
    unittest.main()
