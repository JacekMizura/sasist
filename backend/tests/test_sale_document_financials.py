"""
Sale document financials — brutto input → net/VAT split.

  python -m pytest backend/tests/test_sale_document_financials.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from backend.services.document_number_service import format_document_number
from backend.services.sale_document_financials import (
    brutto_line_to_net_fields,
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


if __name__ == "__main__":
    unittest.main()
