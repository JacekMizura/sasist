"""Complaint physical receipt modes — warehouse vs service paths."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.services.complaints.complaint_physical_receipt import (
    PHYSICAL_RECEIPT_MODE_DIRECT_SERVICE,
    PHYSICAL_RECEIPT_MODE_SERVICE_FORWARD,
    PHYSICAL_RECEIPT_MODE_WAREHOUSE,
    document_has_putaway_eligible_received_lines,
    normalize_physical_receipt_mode,
    physical_receipt_mode_requires_putaway,
    physical_receipt_mode_requires_z_pz,
    stock_document_item_requires_putaway,
)
from backend.services.complaints.complaint_receipt_service import (
    COMPLAINT_RETURN_DECISION_SERVICE_FORWARD,
    receive_complaint_line_at_warehouse,
)
from backend.services.stock_disposition import (
    STOCK_DISPOSITION_QUARANTINE,
    STOCK_DISPOSITION_SERVICE_C,
)


class _Line:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class TestPhysicalReceiptModeHelpers(unittest.TestCase):
    def test_normalize_defaults_to_warehouse(self) -> None:
        self.assertEqual(normalize_physical_receipt_mode(None), PHYSICAL_RECEIPT_MODE_WAREHOUSE)
        self.assertEqual(normalize_physical_receipt_mode("service_forward"), PHYSICAL_RECEIPT_MODE_SERVICE_FORWARD)

    def test_z_pz_and_putaway_gates(self) -> None:
        self.assertTrue(physical_receipt_mode_requires_z_pz(PHYSICAL_RECEIPT_MODE_WAREHOUSE))
        self.assertTrue(physical_receipt_mode_requires_z_pz(PHYSICAL_RECEIPT_MODE_SERVICE_FORWARD))
        self.assertFalse(physical_receipt_mode_requires_z_pz(PHYSICAL_RECEIPT_MODE_DIRECT_SERVICE))
        self.assertTrue(physical_receipt_mode_requires_putaway(PHYSICAL_RECEIPT_MODE_WAREHOUSE))
        self.assertFalse(physical_receipt_mode_requires_putaway(PHYSICAL_RECEIPT_MODE_SERVICE_FORWARD))
        self.assertFalse(physical_receipt_mode_requires_putaway(PHYSICAL_RECEIPT_MODE_DIRECT_SERVICE))


class TestPutawayEligibility(unittest.TestCase):
    def test_service_forward_line_excluded_from_putaway(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.scalar.return_value = PHYSICAL_RECEIPT_MODE_SERVICE_FORWARD
        row = _Line(source_complaint_id=10, received_quantity=1.0)
        self.assertFalse(stock_document_item_requires_putaway(row, db=db))

    def test_rmz_line_still_putaway_eligible(self) -> None:
        row = _Line(source_complaint_id=None, received_quantity=2.0)
        self.assertTrue(stock_document_item_requires_putaway(row))

    def test_document_queue_only_when_warehouse_lines(self) -> None:
        db = MagicMock()
        wh_line = _Line(source_complaint_id=1, received_quantity=1.0)
        svc_line = _Line(source_complaint_id=2, received_quantity=1.0)
        db.query.return_value.filter.return_value.all.return_value = [
            (1, PHYSICAL_RECEIPT_MODE_WAREHOUSE),
            (2, PHYSICAL_RECEIPT_MODE_SERVICE_FORWARD),
        ]
        self.assertTrue(document_has_putaway_eligible_received_lines(db, [wh_line, svc_line]))
        db.query.return_value.filter.return_value.all.return_value = [
            (2, PHYSICAL_RECEIPT_MODE_SERVICE_FORWARD),
        ]
        self.assertFalse(document_has_putaway_eligible_received_lines(db, [svc_line]))


class TestReceiveByMode(unittest.TestCase):
    def _complaint(self, mode: str) -> MagicMock:
        c = MagicMock()
        c.id = 50
        c.tenant_id = 1
        c.warehouse_id = 2
        c.physical_receipt_mode = mode
        c.warehouse_document_id = None
        return c

    def _line(self) -> MagicMock:
        ln = MagicMock()
        ln.id = 500
        ln.order_item_id = 900
        ln.quantity = 1
        oi = MagicMock()
        oi.id = 900
        oi.product_id = 77
        ln.order_item = oi
        return ln

    def test_direct_service_rejects_z_pz(self) -> None:
        db = MagicMock()
        with self.assertRaises(ValueError):
            receive_complaint_line_at_warehouse(db, self._complaint(PHYSICAL_RECEIPT_MODE_DIRECT_SERVICE), self._line())

    @patch("backend.services.complaints.complaint_receipt_service.recompute_putaway_status_for_document")
    @patch("backend.services.complaints.complaint_receipt_service._link_complaint_to_document")
    @patch("backend.services.complaints.complaint_receipt_service.find_or_create_collective_z_pz_for_warehouse")
    @patch("backend.services.complaints.complaint_receipt_service._resolve_z_pz_series")
    @patch("backend.services.complaints.complaint_receipt_service._order_item_pricing")
    @patch("backend.services.complaints.complaint_receipt_service._existing_receipt_item_for_line")
    def test_service_forward_creates_service_c_without_receipt_op(
        self,
        mock_existing,
        mock_pricing,
        mock_series,
        mock_find_doc,
        mock_link,
        mock_recompute,
    ) -> None:
        db = MagicMock()
        c = self._complaint(PHYSICAL_RECEIPT_MODE_SERVICE_FORWARD)
        ln = self._line()
        mock_existing.return_value = None
        db.query.return_value.filter.return_value.first.return_value = MagicMock()
        doc = MagicMock()
        doc.id = 1001
        doc.document_number = "Z-PZ-2026-0020"
        mock_find_doc.return_value = doc
        mock_series.return_value = MagicMock(id="s1")
        mock_pricing.return_value = (10.0, 23.0)
        captured = {}

        def _add(row):
            captured["row"] = row
            row.id = 9001

        db.add.side_effect = _add

        with patch("backend.services.complaints.complaint_receipt_service.append_receipt_operation") as mock_append:
            receive_complaint_line_at_warehouse(db, c, ln)
            mock_append.assert_not_called()
            mock_recompute.assert_not_called()

        row = captured["row"]
        self.assertEqual(row.stock_disposition, STOCK_DISPOSITION_SERVICE_C)
        self.assertEqual(row.return_decision, COMPLAINT_RETURN_DECISION_SERVICE_FORWARD)
        self.assertEqual(c.logistics_status, "FORWARDED_TO_SERVICE")

    @patch("backend.services.complaints.complaint_receipt_service.recompute_putaway_status_for_document")
    @patch("backend.services.complaints.complaint_receipt_service.append_receipt_operation")
    @patch("backend.services.complaints.complaint_receipt_service._link_complaint_to_document")
    @patch("backend.services.complaints.complaint_receipt_service.find_or_create_collective_z_pz_for_warehouse")
    @patch("backend.services.complaints.complaint_receipt_service._resolve_z_pz_series")
    @patch("backend.services.complaints.complaint_receipt_service._order_item_pricing")
    @patch("backend.services.complaints.complaint_receipt_service._existing_receipt_item_for_line")
    def test_warehouse_mode_quarantine_with_receipt(
        self,
        mock_existing,
        mock_pricing,
        mock_series,
        mock_find_doc,
        mock_link,
        mock_append,
        mock_recompute,
    ) -> None:
        db = MagicMock()
        c = self._complaint(PHYSICAL_RECEIPT_MODE_WAREHOUSE)
        ln = self._line()
        mock_existing.return_value = None
        db.query.return_value.filter.return_value.first.return_value = MagicMock()
        doc = MagicMock()
        doc.id = 1001
        mock_find_doc.return_value = doc
        mock_series.return_value = MagicMock(id="s1")
        mock_pricing.return_value = (10.0, 23.0)
        captured = {}

        def _add(row):
            captured["row"] = row
            row.id = 9002

        db.add.side_effect = _add
        db.query.return_value.filter.return_value.all.return_value = [captured.get("row")]

        receive_complaint_line_at_warehouse(db, c, ln)
        self.assertEqual(captured["row"].stock_disposition, STOCK_DISPOSITION_QUARANTINE)
        mock_append.assert_called_once()
        mock_recompute.assert_called_once()


if __name__ == "__main__":
    unittest.main()
