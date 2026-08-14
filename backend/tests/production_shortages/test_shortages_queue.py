"""Production shortages queue — sum aggregation and missing filter."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


class TestProductionShortagesQueueAggregation(unittest.TestCase):
    def test_required_qty_is_sum_not_max(self) -> None:
        from backend.services.production_shortages.queue_service import build_production_shortages_queue

        batch_a = SimpleNamespace(
            id=1,
            number="BAT/001",
            status="planned",
            tenant_id=1,
            warehouse_id=1,
            lines=[
                SimpleNamespace(
                    product_id=10,
                    product=SimpleNamespace(name="FG-A", sku="A", image_url=None),
                )
            ],
        )
        batch_b = SimpleNamespace(
            id=2,
            number="BAT/002",
            status="planned",
            tenant_id=1,
            warehouse_id=1,
            lines=[
                SimpleNamespace(
                    product_id=11,
                    product=SimpleNamespace(name="FG-B", sku="B", image_url=None),
                )
            ],
        )

        db = MagicMock()
        # first query: batches, second: orders
        batch_q = MagicMock()
        batch_q.options.return_value = batch_q
        batch_q.filter.return_value = batch_q
        batch_q.all.return_value = [batch_a, batch_b]
        order_q = MagicMock()
        order_q.options.return_value = order_q
        order_q.filter.return_value = order_q
        order_q.all.return_value = []
        db.query.side_effect = [batch_q, order_q]

        with patch(
            "backend.services.production_shortages.queue_service._aggregate_batch_components",
            side_effect=[{100: 5.0}, {100: 3.0}],
        ), patch(
            "backend.services.production_shortages.queue_service.analyze_component_requirements",
            return_value=[
                {
                    "component_product_id": 100,
                    "product_name": "Komponent X",
                    "product_sku": "KX",
                    "product_image_url": None,
                    "required_qty": 8.0,
                    "on_hand_qty": 10.0,
                    "reserved_qty": 8.0,
                    "available_qty": 2.0,
                    "missing_qty": 6.0,
                    "locations": [],
                    "expected_availability_date": None,
                    "substitute_proposals": [],
                }
            ],
        ) as analyze:
            rows = build_production_shortages_queue(db, tenant_id=1, warehouse_id=1)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["required_qty"], 8.0)
        self.assertEqual(rows[0]["missing_qty"], 6.0)
        self.assertEqual(rows[0]["covered_qty"], 2.0)
        analyze.assert_called_once()
        passed_totals = analyze.call_args.kwargs["component_totals"]
        self.assertEqual(passed_totals[100], 8.0)
        self.assertEqual(len(rows[0]["demand_sources"]), 2)
        numbers = {s["number"] for s in rows[0]["demand_sources"]}
        self.assertEqual(numbers, {"BAT/001", "BAT/002"})

    def test_missing_zero_not_in_queue(self) -> None:
        from backend.services.production_shortages.queue_service import build_production_shortages_queue

        batch = SimpleNamespace(
            id=1,
            number="BAT/010",
            status="planned",
            tenant_id=1,
            warehouse_id=1,
            lines=[
                SimpleNamespace(
                    product_id=10,
                    product=SimpleNamespace(name="FG", sku="FG", image_url=None),
                )
            ],
        )
        db = MagicMock()
        batch_q = MagicMock()
        batch_q.options.return_value = batch_q
        batch_q.filter.return_value = batch_q
        batch_q.all.return_value = [batch]
        order_q = MagicMock()
        order_q.options.return_value = order_q
        order_q.filter.return_value = order_q
        order_q.all.return_value = []
        db.query.side_effect = [batch_q, order_q]

        with patch(
            "backend.services.production_shortages.queue_service._aggregate_batch_components",
            return_value={200: 4.0},
        ), patch(
            "backend.services.production_shortages.queue_service.analyze_component_requirements",
            return_value=[
                {
                    "component_product_id": 200,
                    "product_name": "Covered",
                    "product_sku": "C",
                    "product_image_url": None,
                    "required_qty": 4.0,
                    "on_hand_qty": 10.0,
                    "reserved_qty": 0.0,
                    "available_qty": 10.0,
                    "missing_qty": 0.0,
                    "locations": [],
                    "expected_availability_date": None,
                    "substitute_proposals": [],
                }
            ],
        ):
            rows = build_production_shortages_queue(db, tenant_id=1, warehouse_id=1)

        self.assertEqual(rows, [])

    def test_missing_recomputed_from_sum_and_available(self) -> None:
        """Even if analyze returns stale missing, queue uses max(0, required - available)."""
        from backend.services.production_shortages.queue_service import build_production_shortages_queue

        batch = SimpleNamespace(
            id=1,
            number="BAT/011",
            status="collecting",
            tenant_id=1,
            warehouse_id=1,
            lines=[
                SimpleNamespace(
                    product_id=10,
                    product=SimpleNamespace(name="FG", sku="FG", image_url=None),
                )
            ],
        )
        db = MagicMock()
        batch_q = MagicMock()
        batch_q.options.return_value = batch_q
        batch_q.filter.return_value = batch_q
        batch_q.all.return_value = [batch]
        order_q = MagicMock()
        order_q.options.return_value = order_q
        order_q.filter.return_value = order_q
        order_q.all.return_value = []
        db.query.side_effect = [batch_q, order_q]

        with patch(
            "backend.services.production_shortages.queue_service._aggregate_batch_components",
            return_value={300: 5.0},
        ), patch(
            "backend.services.production_shortages.queue_service.analyze_component_requirements",
            return_value=[
                {
                    "component_product_id": 300,
                    "product_name": "Y",
                    "product_sku": "Y",
                    "product_image_url": None,
                    "required_qty": 5.0,
                    "on_hand_qty": 5.0,
                    "reserved_qty": 0.0,
                    "available_qty": 5.0,
                    "missing_qty": 99.0,  # stale — must not force a shortage row
                    "locations": [],
                    "expected_availability_date": None,
                    "substitute_proposals": [],
                }
            ],
        ):
            rows = build_production_shortages_queue(db, tenant_id=1, warehouse_id=1)

        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
