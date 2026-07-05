"""Regression: invalid warehouse_id must not cause IntegrityError / HTTP 500."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from backend.services.inventory_management_policy_service import get_or_create_wms_settings_row
from backend.services.tenant_default_warehouse import WarehouseScopeError, assert_tenant_warehouse_scope
from backend.services.wms_picking_shortage_settings_service import get_or_create_wms_picking_shortage_settings


class TestAssertTenantWarehouseScope(unittest.TestCase):
    def test_invalid_id_raises_400(self) -> None:
        db = MagicMock()
        with self.assertRaises(WarehouseScopeError) as ctx:
            assert_tenant_warehouse_scope(db, tenant_id=1, warehouse_id=0)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.code, "INVALID_WAREHOUSE_ID")

    @patch("backend.services.tenant_default_warehouse.list_tenant_warehouse_ids", return_value=[1])
    def test_missing_warehouse_raises_404(self, _allowed) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(WarehouseScopeError) as ctx:
            assert_tenant_warehouse_scope(db, tenant_id=1, warehouse_id=99999)
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.code, "WAREHOUSE_NOT_FOUND")

    @patch("backend.services.tenant_default_warehouse.list_tenant_warehouse_ids", return_value=[1])
    def test_unlinked_warehouse_raises_404(self, _allowed) -> None:
        db = MagicMock()
        wh = MagicMock(id=2, tenant_id=99)
        db.query.return_value.filter.return_value.first.return_value = wh
        with self.assertRaises(WarehouseScopeError) as ctx:
            assert_tenant_warehouse_scope(db, tenant_id=1, warehouse_id=2)
        self.assertEqual(ctx.exception.status_code, 404)


class TestGetOrCreateWmsSettingsRow(unittest.TestCase):
    @patch("backend.services.inventory_management_policy_service.assert_tenant_warehouse_scope")
    def test_unknown_warehouse_does_not_insert(self, mock_assert) -> None:
        mock_assert.side_effect = WarehouseScopeError("Magazyn id=99999 nie istnieje.", status_code=404)
        db = MagicMock()
        with self.assertRaises(WarehouseScopeError):
            get_or_create_wms_settings_row(db, tenant_id=1, warehouse_id=99999)
        db.add.assert_not_called()


class TestGetOrCreateWmsPickingShortageSettings(unittest.TestCase):
    @patch("backend.services.wms_picking_shortage_settings_service.assert_tenant_warehouse_scope")
    def test_unknown_warehouse_does_not_insert(self, mock_assert) -> None:
        mock_assert.side_effect = WarehouseScopeError("Magazyn id=99999 nie istnieje.", status_code=404)
        db = MagicMock()
        with self.assertRaises(WarehouseScopeError):
            get_or_create_wms_picking_shortage_settings(db, tenant_id=1, warehouse_id=99999)
        db.add.assert_not_called()


class TestProductionPlanningWarehouseScopeHttp(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from backend.main import app

        cls.client = TestClient(app, raise_server_exceptions=False)

    @patch("backend.services.production_planning.simulation_service.build_planning_snapshot")
    def test_simulate_unknown_warehouse_returns_404_not_500(self, mock_snapshot) -> None:
        mock_snapshot.side_effect = WarehouseScopeError("Magazyn id=99999 nie istnieje.", status_code=404)
        resp = self.client.post(
            "/api/production/planning/simulate",
            json={"tenant_id": 1, "warehouse_id": 99999, "coverage_days": 21},
        )
        self.assertEqual(resp.status_code, 404)
        self.assertNotEqual(resp.status_code, 500)

    @patch("backend.services.production_planning.planning_service.build_planning_snapshot")
    def test_demand_unknown_warehouse_returns_404_not_500(self, mock_snapshot) -> None:
        mock_snapshot.side_effect = WarehouseScopeError("Magazyn id=99999 nie istnieje.", status_code=404)
        resp = self.client.get(
            "/api/production/planning/demand",
            params={"tenant_id": 1, "warehouse_id": 99999, "coverage_days": 21},
        )
        self.assertEqual(resp.status_code, 404)


class TestWmsSettingsWarehouseScopeHttp(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from backend.main import app

        cls.client = TestClient(app, raise_server_exceptions=False)

    @patch("backend.api.wms_settings.get_or_create_wms_settings_row")
    def test_wms_settings_unknown_warehouse_returns_404(self, mock_get) -> None:
        mock_get.side_effect = WarehouseScopeError("Magazyn id=99999 nie istnieje.", status_code=404)
        resp = self.client.get(
            "/api/wms/settings",
            params={"tenant_id": 1, "warehouse_id": 99999},
        )
        self.assertEqual(resp.status_code, 404)

    @patch("backend.api.wms_settings.get_or_create_wms_settings_row")
    def test_wms_production_settings_unknown_warehouse_returns_404(self, mock_get) -> None:
        mock_get.side_effect = WarehouseScopeError("Magazyn id=99999 nie istnieje.", status_code=404)
        resp = self.client.get(
            "/api/wms/settings/production",
            params={"tenant_id": 1, "warehouse_id": 99999},
        )
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
