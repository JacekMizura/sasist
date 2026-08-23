"""Phase 1 — standardized warehouse document series configuration."""

from __future__ import annotations

import unittest
import uuid

from fastapi.testclient import TestClient

from backend.main import app
from backend.schemas.document_series import DocumentSeriesCreate, DocumentSeriesUpdate
from backend.services.document_series_warehouse_validation import apply_warehouse_series_rules
from backend.services.warehouse_series_capabilities import (
    SUPPORTED_WAREHOUSE_SUBTYPES,
    WAREHOUSE_SERIES_CAPABILITIES,
    allowed_warehouse_subtypes,
    physical_effect_for_warehouse_subtype,
)
from backend.services.document_number_service import format_document_number
from backend.services.direct_sale.wz_service import create_and_post_wz_for_direct_sale
from backend.services.wms_picking_product_list_service import _decrement_inventory_for_wms_pick, finalize_wms_picking_cart


class WarehouseCapabilitiesTests(unittest.TestCase):
    def test_all_supported_subtypes_have_capabilities(self):
        for sub in SUPPORTED_WAREHOUSE_SUBTYPES:
            self.assertIn(sub, WAREHOUSE_SERIES_CAPABILITIES)

    def test_rz_physical_effect_false(self):
        self.assertFalse(physical_effect_for_warehouse_subtype("RESERVATION"))

    def test_physical_subtypes_have_physical_effect_true(self):
        for sub in ("WZ", "PZ", "Z_PZ", "RW", "PW", "MM"):
            self.assertTrue(physical_effect_for_warehouse_subtype(sub))

    def test_allowed_subtypes_match_supported(self):
        self.assertEqual(allowed_warehouse_subtypes(), list(SUPPORTED_WAREHOUSE_SUBTYPES))


class WarehouseSeriesValidationTests(unittest.TestCase):
    def test_warehouse_create_strips_sale_only_fields(self):
        body = DocumentSeriesCreate(
            tenant_id=1,
            warehouse_id=1,
            name="Test WZ",
            type="WAREHOUSE",
            subtype="WZ",
            vat_source="FROM_ORDER",
            vat_rate_percent=23,
            warehouse_document_series_id="00000000-0000-0000-0000-000000000001",
            status_on_create_id=1,
            warehouse_effect=False,
        )
        apply_warehouse_series_rules(body)
        self.assertIsNone(body.vat_source)
        self.assertIsNone(body.vat_rate_percent)
        self.assertIsNone(body.warehouse_document_series_id)
        self.assertIsNone(body.status_on_create_id)
        self.assertTrue(body.warehouse_effect)

    def test_rz_strips_print_template(self):
        body = DocumentSeriesUpdate(
            name="RZ",
            type="WAREHOUSE",
            subtype="RESERVATION",
            print_template_id=3,
            print_template="custom",
            document_template_version_id=5,
        )
        apply_warehouse_series_rules(body)
        self.assertIsNone(body.print_template_id)
        self.assertEqual(body.print_template, "")
        self.assertIsNone(body.document_template_version_id)
        self.assertFalse(body.warehouse_effect)

    def test_z_pz_keeps_collective_return_receipt(self):
        body = DocumentSeriesUpdate(
            name="Z-PZ",
            type="WAREHOUSE",
            subtype="Z_PZ",
            collective_return_receipt=True,
        )
        apply_warehouse_series_rules(body)
        self.assertTrue(body.collective_return_receipt)

    def test_mm_clears_collective_return_on_subtype_rules(self):
        body = DocumentSeriesUpdate(
            name="MM",
            type="WAREHOUSE",
            subtype="MM",
            collective_return_receipt=True,
        )
        apply_warehouse_series_rules(body)
        self.assertFalse(body.collective_return_receipt)


class WarehouseSeriesApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_warehouse_capabilities_endpoint(self):
        r = self.client.get("/api/document-series/warehouse-capabilities")
        self.assertEqual(r.status_code, 200)
        items = r.json().get("items") or []
        subtypes = {x["subtype"] for x in items}
        self.assertEqual(subtypes, set(SUPPORTED_WAREHOUSE_SUBTYPES))

    def test_numbering_preview_uses_backend_format(self):
        r = self.client.post(
            "/api/document-series/numbering-preview",
            json={
                "prefix": "PZ",
                "suffix": "",
                "numbering_format": "{PREFIX}/{YEAR}/{MONTH}/{NUMBER}",
                "numbering_start": 7,
                "padding_length": 0,
                "code": "",
                "reset_each_period": False,
                "yearly_reset": False,
                "monthly_reset": True,
            },
        )
        self.assertEqual(r.status_code, 200)
        preview = r.json().get("preview") or ""
        self.assertIn("PZ/", preview)
        self.assertIn("/7", preview)

    def test_create_warehouse_wz_derives_physical_effect(self):
        name = f"WZ test phase1 {uuid.uuid4().hex[:8]}"
        r = self.client.post(
            "/api/document-series",
            json={
                "tenant_id": 1,
                "warehouse_id": 1,
                "name": name,
                "prefix": "WZ",
                "suffix": "",
                "color": "#64748b",
                "type": "WAREHOUSE",
                "subtype": "WZ",
                "warehouse_effect": False,
                "vat_source": "FROM_ORDER",
                "numbering_start": 1,
                "numbering_format": "{PREFIX}/{NUMBER}",
                "is_default": False,
                "is_active": True,
            },
        )
        self.assertEqual(r.status_code, 201, r.text[:500])
        body = r.json()
        self.assertTrue(body.get("warehouse_effect"))
        self.assertIsNone(body.get("vat_source"))

    def test_create_warehouse_rz_physical_effect_false(self):
        name = f"RZ test phase1 {uuid.uuid4().hex[:8]}"
        r = self.client.post(
            "/api/document-series",
            json={
                "tenant_id": 1,
                "warehouse_id": 1,
                "name": name,
                "prefix": "RZ",
                "suffix": "",
                "color": "#64748b",
                "type": "WAREHOUSE",
                "subtype": "RESERVATION",
                "warehouse_effect": True,
                "numbering_start": 1,
                "numbering_format": "{PREFIX}/{NUMBER}",
                "is_default": False,
                "is_active": True,
            },
        )
        self.assertEqual(r.status_code, 201, r.text[:500])
        self.assertFalse(r.json().get("warehouse_effect"))

    def test_update_wz_preserves_warehouse_id(self):
        name = f"WZ wh preserve {uuid.uuid4().hex[:8]}"
        create = self.client.post(
            "/api/document-series",
            json={
                "tenant_id": 1,
                "warehouse_id": 1,
                "name": name,
                "prefix": "WZT",
                "suffix": "",
                "color": "#64748b",
                "type": "WAREHOUSE",
                "subtype": "WZ",
                "numbering_start": 1,
                "numbering_format": "{PREFIX}/{NUMBER}",
                "is_default": False,
                "is_active": True,
            },
        )
        self.assertEqual(create.status_code, 201)
        sid = create.json()["id"]
        updated_name = f"{name} updated"
        payload = {k: v for k, v in create.json().items() if k not in ("id", "tenant_id", "warehouse_id", "created_at", "updated_at", "status_on_create", "status_on_delete", "status_on_error", "status_on_update")}
        payload["name"] = updated_name
        payload["prefix"] = "WZT2"
        upd = self.client.put(
            f"/api/document-series/{sid}",
            params={"tenant_id": 1, "warehouse_id": 1},
            json=payload,
        )
        self.assertEqual(upd.status_code, 200)
        self.assertEqual(int(upd.json()["warehouse_id"]), 1)


class PhysicalDecrementOwnershipTests(unittest.TestCase):
    def test_classic_wms_finalize_is_canonical_decrement(self):
        self.assertTrue(callable(finalize_wms_picking_cart))
        self.assertTrue(callable(_decrement_inventory_for_wms_pick))

    def test_direct_sale_wz_issue_is_canonical_decrement(self):
        self.assertTrue(callable(create_and_post_wz_for_direct_sale))

    def test_no_wz_creation_in_wms_finalize_module(self):
        import inspect

        src = inspect.getsource(finalize_wms_picking_cart)
        self.assertNotIn('document_type="WZ"', src)
        self.assertNotIn("document_type='WZ'", src)


class NumberingServiceAlignmentTests(unittest.TestCase):
    def test_format_document_number_padding_zero(self):
        from types import SimpleNamespace

        row = SimpleNamespace(
            prefix="MM",
            suffix="",
            numbering_format="{PREFIX}/{NUMBER}",
            padding_length=0,
            code="",
        )
        self.assertEqual(format_document_number(row, 12), "MM/12")
