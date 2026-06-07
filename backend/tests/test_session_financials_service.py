"""
Direct-sale session financials — line + order discounts.

  python -m pytest backend/tests/test_session_financials_service.py -q
"""

from __future__ import annotations

import unittest

from backend.services.direct_sale.session_financials_service import (
    _line_discount_gross,
    compute_line_financials,
    compute_session_totals,
)
from types import SimpleNamespace


class TestLineDiscountGross(unittest.TestCase):
    def test_percent_discount(self):
        after, applied = _line_discount_gross(100.0, discount_type="percent", discount_value=10.0)
        self.assertEqual(applied, 10.0)
        self.assertEqual(after, 90.0)

    def test_amount_discount_capped_at_line(self):
        after, applied = _line_discount_gross(5.0, discount_type="amount", discount_value=20.0)
        self.assertEqual(applied, 5.0)
        self.assertEqual(after, 0.0)

    def test_no_discount(self):
        after, applied = _line_discount_gross(6.15, discount_type=None, discount_value=0)
        self.assertEqual(applied, 0.0)
        self.assertEqual(after, 6.15)


class TestSessionTotalsAggregation(unittest.TestCase):
    def _mock_db(self, vat_percent: float = 23.0):
        class _Db:
            def query(self, *_a, **_k):
                return self

            def filter(self, *_a, **_k):
                return self

            def first(self):
                return SimpleNamespace(vat_percent=vat_percent)

        return _Db()

    def test_line_percent_then_order_percent(self):
        db = self._mock_db()
        lines = [
            SimpleNamespace(
                id=1,
                product_id=1,
                quantity=1,
                unit_price=5.0,
                sort_order=0,
                line_discount_type="percent",
                line_discount_value=10.0,
                discount_amount=0,
            ),
        ]
        sess = SimpleNamespace(
            lines=lines,
            order_discount_type="percent",
            order_discount_value=5.0,
        )
        totals = compute_session_totals(db, sess)  # type: ignore[arg-type]
        # 5 net → 6.15 gross, -10% line → 5.535, -5% order → ~5.26
        self.assertEqual(totals["subtotal_gross"], 6.15)
        self.assertGreater(totals["line_discounts_gross"], 0)
        self.assertGreater(totals["order_discount_gross"], 0)
        self.assertLess(totals["total_gross"], totals["lines_gross"])
        self.assertEqual(round(totals["total_net"] + totals["total_vat"], 2), totals["total_gross"])

    def test_compute_line_financials_percent(self):
        db = self._mock_db()
        ln = SimpleNamespace(
            id=2,
            product_id=1,
            quantity=2,
            unit_price=10.0,
            line_discount_type="percent",
            line_discount_value=20.0,
            discount_amount=0,
        )
        fin = compute_line_financials(db, ln)  # type: ignore[arg-type]
        self.assertEqual(fin["gross_before_discount"], 24.6)  # 2 × 12.30
        self.assertEqual(fin["line_discount_gross"], 4.92)
        self.assertEqual(fin["line_gross"], 19.68)


if __name__ == "__main__":
    unittest.main()
