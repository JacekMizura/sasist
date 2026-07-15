"""POST /api/supplier-product-links/ — structured errors + admin schema diagnostic."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError, OperationalError

from backend.database import SessionLocal, engine
from backend.main import app
from backend.models.product import Product
from backend.models.supplier import Supplier
from backend.models.supplier_product import SupplierProduct
from backend.services.supplier_product_links.create_service import map_supplier_product_link_create_exception
from backend.services.supplier_product_links.db_errors import (
    is_foreign_key_violation,
    is_not_null_violation,
    is_undefined_column_error,
    is_undefined_table_error,
)
from backend.services.supplier_product_links.schema_diagnostic_service import (
    inspect_supplier_product_links_schema,
)


class SupplierProductLinksCreateApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app, raise_server_exceptions=False)

    def _sample_supplier_and_product(self) -> tuple[int, int]:
        db = SessionLocal()
        try:
            sup = db.query(Supplier).filter(Supplier.tenant_id == 1).first()
            pr = db.query(Product).filter(Product.tenant_id == 1).first()
            self.assertIsNotNone(sup)
            self.assertIsNotNone(pr)
            return int(sup.id), int(pr.id)
        finally:
            db.close()

    def test_create_link_success(self):
        supplier_id, product_id = self._sample_supplier_and_product()
        db = SessionLocal()
        link_id = 0
        try:
            existing = (
                db.query(SupplierProduct)
                .filter(
                    SupplierProduct.supplier_id == supplier_id,
                    SupplierProduct.product_id == product_id,
                )
                .first()
            )
            if existing:
                db.delete(existing)
                db.commit()

            r = self.client.post(
                "/api/supplier-product-links/",
                json={
                    "tenant_id": 1,
                    "supplier_id": supplier_id,
                    "product_id": product_id,
                    "purchase_price": 10.5,
                },
            )
            self.assertEqual(r.status_code, 201, r.text[:500])
            body = r.json()
            link_id = int(body["id"])
            self.assertEqual(body["supplier_id"], supplier_id)
            self.assertEqual(body["product_id"], product_id)
        finally:
            if link_id:
                db.query(SupplierProduct).filter(SupplierProduct.id == link_id).delete()
                db.commit()
            db.close()

    def test_create_duplicate_returns_structured_json(self):
        supplier_id, product_id = self._sample_supplier_and_product()
        payload = {
            "tenant_id": 1,
            "supplier_id": supplier_id,
            "product_id": product_id,
        }
        db = SessionLocal()
        link_id = 0
        try:
            row = SupplierProduct(
                tenant_id=1,
                supplier_id=supplier_id,
                product_id=product_id,
            )
            db.add(row)
            db.commit()
            link_id = int(row.id)

            r = self.client.post("/api/supplier-product-links/", json=payload)
            self.assertEqual(r.status_code, 409, r.text[:500])
            detail = r.json().get("detail")
            self.assertEqual(detail.get("code"), "SUPPLIER_PRODUCT_LINK_DUPLICATE")
            self.assertIn("message", detail)
            self.assertIn("details", detail)
        finally:
            if link_id:
                db.query(SupplierProduct).filter(SupplierProduct.id == link_id).delete()
                db.commit()
            db.close()

    def test_create_undefined_column_returns_structured_json(self):
        op_err = OperationalError(
            "INSERT",
            {},
            Exception('column "purchase_price_tiers_json" of relation "supplier_products" does not exist'),
        )
        with patch(
            "backend.services.supplier_product_links.create_service._persist_link",
            side_effect=op_err,
        ):
            r = self.client.post(
                "/api/supplier-product-links/",
                json={"tenant_id": 1, "supplier_id": 1, "product_id": 1},
            )
        self.assertEqual(r.status_code, 503, r.text[:500])
        detail = r.json().get("detail")
        self.assertEqual(detail.get("code"), "SUPPLIER_PRODUCT_LINK_UNDEFINED_COLUMN")
        self.assertIn("message", detail)
        self.assertIn("details", detail)

    def test_create_not_null_returns_structured_json(self):
        from backend.services.supplier_product_links.errors import SupplierProductLinkError

        side_effect = SupplierProductLinkError(
            "Brakuje wymaganej wartości w powiązaniu produkt–dostawca.",
            code="SUPPLIER_PRODUCT_LINK_NOT_NULL",
            details='null value in column "supplier_id"',
            http_status=400,
        )
        with patch(
            "backend.api.supplier_product_links.create_supplier_product_link_for_tenant",
            side_effect=side_effect,
        ):
            r = self.client.post(
                "/api/supplier-product-links/",
                json={"tenant_id": 1, "supplier_id": 1, "product_id": 1},
            )
        self.assertEqual(r.status_code, 400, r.text[:500])
        detail = r.json().get("detail")
        self.assertEqual(detail.get("code"), "SUPPLIER_PRODUCT_LINK_NOT_NULL")
        self.assertIn("message", detail)
        self.assertIn("details", detail)

    def test_create_fk_violation_mapped_by_service(self):
        exc = IntegrityError(
            "INSERT",
            {},
            Exception("insert or update on table supplier_products violates foreign key constraint"),
        )
        mapped = map_supplier_product_link_create_exception(exc)
        self.assertEqual(mapped.code, "SUPPLIER_PRODUCT_LINK_FK")


class SupplierProductLinksSchemaDiagnosticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app, raise_server_exceptions=False)

    def test_inspect_schema_report_shape(self):
        report = inspect_supplier_product_links_schema(engine)
        self.assertEqual(report["table"], "supplier_products")
        self.assertIn("table_exists", report)
        self.assertIn("missing_columns", report)
        self.assertIn("indexes", report)
        self.assertIn("foreign_keys", report)
        self.assertIsInstance(report["indexes"], list)
        self.assertIsInstance(report["foreign_keys"], list)

    def test_admin_schema_endpoint_requires_auth(self):
        r = self.client.get("/api/admin/schema/supplier-product-links")
        self.assertIn(r.status_code, (401, 403), r.text[:300])


class SupplierProductLinksDbErrorTests(unittest.TestCase):
    def test_undefined_table_detection(self):
        exc = OperationalError("SELECT", {}, Exception('relation "supplier_products" does not exist'))
        self.assertTrue(is_undefined_table_error(exc))

    def test_undefined_column_detection(self):
        exc = OperationalError(
            "INSERT",
            {},
            Exception('column "purchase_price_tiers_json" does not exist'),
        )
        self.assertTrue(is_undefined_column_error(exc))

    def test_not_null_detection(self):
        exc = IntegrityError(
            "INSERT",
            {},
            Exception('null value in column "supplier_id" violates not-null constraint'),
        )
        self.assertTrue(is_not_null_violation(exc))

    def test_foreign_key_detection(self):
        exc = IntegrityError(
            "INSERT",
            {},
            Exception("violates foreign key constraint fk_supplier_products_supplier_id"),
        )
        self.assertTrue(is_foreign_key_violation(exc))


if __name__ == "__main__":
    unittest.main()
