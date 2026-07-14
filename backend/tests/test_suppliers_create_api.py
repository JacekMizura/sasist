"""POST /api/suppliers/ — create must return readable errors, not opaque 500."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError, OperationalError

from backend.database import SessionLocal
from backend.main import app
from backend.models.supplier import Supplier
from backend.schemas.supplier import SupplierCreateBody
from backend.services.suppliers.errors import SupplierCreateError
from backend.services.suppliers.supplier_create_service import (
    create_supplier_for_tenant,
    map_supplier_create_exception,
)


class SuppliersCreateApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app, raise_server_exceptions=False)

    def test_create_supplier_success(self):
        r = self.client.post(
            "/api/suppliers/",
            json={"tenant_id": 1, "name": "__SUPPLIER_CREATE_API_TEST__", "active": True},
        )
        self.assertEqual(r.status_code, 201, r.text[:500])
        body = r.json()
        self.assertEqual(body["name"], "__SUPPLIER_CREATE_API_TEST__")
        self.assertEqual(body["tenant_id"], 1)
        self.assertEqual(body["delivery_count"], 0)
        self.assertEqual(body["product_count"], 0)
        db = SessionLocal()
        try:
            db.query(Supplier).filter(Supplier.id == body["id"]).delete()
            db.commit()
        finally:
            db.close()

    def test_create_missing_column_returns_readable_json(self):
        op_err = OperationalError(
            "INSERT",
            {},
            Exception('column "offers_free_shipping" of relation "suppliers" does not exist'),
        )
        with patch(
            "backend.services.suppliers.supplier_create_service._persist_supplier",
            side_effect=op_err,
        ):
            with patch(
                "backend.services.suppliers.supplier_create_service.ensure_suppliers_orm_schema",
            ):
                r = self.client.post(
                    "/api/suppliers/",
                    json={"tenant_id": 1, "name": "__SUPPLIER_CREATE_SCHEMA_TEST__"},
                )
        self.assertEqual(r.status_code, 503, r.text[:500])
        detail = r.json().get("detail")
        self.assertEqual(detail.get("code"), "SUPPLIER_CREATE_SCHEMA")
        self.assertIn("message", detail)
        self.assertIn("details", detail)
        self.assertIn("schemat", detail["message"].lower())

    def test_create_duplicate_returns_409_readable_json(self):
        with patch(
            "backend.api.supplier.create_supplier_for_tenant",
            side_effect=SupplierCreateError(
                "Dostawca o podanych danych już istnieje.",
                code="SUPPLIER_CREATE_DUPLICATE",
                details='duplicate key value violates unique constraint "uq_suppliers_name"',
                http_status=409,
            ),
        ):
            r = self.client.post(
                "/api/suppliers/",
                json={"tenant_id": 1, "name": "Duplikat Test"},
            )
        self.assertEqual(r.status_code, 409, r.text[:500])
        detail = r.json().get("detail")
        self.assertEqual(detail.get("code"), "SUPPLIER_CREATE_DUPLICATE")
        self.assertIn("już istnieje", detail.get("message", ""))

    def test_create_not_null_returns_readable_json(self):
        with patch(
            "backend.api.supplier.create_supplier_for_tenant",
            side_effect=SupplierCreateError(
                "Brakuje wymaganej wartości w danych dostawcy.",
                code="SUPPLIER_CREATE_NOT_NULL",
                details='null value in column "name" of relation "suppliers" violates not-null constraint',
                http_status=400,
            ),
        ):
            r = self.client.post(
                "/api/suppliers/",
                json={"tenant_id": 1, "name": "Test NOT NULL"},
            )
        self.assertEqual(r.status_code, 400, r.text[:500])
        detail = r.json().get("detail")
        self.assertEqual(detail.get("code"), "SUPPLIER_CREATE_NOT_NULL")
        self.assertIn("wymaganej", detail.get("message", ""))

    def test_create_unexpected_error_returns_structured_json(self):
        with patch(
            "backend.api.supplier.create_supplier_for_tenant",
            side_effect=RuntimeError("unexpected"),
        ):
            r = self.client.post(
                "/api/suppliers/",
                json={"tenant_id": 1, "name": "Test unexpected"},
            )
        self.assertEqual(r.status_code, 503, r.text[:500])
        detail = r.json().get("detail")
        self.assertEqual(detail.get("code"), "SUPPLIER_CREATE_FAILED")
        self.assertIn("message", detail)
        self.assertIn("details", detail)


class SuppliersCreateServiceTests(unittest.TestCase):
    def test_map_integrity_duplicate(self):
        exc = IntegrityError("stmt", {}, Exception("duplicate key value violates unique constraint"))
        mapped = map_supplier_create_exception(exc)
        self.assertEqual(mapped.code, "SUPPLIER_CREATE_DUPLICATE")
        self.assertEqual(mapped.http_status, 409)

    def test_map_integrity_not_null(self):
        exc = IntegrityError(
            "stmt",
            {},
            Exception('null value in column "name" violates not-null constraint'),
        )
        mapped = map_supplier_create_exception(exc)
        self.assertEqual(mapped.code, "SUPPLIER_CREATE_NOT_NULL")
        self.assertEqual(mapped.http_status, 400)

    def test_map_validation_error(self):
        try:
            SupplierCreateBody.model_validate({"tenant_id": 1, "name": "", "country": "Polska"})
        except ValidationError as exc:
            mapped = map_supplier_create_exception(exc)
        else:
            self.fail("expected ValidationError")
        self.assertEqual(mapped.code, "SUPPLIER_CREATE_VALIDATION")

    def test_map_key_error(self):
        mapped = map_supplier_create_exception(KeyError("tenant_id"))
        self.assertEqual(mapped.code, "SUPPLIER_CREATE_KEY_ERROR")

    def test_map_attribute_error(self):
        mapped = map_supplier_create_exception(AttributeError("missing field"))
        self.assertEqual(mapped.code, "SUPPLIER_CREATE_ATTRIBUTE_ERROR")

    def test_create_rolls_back_on_integrity_error(self):
        db = SessionLocal()
        body = SupplierCreateBody(tenant_id=1, name="__SUPPLIER_CREATE_ROLLBACK__")
        try:
            with patch.object(
                db,
                "commit",
                side_effect=IntegrityError(
                    "INSERT",
                    {},
                    Exception('null value in column "name" violates not-null constraint'),
                ),
            ):
                with patch.object(db, "rollback") as rollback_mock:
                    with self.assertRaises(SupplierCreateError) as ctx:
                        create_supplier_for_tenant(db, body)
                    self.assertEqual(ctx.exception.code, "SUPPLIER_CREATE_NOT_NULL")
                    rollback_mock.assert_called()
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
