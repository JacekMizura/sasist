"""
Picking-entry gate activity presentation (Logi / Historia).

  python -m pytest backend/tests/test_picking_entry_activity_format.py -q
"""

from __future__ import annotations

import unittest

from backend.services.activity_log.domain_event_codes import (
    PICKING_ENTRY_GATE_BLOCKED,
    PICKING_ENTRY_MO_DEMAND,
)
from backend.services.activity_log.picking_entry_activity_format import (
    format_picking_entry_gate_blocked_message,
    format_picking_entry_mo_demand_message,
)
from backend.services.activity_log.presentation import enrich_activity_item


_RAW_ENUMS = (
    "MANUFACTURING_MISSING",
    "MANUFACTURING_PARTIAL",
    "REGULAR_SHORTAGE",
    "BLOCKED_MIXED",
    "BLOCKED_MANUFACTURING",
)


def _assert_no_raw_enums(text: str) -> None:
    for token in _RAW_ENUMS:
        assert token not in text, f"raw enum leaked: {token}"


class TestManufacturingMissingSingle(unittest.TestCase):
    def test_detailed_line(self):
        meta = {
            "lines": [
                {
                    "code": "MANUFACTURING_MISSING",
                    "product_id": 193,
                    "product_name": "Sznurowadła CAT 100 cm",
                    "sku": "ST-001",
                    "required_qty": 1,
                    "available": 0,
                    "allocated_existing_fg": 0,
                    "production_required_qty": 1,
                    "mo_number": "MO/2026/0004",
                }
            ]
        }
        msg = format_picking_entry_gate_blocked_message(
            stored_description="Nie można rozpocząć zbierania — brak gotowego produktu.",
            metadata=meta,
        )
        self.assertIn("Nie można rozpocząć zbierania — brak gotowego produktu.", msg)
        self.assertIn("Sznurowadła CAT 100 cm", msg)
        self.assertIn("ST-001", msg)
        self.assertIn("Wymagane: 1", msg)
        self.assertIn("Dostępne: 0", msg)
        self.assertIn("Przydzielone: 0", msg)
        self.assertIn("Do wyprodukowania: 1", msg)
        self.assertIn("MO/2026/0004", msg)
        _assert_no_raw_enums(msg)

        item = enrich_activity_item(
            {
                "id": 1,
                "event_code": PICKING_ENTRY_GATE_BLOCKED,
                "description": "Nie można rozpocząć zbierania — brak gotowego produktu.",
                "severity": "ERROR",
                "category": "system",
                "occurred_at": "2026-08-15 10:00:00",
                "actor_name": None,
                "metadata": meta,
                "links": [],
            }
        )
        self.assertEqual(item["action"], msg)
        self.assertGreater(len(item["details"]), 0)
        self.assertEqual(item["severity"], "ERROR")
        _assert_no_raw_enums(item["action"])


class TestManufacturingPartial(unittest.TestCase):
    def test_partial_allocation(self):
        meta = {
            "lines": [
                {
                    "code": "MANUFACTURING_PARTIAL",
                    "product_name": "Sznurowadła CAT 100 cm",
                    "sku": "ST-001",
                    "required_qty": 7,
                    "available": 5,
                    "allocated_existing_fg": 5,
                    "production_required_qty": 2,
                    "mo_number": "MO/2026/0004",
                }
            ]
        }
        msg = format_picking_entry_gate_blocked_message(
            stored_description="Nie można rozpocząć zbierania — brak gotowego produktu.",
            metadata=meta,
        )
        self.assertIn("Wymagane: 7", msg)
        self.assertIn("Przydzielone: 5", msg)
        self.assertIn("Do wyprodukowania: 2", msg)
        _assert_no_raw_enums(msg)


class TestBlockedMixedTwoLines(unittest.TestCase):
    def test_compact_multi(self):
        meta = {
            "outcome": "BLOCKED_MIXED",
            "lines": [
                {
                    "code": "MANUFACTURING_PARTIAL",
                    "sku": "ST-001",
                    "product_name": "A",
                    "required_qty": 7,
                    "available": 5,
                    "allocated_existing_fg": 5,
                    "production_required_qty": 2,
                },
                {
                    "code": "REGULAR_SHORTAGE",
                    "sku": "ST-002",
                    "product_name": "B",
                    "required_qty": 10,
                    "available": 6,
                    "missing": 4,
                },
            ],
        }
        msg = format_picking_entry_gate_blocked_message(
            stored_description="Nie można rozpocząć zbierania — brak gotowego produktu.",
            metadata=meta,
        )
        self.assertIn("ST-001", msg)
        self.assertIn("Wymagane 7", msg)
        self.assertIn("Przydzielone 5", msg)
        self.assertIn("Do produkcji 2", msg)
        self.assertIn("ST-002", msg)
        self.assertIn("Dostępne 6", msg)
        self.assertIn("Brak magazynowy 4", msg)
        _assert_no_raw_enums(msg)


class TestMoDemandInfo(unittest.TestCase):
    def test_mo_info_readable(self):
        meta = {
            "mo_number": "MO/2026/0004",
            "requested_quantity": 1,
            "product_name": "Sznurowadła CAT 100 cm",
            "sku": "ST-001",
            "product_id": 193,
        }
        msg = format_picking_entry_mo_demand_message(
            stored_description="Utworzono zapotrzebowanie produkcyjne — MO/2026/0004, 1 szt.",
            metadata=meta,
        )
        self.assertIn("MO/2026/0004", msg)
        self.assertIn("Sznurowadła CAT 100 cm", msg)
        self.assertIn("ST-001", msg)
        self.assertIn("Ilość: 1", msg)
        _assert_no_raw_enums(msg)

        item = enrich_activity_item(
            {
                "id": 2,
                "event_code": PICKING_ENTRY_MO_DEMAND,
                "description": "Utworzono zapotrzebowanie produkcyjne — MO/2026/0004, 1 szt.",
                "severity": "INFO",
                "category": "system",
                "occurred_at": "2026-08-15 10:01:00",
                "actor_name": None,
                "metadata": meta,
                "links": [],
            }
        )
        self.assertIn("Sznurowadła CAT 100 cm", item["action"])
        self.assertGreater(len(item["details"]), 0)


class TestLegacyFallback(unittest.TestCase):
    def test_no_lines_keeps_stored(self):
        stored = "Nie można rozpocząć zbierania — brak gotowego produktu."
        msg = format_picking_entry_gate_blocked_message(
            stored_description=stored,
            metadata={"outcome": "BLOCKED_MANUFACTURING"},
        )
        self.assertEqual(msg, stored)

        item = enrich_activity_item(
            {
                "id": 3,
                "event_code": PICKING_ENTRY_GATE_BLOCKED,
                "description": stored,
                "severity": "ERROR",
                "occurred_at": "2026-08-15 10:02:00",
                "metadata": {},
                "links": [],
            }
        )
        self.assertEqual(item["action"], stored)
        self.assertEqual(item["details"], [])


if __name__ == "__main__":
    unittest.main()
