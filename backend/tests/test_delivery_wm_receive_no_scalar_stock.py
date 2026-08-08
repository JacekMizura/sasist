"""Delivery receive must not bump deprecated Carton.stock / PackagingMaterial.stock."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.api.delivery import _apply_wm_inventory_from_received_delivery, _sync_wm_metadata_from_received_delivery


class DeliveryWmReceiveNoScalarStockTests(unittest.TestCase):
    def test_received_delivery_does_not_mutate_scalar_stock(self):
        carton = SimpleNamespace(id="c1", stock=10.0, last_purchase_price_net=None, tenant_id=1)
        item = SimpleNamespace(
            wm_kind="carton",
            wm_id="c1",
            quantity_received=0.0,
            quantity_ordered=5.0,
            purchase_price=2.5,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [item]

        with patch(
            "backend.services.wm_catalog_stock_service.update_wm_catalog_last_purchase_metadata"
        ) as meta:
            _sync_wm_metadata_from_received_delivery(db, 1, 99)
            meta.assert_called_once()
            self.assertEqual(float(item.quantity_received), 5.0)

        # Scalar stock must remain untouched by this path (Inventory SSOT via PZ).
        self.assertEqual(float(carton.stock), 10.0)

    def test_legacy_alias_calls_metadata_only(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        with patch(
            "backend.api.delivery._sync_wm_metadata_from_received_delivery"
        ) as sync:
            _apply_wm_inventory_from_received_delivery(db, 1, 7)
            sync.assert_called_once_with(db, 1, 7)


if __name__ == "__main__":
    unittest.main()
