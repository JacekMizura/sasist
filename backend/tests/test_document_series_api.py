"""Document series API — list, auto-seed, MM readiness."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.document_series_seed_service import (
    _DEFAULT_CORRECTION_SERIES,
    _DEFAULT_SALE_SERIES,
    _DEFAULT_WAREHOUSE_SERIES,
    ensure_default_document_series,
)

REQUIRED_WAREHOUSE_SUBTYPES = {s["subtype"] for s in _DEFAULT_WAREHOUSE_SERIES}
REQUIRED_SALE_SUBTYPES = {"INVOICE", "RECEIPT"}
REQUIRED_CORRECTION_SUBTYPES = {s["subtype"] for s in _DEFAULT_CORRECTION_SERIES}


class DocumentSeriesApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_list_without_trailing_slash_returns_200(self):
        r = self.client.get("/api/document-series", params={"tenant_id": 1, "warehouse_id": 1})
        self.assertEqual(r.status_code, 200, r.text[:500])
        self.assertIsInstance(r.json(), list)

    def test_list_with_trailing_slash_no_redirect(self):
        r = self.client.get(
            "/api/document-series/",
            params={"tenant_id": 1, "warehouse_id": 1},
            follow_redirects=False,
        )
        self.assertEqual(r.status_code, 200, r.text[:500])

    def test_list_auto_seeds_required_series(self):
        with patch(
            "backend.api.document_series.ensure_default_document_series",
            wraps=ensure_default_document_series,
        ) as mock_ensure:
            r = self.client.get("/api/document-series", params={"tenant_id": 1, "warehouse_id": 1})
        self.assertEqual(r.status_code, 200)
        mock_ensure.assert_called()
        rows = r.json()
        subtypes = {str(x.get("subtype") or "").upper() for x in rows}
        for sub in REQUIRED_WAREHOUSE_SUBTYPES:
            self.assertIn(sub, subtypes, f"missing warehouse subtype {sub}")
        self.assertTrue({"INVOICE", "RECEIPT"}.issubset(subtypes))
        self.assertIn("CORRECTION", subtypes)

    def test_mm_series_present_after_seed(self):
        r = self.client.get("/api/document-series", params={"tenant_id": 1, "warehouse_id": 1})
        self.assertEqual(r.status_code, 200)
        mm = [x for x in r.json() if str(x.get("subtype")).upper() == "MM"]
        self.assertTrue(mm, "MM series must exist after list auto-seed")
        self.assertTrue(mm[0].get("is_active", True))


class EnsureDefaultDocumentSeriesTests(unittest.TestCase):
    def test_ensure_idempotent(self):
        from backend.database import SessionLocal

        db = SessionLocal()
        try:
            first = ensure_default_document_series(db, 1, 1)
            second = ensure_default_document_series(db, 1, 1)
            self.assertGreaterEqual(first, 0)
            self.assertEqual(second, 0)
            count = (
                db.query(__import__("backend.models.document_series", fromlist=["DocumentSeries"]).DocumentSeries)
                .filter_by(tenant_id=1, warehouse_id=1)
                .count()
            )
            expected = (
                len(_DEFAULT_WAREHOUSE_SERIES)
                + len(_DEFAULT_SALE_SERIES)
                + len(_DEFAULT_CORRECTION_SERIES)
            )
            self.assertGreaterEqual(count, expected)
        finally:
            db.close()
