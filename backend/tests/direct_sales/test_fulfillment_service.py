"""Direct sale fulfillment + transfer payment terms — unit tests.

  python -m pytest backend/tests/direct_sales/test_fulfillment_service.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.direct_sale.errors import DirectSaleError
from backend.services.direct_sale.fulfillment_service import (
    FULFILLMENT_DELIVERY,
    FULFILLMENT_PICKUP,
    PAYMENT_TERMS_DEFERRED,
    PAYMENT_TERMS_IMMEDIATE,
    get_session_fulfillment,
    set_session_fulfillment,
    transfer_should_settle,
    validate_fulfillment_for_complete,
)


class TestFulfillmentDefaults(unittest.TestCase):
    def test_default_pickup(self):
        sess = SimpleNamespace(metadata_json=None, status="ACTIVE")
        f = get_session_fulfillment(sess)
        self.assertEqual(f["mode"], FULFILLMENT_PICKUP)
        self.assertEqual(f["payment_terms_mode"], PAYMENT_TERMS_IMMEDIATE)


class TestValidateDelivery(unittest.TestCase):
    def test_delivery_requires_address_and_method(self):
        sess = SimpleNamespace(
            status="ACTIVE",
            metadata_json='{"fulfillment":{"mode":"DELIVERY"}}',
        )
        with self.assertRaises(DirectSaleError) as ctx:
            validate_fulfillment_for_complete(sess)
        self.assertEqual(ctx.exception.code, "shipping_address_required")

    def test_pickup_ok(self):
        sess = SimpleNamespace(status="ACTIVE", metadata_json=None)
        f = validate_fulfillment_for_complete(sess)
        self.assertEqual(f["mode"], FULFILLMENT_PICKUP)


class TestTransferSettle(unittest.TestCase):
    def test_cash_always_settles(self):
        self.assertTrue(transfer_should_settle({"payment_terms_mode": "DEFERRED"}, "CASH"))

    def test_transfer_immediate_settles(self):
        self.assertTrue(
            transfer_should_settle({"payment_terms_mode": PAYMENT_TERMS_IMMEDIATE}, "TRANSFER")
        )

    def test_transfer_deferred_pending(self):
        self.assertFalse(
            transfer_should_settle({"payment_terms_mode": PAYMENT_TERMS_DEFERRED}, "TRANSFER")
        )


class TestSetFulfillmentMode(unittest.TestCase):
    def test_set_delivery_mode(self):
        db = MagicMock()
        sess = SimpleNamespace(
            status="ACTIVE",
            metadata_json=None,
            tenant_id=1,
            warehouse_id=1,
            customer_id=None,
            last_activity_at=None,
        )
        out = set_session_fulfillment(db, sess, mode=FULFILLMENT_DELIVERY)
        self.assertEqual(out["mode"], FULFILLMENT_DELIVERY)
        self.assertIn("fulfillment", sess.metadata_json)


class TestPaymentOrchestrationDeferred(unittest.TestCase):
    def test_deferred_transfer_stays_pending(self):
        from backend.services.direct_sale.payment_service import orchestrate_direct_sale_payment

        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
        order = SimpleNamespace(id=10, tenant_id=1, warehouse_id=1, currency="PLN")
        sess = SimpleNamespace(id=87, tenant_id=1, warehouse_id=1, workstation_id=None)

        with patch(
            "backend.services.direct_sale.payment_service.emit_operational_sales_event"
        ), patch(
            "backend.services.direct_sale.payment_service.log_payment_orchestration"
        ):
            # Capture Payment() constructor via db.add side effect
            created = {}

            def _add(obj):
                if obj.__class__.__name__ == "Payment":
                    created["pay"] = obj
                    obj.id = 55

            db.add.side_effect = _add
            db.flush.side_effect = lambda: None

            pay = orchestrate_direct_sale_payment(
                db,
                order=order,
                sess=sess,
                amount=100.0,
                method="TRANSFER",
                settle=False,
                payment_terms_days=14,
            )
        self.assertEqual(pay.status, "PENDING")
        self.assertEqual(pay.settlement_state, "PENDING")


if __name__ == "__main__":
    unittest.main()
