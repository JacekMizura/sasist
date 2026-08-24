"""Unit tests for generate_document support helpers + unsupported series gate."""

from __future__ import annotations

import unittest
import uuid
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.document_series import DocumentSeries
from backend.models.order import Order
from backend.models.sale_document import SaleDocument
from backend.models.warehouse import Warehouse
from backend.services.documents.create_from_series_service import (
    DocumentCreationError,
    DocumentTriggerContext,
    create_document_from_series,
)
from backend.services.documents.generate_document_support import (
    GENERATE_DOCUMENT_SUPPORTED,
    DocumentCreationOverrides,
    build_issuance_overrides_dict,
    is_generate_document_supported,
    parse_document_creation_overrides,
    resolve_series_payment_term_text,
    resolve_series_sale_date_iso,
)


class GenerateDocumentSupportTests(unittest.TestCase):
    def test_supported_matrix(self):
        self.assertIn(("SALE", "INVOICE"), GENERATE_DOCUMENT_SUPPORTED)
        self.assertIn(("SALE", "RECEIPT"), GENERATE_DOCUMENT_SUPPORTED)
        self.assertIn(("WAREHOUSE", "WZ"), GENERATE_DOCUMENT_SUPPORTED)
        self.assertIn(("WAREHOUSE", "RESERVATION"), GENERATE_DOCUMENT_SUPPORTED)
        self.assertFalse(is_generate_document_supported("WAREHOUSE", "PZ"))
        self.assertFalse(is_generate_document_supported("CORRECTION", "CORRECTION"))

    def test_parse_legacy_series_id_only(self):
        ov = parse_document_creation_overrides({"series_id": "abc"})
        self.assertFalse(ov.override_payment_term)
        self.assertFalse(ov.auto_print)
        self.assertIsNone(ov.payment_term_days)

    def test_parse_payment_term_required_when_override(self):
        with self.assertRaises(ValueError) as cm:
            parse_document_creation_overrides({"override_payment_term": True})
        self.assertEqual(str(cm.exception), "payment_term_days_required")

    def test_parse_payment_term_invalid(self):
        with self.assertRaises(ValueError) as cm:
            parse_document_creation_overrides(
                {"override_payment_term": True, "payment_term_days": -1}
            )
        self.assertEqual(str(cm.exception), "payment_term_days_invalid")

    def test_parse_sale_date_and_print_station(self):
        ov = parse_document_creation_overrides(
            {
                "override_sale_date": True,
                "sale_date": "2026-08-24",
                "auto_print": True,
                "print_station_id": 7,
            }
        )
        self.assertEqual(ov.sale_date, "2026-08-24")
        self.assertEqual(ov.print_station_id, 7)

    def test_parse_print_station_required(self):
        with self.assertRaises(ValueError) as cm:
            parse_document_creation_overrides({"auto_print": True})
        self.assertEqual(str(cm.exception), "print_station_required")

    def test_series_defaults_vs_overrides(self):
        class _Series:
            payment_term_default = "7 dni"
            sale_date_source = "ORDER_DATE"

        class _Order:
            order_date = None
            created_at = None

        base = DocumentCreationOverrides()
        self.assertEqual(resolve_series_payment_term_text(_Series(), base), "7 dni")
        ov = DocumentCreationOverrides(override_payment_term=True, payment_term_days=14)
        self.assertEqual(resolve_series_payment_term_text(_Series(), ov), "14 dni")

        ov_sale = DocumentCreationOverrides(override_sale_date=True, sale_date="2026-01-15")
        self.assertEqual(resolve_series_sale_date_iso(_Series(), _Order(), ov_sale), "2026-01-15")

        issuance = build_issuance_overrides_dict(
            _Series(),
            _Order(),
            DocumentCreationOverrides(
                override_payment_term=True,
                payment_term_days=3,
                override_description=True,
                additional_description="Uwaga test",
            ),
        )
        self.assertEqual(issuance["payment_term_days"], 3)
        self.assertEqual(issuance["additional_description"], "Uwaga test")
        self.assertIn("due_date", issuance)


class UnsupportedSeriesGateTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=__import__("sqlalchemy.pool", fromlist=["StaticPool"]).StaticPool,
        )
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants VALUES (1)"))
        for model in (Warehouse, Order, DocumentSeries):
            model.__table__.create(engine, checkfirst=True)
        self.Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.db.add(Warehouse(id=1, name="M1", tenant_id=1, requires_putaway=True))
        self.db.add(Order(id=1, tenant_id=1, warehouse_id=1, number="O1", status="new"))
        self.pz_id = str(uuid.uuid4())
        self.db.add(
            DocumentSeries(
                id=self.pz_id,
                tenant_id=1,
                warehouse_id=1,
                name="PZ",
                prefix="PZ",
                series_type="WAREHOUSE",
                subtype="PZ",
                numbering_format="{PREFIX}/{NUMBER}",
                is_active=True,
            )
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()

    def test_pz_rejected_as_unsupported(self):
        with self.assertRaises(DocumentCreationError) as cm:
            create_document_from_series(
                self.db,
                tenant_id=1,
                series_id=self.pz_id,
                order_id=1,
            )
        self.assertEqual(cm.exception.code, "unsupported_series")


class SaleHandlerDelegationTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=__import__("sqlalchemy.pool", fromlist=["StaticPool"]).StaticPool,
        )
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants VALUES (1)"))
        for model in (Warehouse, Order, DocumentSeries, SaleDocument):
            model.__table__.create(engine, checkfirst=True)
        self.Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.db.add(Warehouse(id=1, name="M1", tenant_id=1, requires_putaway=True))
        self.db.add(Order(id=10, tenant_id=1, warehouse_id=1, number="O10", status="new"))
        self.sid = str(uuid.uuid4())
        self.db.add(
            DocumentSeries(
                id=self.sid,
                tenant_id=1,
                warehouse_id=1,
                name="Faktura Polska",
                prefix="FV",
                series_type="SALE",
                subtype="INVOICE",
                numbering_format="{PREFIX}/{NUMBER}",
                payment_term_default="7 dni",
                is_active=True,
            )
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()

    def test_sale_path_calls_create_sale_document_with_overrides(self):
        mock_doc = MagicMock()
        mock_doc.id = "sale-1"
        mock_doc.document_number = "FV/2026/08/1"
        mock_doc.document_subtype = "INVOICE"

        with patch(
            "backend.services.wms_sale_document_service.create_sale_document",
            return_value=mock_doc,
        ) as create_sale, patch(
            "backend.services.wms_sale_document_service.panel_document_type_for_series",
            return_value="invoice",
        ), patch(
            "backend.services.activity_log.domain_activity.record_domain_activity",
        ), patch(
            "backend.services.activity_log.domain_activity.find_activity_by_correlation",
            return_value=None,
        ):
            result = create_document_from_series(
                self.db,
                tenant_id=1,
                series_id=self.sid,
                order_id=10,
                trigger_context=DocumentTriggerContext(
                    source="AUTOMATION",
                    automation_execution_id=99,
                    automation_effect_id=1,
                ),
                overrides=DocumentCreationOverrides(
                    override_payment_term=True,
                    payment_term_days=14,
                    override_description=True,
                    additional_description="Opis auto",
                ),
            )
        self.assertEqual(result.document_number, "FV/2026/08/1")
        self.assertEqual(result.sale_document_id, "sale-1")
        self.assertTrue(result.created)
        self.assertEqual(result.metadata.get("payment_term"), "14 dni")
        create_sale.assert_called_once()
        kwargs = create_sale.call_args.kwargs
        self.assertEqual(kwargs["series_id"], self.sid)
        self.assertEqual(kwargs["issuance_overrides"]["payment_term_days"], 14)
        self.assertEqual(kwargs["issuance_overrides"]["additional_description"], "Opis auto")

    def test_sale_idempotent_retry_same_execution(self):
        existing = SaleDocument(
            id="sale-existing",
            tenant_id=1,
            warehouse_id=1,
            order_id=10,
            document_series_id=self.sid,
            document_number="FV/1",
            panel_document_type="INVOICE",
            document_subtype="INVOICE",
            series_type="SALE",
            document_kind="PRIMARY",
            buyer_json="{}",
        )
        self.db.add(existing)
        self.db.commit()

        prior = MagicMock()
        with patch(
            "backend.services.activity_log.domain_activity.find_activity_by_correlation",
            return_value=prior,
        ), patch(
            "backend.services.wms_sale_document_service.create_sale_document",
        ) as create_sale:
            result = create_document_from_series(
                self.db,
                tenant_id=1,
                series_id=self.sid,
                order_id=10,
                trigger_context=DocumentTriggerContext(
                    source="AUTOMATION",
                    automation_execution_id=99,
                    automation_effect_id=1,
                ),
            )
        create_sale.assert_not_called()
        self.assertFalse(result.created)
        self.assertEqual(result.sale_document_id, "sale-existing")

    def test_auto_print_off_skips_queue(self):
        mock_doc = MagicMock()
        mock_doc.id = "sale-2"
        mock_doc.document_number = "FV/2"
        mock_doc.document_subtype = "INVOICE"
        with patch(
            "backend.services.wms_sale_document_service.create_sale_document",
            return_value=mock_doc,
        ), patch(
            "backend.services.wms_sale_document_service.panel_document_type_for_series",
            return_value="invoice",
        ), patch(
            "backend.services.activity_log.domain_activity.record_domain_activity",
        ), patch(
            "backend.services.activity_log.domain_activity.find_activity_by_correlation",
            return_value=None,
        ), patch(
            "backend.services.printing.queue_service.queue_print_job",
        ) as q:
            result = create_document_from_series(
                self.db,
                tenant_id=1,
                series_id=self.sid,
                order_id=10,
                overrides=DocumentCreationOverrides(auto_print=False),
            )
        q.assert_not_called()
        self.assertIsNone(result.print_job_id)

    def test_auto_print_on_queues_job(self):
        mock_doc = MagicMock()
        mock_doc.id = "sale-3"
        mock_doc.document_number = "FV/3"
        mock_doc.document_subtype = "INVOICE"
        job = MagicMock()
        job.id = 55
        with patch(
            "backend.services.wms_sale_document_service.create_sale_document",
            return_value=mock_doc,
        ), patch(
            "backend.services.wms_sale_document_service.panel_document_type_for_series",
            return_value="invoice",
        ), patch(
            "backend.services.activity_log.domain_activity.record_domain_activity",
        ), patch(
            "backend.services.activity_log.domain_activity.find_activity_by_correlation",
            return_value=None,
        ), patch(
            "backend.services.printing.queue_service.queue_print_job",
            return_value=job,
        ) as q:
            result = create_document_from_series(
                self.db,
                tenant_id=1,
                series_id=self.sid,
                order_id=10,
                overrides=DocumentCreationOverrides(auto_print=True, print_station_id=4),
            )
        q.assert_called_once()
        self.assertEqual(q.call_args.kwargs.get("commit"), False)
        self.assertEqual(result.print_job_id, 55)


if __name__ == "__main__":
    unittest.main()
