"""Session enrichment available_qty_hint aligns with offer commercial SSOT."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.direct_sale.session_enrichment import enrich_session_lines


class TestEnrichAvailableQtyHint(unittest.TestCase):
    def test_uses_offer_available_qty_when_offer_present(self):
        db = MagicMock()
        product = SimpleNamespace(
            id=5,
            name="P",
            sku="S",
            symbol="S",
            ean="E",
            catalog_number=None,
            sale_price=10,
            purchase_price=5,
            image_url=None,
        )
        line = SimpleNamespace(
            product_id=5,
            product_sales_offer_id=99,
            source_location_id=None,
            suggested_location_id=None,
            stock_reservation_id=None,
            metadata_json=None,
        )
        sess = SimpleNamespace(tenant_id=1, warehouse_id=1, lines=[line])

        prod_q = MagicMock()
        prod_q.filter.return_value.all.return_value = [product]
        db.query.return_value = prod_q

        with patch(
            "backend.services.direct_sale.session_enrichment.offer_available_qty",
            return_value=7.0,
        ) as offer_qty, patch(
            "backend.services.direct_sale.session_enrichment.build_location_stock",
        ) as loc_stock:
            out = enrich_session_lines(db, sess)

        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["available_qty_hint"], 7.0)
        offer_qty.assert_called_once()
        loc_stock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
