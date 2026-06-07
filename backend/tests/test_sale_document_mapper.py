"""
Canonical sale document mapper — financials, payment labels, legacy numbers.

  python -m pytest backend/tests/test_sale_document_mapper.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.sale_document_mapper import (
    compute_canonical_financials,
    is_legacy_document_number,
    payment_method_label_pl,
    resolve_document_number_fields,
)


class TestLegacyNumbers(unittest.TestCase):
    def test_detects_unresolved_template(self):
        self.assertTrue(is_legacy_document_number("PA/{YEAR}/{MONTH}/1"))

    def test_valid_number(self):
        self.assertFalse(is_legacy_document_number("PA/2026/06/000002"))

    def test_legacy_display(self):
        out = resolve_document_number_fields("PA/{YEAR}/{MONTH}/1")
        self.assertTrue(out["numbering_legacy"])
        self.assertEqual(out["document_number"], "Numer legacy (wymaga korekty)")


class TestPaymentLabels(unittest.TestCase):
    def test_cash_pl(self):
        self.assertEqual(payment_method_label_pl("CASH"), "Gotówka")

    def test_card_pl(self):
        self.assertEqual(payment_method_label_pl("CARD"), "Karta")


class TestCanonicalFinancials(unittest.TestCase):
    def test_prefers_line_computation_over_stale_db(self):
        product = SimpleNamespace(name="Test", sku="SKU1", symbol=None, metadata_json=None)
        item = SimpleNamespace(
            id=1,
            product_id=10,
            product=product,
            quantity=1,
            unit_price=5.0,
            total_price=5.0,
            vat_percent=23.0,
            metadata_json='{"line_gross_total": 6.15, "price_input_mode": "NETTO"}',
            oms_line_status=None,
            parent_bundle_order_item_id=None,
        )
        order = SimpleNamespace(id=5, items=[item], value=6.15, currency="PLN")
        fin = compute_canonical_financials(order)
        self.assertEqual(fin["total_net"], 5.0)
        self.assertEqual(fin["total_gross"], 6.15)
        self.assertEqual(fin["total_vat"], 1.15)


class TestMapperListUsesCanonical(unittest.TestCase):
    @patch("backend.services.sale_document_mapper.refresh_persisted_financials")
    def test_list_net_from_lines_not_stale_db(self, _refresh):
        from backend.services.sale_document_mapper import map_sale_document

        product = SimpleNamespace(name="Test", sku="SKU1", symbol=None, metadata_json=None)
        item = SimpleNamespace(
            id=1,
            product_id=10,
            product=product,
            quantity=1,
            unit_price=5.0,
            total_price=5.0,
            vat_percent=23.0,
            metadata_json='{"line_gross_total": 6.15, "price_input_mode": "NETTO"}',
            oms_line_status=None,
            parent_bundle_order_item_id=None,
            source_movement_id=None,
        )
        order = SimpleNamespace(
            id=5,
            number="ORD-1",
            items=[item],
            value=6.15,
            currency="PLN",
            source="direct-sales",
            order_channel="DIRECT_SALE",
            customer_id=None,
            customer_name=None,
            city=None,
            country=None,
            fulfillment_mode="IMMEDIATE",
        )
        doc = SimpleNamespace(
            id="doc-uuid",
            order_id=5,
            tenant_id=1,
            warehouse_id=1,
            document_series_id="s1",
            document_type_id="s1",
            document_subtype="RECEIPT",
            panel_document_type="PARAGON",
            series_type="SALE",
            document_number="PA/2026/06/000002",
            total_net=5.0,
            total_gross=5.0,
            total_vat=0.0,
            payment_id=None,
            payment_method=None,
            payment_status=None,
            payment_captured_at=None,
            payment_external_transaction_id=None,
            created_at=None,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None

        row = map_sale_document(db, doc=doc, order=order, customer=None, mode="list", refresh_db=False)
        self.assertEqual(row["total_net"], 5.0)
        self.assertEqual(row["total_gross"], 6.15)
        self.assertEqual(row["net"], 5.0)
        self.assertEqual(row["gross"], 6.15)


if __name__ == "__main__":
    unittest.main()
