"""Complaint → Z-PZ integration tests."""

from __future__ import annotations

import unittest
from datetime import date, datetime
from unittest.mock import MagicMock, patch

from backend.services.complaints.complaint_receipt_service import (
    COMPLAINT_RETURN_DECISION_QUARANTINE,
    complaint_line_receipt_posted,
    disposition_for_complaint_line_decision,
    receive_complaint_line_at_warehouse,
    sync_complaint_line_disposition_from_decision,
)
from backend.services.stock_disposition import (
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_QUARANTINE,
    STOCK_DISPOSITION_REJECTED_STOCK,
    STOCK_DISPOSITION_SALEABLE,
    STOCK_DISPOSITION_SERVICE_C,
)
from backend.services.stock_document_service import doc_allows_wms_putaway


class _Line:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class _Complaint:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class TestComplaintDispositionMapping(unittest.TestCase):
    def test_repair_maps_to_service_c(self) -> None:
        ln = _Line(line_decision="repair")
        self.assertEqual(
            disposition_for_complaint_line_decision(ln),
            STOCK_DISPOSITION_SERVICE_C,
        )

    def test_refund_maps_to_saleable(self) -> None:
        ln = _Line(line_decision="refund")
        self.assertEqual(
            disposition_for_complaint_line_decision(ln),
            STOCK_DISPOSITION_SALEABLE,
        )

    def test_outlet_operational_decision(self) -> None:
        ln = _Line(line_decision="exchange")
        c = _Complaint(operational_decision="outlet")
        self.assertEqual(
            disposition_for_complaint_line_decision(ln, complaint=c),
            STOCK_DISPOSITION_OUTLET_B,
        )

    def test_reject_not_saleable(self) -> None:
        ln = _Line(line_decision="reject")
        disp = disposition_for_complaint_line_decision(ln)
        self.assertEqual(disp, STOCK_DISPOSITION_REJECTED_STOCK)
        self.assertNotEqual(disp, STOCK_DISPOSITION_SALEABLE)


class TestReceiveComplaintLineAtWarehouse(unittest.TestCase):
    def _complaint(self) -> MagicMock:
        c = MagicMock()
        c.id = 50
        c.tenant_id = 1
        c.warehouse_id = 2
        c.warehouse_document_id = None
        c.warehouse_document_type = None
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

    @patch("backend.services.complaints.complaint_receipt_service.recompute_putaway_status_for_document")
    @patch("backend.services.complaints.complaint_receipt_service.append_receipt_operation")
    @patch("backend.services.complaints.complaint_receipt_service.assign_return_receipt_document_number")
    @patch("backend.services.complaints.complaint_receipt_service._link_complaint_to_document")
    @patch("backend.services.complaints.complaint_receipt_service.find_or_create_collective_z_pz_for_warehouse")
    @patch("backend.services.complaints.complaint_receipt_service._resolve_z_pz_series")
    @patch("backend.services.complaints.complaint_receipt_service._order_item_pricing")
    @patch("backend.services.complaints.complaint_receipt_service._existing_receipt_item_for_line")
    def test_item_received_creates_z_pz_line_with_quarantine(
        self,
        mock_existing,
        mock_pricing,
        mock_series,
        mock_find_doc,
        mock_link,
        mock_assign_num,
        mock_append_op,
        mock_recompute,
    ) -> None:
        db = MagicMock()
        c = self._complaint()
        ln = self._line()
        mock_existing.return_value = None

        product = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = product

        doc = MagicMock()
        doc.id = 1001
        doc.document_number = "Z-PZ-2026-0017"
        mock_find_doc.return_value = doc
        mock_series.return_value = MagicMock(id="series-1")
        mock_pricing.return_value = (99.0, 23.0)

        captured_item = {}

        def _add(row):
            captured_item["row"] = row
            row.id = 7001

        db.add.side_effect = _add
        db.query.return_value.filter.return_value.all.return_value = [captured_item.get("row")]

        out = receive_complaint_line_at_warehouse(db, c, ln)

        self.assertIs(out, doc)
        row = captured_item["row"]
        self.assertEqual(row.stock_disposition, STOCK_DISPOSITION_QUARANTINE)
        self.assertEqual(row.source_complaint_id, 50)
        self.assertEqual(row.source_complaint_line_id, 500)
        self.assertEqual(row.return_decision, COMPLAINT_RETURN_DECISION_QUARANTINE)
        mock_append_op.assert_called_once()
        mock_link.assert_called_once_with(db, c, doc)

    @patch("backend.services.complaints.complaint_receipt_service.recompute_putaway_status_for_document")
    @patch("backend.services.complaints.complaint_receipt_service._link_complaint_to_document")
    @patch("backend.services.complaints.complaint_receipt_service._existing_receipt_item_for_line")
    def test_idempotent_when_line_already_posted(self, mock_existing, mock_link, mock_recompute) -> None:
        db = MagicMock()
        c = self._complaint()
        ln = self._line()
        existing = MagicMock()
        existing.document_id = 1001
        doc = MagicMock()
        doc.id = 1001
        mock_existing.return_value = existing

        db.query.return_value.filter.return_value.first.return_value = doc

        out = receive_complaint_line_at_warehouse(db, c, ln)
        self.assertIs(out, doc)
        mock_link.assert_called_once()
        db.add.assert_not_called()


class TestComplaintLineReceiptPosted(unittest.TestCase):
    def test_posted_flag(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = (1,)
        self.assertTrue(complaint_line_receipt_posted(db, 12))
        db.query.return_value.filter.return_value.first.return_value = None
        self.assertFalse(complaint_line_receipt_posted(db, 12))


class TestSyncComplaintDisposition(unittest.TestCase):
    @patch("backend.services.complaints.complaint_receipt_service.recompute_putaway_status_for_document")
    def test_accepted_refund_updates_stock_disposition(self, mock_recompute) -> None:
        db = MagicMock()
        ln = _Line(id=5, line_decision="refund")
        c = _Complaint(id=1)
        item = MagicMock()
        item.id = 99
        item.document_id = 1001
        item.stock_disposition = STOCK_DISPOSITION_QUARANTINE
        item.return_disposition = STOCK_DISPOSITION_QUARANTINE
        item.return_decision = COMPLAINT_RETURN_DECISION_QUARANTINE

        db.query.return_value.filter.return_value.all.side_effect = [[item], [item]]
        doc = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = doc

        changed = sync_complaint_line_disposition_from_decision(db, ln, complaint=c)  # type: ignore[arg-type]
        self.assertTrue(changed)
        self.assertEqual(item.stock_disposition, STOCK_DISPOSITION_SALEABLE)
        self.assertEqual(item.return_decision, "ACCEPTED")

    @patch("backend.services.complaints.complaint_receipt_service.recompute_putaway_status_for_document")
    def test_rejected_stays_non_saleable(self, mock_recompute) -> None:
        db = MagicMock()
        ln = _Line(id=6, line_decision="reject")
        c = _Complaint(id=1)
        item = MagicMock()
        item.id = 100
        item.document_id = 1001
        item.stock_disposition = STOCK_DISPOSITION_QUARANTINE

        db.query.return_value.filter.return_value.all.side_effect = [[item], [item]]
        db.query.return_value.filter.return_value.first.return_value = MagicMock()

        sync_complaint_line_disposition_from_decision(db, ln, complaint=c)  # type: ignore[arg-type]
        self.assertEqual(item.stock_disposition, STOCK_DISPOSITION_REJECTED_STOCK)
        self.assertNotEqual(item.stock_disposition, STOCK_DISPOSITION_SALEABLE)


class TestComplaintDocumentPutawayQueue(unittest.TestCase):
    def test_open_collective_z_pz_with_complaint_line_enters_putaway_queue(self) -> None:
        doc = _Complaint(
            document_type="Z_PZ",
            status="OPEN",
            is_collective_return_receipt=True,
            relocation_status="OPEN",
            receiving_status="DONE",
            putaway_status="NOT_STARTED",
        )
        line = _Line(
            received_quantity=1.0,
            source_complaint_id=50,
            source_complaint_line_id=500,
            stock_disposition=STOCK_DISPOSITION_QUARANTINE,
        )
        self.assertTrue(doc_allows_wms_putaway(doc))
        self.assertGreater(float(line.received_quantity), 0)
        self.assertIsNotNone(line.source_complaint_id)


if __name__ == "__main__":
    unittest.main()
