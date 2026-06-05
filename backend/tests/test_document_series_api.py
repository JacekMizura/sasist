"""Document series API — list, auto-seed, MM readiness."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.document_series_catalog import (
    ALL_OPERATIONAL_SERIES,
    DEFAULT_NUMBERING_FORMAT,
    normalize_series_spec,
)
from backend.services.document_series_seed_service import ensure_default_document_series

REQUIRED_WAREHOUSE_SUBTYPES = {
    normalize_series_spec(s)["subtype"]
    for s in ALL_OPERATIONAL_SERIES
    if normalize_series_spec(s)["series_type"] == "WAREHOUSE"
}
REQUIRED_SALE_SUBTYPES = {"INVOICE", "RECEIPT"}
REQUIRED_CORRECTION_SUBTYPES = {"CORRECTION"}


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
        self.assertTrue(REQUIRED_SALE_SUBTYPES.issubset(subtypes))
        self.assertIn("CORRECTION", subtypes)

    def test_mm_series_present_after_seed(self):
        r = self.client.get("/api/document-series", params={"tenant_id": 1, "warehouse_id": 1})
        self.assertEqual(r.status_code, 200)
        mm = [x for x in r.json() if str(x.get("subtype")).upper() == "MM"]
        self.assertTrue(mm, "MM series must exist after list auto-seed")
        self.assertTrue(mm[0].get("is_active", True))
        self.assertEqual(mm[0].get("numbering_format"), DEFAULT_NUMBERING_FORMAT)

    def test_safe_series_to_read_coerces_legacy_fields(self):
        from backend.api.document_series import _safe_series_to_read
        from backend.models.document_series import DocumentSeries

        row = DocumentSeries(
            id="bad",
            tenant_id=1,
            warehouse_id=1,
            name="x",
            color="not-a-color",
            series_type="WAREHOUSE",
            subtype="PZ",
            vat_rate_percent="nope",
        )
        out = _safe_series_to_read(row)
        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out.color, "#64748b")
        self.assertIsNone(out.vat_rate_percent)


class OperationalCatalogApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_operational_catalog_returns_required_types(self):
        r = self.client.get(
            "/api/document-series/operational-catalog",
            params={"tenant_id": 1, "warehouse_id": 1},
        )
        self.assertEqual(r.status_code, 200, r.text[:500])
        body = r.json()
        self.assertTrue(body.get("bootstrap_complete"), body)
        self.assertGreaterEqual(int(body.get("configured_count") or 0), 8)
        codes = {str(x.get("operational_code") or "").upper() for x in body.get("items") or []}
        for code in ("PZ", "WZ", "MM", "RW", "PW", "FV", "PA", "KOR"):
            self.assertIn(code, codes, f"missing operational code {code}")


class EnsureDefaultDocumentSeriesTests(unittest.TestCase):
    def test_ensure_idempotent(self):
        from backend.database import SessionLocal
        from backend.models.document_series import DocumentSeries

        db = SessionLocal()
        try:
            first = ensure_default_document_series(db, 1, 1)
            second = ensure_default_document_series(db, 1, 1)
            self.assertGreaterEqual(first, 0)
            self.assertEqual(second, 0)
            count = db.query(DocumentSeries).filter_by(tenant_id=1, warehouse_id=1).count()
            self.assertGreaterEqual(count, len(ALL_OPERATIONAL_SERIES))
        finally:
            db.close()

    def test_legacy_single_pz_promoted_not_duplicated(self):
        from backend.database import SessionLocal
        from backend.models.document_series import DocumentSeries

        db = SessionLocal()
        try:
            ensure_default_document_series(db, 1, 1)
            pz_rows = (
                db.query(DocumentSeries)
                .filter_by(tenant_id=1, warehouse_id=1, series_type="WAREHOUSE", subtype="PZ")
                .all()
            )
            self.assertGreaterEqual(len(pz_rows), 1)
            defaults = [r for r in pz_rows if bool(getattr(r, "is_default", False))]
            self.assertEqual(len(defaults), 1, "exactly one default PZ series")
        finally:
            db.close()

    def test_new_series_use_monthly_format(self):
        from backend.database import SessionLocal
        from backend.models.document_series import DocumentSeries

        db = SessionLocal()
        try:
            ensure_default_document_series(db, 1, 1)
            mm = (
                db.query(DocumentSeries)
                .filter_by(tenant_id=1, warehouse_id=1, series_type="WAREHOUSE", subtype="MM", is_default=True)
                .first()
            )
            if mm is None:
                mm = (
                    db.query(DocumentSeries)
                    .filter_by(tenant_id=1, warehouse_id=1, series_type="WAREHOUSE", subtype="MM")
                    .first()
                )
            self.assertIsNotNone(mm)
            assert mm is not None
            self.assertEqual((mm.prefix or "").strip(), "MM")
            self.assertEqual(mm.numbering_format, DEFAULT_NUMBERING_FORMAT)
            self.assertTrue(bool(getattr(mm, "monthly_reset", False)))
        finally:
            db.close()
