"""Direct sales enabled rollout — ds_enabled_v1 stamp + legacy fail-open.

  python -m pytest backend/tests/direct_sales/test_direct_sales_enabled_rollout.py -q
"""

from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

from backend.models.direct_sales_settings import TENANT_DEFAULT_WAREHOUSE_ID, DirectSalesSettings
from backend.schemas.direct_sales_settings import DirectSalesSettingsConfig
from backend.services.direct_sale.enable_gate import (
    DIRECT_SALES_DISABLED_CODE,
    assert_direct_sales_business_enabled,
    assert_direct_sales_expansion_allowed,
)
from backend.services.direct_sale.errors import DirectSaleError
from backend.services.direct_sale.line_service import update_session_line_quantity
from backend.services.direct_sales_settings_service import (
    DS_ENABLED_V1_KEY,
    resolve_direct_sales_business_enabled,
    resolve_direct_sales_enable_state,
    resolve_direct_sales_settings,
    save_direct_sales_settings,
)
from backend.services.direct_sale.session_service import create_session


def _json(**kwargs: object) -> str:
    return json.dumps(kwargs, ensure_ascii=False)


class TestEnableStateResolution(unittest.TestCase):
    def test_a_no_row_no_stamp_fail_open(self):
        st = resolve_direct_sales_enable_state(
            tenant_data={},
            wh_data={},
            warehouse_id=1,
            resolved_stored_enabled=False,
        )
        self.assertTrue(st.enabled_effective)
        self.assertFalse(st.enabled_enforced)
        self.assertFalse(st.expansion_blocked)

    def test_b_stored_false_no_stamp_still_open(self):
        st = resolve_direct_sales_enable_state(
            tenant_data={"enabled": False},
            wh_data={},
            warehouse_id=1,
            resolved_stored_enabled=False,
        )
        self.assertTrue(st.enabled_effective)
        self.assertFalse(st.enabled_enforced)

    def test_d_tenant_stamped_false_blocks(self):
        st = resolve_direct_sales_enable_state(
            tenant_data={"enabled": False, "extensions": {DS_ENABLED_V1_KEY: True}},
            wh_data={},
            warehouse_id=1,
            resolved_stored_enabled=False,
        )
        self.assertFalse(st.enabled_effective)
        self.assertTrue(st.enabled_enforced)
        self.assertTrue(st.expansion_blocked)

    def test_e_tenant_stamped_true_allows(self):
        st = resolve_direct_sales_enable_state(
            tenant_data={"enabled": True, "extensions": {DS_ENABLED_V1_KEY: True}},
            wh_data={},
            warehouse_id=1,
            resolved_stored_enabled=True,
        )
        self.assertTrue(st.enabled_effective)
        self.assertTrue(st.enabled_enforced)
        self.assertFalse(st.expansion_blocked)

    def test_f_tenant_stamped_false_wh_unstamped_inherits_tenant(self):
        st = resolve_direct_sales_enable_state(
            tenant_data={"enabled": False, "extensions": {DS_ENABLED_V1_KEY: True}},
            wh_data={"enabled": True},
            warehouse_id=2,
            resolved_stored_enabled=True,
        )
        self.assertFalse(st.enabled_effective)
        self.assertTrue(st.enabled_enforced)

    def test_g_wh_stamped_override_wins(self):
        st = resolve_direct_sales_enable_state(
            tenant_data={"enabled": False, "extensions": {DS_ENABLED_V1_KEY: True}},
            wh_data={"enabled": True, "extensions": {DS_ENABLED_V1_KEY: True}},
            warehouse_id=2,
            resolved_stored_enabled=True,
        )
        self.assertTrue(st.enabled_effective)
        self.assertTrue(st.enabled_enforced)


class TestSaveStampsV1(unittest.TestCase):
    def test_put_with_enabled_stamps_extensions(self):
        db = MagicMock()
        row = DirectSalesSettings(
            tenant_id=1,
            warehouse_id=TENANT_DEFAULT_WAREHOUSE_ID,
            settings_json="{}",
        )

        def _get_row(_db, tid, wid):
            if int(wid) == TENANT_DEFAULT_WAREHOUSE_ID:
                return row
            return None

        with patch(
            "backend.services.direct_sales_settings_service._get_or_create_row",
            return_value=row,
        ), patch(
            "backend.services.direct_sales_settings_service._get_row",
            side_effect=_get_row,
        ), patch(
            "backend.services.direct_sales_settings_service._config_from_dict",
            side_effect=lambda data, **kw: DirectSalesSettingsConfig.model_validate(
                {**DirectSalesSettingsConfig().model_dump(), **data}
            ),
        ):
            save_direct_sales_settings(
                db,
                tenant_id=1,
                warehouse_id=0,
                settings=DirectSalesSettingsConfig(enabled=False),
            )
        saved = json.loads(row.settings_json or "{}")
        self.assertTrue(saved.get("extensions", {}).get(DS_ENABLED_V1_KEY))

    def test_get_alone_does_not_stamp(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sales_settings_service._get_row",
            return_value=None,
        ):
            read = resolve_direct_sales_settings(db, tenant_id=1, warehouse_id=1)
        self.assertTrue(read.enabled_effective)
        self.assertFalse(read.enabled_enforced)
        db.add.assert_not_called()


class TestBusinessGateWithRollout(unittest.TestCase):
    def test_legacy_fail_open_allows_create_path(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.enable_gate.resolve_direct_sales_business_enabled",
            return_value=True,
        ):
            assert_direct_sales_business_enabled(db, tenant_id=1, warehouse_id=1)

    def test_stamped_off_blocks_new_work(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.enable_gate.resolve_direct_sales_business_enabled",
            return_value=False,
        ):
            with self.assertRaises(DirectSaleError) as ctx:
                assert_direct_sales_business_enabled(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(ctx.exception.code, DIRECT_SALES_DISABLED_CODE)

    def test_create_session_blocked_when_stamped_off(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.enable_gate.assert_direct_sales_business_enabled",
            side_effect=DirectSaleError("off", code=DIRECT_SALES_DISABLED_CODE, http_status=403),
        ):
            with self.assertRaises(DirectSaleError):
                create_session(db, tenant_id=1, warehouse_id=1, operator_user_id=1)
        db.add.assert_not_called()


class TestExistingSessionExpansionGate(unittest.TestCase):
    def test_qty_increase_blocked_when_expansion_blocked(self):
        db = MagicMock()
        sess = MagicMock()
        sess.status = "ACTIVE"
        sess.tenant_id = 1
        sess.warehouse_id = 1
        line = MagicMock()
        line.quantity = 2.0
        line.metadata_json = None
        with patch(
            "backend.services.direct_sale.line_service.get_session_line",
            return_value=line,
        ), patch(
            "backend.services.direct_sale.enable_gate.is_direct_sales_expansion_blocked",
            return_value=True,
        ):
            with self.assertRaises(DirectSaleError) as ctx:
                update_session_line_quantity(db, sess, line_id=1, quantity=3.0)
        self.assertEqual(ctx.exception.code, DIRECT_SALES_DISABLED_CODE)

    def test_qty_decrease_allowed_when_expansion_blocked(self):
        db = MagicMock()
        sess = MagicMock()
        sess.status = "ACTIVE"
        sess.tenant_id = 1
        sess.warehouse_id = 1
        line = MagicMock()
        line.quantity = 3.0
        line.metadata_json = None
        with patch(
            "backend.services.direct_sale.line_service.get_session_line",
            return_value=line,
        ), patch(
            "backend.services.direct_sale.enable_gate.is_direct_sales_expansion_blocked",
            return_value=True,
        ):
            out = update_session_line_quantity(db, sess, line_id=1, quantity=2.0)
        self.assertIs(out, line)
        self.assertEqual(line.quantity, 2.0)

    def test_assert_expansion_raises_when_blocked(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.enable_gate.is_direct_sales_expansion_blocked",
            return_value=True,
        ):
            with self.assertRaises(DirectSaleError):
                assert_direct_sales_expansion_allowed(db, tenant_id=1, warehouse_id=1)


class TestResolveBusinessEnabledIntegration(unittest.TestCase):
    def test_resolve_returns_true_on_legacy(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sales_settings_service.resolve_direct_sales_settings",
        ) as mock_resolve:
            mock_resolve.return_value = MagicMock(enabled_effective=True)
            self.assertTrue(resolve_direct_sales_business_enabled(db, tenant_id=1, warehouse_id=1))

    def test_resolve_returns_false_when_stamped_off(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sales_settings_service.resolve_direct_sales_settings",
        ) as mock_resolve:
            mock_resolve.return_value = MagicMock(enabled_effective=False)
            self.assertFalse(resolve_direct_sales_business_enabled(db, tenant_id=1, warehouse_id=1))


if __name__ == "__main__":
    unittest.main()
