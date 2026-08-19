"""Direct sale customer gates at complete — PA/FV runtime (not settings-driven).

  python -m pytest backend/tests/direct_sales/test_direct_sales_customer_complete.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.direct_sale.errors import DirectSaleError
from backend.services.direct_sale.retail_customer_service import RETAIL_CUSTOMER_EMAIL_SUFFIX


def _retail_customer(*, tenant_id: int = 1, customer_id: int = 99) -> SimpleNamespace:
    return SimpleNamespace(
        id=customer_id,
        email=f"retail+{tenant_id}{RETAIL_CUSTOMER_EMAIL_SUFFIX}",
        nip=None,
        first_name="Klient detaliczny",
        last_name="",
        company_name="Klient detaliczny",
    )


def _named_customer(*, customer_id: int = 50, nip: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=customer_id,
        email="b2b@example.com",
        nip=nip,
        first_name="Jan",
        last_name="Kowalski",
        company_name="Firma Test",
    )


def _session(*, customer_id: int, status: str = "CHECKOUT") -> SimpleNamespace:
    line = SimpleNamespace(
        id=10,
        product_id=5,
        quantity=1.0,
        unit_price=10.0,
        discount_amount=0.0,
        sort_order=0,
    )
    return SimpleNamespace(
        id=9,
        tenant_id=1,
        warehouse_id=1,
        status=status,
        pipeline_status="PAYMENT_STARTED",
        pipeline_state_json=None,
        pipeline_failed_stage=None,
        order_id=None,
        customer_id=customer_id,
        lines=[line],
        issue_strategy="STRICT_LOCATION",
        reservation_scope="SESSION",
        workstation_id=None,
        metadata_json=None,
    )


class TestDirectSaleCustomerCompleteMatrix(unittest.TestCase):
    def _db_with_customer(self, customer: SimpleNamespace | None) -> MagicMock:
        pay = SimpleNamespace(id=300, status="PAID", method="CASH", order_id=100)
        order = SimpleNamespace(id=100, value=10.0)

        db = MagicMock()

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            q.order_by.return_value = q
            name = getattr(model, "__name__", "")
            if name == "Customer":
                q.first.return_value = customer
            elif name == "Payment":
                q.first.return_value = pay
            elif name == "Order":
                q.first.return_value = order
            else:
                q.first.return_value = None
            return q

        db.query.side_effect = query_side
        return db

    @patch("backend.services.direct_sale.complete_service.run_staged_complete_pipeline")
    def test_pa_retail_complete_passes(self, mock_pipeline):
        from backend.services.direct_sale.complete_service import complete_direct_sale_session
        from backend.services.direct_sale.pipeline_orchestrator import StageEntities

        mock_pipeline.return_value = StageEntities(
            order_id=100,
            payment_id=300,
            document_job_id=55,
            document_number="PA1",
            stock_document_id=None,
        )
        retail = _retail_customer()
        sess = _session(customer_id=int(retail.id))
        db = self._db_with_customer(retail)

        result = complete_direct_sale_session(db, sess, document_subtype="RECEIPT")
        self.assertEqual(result.order_id, 100)
        mock_pipeline.assert_called_once()

    @patch("backend.services.direct_sale.complete_service.run_staged_complete_pipeline")
    def test_fv_retail_rejected(self, mock_pipeline):
        from backend.services.direct_sale.complete_service import complete_direct_sale_session

        retail = _retail_customer()
        sess = _session(customer_id=int(retail.id))
        db = self._db_with_customer(retail)

        with self.assertRaises(DirectSaleError) as ctx:
            complete_direct_sale_session(db, sess, document_subtype="INVOICE")
        self.assertEqual(ctx.exception.code, "invoice_customer_required")
        mock_pipeline.assert_not_called()

    @patch("backend.services.direct_sale.complete_service.run_staged_complete_pipeline")
    def test_fv_named_without_nip_rejected(self, mock_pipeline):
        from backend.services.direct_sale.complete_service import complete_direct_sale_session

        cust = _named_customer(nip=None)
        sess = _session(customer_id=int(cust.id))
        db = self._db_with_customer(cust)

        with self.assertRaises(DirectSaleError) as ctx:
            complete_direct_sale_session(db, sess, document_subtype="INVOICE")
        self.assertEqual(ctx.exception.code, "invoice_nip_required")
        mock_pipeline.assert_not_called()

    @patch("backend.services.direct_sale.complete_service.run_staged_complete_pipeline")
    def test_fv_named_with_nip_passes(self, mock_pipeline):
        from backend.services.direct_sale.complete_service import complete_direct_sale_session
        from backend.services.direct_sale.pipeline_orchestrator import StageEntities

        mock_pipeline.return_value = StageEntities(
            order_id=100,
            payment_id=300,
            document_job_id=55,
            document_number="FV1",
            stock_document_id=None,
        )
        cust = _named_customer(nip="1234567890")
        sess = _session(customer_id=int(cust.id))
        db = self._db_with_customer(cust)

        result = complete_direct_sale_session(db, sess, document_subtype="INVOICE")
        self.assertEqual(result.order_id, 100)
        mock_pipeline.assert_called_once()


if __name__ == "__main__":
    unittest.main()
