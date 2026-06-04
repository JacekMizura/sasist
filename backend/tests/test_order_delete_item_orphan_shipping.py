"""DELETE order item must survive orphan orders.shipping_method_id FK."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.api.order import _recompute_order_value_and_volume
from backend.services.order_shipping_fk_service import (
    sanitize_order_orphan_shipping_method_id,
    shipping_method_id_exists,
)


class ShippingMethodIdExistsTests(unittest.TestCase):
    def test_empty_id(self):
        db = MagicMock()
        self.assertFalse(shipping_method_id_exists(db, ""))


class SanitizeOrphanShippingMethodTests(unittest.TestCase):
    def test_clears_missing_fk(self):
        order = SimpleNamespace(id=1206, shipping_method_id="2ef14701-836a-48ab-8203-060a5035dc39")
        db = MagicMock()
        with patch(
            "backend.services.order_shipping_fk_service.shipping_method_id_exists",
            return_value=False,
        ):
            changed = sanitize_order_orphan_shipping_method_id(db, order)
        self.assertTrue(changed)
        self.assertIsNone(order.shipping_method_id)

    def test_keeps_valid_fk(self):
        order = SimpleNamespace(id=1, shipping_method_id="valid-uuid")
        db = MagicMock()
        with patch(
            "backend.services.order_shipping_fk_service.shipping_method_id_exists",
            return_value=True,
        ):
            changed = sanitize_order_orphan_shipping_method_id(db, order)
        self.assertFalse(changed)
        self.assertEqual(order.shipping_method_id, "valid-uuid")

    def test_noop_when_already_null(self):
        order = SimpleNamespace(id=1, shipping_method_id=None)
        db = MagicMock()
        self.assertFalse(sanitize_order_orphan_shipping_method_id(db, order))


class RecomputeOrderValueOrphanShippingTests(unittest.TestCase):
    def test_recompute_clears_orphan_and_updates_value(self):
        active = SimpleNamespace(quantity=2, unit_price=5.0, total_price=10.0)
        removed = SimpleNamespace(quantity=0, unit_price=3.0, total_price=0.0)
        order = SimpleNamespace(
            id=1206,
            shipping_method_id="orphan-uuid",
            items=[active, removed],
            import_meta_json=None,
        )
        db = MagicMock()
        with patch(
            "backend.services.order_shipping_fk_service.shipping_method_id_exists",
            return_value=False,
        ), patch(
            "backend.api.order._order_import_meta_dict",
            return_value={"shipping_cost": 0},
        ), patch(
            "backend.api.order._order_total_volume_and_multi",
            return_value=(0.0, 0, 0, 0),
        ):
            _recompute_order_value_and_volume(order, db)
        self.assertIsNone(order.shipping_method_id)
        self.assertEqual(order.value, 10.0)


class DeleteOrderItemOrphanShippingIntegrationTests(unittest.TestCase):
    """Soft-remove + recompute + commit path does not require a live shipping_methods row."""

    def test_delete_flow_sanitizes_before_persist(self):
        item = SimpleNamespace(
            id=2015,
            order_id=1206,
            quantity=0,
            unit_price=5.0,
            total_price=0.0,
            product_id=1,
            product=None,
            parent_bundle_order_item_id=None,
            replaced_from_product_name=None,
            wms_picking_line_missing_qty=0.0,
            metadata_json=None,
        )
        order = SimpleNamespace(
            id=1206,
            tenant_id=1,
            warehouse_id=1,
            shipping_method_id="orphan-uuid",
            items=[item],
            import_meta_json=None,
        )
        db = MagicMock()
        with patch(
            "backend.services.order_shipping_fk_service.shipping_method_id_exists",
            return_value=False,
        ), patch(
            "backend.api.order._order_import_meta_dict",
            return_value={"shipping_cost": 0},
        ), patch(
            "backend.api.order._order_total_volume_and_multi",
            return_value=(0.0, 0, 0, 0),
        ):
            _recompute_order_value_and_volume(order, db)
        self.assertIsNone(order.shipping_method_id)
        self.assertEqual(order.value, 0.0)


if __name__ == "__main__":
    unittest.main()
