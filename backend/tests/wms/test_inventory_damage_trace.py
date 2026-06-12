"""Damage trace: document line → inventory persistence and API labels."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.inventory_damage_trace_service import (
    apply_damage_trace_to_inventory,
    build_damage_trace_from_document_line,
    infer_damage_class_from_line,
)
from backend.services.stock_disposition import (
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_SERVICE_C,
    damaged_inventory_badge_label,
)


class DamageTraceServiceTests(unittest.TestCase):
    def test_infer_damage_class_from_return_decision(self) -> None:
        line = SimpleNamespace(return_decision="DAMAGED_B", stock_disposition="SALEABLE")
        self.assertEqual(infer_damage_class_from_line(line), "B")
        line2 = SimpleNamespace(return_decision="DAMAGED_C", stock_disposition="SALEABLE")
        self.assertEqual(infer_damage_class_from_line(line2), "C")

    def test_infer_damage_class_from_disposition(self) -> None:
        line = SimpleNamespace(return_decision=None, stock_disposition=STOCK_DISPOSITION_OUTLET_B, return_disposition=None)
        self.assertEqual(infer_damage_class_from_line(line), "B")
        line2 = SimpleNamespace(return_decision=None, stock_disposition=STOCK_DISPOSITION_SERVICE_C, return_disposition=None)
        self.assertEqual(infer_damage_class_from_line(line2), "C")

    def test_badge_labels(self) -> None:
        self.assertEqual(damaged_inventory_badge_label(STOCK_DISPOSITION_OUTLET_B, "B"), "USZKODZONY B")
        self.assertEqual(damaged_inventory_badge_label(STOCK_DISPOSITION_SERVICE_C, "C"), "USZKODZONY C")
        self.assertEqual(damaged_inventory_badge_label(STOCK_DISPOSITION_OUTLET_B, None), "USZKODZONY")
        self.assertEqual(damaged_inventory_badge_label(STOCK_DISPOSITION_SERVICE_C, None), "USZKODZONY")
        self.assertEqual(damaged_inventory_badge_label("SALEABLE", None), "(A)")

    @patch("backend.services.inventory_damage_trace_service._find_rmz_damage_entry")
    @patch("backend.services.inventory_damage_trace_service._rmz_source_reference", return_value="RMZ-2026-001")
    def test_build_trace_from_rmz_line(self, _src_mock, find_mock) -> None:
        find_mock.return_value = {
            "condition": "B",
            "damage_type": "PACKAGING",
            "operator_name": "Jan K.",
            "created_at": "2026-06-08T10:00:00",
            "note": "Pęknięte opakowanie",
        }
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        db.query.return_value.filter.return_value.all.return_value = []
        line = SimpleNamespace(
            id=99,
            document_id=1,
            return_decision="DAMAGED_B",
            stock_disposition=STOCK_DISPOSITION_OUTLET_B,
            return_disposition=STOCK_DISPOSITION_OUTLET_B,
            source_rmz_id=12,
            rmz_damage_entry_id="ent-1",
            source_complaint_id=None,
            source_complaint_line_id=None,
        )
        with patch("backend.services.inventory_damage_trace_service._resolve_reason_labels", return_value=["Uszkodzone opakowanie"]):
            snap = build_damage_trace_from_document_line(db, line)
        self.assertEqual(snap.damage_class, "B")
        self.assertEqual(snap.source_reference, "RMZ-2026-001")
        self.assertIn("Pęknięte opakowanie", snap.reason_labels)
        inv = SimpleNamespace()
        apply_damage_trace_to_inventory(inv, snap)
        self.assertEqual(inv.damage_class, "B")
        self.assertEqual(inv.source_document_line_id, 99)


if __name__ == "__main__":
    unittest.main()
