"""Tests for WMS incomplete receiving product list."""

from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_product_incomplete_service import (
    _scalar_query_first,
    list_incomplete_receiving_products,
    resolve_incomplete_product_scan,
)


class ScalarQueryFirstTests(unittest.TestCase):
    def test_datetime_scalar(self):
        dt = datetime(2026, 1, 1, 12, 0, 0)
        self.assertIs(_scalar_query_first(dt), dt)

    def test_tuple_row(self):
        dt = datetime(2026, 1, 1, 12, 0, 0)
        self.assertEqual(_scalar_query_first((dt,)), dt)

    def test_none(self):
        self.assertIsNone(_scalar_query_first(None))


class ListIncompleteReceivingProductsTests(unittest.TestCase):
    def test_only_products_with_active_requirements_and_missing_fields(self):
        complete = SimpleNamespace(
            id=1,
            tenant_id=1,
            deleted_at=None,
            name="OK",
            ean="1",
            sku="A",
            symbol=None,
            image_url=None,
            require_recv_weight=True,
            require_recv_height=False,
            require_recv_width=False,
            require_recv_length=False,
            require_recv_master_carton=False,
            require_recv_master_carton_ean=False,
            require_recv_master_carton_qty=False,
            require_recv_master_carton_dims=False,
            require_recv_master_carton_weight=False,
            weight=2.0,
            height=None,
            width=None,
            length=None,
            bulk_ean=None,
            units_per_carton=None,
            carton_length_cm=None,
            carton_width_cm=None,
            carton_height_cm=None,
            carton_weight_kg=None,
            metadata_json=None,
        )
        incomplete = SimpleNamespace(
            **{**complete.__dict__, "id": 2, "weight": None},
        )
        no_req = SimpleNamespace(
            **{**complete.__dict__, "id": 3, "require_recv_weight": False, "weight": None},
        )

        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        q.limit.return_value = q
        q.all.return_value = [complete, incomplete, no_req]
        db.query.return_value = q

        out = list_incomplete_receiving_products(db, tenant_id=1, warehouse_id=None, limit=50)

        self.assertEqual(out.total, 1)
        self.assertEqual(len(out.items), 1)
        self.assertEqual(out.items[0].product_id, 2)
        self.assertIn("weight", out.items[0].missing_fields)
        self.assertTrue(any("waga" in lbl.lower() for lbl in out.items[0].missing_field_labels))
        self.assertIn("editable_values", out.items[0].model_dump())
        self.assertIn("required_rules", out.items[0].model_dump())


class ResolveScanTests(unittest.TestCase):
    def test_resolve_by_ean(self):
        row = SimpleNamespace(
            product_id=5,
            ean="5900000000005",
            sku="SKU5",
            name="X",
            image_url=None,
            location_label="A-01",
            location_zone="A",
            stock=1.0,
            missing_fields=["weight"],
            missing_field_labels=["Brak wagi"],
            required_rules={},
            editable_values={},
            force_wms_completion=False,
            product_name="X",
            product_ean="5900000000005",
            product_sku="SKU5",
            warehouse_qty=1.0,
            missing_labels=["Brak wagi"],
        )
        listing = SimpleNamespace(items=[row], total=1, without_location_count=0)

        db = MagicMock()
        with patch(
            "backend.services.wms_product_incomplete_service.list_incomplete_receiving_products",
            return_value=listing,
        ):
            hit = resolve_incomplete_product_scan(
                db, tenant_id=1, warehouse_id=1, code="5900000000005"
            )
        self.assertIsNotNone(hit)
        assert hit is not None
        self.assertEqual(hit.product_id, 5)


if __name__ == "__main__":
    unittest.main()
