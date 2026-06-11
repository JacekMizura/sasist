"""Z-PZ (RMZ return receipt) — unit tests."""

from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

from backend.services.rmz_return_receipt_service import (
    _any_planned_lines,
    _planned_stock_counts_for_line,
    stock_document_ids_for_rmz,
)
from backend.services.returns.z_pz_constants import RETURN_RECEIPT_DOCUMENT_TYPES, Z_PZ


class _Line:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class TestZPzConstants(unittest.TestCase):
    def test_z_pz_in_return_receipt_types(self) -> None:
        self.assertIn(Z_PZ, RETURN_RECEIPT_DOCUMENT_TYPES)


class TestDecisionMapping(unittest.TestCase):
    def test_accepted_only(self) -> None:
        ln = _Line(
            accepted_qty=2,
            rejected_qty=0,
            damaged_b_qty=0,
            damaged_c_qty=0,
            damage_type=None,
            decision="OK",
            damage_entries_json=None,
            id=1,
        )
        aq, dmg, rej = _planned_stock_counts_for_line(None, 1, 1, ln, include_rejected=False)  # type: ignore[arg-type]
        self.assertEqual(aq, 2)
        self.assertEqual(dmg, [])
        self.assertEqual(rej, 0)
        self.assertTrue(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]

    def test_damaged_b_and_c(self) -> None:
        ln = _Line(
            accepted_qty=0,
            rejected_qty=0,
            damaged_b_qty=1,
            damaged_c_qty=1,
            damage_type=None,
            decision="DAMAGED",
            damage_entries_json=None,
            id=2,
        )
        aq, dmg, rej = _planned_stock_counts_for_line(None, 1, 1, ln, include_rejected=False)  # type: ignore[arg-type]
        self.assertEqual(aq, 0)
        self.assertEqual(len(dmg), 2)
        self.assertIn(("legacy-b-2-0", "B"), dmg)
        self.assertIn(("legacy-c-2-0", "C"), dmg)
        self.assertEqual(rej, 0)

    def test_rejected_no_stock_movement(self) -> None:
        ln = _Line(
            accepted_qty=0,
            rejected_qty=3,
            damaged_b_qty=0,
            damaged_c_qty=0,
            damage_type="reject:product_used",
            decision="REJECTED",
            damage_entries_json=None,
            id=3,
        )
        aq, dmg, rej = _planned_stock_counts_for_line(None, 1, 1, ln, include_rejected=False)  # type: ignore[arg-type]
        self.assertEqual(aq, 0)
        self.assertEqual(dmg, [])
        self.assertEqual(rej, 0)
        self.assertFalse(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]

    def test_rejected_never_counts_as_planned_line(self) -> None:
        """Z-PZ path always uses include_rejected=False — REJECTED never posts stock."""
        ln = _Line(
            accepted_qty=0,
            rejected_qty=2,
            damaged_b_qty=0,
            damaged_c_qty=0,
            damage_type="reject:order_wrong_product",
            decision="REJECTED",
            damage_entries_json=None,
            id=4,
        )
        self.assertFalse(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]


class TestStockDocumentIdsForRmz(unittest.TestCase):
    def test_merges_link_table_and_legacy(self) -> None:
        db = MagicMock()
        rmz = MagicMock()
        rmz.warehouse_document_id = 10

        q_rmz = MagicMock()
        q_rmz.filter.return_value.first.return_value = rmz

        q_link = MagicMock()
        q_link.filter.return_value.all.return_value = [(10,), (11,)]

        q_legacy = MagicMock()
        q_legacy.filter.return_value.all.return_value = [(12,)]

        q_lines = MagicMock()
        q_lines.filter.return_value.distinct.return_value.all.return_value = [(11,)]

        db.query.side_effect = [q_rmz, q_link, q_legacy, q_lines]

        ids = stock_document_ids_for_rmz(db, 5)
        self.assertEqual(ids, [10, 11, 12])


class TestCollectiveDocumentLookup(unittest.TestCase):
    def test_collective_filters_by_warehouse_and_today(self) -> None:
        from backend.services.rmz_return_receipt_service import _find_collective_z_pz_for_today

        db = MagicMock()
        doc = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = doc
        hit = _find_collective_z_pz_for_today(
            db,
            tenant_id=1,
            warehouse_id=2,
            series_id="series-uuid",
        )
        self.assertIs(hit, doc)
        filter_call = db.query.return_value.filter
        self.assertTrue(filter_call.called)


class TestReturnLink(unittest.TestCase):
    def test_ensure_return_link_idempotent(self) -> None:
        from backend.services.rmz_return_receipt_service import _ensure_return_link

        db = MagicMock()
        existing = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = existing
        row = _ensure_return_link(
            db,
            tenant_id=1,
            warehouse_id=2,
            stock_document_id=99,
            rmz_id=7,
        )
        self.assertIs(row, existing)
        db.add.assert_not_called()


class TestEnsureRmzReturnReceiptDocument(unittest.TestCase):
    def _rmz(self, *, wh_id: int = 1, rmz_id: int = 100) -> MagicMock:
        rmz = MagicMock()
        rmz.id = rmz_id
        rmz.tenant_id = 1
        rmz.warehouse_id = wh_id
        rmz.warehouse_document_id = None
        return rmz

    def _accepted_line(self) -> MagicMock:
        ln = MagicMock()
        ln.id = 1
        ln.product_id = 10
        ln.order_item_id = 20
        ln.accepted_qty = 1
        ln.rejected_qty = 0
        ln.damaged_b_qty = 0
        ln.damaged_c_qty = 0
        ln.damage_type = None
        ln.decision = "OK"
        ln.damage_entries_json = None
        ln.rmz_id = 100
        return ln

    @patch("backend.services.rmz_return_receipt_service._link_rmz_to_document")
    @patch("backend.services.rmz_return_receipt_service._append_rmz_lines_to_document")
    @patch("backend.services.rmz_return_receipt_service.recompute_putaway_status_for_document")
    @patch("backend.services.rmz_return_receipt_service._patch_damage_entries_with_stock_links")
    @patch("backend.services.rmz_return_receipt_service._create_z_pz_shell")
    @patch("backend.services.rmz_return_receipt_service._find_collective_z_pz_for_today")
    @patch("backend.services.rmz_return_receipt_service._find_existing_document_for_rmz")
    @patch("backend.services.rmz_return_receipt_service._resolve_z_pz_series")
    @patch("backend.services.rmz_return_receipt_service._rmz_lines_already_posted")
    def test_collective_reuses_daily_document(
        self,
        mock_posted,
        mock_series,
        mock_existing,
        mock_find_collective,
        mock_create,
        mock_patch_damage,
        mock_recompute,
        mock_append,
        mock_link,
    ) -> None:
        from backend.services.rmz_return_receipt_service import ensure_rmz_return_receipt_document

        db = MagicMock()
        rmz = self._rmz()
        series = MagicMock()
        series.id = "series-1"
        series.collective_return_receipt = True
        mock_series.return_value = series
        mock_existing.return_value = None
        mock_posted.return_value = False
        collective_doc = MagicMock()
        collective_doc.id = 501
        mock_find_collective.return_value = collective_doc
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
            self._accepted_line()
        ]
        mock_append.return_value = [MagicMock()]

        doc = ensure_rmz_return_receipt_document(db, rmz)

        self.assertIs(doc, collective_doc)
        mock_create.assert_not_called()
        mock_link.assert_called_once()
        mock_append.assert_called_once()

    @patch("backend.services.rmz_return_receipt_service._link_rmz_to_document")
    @patch("backend.services.rmz_return_receipt_service._append_rmz_lines_to_document")
    @patch("backend.services.rmz_return_receipt_service.recompute_putaway_status_for_document")
    @patch("backend.services.rmz_return_receipt_service._patch_damage_entries_with_stock_links")
    @patch("backend.services.rmz_return_receipt_service._create_z_pz_shell")
    @patch("backend.services.rmz_return_receipt_service._find_collective_z_pz_for_today")
    @patch("backend.services.rmz_return_receipt_service._find_existing_document_for_rmz")
    @patch("backend.services.rmz_return_receipt_service._resolve_z_pz_series")
    @patch("backend.services.rmz_return_receipt_service._rmz_lines_already_posted")
    def test_non_collective_creates_per_rmz_document(
        self,
        mock_posted,
        mock_series,
        mock_existing,
        mock_find_collective,
        mock_create,
        mock_patch_damage,
        mock_recompute,
        mock_append,
        mock_link,
    ) -> None:
        from backend.services.rmz_return_receipt_service import ensure_rmz_return_receipt_document

        db = MagicMock()
        rmz = self._rmz()
        series = MagicMock()
        series.id = "series-1"
        series.collective_return_receipt = False
        mock_series.return_value = series
        mock_existing.return_value = None
        mock_posted.return_value = False
        new_doc = MagicMock()
        new_doc.id = 777
        mock_create.return_value = new_doc
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
            self._accepted_line()
        ]
        mock_append.return_value = [MagicMock()]

        doc = ensure_rmz_return_receipt_document(db, rmz)

        self.assertIs(doc, new_doc)
        mock_find_collective.assert_not_called()
        mock_create.assert_called_once()
        _, kwargs = mock_create.call_args
        self.assertFalse(kwargs.get("collective"))

    @patch("backend.services.rmz_return_receipt_service._link_rmz_to_document")
    @patch("backend.services.rmz_return_receipt_service._append_rmz_lines_to_document")
    @patch("backend.services.rmz_return_receipt_service.recompute_putaway_status_for_document")
    @patch("backend.services.rmz_return_receipt_service._patch_damage_entries_with_stock_links")
    @patch("backend.services.rmz_return_receipt_service._create_z_pz_shell")
    @patch("backend.services.rmz_return_receipt_service._find_collective_z_pz_for_today")
    @patch("backend.services.rmz_return_receipt_service._find_existing_document_for_rmz")
    @patch("backend.services.rmz_return_receipt_service._resolve_z_pz_series")
    @patch("backend.services.rmz_return_receipt_service._rmz_lines_already_posted")
    def test_different_warehouses_use_separate_collective_lookup(
        self,
        mock_posted,
        mock_series,
        mock_existing,
        mock_find_collective,
        mock_create,
        mock_patch_damage,
        mock_recompute,
        mock_append,
        mock_link,
    ) -> None:
        from backend.services.rmz_return_receipt_service import ensure_rmz_return_receipt_document

        db = MagicMock()
        series = MagicMock()
        series.id = "series-1"
        series.collective_return_receipt = True
        mock_series.return_value = series
        mock_existing.return_value = None
        mock_posted.return_value = False
        mock_find_collective.return_value = None
        created = MagicMock()
        created.id = 1
        mock_create.return_value = created
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
            self._accepted_line()
        ]
        mock_append.return_value = [MagicMock()]

        ensure_rmz_return_receipt_document(db, self._rmz(wh_id=1))
        ensure_rmz_return_receipt_document(db, self._rmz(wh_id=2, rmz_id=101))

        wh_ids = {c.kwargs["warehouse_id"] for c in mock_find_collective.call_args_list}
        self.assertEqual(wh_ids, {1, 2})

    @patch("backend.services.rmz_return_receipt_service._ensure_return_link")
    def test_link_created_on_finalize(self, mock_link_fn) -> None:
        from backend.services.rmz_return_receipt_service import _link_rmz_to_document

        db = MagicMock()
        rmz = self._rmz()
        doc = MagicMock()
        doc.id = 900
        doc.rmz_id = None

        _link_rmz_to_document(db, rmz, doc, collective=False)

        self.assertEqual(rmz.warehouse_document_id, 900)
        self.assertEqual(rmz.warehouse_document_type, Z_PZ)
        mock_link_fn.assert_called_once()


if __name__ == "__main__":
    unittest.main()
