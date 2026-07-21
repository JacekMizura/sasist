"""Actionable replenishment vs no-source stock (Centrum operacyjne → Uzupełnienia)."""

from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.schemas.wms_replenishment import (
    WmsReplenishmentBufferSource,
    WmsReplenishmentLineRead,
    WmsReplenishmentSourceAllocation,
)
from backend.services.warehouse_operations_replenishment import build_replenishment_alerts
from backend.services.wms_replenishment_service import _build_source_chain, _effective_moveable_reserve


def _line(**kw):
    base = dict(
        product_id=1,
        product_name="Sznurowadła",
        product_sku="SKU-1",
        product_ean=None,
        product_image_url=None,
        pick_location_id=10,
        pick_location_name="A9-A-1",
        pick_stock=0.0,
        min_level=10.0,
        missing_qty=10.0,
        buffer_location_id=20,
        buffer_location_name="B1-A-1",
        buffer_stock_at_source=20.0,
        suggested_qty=10.0,
        buffer_sources=[
            WmsReplenishmentBufferSource(
                location_id=20, location_name="B1-A-1", quantity=20.0, moveable_quantity=20.0
            )
        ],
        source_allocations=[WmsReplenishmentSourceAllocation(location_id=20, quantity=10.0)],
        priority_score=100.0,
        priority_band="HIGH",
        open_orders_qty=0.0,
        today_sales_velocity=0.0,
    )
    base.update(kw)
    return WmsReplenishmentLineRead(**base)


class TestSourceChain(unittest.TestCase):
    def test_D_multiple_sources(self):
        chain = _build_source_chain(10.0, [(1, 3.0, 3.0), (2, 7.0, 7.0)])
        self.assertEqual(len(chain), 2)
        self.assertEqual(chain[0]["quantity_planned"], 3.0)
        self.assertEqual(chain[1]["quantity_planned"], 7.0)

    def test_C_source_less_than_need(self):
        chain = _build_source_chain(8.0, [(1, 5.0, 5.0)])
        self.assertEqual(sum(s["quantity_planned"] for s in chain), 5.0)

    def test_I_min_reserve_floor(self):
        p = SimpleNamespace(min_reserve_quantity=5)
        self.assertEqual(_effective_moveable_reserve(p, 12.0), 7.0)
        self.assertEqual(_effective_moveable_reserve(p, 4.0), 0.0)


class TestActionableAlerts(unittest.TestCase):
    def test_A_no_lines_when_no_source(self):
        db = MagicMock()
        with (
            patch(
                "backend.services.warehouse_operations_replenishment._iter_replenishment_line_tuples",
                return_value=[],
            ),
            patch(
                "backend.services.warehouse_operations_replenishment.blocked_orders_by_product",
                return_value=({1: {100}}, {1: datetime(2026, 1, 1)}),
            ),
            patch(
                "backend.services.warehouse_operations_replenishment._active_relocation_product_ids",
                return_value=set(),
            ),
        ):
            # blocked product with no actionable line → empty operator queue
            out = build_replenishment_alerts(db, tenant_id=1, warehouse_id=1, now=datetime(2026, 7, 21))
        self.assertEqual(out, [])

    def test_B_actionable_move_qty(self):
        db = MagicMock()
        line = _line(suggested_qty=5.0, missing_qty=5.0)
        with (
            patch(
                "backend.services.warehouse_operations_replenishment._iter_replenishment_line_tuples",
                return_value=[(line, 80.0, 5.0, "MEDIUM")],
            ),
            patch(
                "backend.services.warehouse_operations_replenishment.blocked_orders_by_product",
                return_value=({}, {}),
            ),
            patch(
                "backend.services.warehouse_operations_replenishment._active_relocation_product_ids",
                return_value=set(),
            ),
        ):
            out = build_replenishment_alerts(db, tenant_id=1, warehouse_id=1, now=datetime(2026, 7, 21))
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].classification, "ACTIONABLE")
        self.assertEqual(out[0].move_quantity, 5.0)
        self.assertIn("Przenieś", out[0].instruction_label or "")
        self.assertEqual(out[0].action_label, "Utwórz przesunięcie")

    def test_C_unresolved_when_source_short(self):
        db = MagicMock()
        line = _line(
            suggested_qty=5.0,
            missing_qty=8.0,
            buffer_sources=[
                WmsReplenishmentBufferSource(
                    location_id=20, location_name="B1", quantity=5.0, moveable_quantity=5.0
                )
            ],
        )
        with (
            patch(
                "backend.services.warehouse_operations_replenishment._iter_replenishment_line_tuples",
                return_value=[(line, 80.0, 5.0, "MEDIUM")],
            ),
            patch(
                "backend.services.warehouse_operations_replenishment.blocked_orders_by_product",
                return_value=({}, {}),
            ),
            patch(
                "backend.services.warehouse_operations_replenishment._active_relocation_product_ids",
                return_value=set(),
            ),
        ):
            out = build_replenishment_alerts(db, tenant_id=1, warehouse_id=1, now=datetime(2026, 7, 21))
        self.assertEqual(out[0].move_quantity, 5.0)
        self.assertEqual(out[0].unresolved_shortage_qty, 3.0)


class TestCapacityCapTrusted(unittest.TestCase):
    def test_E_trusted_capacity_caps_qty(self):
        from backend.services import wms_replenishment_service as svc

        pick_loc = SimpleNamespace(id=10, name="A9")
        product = SimpleNamespace(
            id=1,
            name="P",
            sku="S",
            ean=None,
            image_url=None,
            min_pick_quantity=15,
            max_pick_quantity=None,
            min_reserve_quantity=None,
        )
        cap = SimpleNamespace(additional_capacity=3.0, capacity_numeric_trusted=True)

        with (
            patch.object(
                svc,
                "_agg_pick_buffer",
                return_value=({(1, 10): 0.0}, {1: [(20, 50.0)]}, {10: pick_loc, 20: SimpleNamespace(id=20, name="B1")}),
            ),
            patch.object(svc, "_open_order_demand_units", return_value=0.0),
            patch.object(svc, "_today_pick_velocity_units", return_value=0.0),
            patch(
                "backend.services.slotting.location_capacity_solver.solve_location_capacity",
                return_value=cap,
            ),
        ):
            db = MagicMock()
            db.query.return_value.filter.return_value.all.return_value = [product]
            rows = svc._iter_replenishment_line_tuples(db, 1, 1)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0].suggested_qty, 3.0)

    def test_F_untrusted_capacity_does_not_fake_cap(self):
        from backend.services import wms_replenishment_service as svc

        pick_loc = SimpleNamespace(id=10, name="A9")
        product = SimpleNamespace(
            id=1,
            name="P",
            sku="S",
            ean=None,
            image_url=None,
            min_pick_quantity=10,
            max_pick_quantity=None,
            min_reserve_quantity=None,
        )
        cap = SimpleNamespace(additional_capacity=None, capacity_numeric_trusted=False)

        with (
            patch.object(
                svc,
                "_agg_pick_buffer",
                return_value=({(1, 10): 0.0}, {1: [(20, 20.0)]}, {10: pick_loc, 20: SimpleNamespace(id=20, name="B1")}),
            ),
            patch.object(svc, "_open_order_demand_units", return_value=0.0),
            patch.object(svc, "_today_pick_velocity_units", return_value=0.0),
            patch(
                "backend.services.slotting.location_capacity_solver.solve_location_capacity",
                return_value=cap,
            ),
        ):
            db = MagicMock()
            db.query.return_value.filter.return_value.all.return_value = [product]
            rows = svc._iter_replenishment_line_tuples(db, 1, 1)
        self.assertEqual(len(rows), 1)
        # Need 10, source 20 — without fake geometry cap → 10
        self.assertEqual(rows[0][0].suggested_qty, 10.0)


if __name__ == "__main__":
    unittest.main()
