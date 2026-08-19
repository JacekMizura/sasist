"""Direct sales business enabled gate (settings.enabled) vs deployment feature flag.

  python -m pytest backend/tests/direct_sales/test_direct_sales_enable_gate.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from backend.api.operational_features_deps import operational_sales_sessions_for_request
from backend.schemas.direct_sales_settings import DirectSalesSettingsConfig, DirectSalesSettingsRead
from backend.services.direct_sale.enable_gate import (
    DIRECT_SALES_DISABLED_CODE,
    assert_direct_sales_business_enabled,
    is_direct_sales_business_enabled,
)
from backend.services.direct_sale.errors import DirectSaleError
from backend.services.direct_sale.session_service import cancel_session, create_session
from backend.services.operational_features_context import OperationalFeaturesContext


def _read(*, enabled: bool, warehouse_id: int = 1, enforced: bool = True) -> DirectSalesSettingsRead:
    cfg = DirectSalesSettingsConfig(enabled=enabled)
    return DirectSalesSettingsRead(
        tenant_id=1,
        warehouse_id=warehouse_id,
        resolved=cfg,
        tenant_defaults=DirectSalesSettingsConfig(enabled=False),
        warehouse_overrides=cfg if warehouse_id > 0 else None,
        has_warehouse_override=warehouse_id > 0 and enabled,
        enabled_effective=enabled if enforced else True,
        enabled_enforced=enforced,
    )


class TestBusinessEnableGate(unittest.TestCase):
    def test_off_raises_403(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.enable_gate.resolve_direct_sales_business_enabled",
            return_value=False,
        ):
            with self.assertRaises(DirectSaleError) as ctx:
                assert_direct_sales_business_enabled(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(ctx.exception.http_status, 403)
        self.assertEqual(ctx.exception.code, DIRECT_SALES_DISABLED_CODE)

    def test_on_allows(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.enable_gate.resolve_direct_sales_business_enabled",
            return_value=True,
        ):
            assert_direct_sales_business_enabled(db, tenant_id=1, warehouse_id=1)

    def test_legacy_fail_open_via_ssot(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.enable_gate.resolve_direct_sales_business_enabled",
            return_value=True,
        ):
            self.assertTrue(is_direct_sales_business_enabled(db, tenant_id=1, warehouse_id=1))

    def test_warehouse_override_independent_of_tenant_default(self):
        db = MagicMock()

        def _resolve(_db, *, tenant_id, warehouse_id):
            return _read(
                enabled=(int(warehouse_id) == 2),
                warehouse_id=int(warehouse_id),
                enforced=True,
            )

        with patch(
            "backend.services.direct_sale.enable_gate.resolve_direct_sales_business_enabled",
            side_effect=lambda db, *, tenant_id, warehouse_id: _resolve(
                db, tenant_id=tenant_id, warehouse_id=warehouse_id
            ).enabled_effective,
        ):
            self.assertFalse(is_direct_sales_business_enabled(db, tenant_id=1, warehouse_id=1))
            self.assertTrue(is_direct_sales_business_enabled(db, tenant_id=1, warehouse_id=2))


class TestCreateSessionRespectsEnabled(unittest.TestCase):
    def test_create_blocked_when_disabled(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.enable_gate.assert_direct_sales_business_enabled",
            side_effect=DirectSaleError("off", code=DIRECT_SALES_DISABLED_CODE, http_status=403),
        ):
            with self.assertRaises(DirectSaleError) as ctx:
                create_session(db, tenant_id=1, warehouse_id=1, operator_user_id=1)
        self.assertEqual(ctx.exception.code, DIRECT_SALES_DISABLED_CODE)
        db.add.assert_not_called()

    def test_cancel_existing_session_does_not_require_enabled(self):
        db = MagicMock()
        sess = SimpleNamespace(
            status="ACTIVE",
            tenant_id=1,
            warehouse_id=1,
            id=9,
            completed_at=None,
            last_activity_at=None,
        )
        with patch(
            "backend.services.reservations.lifecycle_service.release_session_reservations_lifecycle",
        ), patch(
            "backend.services.direct_sale.session_service.emit_operational_sales_event",
        ):
            out = cancel_session(db, sess)
        self.assertEqual(out.status, "CANCELLED")


class TestFeatureFlagStill404(unittest.TestCase):
    def test_router_dep_404_when_sessions_flag_off(self):
        db = MagicMock()
        ctx = OperationalFeaturesContext(
            tenant_id=1,
            warehouse_id=1,
            operational_sales=True,
            immediate_wms_exclusion=True,
            operational_sales_sessions=False,
            operational_runtime=False,
            replenishment_engine=False,
            resolution_scope="test",
        )
        with patch(
            "backend.api.operational_features_deps.build_operational_features_context",
            return_value=ctx,
        ):
            gen = operational_sales_sessions_for_request(tenant_id=1, warehouse_id=1, db=db)
            with self.assertRaises(HTTPException) as http:
                next(gen)
        self.assertEqual(http.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
