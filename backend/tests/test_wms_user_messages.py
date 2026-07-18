"""WmsUserMessage catalog unit tests."""

from __future__ import annotations

import unittest

from backend.services.cart_capacity.exceptions import CartCapacityExceeded
from backend.services.wms_user_messages import (
    WMS_BASKETS_FULL,
    WMS_CART_CAPACITY_REACHED,
    WMS_CART_IN_USE,
    from_cart_capacity_exceeded,
    from_cart_lifecycle_error,
    msg_cart_in_use,
    parse_detail_as_wms_message,
)


class TestWmsUserMessages(unittest.TestCase):
    def test_capacity_baskets(self) -> None:
        exc = CartCapacityExceeded(
            current_orders=6,
            capacity_orders=6,
            attempted=2,
            strategy="BASKETS",
            reason="no_basket",
        )
        msg = from_cart_capacity_exceeded(exc)
        self.assertEqual(msg.code, WMS_BASKETS_FULL)
        self.assertIn("koszyk", msg.details.lower())

    def test_capacity_volume(self) -> None:
        exc = CartCapacityExceeded(
            current_orders=3,
            capacity_orders=10,
            attempted=1,
            strategy="LIMIT_VOLUME",
            reason="volume_limit",
        )
        msg = from_cart_capacity_exceeded(exc)
        self.assertEqual(msg.code, WMS_CART_CAPACITY_REACHED)
        detail = msg.to_detail()
        self.assertEqual(detail["severity"], "WARNING")
        self.assertTrue(detail["title"])
        self.assertTrue(detail["suggested_action"])

    def test_cart_in_use_polish_state(self) -> None:
        msg = msg_cart_in_use(
            operator_name="Jan Kowalski",
            started_at="09:42",
            lifecycle_state="PICKING",
        )
        self.assertEqual(msg.code, WMS_CART_IN_USE)
        self.assertIn("Jan Kowalski", msg.details or "")
        self.assertIn("Zbieranie", msg.details or "")

    def test_lifecycle_claimed_maps(self) -> None:
        class E:
            code = "CartAlreadyClaimed"
            message = "claimed"

        msg = from_cart_lifecycle_error(E())
        self.assertEqual(msg.code, WMS_CART_IN_USE)

    def test_roundtrip_detail(self) -> None:
        msg = msg_cart_in_use(operator_name="A")
        parsed = parse_detail_as_wms_message(msg.to_detail())
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.code, msg.code)
        self.assertEqual(parsed.title, msg.title)


if __name__ == "__main__":
    unittest.main()
