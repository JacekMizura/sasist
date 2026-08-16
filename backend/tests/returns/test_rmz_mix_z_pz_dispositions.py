"""Mix Accepted + Damaged B/C + Rejected → Z-PZ lines (rejected excluded)."""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.rmz_return_receipt_service import (
    _any_planned_lines,
    _planned_stock_counts_for_line,
)
from backend.services.stock_disposition import (
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_SALEABLE,
    STOCK_DISPOSITION_SERVICE_C,
    stock_disposition_for_document_line,
)
from backend.services.returns.z_pz_constants import (
    DISPOSITION_OUTLET_B,
    DISPOSITION_SALEABLE,
    DISPOSITION_SERVICE_C,
)


class _Line:
    def __init__(self, **kwargs):
        self.bundle_component_returns = kwargs.pop("bundle_component_returns", [])
        self.component_recoveries = kwargs.pop("component_recoveries", [])
        for k, v in kwargs.items():
            setattr(self, k, v)


def _plain_line(**kwargs) -> _Line:
    base = dict(
        rejected_qty=0,
        damaged_b_qty=0,
        damaged_c_qty=0,
        damage_type=None,
        damage_entries_json=None,
        stock_intake_mode=None,
        disassembly_qty=None,
        fg_intake_qty=None,
        component_recoveries=[],
        bundle_component_returns=[],
    )
    base.update(kwargs)
    return _Line(**base)


class TestSingleDispositionPlanning(unittest.TestCase):
    def test_a_accepted_only(self) -> None:
        ln = _plain_line(id=1, accepted_qty=1, decision="OK")
        aq, dmg, rej = _planned_stock_counts_for_line(None, 1, 1, ln, include_rejected=False)  # type: ignore[arg-type]
        self.assertEqual(aq, 1)
        self.assertEqual(dmg, [])
        self.assertEqual(rej, 0)
        self.assertTrue(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]

    def test_b_damaged_b_only(self) -> None:
        ln = _plain_line(
            id=2,
            accepted_qty=0,
            damaged_b_qty=1,
            decision="DAMAGED",
            damage_entries_json=json.dumps([{"id": "b1", "qty": 1, "condition": "B"}]),
        )
        aq, dmg, _ = _planned_stock_counts_for_line(None, 1, 1, ln, include_rejected=False)  # type: ignore[arg-type]
        self.assertEqual(aq, 0)
        self.assertEqual(dmg, [("b1", "B")])

    def test_c_damaged_c_only(self) -> None:
        ln = _plain_line(
            id=3,
            accepted_qty=0,
            damaged_c_qty=1,
            decision="DAMAGED",
            damage_entries_json=json.dumps([{"id": "c1", "qty": 1, "condition": "C"}]),
        )
        aq, dmg, _ = _planned_stock_counts_for_line(None, 1, 1, ln, include_rejected=False)  # type: ignore[arg-type]
        self.assertEqual(aq, 0)
        self.assertEqual(dmg, [("c1", "C")])


class TestMixAcceptedDamagedRejectedPlanning(unittest.TestCase):
    def test_f_mix_accepted_b_rejected_plans_only_stock_units(self) -> None:
        """F: A + B + Rejected → planned accepted + damaged B; rejected excluded."""
        lines = [
            _plain_line(id=1, accepted_qty=1, decision="OK"),
            _plain_line(
                id=2,
                accepted_qty=0,
                damaged_b_qty=1,
                decision="DAMAGED",
                damage_entries_json=json.dumps([{"id": "dmg-b-1", "qty": 1, "condition": "B"}]),
            ),
            _plain_line(
                id=3,
                accepted_qty=0,
                rejected_qty=1,
                damage_type="reject:product_used",
                decision="REJECTED",
            ),
        ]
        self.assertTrue(_any_planned_lines(None, 1, 1, lines))  # type: ignore[arg-type]

        aq0, dmg0, _ = _planned_stock_counts_for_line(None, 1, 1, lines[0], include_rejected=False)  # type: ignore[arg-type]
        aq1, dmg1, _ = _planned_stock_counts_for_line(None, 1, 1, lines[1], include_rejected=False)  # type: ignore[arg-type]
        aq2, dmg2, rej2 = _planned_stock_counts_for_line(None, 1, 1, lines[2], include_rejected=False)  # type: ignore[arg-type]

        self.assertEqual(aq0, 1)
        self.assertEqual(dmg0, [])
        self.assertEqual(aq1, 0)
        self.assertEqual(len(dmg1), 1)
        self.assertEqual(dmg1[0][1], "B")
        self.assertEqual(aq2, 0)
        self.assertEqual(dmg2, [])
        self.assertEqual(rej2, 0)

    def test_mix_a_b_c_rejected(self) -> None:
        lines = [
            _plain_line(id=10, accepted_qty=1, decision="OK"),
            _plain_line(id=11, accepted_qty=0, damaged_b_qty=1, decision="DAMAGED"),
            _plain_line(id=12, accepted_qty=0, damaged_c_qty=1, decision="DAMAGED"),
            _plain_line(
                id=13,
                accepted_qty=0,
                rejected_qty=1,
                damage_type="reject:product_used",
                decision="REJECTED",
            ),
        ]
        self.assertTrue(_any_planned_lines(None, 1, 1, lines))  # type: ignore[arg-type]
        planned_units = 0
        for ln in lines:
            aq, dmg, _ = _planned_stock_counts_for_line(None, 1, 1, ln, include_rejected=False)  # type: ignore[arg-type]
            planned_units += aq + len(dmg)
        self.assertEqual(planned_units, 3)  # A + B + C; rejected out

    def test_e_rejected_only_skips_z_pz(self) -> None:
        ln = _plain_line(
            id=9,
            accepted_qty=0,
            rejected_qty=2,
            damage_type="reject:wrong_item",
            decision="REJECTED",
        )
        self.assertFalse(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]

    def test_damage_entries_invalid_condition_falls_back_to_qty_columns(self) -> None:
        """JSON present without B/C must not drop damaged_b_qty / damaged_c_qty."""
        ln = _plain_line(
            id=44,
            accepted_qty=0,
            damaged_b_qty=1,
            damaged_c_qty=1,
            decision="DAMAGED",
            damage_entries_json=json.dumps([{"id": "bad", "qty": 1, "condition": "X"}]),
        )
        aq, dmg, _ = _planned_stock_counts_for_line(None, 1, 1, ln, include_rejected=False)  # type: ignore[arg-type]
        self.assertEqual(aq, 0)
        self.assertEqual(len(dmg), 2)
        self.assertEqual({c for _, c in dmg}, {"B", "C"})
        self.assertTrue(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]

    def test_damage_condition_case_insensitive(self) -> None:
        ln = _plain_line(
            id=45,
            accepted_qty=0,
            decision="DAMAGED",
            damage_entries_json=json.dumps([{"id": "b1", "qty": 1, "condition": "b"}]),
        )
        _, dmg, _ = _planned_stock_counts_for_line(None, 1, 1, ln, include_rejected=False)  # type: ignore[arg-type]
        self.assertEqual(dmg, [("b1", "B")])


class TestEnsurePerRmzAndCollective(unittest.TestCase):
    def _run_ensure(self, *, collective: bool, tenant_id: int = 1):
        from backend.services.rmz_return_receipt_service import ensure_rmz_return_receipt_document

        with (
            patch("backend.services.rmz_return_receipt_service._link_rmz_to_document") as mock_link,
            patch("backend.services.rmz_return_receipt_service._append_rmz_lines_to_document") as mock_append,
            patch("backend.services.rmz_return_receipt_service.recompute_putaway_status_for_document"),
            patch("backend.services.rmz_return_receipt_service._patch_damage_entries_with_stock_links"),
            patch("backend.services.rmz_return_receipt_service._create_z_pz_shell") as mock_create,
            patch("backend.services.rmz_return_receipt_service._find_or_create_collective_z_pz") as mock_find_or_create,
            patch("backend.services.rmz_return_receipt_service._find_existing_document_for_rmz", return_value=None),
            patch("backend.services.rmz_return_receipt_service._resolve_z_pz_series") as mock_series,
            patch("backend.services.rmz_return_receipt_service._rmz_lines_already_posted", return_value=False),
        ):
            db = MagicMock()
            rmz = SimpleNamespace(id=28, tenant_id=tenant_id, warehouse_id=1)
            series = SimpleNamespace(id="series-z", collective_return_receipt=collective)
            mock_series.return_value = series
            new_doc = MagicMock()
            new_doc.id = 900
            collective_doc = MagicMock()
            collective_doc.id = 501
            mock_create.return_value = new_doc
            mock_find_or_create.return_value = collective_doc
            db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
                _plain_line(id=1, accepted_qty=1, damaged_b_qty=1, decision="DAMAGED")
            ]
            mock_append.return_value = [MagicMock(), MagicMock()]
            doc = ensure_rmz_return_receipt_document(db, rmz)
            return doc, mock_create, mock_find_or_create, mock_link, mock_append

    def test_missing_series_flag_defaults_to_per_rmz(self) -> None:
        from backend.services.rmz_return_receipt_service import ensure_rmz_return_receipt_document

        with (
            patch("backend.services.rmz_return_receipt_service._link_rmz_to_document"),
            patch("backend.services.rmz_return_receipt_service._append_rmz_lines_to_document") as mock_append,
            patch("backend.services.rmz_return_receipt_service.recompute_putaway_status_for_document"),
            patch("backend.services.rmz_return_receipt_service._patch_damage_entries_with_stock_links"),
            patch("backend.services.rmz_return_receipt_service._create_z_pz_shell") as mock_create,
            patch("backend.services.rmz_return_receipt_service._find_or_create_collective_z_pz") as mock_find_or_create,
            patch("backend.services.rmz_return_receipt_service._find_existing_document_for_rmz", return_value=None),
            patch("backend.services.rmz_return_receipt_service._resolve_z_pz_series") as mock_series,
            patch("backend.services.rmz_return_receipt_service._rmz_lines_already_posted", return_value=False),
        ):
            db = MagicMock()
            rmz = SimpleNamespace(id=28, tenant_id=1, warehouse_id=1)
            series = SimpleNamespace(id="series-z")  # no collective attr
            mock_series.return_value = series
            new_doc = MagicMock()
            new_doc.id = 900
            mock_create.return_value = new_doc
            db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
                _plain_line(id=1, accepted_qty=1, damaged_b_qty=1, decision="DAMAGED")
            ]
            mock_append.return_value = [MagicMock(), MagicMock()]
            doc = ensure_rmz_return_receipt_document(db, rmz)
            self.assertIs(doc, new_doc)
            mock_create.assert_called_once()
            mock_find_or_create.assert_not_called()
            self.assertFalse(mock_create.call_args.kwargs.get("collective"))

    def test_per_rmz_creates_shell(self) -> None:
        doc, mock_create, mock_find_or_create, mock_link, _ = self._run_ensure(collective=False)
        self.assertEqual(doc.id, 900)
        mock_create.assert_called_once()
        mock_find_or_create.assert_not_called()
        mock_link.assert_called_once()

    def test_collective_on_reuses_active(self) -> None:
        doc, mock_create, mock_find_or_create, mock_link, mock_append = self._run_ensure(collective=True)
        self.assertEqual(doc.id, 501)
        mock_find_or_create.assert_called_once()
        mock_create.assert_not_called()
        mock_link.assert_called_once()
        mock_append.assert_called_once()

    def test_other_tenant_collective_still_honored(self) -> None:
        """Tenant≠1 with collective=true still uses collective path (no silent override)."""
        doc, mock_create, mock_find_or_create, _, _ = self._run_ensure(collective=True, tenant_id=99)
        self.assertEqual(doc.id, 501)
        mock_find_or_create.assert_called_once()
        mock_create.assert_not_called()


class TestPutawayPreservesDisposition(unittest.TestCase):
    def test_document_line_disposition_roundtrip(self) -> None:
        for code in (STOCK_DISPOSITION_SALEABLE, STOCK_DISPOSITION_OUTLET_B, STOCK_DISPOSITION_SERVICE_C):
            line = SimpleNamespace(stock_disposition=code, return_disposition=None)
            self.assertEqual(stock_disposition_for_document_line(line), code)

    def test_legacy_return_disposition_fallback(self) -> None:
        line = SimpleNamespace(stock_disposition=None, return_disposition=STOCK_DISPOSITION_OUTLET_B)
        self.assertEqual(stock_disposition_for_document_line(line), STOCK_DISPOSITION_OUTLET_B)


class TestDispositionConstants(unittest.TestCase):
    def test_a_b_c_map_to_distinct_pools(self) -> None:
        self.assertEqual(DISPOSITION_SALEABLE, STOCK_DISPOSITION_SALEABLE)
        self.assertEqual(DISPOSITION_OUTLET_B, STOCK_DISPOSITION_OUTLET_B)
        self.assertEqual(DISPOSITION_SERVICE_C, STOCK_DISPOSITION_SERVICE_C)
        self.assertNotEqual(STOCK_DISPOSITION_SALEABLE, STOCK_DISPOSITION_OUTLET_B)
        self.assertNotEqual(STOCK_DISPOSITION_OUTLET_B, STOCK_DISPOSITION_SERVICE_C)


if __name__ == "__main__":
    unittest.main()
