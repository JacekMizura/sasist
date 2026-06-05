"""ZWK batch document vs relocation session — rozdzielone API."""

from __future__ import annotations

import json
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.document_number_service import DocumentSeriesOperationalError
from backend.services.wms_relocation_batch_service import (
    ZWK_DOCUMENT_TYPE,
    add_relocation_items_to_document,
    get_or_create_zwk_draft_document,
    zwk_document_label,
)


class ZwkDocumentLabelTests(unittest.TestCase):
    def test_label_uses_allocated_number(self):
        doc = SimpleNamespace(
            id=124,
            created_at=datetime(2026, 3, 15),
            document_type="MM",
            document_number="MM/2026/000124",
        )
        self.assertEqual(zwk_document_label(doc), "MM/2026/000124")

    def test_label_fallback_pm_format(self):
        doc = SimpleNamespace(id=124, created_at=datetime(2026, 3, 15), document_type="MM")
        self.assertEqual(zwk_document_label(doc), "PM-2026-0124")


class AddItemsWithoutSessionTests(unittest.TestCase):
    @patch("backend.services.wms_relocation_batch_service.find_relocation_task_for_order")
    @patch("backend.services.wms_relocation_batch_service._collect_pending_relocation_rows_for_order")
    @patch("backend.services.wms_relocation_batch_service.get_or_create_zwk_draft_document")
    def test_add_items_does_not_start_session(
        self,
        mock_get_doc,
        mock_collect,
        mock_find_task,
    ):
        db = MagicMock()
        order = SimpleNamespace(id=10, tenant_id=1, warehouse_id=2)
        db.query.return_value.filter.return_value.first.return_value = order

        doc = SimpleNamespace(
            id=99,
            created_at=datetime(2026, 1, 1),
            created_by_user_id=None,
            updated_at=None,
        )
        mock_get_doc.return_value = doc
        mock_collect.return_value = [
            {
                "task_id": 7,
                "order_item_id": 501,
                "product_id": 3,
                "qty": 2.0,
                "relocated_qty": 0.0,
                "picked_from": "A1-1",
                "relocation_reason": "PICKED_ITEM_REMOVED",
            }
        ]
        mock_find_task.return_value = SimpleNamespace(id=7)

        oi = SimpleNamespace(id=501, order_id=10, product_id=3)
        item_q = MagicMock()
        item_q.filter.return_value.first.side_effect = [oi, None]
        db.query.side_effect = [
            MagicMock(filter=MagicMock(return_value=MagicMock(first=MagicMock(return_value=order)))),
            item_q,
            MagicMock(filter=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
        ]

        with patch(
            "backend.services.wms_relocation_batch_service.StockDocumentItem",
            return_value=SimpleNamespace(),
        ):
            out = add_relocation_items_to_document(
                db,
                tenant_id=1,
                warehouse_id=2,
                order_id=10,
                operator_user_id=42,
            )

        self.assertTrue(out["ok"])
        self.assertEqual(out["document_id"], 99)
        self.assertEqual(out["lines_added"], 1)
        self.assertFalse(out["redirect_to_relocation"])
        mock_find_task.assert_called()

    def test_get_or_create_without_series_raises(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
        with patch(
            "backend.services.wms_relocation_batch_service._assert_warehouse_for_tenant",
        ), patch(
            "backend.services.wms_mm_draft_service.get_or_create_mm_draft_document",
            side_effect=DocumentSeriesOperationalError(
                document_type="MM",
                message="Brak aktywnej serii dokumentów MM",
            ),
        ):
            with self.assertRaises(ValueError) as ctx:
                get_or_create_zwk_draft_document(db, tenant_id=1, warehouse_id=2)
        self.assertEqual(str(ctx.exception), "Brak aktywnej serii dokumentów MM")

    def test_get_or_create_uses_zwk_type(self):
        db = MagicMock()
        existing = SimpleNamespace(
            id=5,
            document_type=ZWK_DOCUMENT_TYPE,
            status="draft",
            relocation_status="OPEN",
            updated_at=datetime.utcnow(),
        )
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = existing
        with patch(
            "backend.services.wms_relocation_batch_service._assert_warehouse_for_tenant",
        ), patch(
            "backend.services.wms_mm_draft_service.get_or_create_mm_draft_document",
            return_value=existing,
        ):
            doc = get_or_create_zwk_draft_document(db, tenant_id=1, warehouse_id=2)
        self.assertIs(doc, existing)
