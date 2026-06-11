"""Centralized document numbering — format and operational errors."""

from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.document_number_service import (
    DOCUMENT_SERIES_MISSING_CODE,
    DocumentSeriesOperationalError,
    _should_reset_counter,
    format_document_number,
    require_warehouse_series,
    resolve_default_document_series,
)
from backend.services.document_series_catalog import DEFAULT_NUMBERING_FORMAT


def _series(**kwargs):
    defaults = dict(
        prefix="MM",
        suffix="",
        numbering_format=DEFAULT_NUMBERING_FORMAT,
        padding_length=6,
        code="MAG1",
        monthly_reset=True,
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestFormatDocumentNumber(unittest.TestCase):
    def test_mm_monthly_format(self):
        s = _series()
        out = format_document_number(s, 1, now=datetime(2026, 6, 4))
        self.assertEqual(out, "MM/2026/06/000001")

    def test_pz_monthly_format(self):
        s = _series(prefix="PZ", subtype="PZ")
        out = format_document_number(s, 42, now=datetime(2026, 6, 4))
        self.assertEqual(out, "PZ/2026/06/000042")

    def test_pa_receipt_zero_padding(self):
        s = _series(prefix="PA", numbering_format="{PREFIX}/{YEAR}/{MONTH}/{NUMBER}", padding_length=0)
        out = format_document_number(s, 3, now=datetime(2026, 6, 4))
        self.assertEqual(out, "PA/2026/06/3")

    def test_z_pz_year_format_no_padding(self):
        s = _series(
            prefix="Z-PZ",
            numbering_format="{PREFIX}-{YEAR}-{NUMBER}",
            padding_length=0,
            monthly_reset=False,
        )
        out = format_document_number(s, 3, now=datetime(2026, 6, 4))
        self.assertEqual(out, "Z-PZ-2026-3")

    def test_default_no_padding_when_unset(self):
        s = SimpleNamespace(
            prefix="Z-PZ",
            suffix="",
            numbering_format="{PREFIX}-{YEAR}-{NUMBER}",
            code="MAG1",
            monthly_reset=False,
        )
        out = format_document_number(s, 1, now=datetime(2026, 6, 4))
        self.assertEqual(out, "Z-PZ-2026-1")

    def test_wz_with_warehouse_code_legacy_format(self):
        s = _series(
            prefix="WZ",
            numbering_format="{PREFIX}/{WAREHOUSE}/{YEAR}/{NUMBER}",
            code="MAG1",
            monthly_reset=False,
        )
        out = format_document_number(s, 145, now=datetime(2026, 3, 1))
        self.assertEqual(out, "WZ/MAG1/2026/000145")


class TestMonthlyReset(unittest.TestCase):
    def test_monthly_reset_on_new_month(self):
        s = _series(monthly_reset=True, last_number_period="2026-05")
        self.assertTrue(_should_reset_counter(s, datetime(2026, 6, 1)))

    def test_monthly_reset_same_month(self):
        s = _series(monthly_reset=True, last_number_period="2026-06")
        self.assertFalse(_should_reset_counter(s, datetime(2026, 6, 15)))


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
