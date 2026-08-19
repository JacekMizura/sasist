"""Direct sales stock settings — allocation, qty gate, legacy migration, integrity.

  python -m pytest backend/tests/direct_sales/test_direct_sales_stock_settings.py -q
"""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.schemas.direct_sales_settings import DirectSalesSettingsConfig

from backend.services.direct_sale.errors import DirectSaleError
from backend.services.direct_sale.issue_plan_service import IssueAllocation, plan_issue_allocations
from backend.services.direct_sale.line_service import update_session_line_quantity
from backend.services.direct_sale.scan_service import session_add_product_line
from backend.services.direct_sales_settings_service import (
    LEGACY_STOCK_SETTING_KEYS,
    normalize_allocation_strategy,
    preserve_legacy_stock_setting_keys,
)
from backend.services.location_priority_service import suggest_sales_locations
from backend.services.product_sales_offers.errors import OfferStockUnavailableError


class TestLegacyAllocationMigration(unittest.TestCase):
    def test_legacy_values_map_to_live_strategies(self):
        self.assertEqual(normalize_allocation_strategy("auto"), "auto_split")
        self.assertEqual(normalize_allocation_strategy("store_first"), "auto_split")
        self.assertEqual(normalize_allocation_strategy("pick_face"), "single_location")
        self.assertEqual(normalize_allocation_strategy("manual"), "manual")
        self.assertEqual(normalize_allocation_strategy("auto_split"), "auto_split")

    def test_config_model_drops_allow_oversell(self):
        from backend.services.direct_sales_settings_service import _config_from_dict

        cfg = _config_from_dict(
            {"enabled": True, "allow_oversell": True, "allocation_strategy": "store_first"}
        )
        dumped = cfg.model_dump()
        self.assertNotIn("allow_oversell", dumped)
        self.assertEqual(dumped["allocation_strategy"], "auto_split")

    def test_legacy_save_round_trip_normalizes_allocation(self):
        from backend.models.direct_sales_settings import DirectSalesSettings
        from backend.services.direct_sales_settings_service import save_direct_sales_settings

        row = DirectSalesSettings(
            tenant_id=1,
            warehouse_id=0,
            settings_json='{"allocation_strategy":"store_first","enabled":true}',
        )
        db = MagicMock()
        with patch(
            "backend.services.direct_sales_settings_service._get_or_create_row",
            return_value=row,
        ), patch(
            "backend.services.direct_sales_settings_service._get_row",
            return_value=row,
        ):
            save_direct_sales_settings(
                db,
                tenant_id=1,
                warehouse_id=0,
                settings=DirectSalesSettingsConfig(enabled=True, allocation_strategy="auto_split"),
            )
        saved = json.loads(row.settings_json)
        self.assertEqual(saved["allocation_strategy"], "auto_split")

    def test_preserve_legacy_stock_keys_on_save(self):
        out = preserve_legacy_stock_setting_keys(
            {"allow_oversell": True, "enabled": True},
            {"enabled": True, "allocation_strategy": "auto_split"},
        )
        self.assertTrue(out["allow_oversell"])
        self.assertEqual(out["allocation_strategy"], "auto_split")
        for key in LEGACY_STOCK_SETTING_KEYS:
            self.assertIn(key, out)


class TestAddScanStockZeroBlocked(unittest.TestCase):
    def test_add_product_offer_unavailable(self):
        db = MagicMock()
        product = MagicMock(id=5, tenant_id=1)
        db.query.return_value.filter.return_value.first.return_value = product
        sess = MagicMock(status="ACTIVE", tenant_id=1, warehouse_id=1, id=87, lines=[])
        offer = MagicMock(id=3)
        with patch(
            "backend.services.direct_sale.scan_service.assert_direct_sales_business_enabled",
        ), patch(
            "backend.services.direct_sale.scan_service._resolve_offer_for_line",
            return_value=offer,
        ), patch(
            "backend.services.direct_sale.scan_service.assert_offer_quantity_available",
            side_effect=OfferStockUnavailableError("Brak dostępności."),
        ):
            with self.assertRaises(DirectSaleError) as ctx:
                session_add_product_line(db, sess, product_id=5, quantity=1.0)
        self.assertEqual(ctx.exception.code, "offer_stock_unavailable")


class TestQtyIncreaseGate(unittest.TestCase):
    def _line_sess(self, *, qty: float = 1.0):
        line = SimpleNamespace(
            id=10,
            product_id=5,
            product_sales_offer_id=99,
            quantity=qty,
            metadata_json=None,
        )
        sess = SimpleNamespace(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            status="ACTIVE",
            lines=[line],
            last_activity_at=None,
        )
        return sess, line

    @patch("backend.services.direct_sale.line_service.get_session_line")
    def test_increase_qty_blocked_when_offer_insufficient(self, mock_get_line):
        sess, line = self._line_sess(qty=1.0)
        mock_get_line.return_value = line
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.enable_gate.assert_direct_sales_expansion_allowed",
        ), patch(
            "backend.services.direct_sale.line_service.assert_offer_quantity_available",
            side_effect=OfferStockUnavailableError("Brak dostępności."),
        ):
            with self.assertRaises(DirectSaleError) as ctx:
                update_session_line_quantity(db, sess, line_id=10, quantity=2.0)
        self.assertEqual(ctx.exception.code, "offer_stock_unavailable")

    @patch("backend.services.direct_sale.line_service.get_session_line")
    def test_decrease_qty_allowed_without_stock_check(self, mock_get_line):
        sess, line = self._line_sess(qty=2.0)
        mock_get_line.return_value = line
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.line_service.assert_offer_quantity_available",
        ) as offer_check:
            out = update_session_line_quantity(db, sess, line_id=10, quantity=1.0)
        offer_check.assert_not_called()
        self.assertEqual(out.quantity, 1.0)

    @patch("backend.services.direct_sale.line_service.get_session_line")
    def test_increase_qty_blocked_by_expansion_gate_before_stock(self, mock_get_line):
        from backend.services.direct_sale.enable_gate import DIRECT_SALES_DISABLED_CODE

        sess, line = self._line_sess(qty=1.0)
        mock_get_line.return_value = line
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.enable_gate.assert_direct_sales_expansion_allowed",
            side_effect=DirectSaleError("Wyłączone", code=DIRECT_SALES_DISABLED_CODE),
        ), patch(
            "backend.services.direct_sale.line_service.assert_offer_quantity_available",
        ) as offer_check:
            with self.assertRaises(DirectSaleError) as ctx:
                update_session_line_quantity(db, sess, line_id=10, quantity=2.0)
        self.assertEqual(ctx.exception.code, DIRECT_SALES_DISABLED_CODE)
        offer_check.assert_not_called()


class TestPreferStoreSplit(unittest.TestCase):
    def _rows(self):
        return [
            {
                "location_id": 1,
                "code": "STORE-01",
                "operational_zone_type": "SALES",
                "sales_priority": 10,
                "available": 1.0,
            },
            {
                "location_id": 2,
                "code": "PICK-01",
                "operational_zone_type": "PACKING",
                "sales_priority": 100,
                "available": 10.0,
            },
        ]

    def test_prefer_store_splits_store_then_pick(self):
        out = suggest_sales_locations(self._rows(), quantity=3.0, prefer_store_locations=True)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]["location_id"], 1)
        self.assertEqual(out[0]["suggested_qty"], 1.0)
        self.assertEqual(out[1]["location_id"], 2)
        self.assertEqual(out[1]["suggested_qty"], 2.0)

    def test_neutral_order_uses_location_id(self):
        out = suggest_sales_locations(self._rows(), quantity=3.0, prefer_store_locations=False)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]["location_id"], 1)
        self.assertEqual(out[1]["location_id"], 2)


class TestIssuePlanStrategies(unittest.TestCase):
    @patch("backend.services.direct_sale.issue_plan_service.suggest_issue_locations_for_sales")
    def test_auto_split_delegates_to_suggest(self, mock_suggest):
        mock_suggest.return_value = [
            {"location_id": 1, "suggested_qty": 1.0},
            {"location_id": 2, "suggested_qty": 2.0},
        ]
        sess = SimpleNamespace(tenant_id=1, warehouse_id=1, issue_strategy="AUTO_SPLIT")
        line = SimpleNamespace(id=10, product_id=5, quantity=3.0, source_location_id=None)
        with patch(
            "backend.services.direct_sale.issue_plan_service._resolve_prefer_store_locations",
            return_value=True,
        ):
            out = plan_issue_allocations(MagicMock(), sess, [line])
        self.assertEqual(len(out), 2)
        mock_suggest.assert_called_once()
        self.assertTrue(mock_suggest.call_args.kwargs.get("prefer_store_locations"))

    @patch("backend.services.direct_sale.issue_plan_service.build_location_stock")
    @patch("backend.services.direct_sale.issue_plan_service.suggest_issue_locations_for_sales")
    def test_single_location_picks_one_full_location(self, mock_suggest, mock_stock):
        mock_stock.return_value = {
            "locations": [
                {"location_id": 1, "available": 1.0},
                {"location_id": 2, "available": 10.0},
            ]
        }
        mock_suggest.return_value = [{"location_id": 2, "suggested_qty": 3.0}]
        sess = SimpleNamespace(tenant_id=1, warehouse_id=1, issue_strategy="SINGLE_LOCATION_ONLY")
        line = SimpleNamespace(id=10, product_id=5, quantity=3.0, source_location_id=None)
        with patch(
            "backend.services.direct_sale.issue_plan_service._resolve_prefer_store_locations",
            return_value=True,
        ):
            out = plan_issue_allocations(MagicMock(), sess, [line])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0], IssueAllocation(10, 5, 2, 3.0))
        mock_suggest.assert_called_once()
        self.assertTrue(mock_suggest.call_args.kwargs.get("prefer_store_locations"))

    def test_strict_missing_source_raises_without_fallback(self):
        sess = SimpleNamespace(tenant_id=1, warehouse_id=1, issue_strategy="STRICT_LOCATION")
        line = SimpleNamespace(id=10, product_id=5, quantity=1.0, source_location_id=None)
        with patch(
            "backend.services.direct_sale.issue_plan_service._resolve_prefer_store_locations",
            return_value=True,
        ), patch(
            "backend.services.direct_sale.issue_plan_service._fallback_line_allocations",
        ) as mock_fallback:
            with self.assertRaises(DirectSaleError) as ctx:
                plan_issue_allocations(MagicMock(), sess, [line])
            mock_fallback.assert_not_called()
        self.assertEqual(ctx.exception.code, "missing_source_location")

    @patch("backend.services.direct_sale.issue_plan_service._available_at_location", return_value=1.0)
    def test_strict_insufficient_at_chosen_location_no_fallback(self, _avail):
        sess = SimpleNamespace(tenant_id=1, warehouse_id=1, issue_strategy="STRICT_LOCATION")
        line = SimpleNamespace(id=10, product_id=5, quantity=3.0, source_location_id=22)
        with patch(
            "backend.services.direct_sale.issue_plan_service._resolve_prefer_store_locations",
            return_value=True,
        ), patch(
            "backend.services.direct_sale.issue_plan_service._fallback_line_allocations",
        ) as mock_fallback:
            with self.assertRaises(DirectSaleError) as ctx:
                plan_issue_allocations(MagicMock(), sess, [line])
            mock_fallback.assert_not_called()
        self.assertEqual(ctx.exception.code, "insufficient_stock")

    @patch("backend.services.direct_sale.issue_plan_service._available_at_location", return_value=5.0)
    def test_existing_session_issue_strategy_respected(self, _avail):
        sess = SimpleNamespace(tenant_id=1, warehouse_id=1, issue_strategy="STRICT_LOCATION")
        line = SimpleNamespace(id=10, product_id=5, quantity=2.0, source_location_id=22)
        with patch(
            "backend.services.direct_sale.issue_plan_service._resolve_prefer_store_locations",
            return_value=False,
        ):
            out = plan_issue_allocations(MagicMock(), sess, [line])
        self.assertEqual(out[0].location_id, 22)


class TestScanPreferStoreResolved(unittest.TestCase):
    @patch("backend.services.direct_sale.scan_service.create_soft_hold_for_scan")
    @patch("backend.services.direct_sale.scan_service.suggest_issue_locations_for_sales")
    @patch("backend.services.direct_sale.scan_service.assert_offer_quantity_available")
    @patch("backend.services.direct_sale.scan_service._resolve_offer_for_line")
    @patch("backend.services.direct_sale.scan_service.assert_direct_sales_business_enabled")
    @patch("backend.services.direct_sale.scan_service.resolve_direct_sales_settings")
    def test_add_passes_resolved_prefer_store(
        self,
        mock_settings,
        _enabled,
        mock_offer,
        _assert_qty,
        mock_suggest,
        _hold,
    ):
        mock_settings.return_value = SimpleNamespace(resolved=SimpleNamespace(prefer_store_locations=False))
        mock_offer.return_value = MagicMock(id=3)
        mock_suggest.return_value = [{"location_id": 9, "suggested_qty": 1.0}]
        product = MagicMock(id=5, tenant_id=1)
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = product
        sess = MagicMock(status="ACTIVE", tenant_id=1, warehouse_id=1, id=87, lines=[], operator_user_id=None)
        session_add_product_line(db, sess, product_id=5, quantity=1.0)
        self.assertFalse(mock_suggest.call_args.kwargs.get("prefer_store_locations"))


class TestLocationStockEmptyFilter(unittest.TestCase):
    @patch("backend.api.location_stock.build_location_stock")
    def test_available_only_hides_empty_locations(self, mock_build):
        from backend.api.location_stock import get_location_stock

        mock_build.return_value = {
            "product_id": 5,
            "warehouse_id": 1,
            "tenant_id": 1,
            "summary": {"available": 5.0, "reserved": 0.0, "picking": 0.0},
            "locations": [{"location_id": 2, "available": 5.0, "code": "A-02"}],
        }
        db = MagicMock()
        with patch("backend.api.location_stock.resolve_product_id", return_value=5):
            out = get_location_stock(tenant_id=1, warehouse_id=1, product_id=5, available_only=True, db=db)
        mock_build.assert_called_once()
        self.assertTrue(mock_build.call_args.kwargs.get("available_only"))
        self.assertEqual(len(out.locations), 1)

    def test_suggest_skips_zero_available_for_issue(self):
        rows = [
            {"location_id": 1, "available": 0.0, "operational_zone_type": "SALES"},
            {"location_id": 2, "available": 5.0, "operational_zone_type": "PACKING"},
        ]
        out = suggest_sales_locations(rows, quantity=1.0, prefer_store_locations=True)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["location_id"], 2)


class TestInventoryConcurrencyIntegrity(unittest.TestCase):
    def test_second_consume_fails_when_stock_depleted(self):
        from backend.services.order_item_pick_allocation_service import consume_inventory_fifo_slices

        inv = SimpleNamespace(
            id=1,
            quantity=1.0,
            batch_number="",
            expiry_date=None,
            tenant_id=1,
            warehouse_id=1,
            product_id=5,
            location_id=10,
            stock_disposition="SALEABLE",
        )
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        q.with_for_update.return_value = q
        q.all.return_value = [inv]
        db.query.return_value = q
        with patch(
            "backend.services.wms_picking_atp.reserved_qty_at_lot_excluding_sales_order",
            return_value=0.0,
        ):
            consume_inventory_fifo_slices(
                db,
                tenant_id=1,
                warehouse_id=1,
                product_id=5,
                location_id=10,
                quantity=1.0,
            )
            inv.quantity = 0.0
            with self.assertRaises(ValueError):
                consume_inventory_fifo_slices(
                    db,
                    tenant_id=1,
                    warehouse_id=1,
                    product_id=5,
                    location_id=10,
                    quantity=1.0,
                )


if __name__ == "__main__":
    unittest.main()
