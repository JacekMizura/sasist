"""
Sale document financials — NET catalog price → gross/VAT split.

  python -m pytest backend/tests/test_sale_document_financials.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from backend.services.document_number_service import format_document_number
from backend.services.sale_document_financials import (
    brutto_line_to_net_fields,
    compute_direct_sale_line_gross,
    compute_direct_sale_session_total,
    compute_order_line_financials_with_margin,
    netto_line_to_gross_fields,
    net_vat_from_gross,
)


class TestNetVatFromGross(unittest.TestCase):
    def test_five_pln_brutto_23_percent(self):
        net, vat = net_vat_from_gross(5.0, 23.0)
        self.assertEqual(net, 4.07)
        self.assertEqual(vat, 0.93)
        self.assertEqual(round(net + vat, 2), 5.0)

    def test_brutto_line_fields(self):
        fin = brutto_line_to_net_fields(unit_gross=5.0, qty=1, vat_percent=23.0)
        self.assertEqual(fin["line_gross"], 5.0)
        self.assertEqual(fin["total_price"], 4.07)
        self.assertEqual(fin["line_vat"], 0.93)


class TestNettoDirectSalesFields(unittest.TestCase):
    def test_five_net_one_qty_23_vat(self):
        fin = netto_line_to_gross_fields(unit_net=5.0, qty=1, vat_percent=23.0)
        self.assertEqual(fin["unit_price"], 5.0)
        self.assertEqual(fin["total_price"], 5.0)
        self.assertEqual(fin["line_gross"], 6.15)
        self.assertEqual(fin["line_vat"], 1.15)
        self.assertEqual(fin["unit_price_gross"], 6.15)

    def test_session_line_gross_from_net(self):
        gross = compute_direct_sale_line_gross(unit_net=5.0, quantity=1, vat_percent=23.0)
        self.assertEqual(gross, 6.15)

    def test_session_total_sums_gross_from_net_lines(self):
        lines = [
            SimpleNamespace(unit_price=5.0, quantity=1, discount_amount=0, product_id=1),
        ]
        total = compute_direct_sale_session_total(lines)
        self.assertEqual(total, 6.15)


class TestOrderLineFinancials(unittest.TestCase):
    def test_netto_anchored_line_uses_stored_gross(self):
        item = SimpleNamespace(
            quantity=1,
            unit_price=5.0,
            total_price=5.0,
            vat_percent=23.0,
            metadata_json='{"line_gross_total": 6.15, "price_input_mode": "NETTO"}',
        )
        fin = compute_order_line_financials_with_margin(item, None)
        self.assertEqual(fin["line_gross_total"], 6.15)
        self.assertEqual(fin["line_net_total"], 5.0)
        self.assertEqual(fin["line_vat_amount"], 1.15)
        self.assertEqual(fin["unit_price_gross"], 6.15)

    def test_legacy_brutto_anchored_line_still_readable(self):
        item = SimpleNamespace(
            quantity=1,
            unit_price=4.07,
            total_price=4.07,
            vat_percent=23.0,
            metadata_json='{"line_gross_total": 5.0, "price_input_mode": "BRUTTO"}',
        )
        fin = compute_order_line_financials_with_margin(item, None)
        self.assertEqual(fin["line_gross_total"], 5.0)
        self.assertEqual(fin["line_net_total"], 4.07)
        self.assertEqual(fin["line_vat_amount"], 0.93)

    def test_margin_null_when_purchase_unknown(self):
        item = SimpleNamespace(
            quantity=1,
            unit_price=5.0,
            total_price=5.0,
            vat_percent=23.0,
            metadata_json='{"line_gross_total": 6.15}',
        )
        fin = compute_order_line_financials_with_margin(item, None)
        self.assertIsNone(fin["line_margin_percent"])
        self.assertIsNone(fin["line_purchase_total_net"])

    def test_margin_from_fifo_purchase_net(self):
        item = SimpleNamespace(
            quantity=1,
            unit_price=5.0,
            total_price=5.0,
            vat_percent=23.0,
            metadata_json='{"line_gross_total": 6.15}',
        )
        fin = compute_order_line_financials_with_margin(item, None, fifo_purchase_net=2.0)
        self.assertEqual(fin["line_purchase_total_net"], 2.0)
        self.assertEqual(fin["line_margin_amount"], 3.0)
        self.assertAlmostEqual(fin["line_margin_percent"], 60.0, places=1)


class TestSaleDocumentNumbering(unittest.TestCase):
    def test_pa_monthly_format(self):
        series = SimpleNamespace(
            prefix="PA",
            suffix="",
            numbering_format="{PREFIX}/{YEAR}/{MONTH}/{NUMBER}",
            padding_length=6,
            code="",
        )
        out = format_document_number(series, 2, now=__import__("datetime").datetime(2026, 6, 4))
        self.assertEqual(out, "PA/2026/06/000002")

    def test_pa_zero_padding(self):
        series = SimpleNamespace(
            prefix="PA",
            suffix="",
            numbering_format="{PREFIX}/{YEAR}/{MONTH}/{NUMBER}",
            padding_length=0,
            code="",
        )
        out = format_document_number(series, 5, now=__import__("datetime").datetime(2026, 6, 4))
        self.assertEqual(out, "PA/2026/06/5")


if __name__ == "__main__":
    unittest.main()
