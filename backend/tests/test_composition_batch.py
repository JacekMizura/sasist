"""
Composition engine + production batch aggregation tests.

  python -m pytest backend/tests/test_composition_batch.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.services.composition_engine_service import (
    aggregate_component_demand,
    calculate_required_components,
    effective_line_qty,
)
from backend.services.production_batch_service import _aggregate_batch_components


class _Line(SimpleNamespace):
    pass


class _Composition(SimpleNamespace):
    pass


class _BatchLine(SimpleNamespace):
    pass


class _Batch(SimpleNamespace):
    pass


class TestCompositionEngine(unittest.TestCase):
    def test_effective_line_qty_with_waste_and_yield(self):
        ln = _Line(quantity=2.0, waste_percent=10.0)
        per = effective_line_qty(ln, yield_qty=4.0)
        self.assertAlmostEqual(per, 2.0 * 1.1 / 4.0, places=6)

    def test_aggregate_component_demand_sums_across_lines(self):
        block_a = [
            {"component_product_id": 100, "total_required": 50.0},
            {"component_product_id": 200, "total_required": 20.0},
        ]
        block_b = [
            {"component_product_id": 100, "total_required": 70.0},
            {"component_product_id": 300, "total_required": 10.0},
        ]
        totals = aggregate_component_demand([block_a, block_b])
        self.assertAlmostEqual(totals[100], 120.0, places=4)
        self.assertAlmostEqual(totals[200], 20.0, places=4)
        self.assertAlmostEqual(totals[300], 10.0, places=4)

    def test_calculate_required_components_scales_planned_qty(self):
        comp = _Composition(
            yield_quantity=2.0,
            lines=[
                _Line(component_product_id=10, quantity=1.0, waste_percent=0.0, sort_order=0, id=1),
                _Line(component_product_id=20, quantity=3.0, waste_percent=5.0, sort_order=1, id=2),
            ],
        )
        reqs = calculate_required_components(comp, planned_quantity=10.0)
        self.assertEqual(len(reqs), 2)
        self.assertAlmostEqual(reqs[0]["total_required"], 5.0, places=4)
        self.assertAlmostEqual(reqs[1]["total_required"], 10.0 * (3.0 * 1.05 / 2.0), places=4)


class TestBatchAggregation(unittest.TestCase):
    def test_aggregate_batch_components_example(self):
        linka_cat = _Composition(
            yield_quantity=1.0,
            lines=[_Line(component_product_id=900, quantity=2.0, waste_percent=0.0, sort_order=0, id=1)],
        )
        linka_red = _Composition(
            yield_quantity=1.0,
            lines=[_Line(component_product_id=900, quantity=2.0, waste_percent=0.0, sort_order=0, id=1)],
        )
        batch = _Batch(
            lines=[
                _BatchLine(planned_quantity=50.0, composition=linka_cat),
                _BatchLine(planned_quantity=20.0, composition=linka_red),
            ]
        )
        totals = _aggregate_batch_components(batch)
        self.assertAlmostEqual(totals[900], 140.0, places=4)


if __name__ == "__main__":
    unittest.main()
