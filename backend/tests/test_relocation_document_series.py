"""Serie dokumentów ZWK/MM — walidacja i auto-wybór."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.relocation_document_series_service import (
    RELOCATION_DOCUMENT_SERIES_MISSING_MSG,
    assert_relocation_document_series_configured,
    resolve_relocation_document_series,
)


def _series(*, sid: str = "s1", subtype: str = "RW", name: str = "RW magazyn"):
    return SimpleNamespace(id=sid, subtype=subtype, name=name, series_type="WAREHOUSE")


class TestRelocationDocumentSeries(unittest.TestCase):
    def test_missing_series_raises_value_error(self):
        db = MagicMock()
        with patch(
            "backend.services.relocation_document_series_service._warehouse_series_query",
            return_value=MagicMock(all=MagicMock(return_value=[])),
        ):
            with self.assertRaises(ValueError) as ctx:
                assert_relocation_document_series_configured(db, tenant_id=1, warehouse_id=2)
        self.assertEqual(str(ctx.exception), RELOCATION_DOCUMENT_SERIES_MISSING_MSG)

    def test_auto_default_single_rw_series(self):
        db = MagicMock()
        row = _series()
        with patch(
            "backend.services.relocation_document_series_service._warehouse_series_query",
            return_value=MagicMock(all=MagicMock(return_value=[row])),
        ):
            hit = resolve_relocation_document_series(db, tenant_id=1, warehouse_id=2)
        self.assertIs(hit, row)

    def test_prefers_zwk_named_rw_series(self):
        db = MagicMock()
        generic = _series(sid="g1", name="RW ogólna")
        named = _series(sid="z1", name="ZWK rozlokowanie")
        with patch(
            "backend.services.relocation_document_series_service._warehouse_series_query",
            return_value=MagicMock(all=MagicMock(return_value=[generic, named])),
        ):
            hit = resolve_relocation_document_series(db, tenant_id=1, warehouse_id=2)
        self.assertEqual(hit.id, "z1")
