"""GET /api/suppliers/ — list must not 500 on schema/query edge cases."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from backend.database import SessionLocal
from backend.main import app
from backend.models.supplier import Supplier
class SuppliersListApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app, raise_server_exceptions=False)

    def test_list_missing_tenant_id_returns_422(self):
        r = self.client.get("/api/suppliers/")
        self.assertEqual(r.status_code, 422, r.text[:500])
        detail = r.json().get("detail")
        self.assertTrue(
            any(item.get("loc") == ["query", "tenant_id"] for item in detail),
            detail,
        )

    def test_list_empty_tenant_returns_200_empty_list(self):
        r = self.client.get("/api/suppliers/", params={"tenant_id": 999_999})
        self.assertEqual(r.status_code, 200, r.text[:500])
        self.assertEqual(r.json(), [])

    def test_list_default_returns_200_list(self):
        r = self.client.get("/api/suppliers/", params={"tenant_id": 1})
        self.assertEqual(r.status_code, 200, r.text[:500])
        body = r.json()
        self.assertIsInstance(body, list)
        if body:
            row = body[0]
            self.assertIn("id", row)
            self.assertIn("tenant_id", row)
            self.assertIn("name", row)
            self.assertIn("delivery_count", row)
            self.assertIn("product_count", row)

    def test_list_includes_created_supplier(self):
        db = SessionLocal()
        supplier_id = 0
        try:
            row = Supplier(
                tenant_id=1,
                name="__SUPPLIERS_LIST_API_TEST__",
                active=True,
            )
            db.add(row)
            db.commit()
            supplier_id = int(row.id)

            r = self.client.get(
                "/api/suppliers/",
                params={"tenant_id": 1, "name": "__SUPPLIERS_LIST_API_TEST__"},
            )
            self.assertEqual(r.status_code, 200, r.text[:500])
            matches = [x for x in r.json() if x["id"] == supplier_id]
            self.assertEqual(len(matches), 1)
            self.assertEqual(matches[0]["name"], "__SUPPLIERS_LIST_API_TEST__")
            self.assertEqual(matches[0]["delivery_count"], 0)
            self.assertEqual(matches[0]["product_count"], 0)
        finally:
            if supplier_id:
                db.query(Supplier).filter(Supplier.id == supplier_id).delete()
                db.commit()
            db.close()

    def test_list_query_failure_returns_readable_error_not_500(self):
        with patch(
            "backend.services.suppliers.supplier_list_service._list_impl",
            side_effect=OperationalError("SELECT", {}, Exception('no such column: "suppliers"."is_incomplete"')),
        ):
            with patch(
                "backend.services.suppliers.supplier_list_service.ensure_suppliers_orm_schema",
                side_effect=RuntimeError("migration still missing column"),
            ):
                r = self.client.get("/api/suppliers/", params={"tenant_id": 1})
        self.assertEqual(r.status_code, 503, r.text[:500])
        detail = r.json().get("detail")
        self.assertEqual(detail.get("code"), "SUPPLIERS_LIST_QUERY_FAILED")
        self.assertIn("dostawców", detail.get("message", ""))

    def test_list_unexpected_error_returns_readable_error(self):
        with patch(
            "backend.api.supplier.list_suppliers_for_tenant",
            side_effect=RuntimeError("unexpected"),
        ):
            r = self.client.get("/api/suppliers/", params={"tenant_id": 1})
        self.assertEqual(r.status_code, 503, r.text[:500])
        detail = r.json().get("detail")
        self.assertEqual(detail.get("code"), "SUPPLIERS_LIST_FAILED")
        self.assertIn("dostawców", detail.get("message", ""))

    def test_service_raises_on_invalid_tenant(self):
        from backend.services.suppliers.supplier_list_service import list_suppliers_for_tenant

        db = SessionLocal()
        try:
            with self.assertRaises(ValueError):
                list_suppliers_for_tenant(db, tenant_id=0)
        finally:
            db.close()

    def test_missing_column_error_detection(self):
        from backend.services.suppliers.supplier_list_service import _is_missing_column_error

        self.assertTrue(_is_missing_column_error(Exception('column "is_incomplete" does not exist')))
        self.assertTrue(_is_missing_column_error(Exception("no such column: suppliers.is_incomplete")))
        self.assertFalse(_is_missing_column_error(Exception("connection refused")))


if __name__ == "__main__":
    unittest.main()
