"""
Kolejka Braki — fallback karty nigdy nie ukrywa OPEN zadania.

  python -m pytest backend/tests/test_braki_queue_normalize.py -q
"""

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.services.braki_queue_normalize import build_fallback_braki_queue_card


class TestBrakiQueueNormalize(unittest.TestCase):
    def test_fallback_card_always_renderable(self):
        task = SimpleNamespace(
            id=42,
            tenant_id=1,
            warehouse_id=1,
            order_id=1197,
            type="MIXED",
            status="OPEN",
            missing_items="[]",
            picked_items="[]",
            created_at=datetime(2026, 6, 4, 10, 0, 0),
        )
        order = SimpleNamespace(id=1197, number="1197", status="processing")
        db = MagicMock()

        card = build_fallback_braki_queue_card(
            db,
            task,
            order,
            warnings=["test partial"],
            u_short=2,
            r_pend=1,
            workflow_status="pick_and_relocation",
        )

        self.assertEqual(int(card.id), 42)
        self.assertEqual(int(card.order_id), 1197)
        self.assertTrue(card.partial_data)
        self.assertIn("Niepełne dane operacyjne", card.queue_warnings)
        self.assertEqual(card.customer_name, "—")


if __name__ == "__main__":
    unittest.main()
