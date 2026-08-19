"""Direct sale discount validation — caps, stacking, complete revalidation.

  python -m pytest backend/tests/direct_sales/test_discount_validation_service.py -q
"""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.schemas.direct_sales_settings import DirectSalesDiscountSettings
from backend.services.direct_sale.discount_validation_service import (
    validate_line_discount,
    validate_order_discount,
    validate_session_discounts_for_complete,
)
from backend.services.direct_sale.errors import DirectSaleError
from backend.services.direct_sales_settings_service import (
    LEGACY_DISCOUNT_SETTING_KEYS,
    preserve_legacy_discount_setting_keys,
)


def _discount_cfg(**overrides) -> DirectSalesDiscountSettings:
    base = DirectSalesDiscountSettings()
    return base.model_copy(update=overrides)


def _mock_db(vat_percent: float = 0.0) -> MagicMock:
    db = MagicMock()

    def _query(*_a, **_k):
        q = MagicMock()

        def _filter(*_fa, **_fk):
            f = MagicMock()
            f.first.return_value = SimpleNamespace(vat_percent=vat_percent)
            return f

        q.filter = _filter
        return q

    db.query = _query
    return db


def _session(*, lines=None, order_type=None, order_val=0.0):
    return SimpleNamespace(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        lines=lines or [],
        order_discount_type=order_type,
        order_discount_value=order_val,
    )


def _line(
    line_id: int,
    *,
    unit_net: float = 100.0,
    qty: float = 1.0,
    disc_type=None,
    disc_val=0.0,
):
    return SimpleNamespace(
        id=line_id,
        product_id=line_id,
        quantity=qty,
        unit_price=unit_net,
        sort_order=line_id,
        line_discount_type=disc_type,
        line_discount_value=disc_val,
        discount_amount=0.0,
        source_location_id=None,
    )


class TestLegacyDiscountSettingsPreserve(unittest.TestCase):
    def test_preserve_legacy_discount_keys_in_nested_object(self):
        out = preserve_legacy_discount_setting_keys(
            {
                "discounts": {
                    "require_manager_approval": True,
                    "allow_negative_margin_override": True,
                    "max_discount_percent": 40,
                }
            },
            {"discounts": {"max_discount_percent": 30}},
        )
        disc = out["discounts"]
        self.assertTrue(disc["require_manager_approval"])
        self.assertTrue(disc["allow_negative_margin_override"])
        self.assertEqual(disc["max_discount_percent"], 30)

    def test_live_schema_drops_legacy_discount_keys(self):
        from backend.services.direct_sales_settings_service import _config_from_dict

        cfg = _config_from_dict(
            {
                "discounts": {
                    "require_manager_approval": True,
                    "allow_negative_margin_override": True,
                    "max_discount_percent": 25,
                }
            }
        )
        dumped = cfg.model_dump()["discounts"]
        for key in LEGACY_DISCOUNT_SETTING_KEYS:
            self.assertNotIn(key, dumped)
        self.assertEqual(dumped["max_discount_percent"], 25)


class TestDiscountValidationCaps(unittest.TestCase):
    def setUp(self):
        self.db = _mock_db(vat_percent=0.0)
        self.vat_patcher = patch(
            "backend.services.direct_sale.session_financials_service.product_vat_for_direct_sale",
            return_value=0.0,
        )
        self.vat_patcher.start()
        self.patcher = patch(
            "backend.services.direct_sale.discount_validation_service._discount_settings",
            return_value=_discount_cfg(max_discount_percent=50.0),
        )
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        self.vat_patcher.stop()

    def test_allow_line_false_rejects_patch(self):
        with patch(
            "backend.services.direct_sale.discount_validation_service._discount_settings",
            return_value=_discount_cfg(allow_line_discounts=False),
        ):
            sess = _session(lines=[_line(1)])
            with self.assertRaises(DirectSaleError) as ctx:
                validate_line_discount(self.db, sess, line_id=1, discount_type="percent", discount_value=10)
            self.assertEqual(ctx.exception.code, "line_discounts_disabled")

    def test_allow_order_false_rejects_patch(self):
        with patch(
            "backend.services.direct_sale.discount_validation_service._discount_settings",
            return_value=_discount_cfg(allow_order_discounts=False),
        ):
            sess = _session(lines=[_line(1)])
            with self.assertRaises(DirectSaleError) as ctx:
                validate_order_discount(self.db, sess, discount_type="percent", discount_value=10)
            self.assertEqual(ctx.exception.code, "order_discounts_disabled")

    def test_line_percent_50_passes(self):
        sess = _session(lines=[_line(1)])
        validate_line_discount(self.db, sess, line_id=1, discount_type="percent", discount_value=50)

    def test_line_percent_50_01_fails(self):
        sess = _session(lines=[_line(1)])
        with self.assertRaises(DirectSaleError) as ctx:
            validate_line_discount(self.db, sess, line_id=1, discount_type="percent", discount_value=50.01)
        self.assertEqual(ctx.exception.code, "discount_exceeds_max")

    def test_line_amount_effective_50_passes(self):
        sess = _session(lines=[_line(1)])
        validate_line_discount(self.db, sess, line_id=1, discount_type="amount", discount_value=50)

    def test_line_amount_effective_over_max_fails(self):
        sess = _session(lines=[_line(1)])
        with self.assertRaises(DirectSaleError) as ctx:
            validate_line_discount(self.db, sess, line_id=1, discount_type="amount", discount_value=50.01)
        self.assertEqual(ctx.exception.code, "discount_exceeds_max")

    def test_order_percent_and_amount_caps(self):
        sess = _session(lines=[_line(1), _line(2, unit_net=50.0)])
        validate_order_discount(self.db, sess, discount_type="percent", discount_value=50)
        sess2 = _session(lines=[_line(1)])
        validate_order_discount(self.db, sess2, discount_type="amount", discount_value=50)
        with self.assertRaises(DirectSaleError):
            validate_order_discount(self.db, sess2, discount_type="amount", discount_value=50.01)


class TestDiscountStacking(unittest.TestCase):
    def setUp(self):
        self.db = _mock_db(vat_percent=0.0)
        self.vat_patcher = patch(
            "backend.services.direct_sale.session_financials_service.product_vat_for_direct_sale",
            return_value=0.0,
        )
        self.vat_patcher.start()
        patcher = patch(
            "backend.services.direct_sale.discount_validation_service._discount_settings",
            return_value=_discount_cfg(max_discount_percent=50.0),
        )
        self.addCleanup(patcher.stop)
        self.addCleanup(self.vat_patcher.stop)
        patcher.start()

    def test_line_20_order_20_passes(self):
        line = _line(1, disc_type="percent", disc_val=20.0)
        sess = _session(lines=[line])
        validate_order_discount(self.db, sess, discount_type="percent", discount_value=20)

    def test_line_50_order_50_fails(self):
        line = _line(1, disc_type="percent", disc_val=50.0)
        sess = _session(lines=[line])
        with self.assertRaises(DirectSaleError) as ctx:
            validate_order_discount(self.db, sess, discount_type="percent", discount_value=50)
        self.assertEqual(ctx.exception.code, "discount_exceeds_max")

    def test_line_50_order_1_fails_effective_stack(self):
        line = _line(1, disc_type="percent", disc_val=50.0)
        sess = _session(lines=[line])
        with self.assertRaises(DirectSaleError):
            validate_order_discount(self.db, sess, discount_type="percent", discount_value=1)


class TestCompleteRevalidation(unittest.TestCase):
    def setUp(self):
        self.db = _mock_db(vat_percent=0.0)
        self.vat_patcher = patch(
            "backend.services.direct_sale.session_financials_service.product_vat_for_direct_sale",
            return_value=0.0,
        )
        self.vat_patcher.start()

    def tearDown(self):
        self.vat_patcher.stop()

    def test_max_lowered_fails_complete(self):
        line = _line(1, disc_type="percent", disc_val=30.0)
        sess = _session(lines=[line])
        with patch(
            "backend.services.direct_sale.discount_validation_service._discount_settings",
            return_value=_discount_cfg(max_discount_percent=10.0),
        ):
            with self.assertRaises(DirectSaleError) as ctx:
                validate_session_discounts_for_complete(self.db, sess)
            self.assertEqual(ctx.exception.code, "discount_exceeds_max")

    def test_allow_line_disabled_with_existing_discount_fails_complete(self):
        line = _line(1, disc_type="percent", disc_val=10.0)
        sess = _session(lines=[line])
        with patch(
            "backend.services.direct_sale.discount_validation_service._discount_settings",
            return_value=_discount_cfg(allow_line_discounts=False),
        ):
            with self.assertRaises(DirectSaleError) as ctx:
                validate_session_discounts_for_complete(self.db, sess)
            self.assertEqual(ctx.exception.code, "line_discounts_disabled")


    def test_complete_passes_after_removing_invalid_discount(self):
        line = _line(1, disc_type="percent", disc_val=30.0)
        sess = _session(lines=[line])
        with patch(
            "backend.services.direct_sale.discount_validation_service._discount_settings",
            return_value=_discount_cfg(max_discount_percent=10.0),
        ):
            with self.assertRaises(DirectSaleError):
                validate_session_discounts_for_complete(self.db, sess)
        line.line_discount_type = None
        line.line_discount_value = 0.0
        with patch(
            "backend.services.direct_sale.discount_validation_service._discount_settings",
            return_value=_discount_cfg(max_discount_percent=10.0),
        ):
            validate_session_discounts_for_complete(self.db, sess)


if __name__ == "__main__":
    unittest.main()
