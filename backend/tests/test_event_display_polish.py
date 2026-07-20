"""User-facing event titles must be Polish — never raw English codes."""

from __future__ import annotations

import unittest

from backend.services.activity_log.presentation import enrich_activity_item
from backend.services.cart_lifecycle_event_catalog import (
    EVENT_ADMIN_CART_RELEASED,
    EVENT_ADMIN_ORDERS_DETACHED,
    EVENT_CART_AUTO_RELEASED_IDLE,
    EVENT_CART_RELEASED,
    EVENT_DESCRIPTIONS_PL,
    EVENT_FIRST_PRODUCT_CONFIRMED,
    EVENT_ORDER_PACKED,
    EVENT_ORDERS_ASSIGNED,
    EVENT_PICKING_CANCELLED,
    EVENT_TITLES_PL,
    UNKNOWN_EVENT_TITLE_PL,
    compose_informative_message,
    description_pl,
    title_pl,
)


SCREEN_CODES = [
    EVENT_CART_RELEASED,
    EVENT_ORDER_PACKED,
    EVENT_FIRST_PRODUCT_CONFIRMED,
    EVENT_ORDERS_ASSIGNED,
    EVENT_ADMIN_ORDERS_DETACHED,
    EVENT_ADMIN_CART_RELEASED,
    EVENT_CART_AUTO_RELEASED_IDLE,
]

FORBIDDEN = {
    "CART RELEASED",
    "ORDER PACKED",
    "FIRST PRODUCT CONFIRMED",
    "ORDERS ASSIGNED",
    "ADMIN ORDERS DETACHED",
    "ADMIN CART RELEASED",
    "CART AUTO RELEASED IDLE",
}


class TestCartEventPolishPresentation(unittest.TestCase):
    def test_titles_for_historia_czynnosci(self):
        for code in SCREEN_CODES:
            label = title_pl(code)
            self.assertNotEqual(label, code)
            self.assertNotIn(label.upper(), FORBIDDEN)
            self.assertTrue(any(c.isalpha() for c in label))
            self.assertEqual(label, EVENT_TITLES_PL[code])

    def test_unknown_fallback(self):
        self.assertEqual(title_pl("some_new_internal_event"), UNKNOWN_EVENT_TITLE_PL)
        self.assertNotIn("_", description_pl("some_new_internal_event"))

    def test_description_never_returns_raw_code(self):
        for code in EVENT_DESCRIPTIONS_PL:
            self.assertNotEqual(description_pl(code), code)

    def test_compose_picking_cancelled_informative(self):
        msg = compose_informative_message(
            EVENT_PICKING_CANCELLED,
            stored_description="ANULOWANO ZBIERANIE",
            metadata={
                "orders": ["1234", "1235"],
                "cart_code": "8X8X4X4",
                "location_qty_restored": 8,
                "put_back_required": [
                    {
                        "product_name": "Sznurowadła CAT 150 cm",
                        "quantity": 4,
                        "location_code": "A10-A-1",
                    }
                ],
            },
        )
        self.assertIn("Anulowano zbieranie zamówień", msg)
        self.assertIn("#1234", msg)
        self.assertIn("#1235", msg)
        self.assertIn("8X8X4X4", msg)
        self.assertIn("Sznurowadła CAT 150 cm", msg)
        self.assertIn("A10-A-1", msg)

    def test_enrich_activity_item_exposes_polish_title(self):
        item = enrich_activity_item(
            {
                "id": 1,
                "event_code": EVENT_CART_RELEASED,
                "description": "Zwolniono wózek.",
                "actor_name": None,
                "actor_user_id": None,
                "occurred_at": "2026-07-20T10:00:00",
                "metadata": {"cart_code": "CART-0001"},
                "source_module": "cart_lifecycle",
                "severity": "AUDIT",
                "category": "system",
                "links": [],
            }
        )
        self.assertEqual(item["event_display_label"], "Zwolniono wózek")
        self.assertIn("CART-0001", item["action"])
        self.assertNotIn("CART RELEASED", item["event_display_label"].upper())


if __name__ == "__main__":
    unittest.main()
