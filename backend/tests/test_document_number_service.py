"""Centralized document numbering — format and operational errors."""

from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.document_number_service import (
    DOCUMENT_SERIES_MISSING_CODE,
    DocumentSeriesOperationalError,
    format_document_number,
    require_warehouse_series,
    resolve_default_document_series,
)


def _series(**kwargs):
    defaults = dict(
        prefix="MM/",
        suffix="",
        numbering_format="{PREFIX}{YEAR}/{NUMBER}",
        padding_length=6,
        code="MAG1",
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestFormatDocumentNumber(unittest.TestCase):
    def test_mm_yearly_format(self):
        s = _series()
        out = format_document_number(s, 21, now=datetime(2026, 6, 4))
        self.assertEqual(out, "MM/2026/000021")

    def test_wz_with_warehouse_code(self):
        s = _series(
            prefix="WZ/",
            numbering_format="{PREFIX}{WAREHOUSE}/{YEAR}/{NUMBER}",
            code="MAG1",
        )
        out = format_document_number(s, 145, now=datetime(2026, 3, 1))
        self.assertEqual(out, "WZ/MAG1/2026/000145")

    def test_fv_monthly_format(self):
        s = _series(
            prefix="FV/",
            numbering_format="{PREFIX}{MONTH}/{YEAR}/{NUMBER}",
            code="",
        )
        out = format_document_number(s, 882, now=datetime(2026, 6, 4))
        self.assertEqual(out, "FV/06/2026/000882")


class TestRequireWarehouseSeries(unittest.TestCase):
    def test_missing_raises_structured_error(self):
        db = MagicMock()
        with patch(
            "backend.services.document_number_service.resolve_default_document_series",
            return_value=None,
        ):
            with self.assertRaises(DocumentSeriesOperationalError) as ctx:
                require_warehouse_series(db, tenant_id=1, warehouse_id=2, subtype="MM")
        exc = ctx.exception
        self.assertEqual(exc.code, DOCUMENT_SERIES_MISSING_CODE)
        self.assertEqual(exc.document_type, "MM")
        self.assertIn("MM", exc.message)

    def test_resolve_default_prefers_single_default(self):
        db = MagicMock()
        default = SimpleNamespace(id="d1", is_active=True, is_default=True, name="A")
        other = SimpleNamespace(id="d2", is_active=True, is_default=False, name="B")
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
            default,
            other,
        ]
        hit = resolve_default_document_series(
            db,
            tenant_id=1,
            warehouse_id=2,
            series_type="WAREHOUSE",
            subtype="MM",
        )
        self.assertEqual(hit.id, "d1")
