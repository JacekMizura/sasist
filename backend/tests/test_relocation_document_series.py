"""Serie dokumentów MM — walidacja i auto-wybór dla rozlokowania."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.document_number_service import DocumentSeriesOperationalError
from backend.services.relocation_document_series_service import (
    RELOCATION_DOCUMENT_SERIES_MISSING_MSG,
    assert_relocation_document_series_configured,
    resolve_relocation_document_series,
)


def _series(*, sid: str = "s1", subtype: str = "MM", name: str = "MM magazyn"):
    return SimpleNamespace(
        id=sid,
        subtype=subtype,
        name=name,
        series_type="WAREHOUSE",
        is_active=True,
        is_default=True,
    )


class TestRelocationDocumentSeries(unittest.TestCase):
    def test_missing_series_raises_operational_error(self):
        db = MagicMock()
        with patch(
            "backend.services.relocation_document_series_service.require_warehouse_series",
            side_effect=DocumentSeriesOperationalError(document_type="MM", message="Brak aktywnej serii dokumentów MM"),
        ), patch(
            "backend.services.relocation_document_series_service.resolve_relocation_document_series",
            return_value=None,
        ):
            with self.assertRaises(DocumentSeriesOperationalError) as ctx:
                assert_relocation_document_series_configured(db, tenant_id=1, warehouse_id=2)
        self.assertEqual(str(ctx.exception), RELOCATION_DOCUMENT_SERIES_MISSING_MSG)

    def test_auto_default_mm_series(self):
        db = MagicMock()
        row = _series()
        with patch(
            "backend.services.relocation_document_series_service.require_warehouse_series",
            return_value=row,
        ):
            hit = assert_relocation_document_series_configured(db, tenant_id=1, warehouse_id=2)
        self.assertIs(hit, row)

    def test_resolve_prefers_mm_over_rw(self):
        db = MagicMock()
        mm = _series(sid="m1", subtype="MM", name="MM domyślna")
        with patch(
            "backend.services.relocation_document_series_service.resolve_default_document_series",
            side_effect=[mm, None, None],
        ):
            hit = resolve_relocation_document_series(db, tenant_id=1, warehouse_id=2)
        self.assertEqual(hit.id, "m1")

    def test_resolve_fallback_rw_when_mm_missing(self):
        db = MagicMock()
        rw = _series(sid="r1", subtype="RW", name="RW zapasowa")
        with patch(
            "backend.services.relocation_document_series_service.resolve_default_document_series",
            side_effect=[None, rw, None],
        ):
            hit = resolve_relocation_document_series(db, tenant_id=1, warehouse_id=2)
        self.assertEqual(hit.id, "r1")
