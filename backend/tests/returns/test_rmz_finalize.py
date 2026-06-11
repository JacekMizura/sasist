"""Atomic RMZ finalize + collective Z-PZ race safety."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.schemas.wms_return import WmsReturnFinalizeLineIn
from backend.services.returns.errors import RmzFinalizeError
from backend.services.returns.rmz_finalize_service import finalize_rmz_return
from backend.services.returns.rmz_line_split_service import assert_rmz_editable


class TestRmzEditableGuard(unittest.TestCase):
    def test_blocks_when_warehouse_document_exists(self) -> None:
        row = MagicMock()
        row.warehouse_document_id = 99
        row.return_status = None
        with self.assertRaises(RmzFinalizeError):
            assert_rmz_editable(row)


class TestFinalizeRollback(unittest.TestCase):
    @patch("backend.services.returns.rmz_finalize_service.ensure_rmz_return_receipt_document")
    @patch("backend.services.returns.rmz_finalize_service.apply_rmz_line_split")
    def test_z_pz_failure_propagates(self, mock_apply, mock_z_pz) -> None:
        from backend.services.returns.rmz_finalize_service import finalize_rmz_return

        db = MagicMock()
        row = MagicMock()
        row.id = 1
        row.tenant_id = 1
        row.warehouse_id = 1
        row.return_type = "RMA"
        row.warehouse_document_id = None
        row.return_status = None

        settings = MagicMock()
        settings.returns_mode = "simple"
        settings.require_photos = False
        settings.enable_refund = False

        ln = MagicMock()
        ln.order_item_id = 10
        ln.rmz_id = 1
        db.query.return_value.filter.return_value.all.return_value = [ln]

        mock_z_pz.side_effect = ValueError("Z-PZ failed")

        with self.assertRaises(ValueError):
            finalize_rmz_return(
                db,
                row,
                line_payloads=[
                    WmsReturnFinalizeLineIn(
                        order_item_id=10,
                        product_id=1,
                        accepted_qty=1,
                    )
                ],
                settings=settings,
            )


class TestCollectiveIntegrityRecovery(unittest.TestCase):
    """Unique index collision → retry find (race between two operators)."""

    @patch("backend.services.returns.collective_z_pz_service.create_collective_z_pz_shell")
    @patch("backend.services.returns.collective_z_pz_service.find_active_collective_z_pz")
    @patch("backend.services.returns.collective_z_pz_service.acquire_collective_z_pz_lock")
    def test_integrity_error_falls_back_to_existing_doc(
        self,
        mock_lock,
        mock_find,
        mock_create,
    ) -> None:
        from sqlalchemy.exc import IntegrityError

        from backend.services.returns.collective_z_pz_service import find_or_create_collective_z_pz

        db = MagicMock()
        rmz = MagicMock()
        rmz.tenant_id = 1
        rmz.warehouse_id = 1
        rmz.id = 5
        series = MagicMock()
        series.id = "s1"

        existing = MagicMock()
        existing.id = 42

        mock_find.side_effect = [None, existing]
        mock_create.side_effect = IntegrityError("INSERT", {}, Exception("unique"))

        doc = find_or_create_collective_z_pz(db, rmz, series=series)
        self.assertIs(doc, existing)
        self.assertEqual(mock_find.call_count, 2)
        mock_lock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
