"""
Activity Log Framework — presentation + description helpers.

  python -m pytest backend/tests/test_activity_log_framework.py -q
"""

from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace

from backend.services.activity_log.presentation import (
    enrich_activity_item,
    format_occurred_at_display,
    resolve_operator_display,
)
from backend.services.cart_stats_service import format_orders_operation_description


class TestPresentation(unittest.TestCase):
    def test_date_format(self):
        self.assertEqual(
            format_occurred_at_display(datetime(2026, 7, 18, 15, 45)),
            "18.07.2026 15:45",
        )

    def test_operator_system_when_missing(self):
        self.assertEqual(resolve_operator_display(actor_name=None), "System")

    def test_operator_integration_from_meta(self):
        self.assertEqual(
            resolve_operator_display(
                actor_name=None,
                metadata={"integration_name": "Integracja Allegro"},
            ),
            "Integracja Allegro",
        )

    def test_enrich_ready_fields(self):
        item = enrich_activity_item(
            {
                "id": 1,
                "event_code": "orders_assigned",
                "description": "Przypisano zamówienia #1, #2 do wózka CART-1.",
                "severity": "SUCCESS",
                "category": "assignment",
                "occurred_at": "2026-07-18 15:45:00",
                "actor_user_id": 9,
                "actor_name": "Jacek Mizura",
                "source_module": "cart_lifecycle",
                "metadata": {
                    "order_numbers": ["1", "2"],
                    "reason": "start_picking",
                    "cart_label": "CART-1",
                    "session_id": 44,
                },
                "links": [],
            }
        )
        self.assertEqual(item["occurred_at_display"], "18.07.2026 15:45")
        self.assertEqual(item["operator_display"], "Jacek Mizura")
        self.assertEqual(item["action"], item["description"])
        labels = [d["label"] for d in item["details"]]
        self.assertIn("Data", labels)
        self.assertIn("Operator", labels)
        self.assertIn("Akcja", labels)
        self.assertIn("Powód", labels)
        self.assertIn("Wózek", labels)
        self.assertIn("Sesja", labels)
        self.assertEqual(item["order_numbers"], ["#1", "#2"])


class TestOrdersDescription(unittest.TestCase):
    def test_assign_with_cart_and_numbers(self):
        orders = [
            SimpleNamespace(id=1198, number="1198"),
            SimpleNamespace(id=1202, number="1202"),
            SimpleNamespace(id=1203, number="1203"),
        ]
        # orders_event_meta uses order.number or id — ensure attrs
        for o in orders:
            if not hasattr(o, "number"):
                o.number = str(o.id)
        text = format_orders_operation_description(
            "Przypisano",
            orders,
            cart_label="CART-0001",
        )
        self.assertIn("Przypisano zamówienia", text)
        self.assertIn("#1198", text)
        self.assertIn("do wózka CART-0001.", text)

    def test_detach_relation_od(self):
        orders = [SimpleNamespace(id=1203, number="1203")]
        text = format_orders_operation_description(
            "Odłączono",
            orders,
            cart_label="CART-0001",
            cart_relation="od",
        )
        self.assertEqual(text, "Odłączono zamówienie #1203 od wózka CART-0001.")


if __name__ == "__main__":
    unittest.main()
