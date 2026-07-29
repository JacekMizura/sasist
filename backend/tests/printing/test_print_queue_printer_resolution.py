"""Print queue printer resolution — workstation mapping only (no PrintingDefault)."""

from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import patch

from sqlalchemy import text
from sqlalchemy.schema import CreateTable

from backend.models.printing.agent_printer import AgentPrinter
from backend.models.printing.constants import JOB_STATUS_PENDING, PRINTER_TYPE_LABEL
from backend.models.printing.print_job import PrintJob
from backend.models.printing.printing_default import PrintingDefault
from backend.models.printing.printer_agent import PrinterAgent
from backend.models.printer import Printer
from backend.models.printer_profile import PrinterProfile
from backend.models.wms_workstations import WmsWorkstation, WorkstationPrinterMapping
from backend.models.wms_workstations.constants import PRINT_TYPE_LABELS, STATION_TYPE_PACKING
from backend.schemas.printing.queue import LabelQueuePayload, QueuePrintRequest
from backend.services.printing.errors import PrintingError
from backend.services.printing.printer_service import (
    backfill_profile_agent_printer_links,
    resolve_profile_agent_printer_id,
)
from backend.services.printing.queue_service import (
    queue_print_job,
    resolve_queue_printer_id,
)
from backend.tests.printing._helpers import create_printing_test_engine, make_session_factory


def _ensure_label_tables(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(str(CreateTable(PrinterProfile.__table__).compile(dialect=engine.dialect))))
        conn.execute(text(str(CreateTable(Printer.__table__).compile(dialect=engine.dialect))))


class PrintQueuePrinterResolutionTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_printing_test_engine()
        _ensure_label_tables(cls.engine)
        cls.SessionLocal = make_session_factory(cls.engine)

    def setUp(self) -> None:
        self.db = self.SessionLocal()
        with self.engine.begin() as conn:
            conn.execute(text("DELETE FROM print_jobs"))
            conn.execute(text("DELETE FROM wms_workstation_printer_mappings"))
            conn.execute(text("DELETE FROM wms_workstations"))
            conn.execute(text("DELETE FROM printing_defaults"))
            conn.execute(text("DELETE FROM agent_printers"))
            conn.execute(text("DELETE FROM printer_agents"))
            conn.execute(text("DELETE FROM printers"))
            conn.execute(text("DELETE FROM printer_profiles"))

        now = datetime.utcnow()
        agent = PrinterAgent(
            tenant_id=1,
            warehouse_id=1,
            machine_id="WIN-LABEL-001",
            name="Label PC",
            token_hash="hash",
            last_seen_at=now,
        )
        self.db.add(agent)
        self.db.flush()

        self.label_default = AgentPrinter(
            agent_id=agent.id,
            name="Zebra ZPL",
            system_name="ZDesigner ZD220-203dpi ZPL",
            printer_type=PRINTER_TYPE_LABEL,
            is_default=True,
            is_active=True,
        )
        self.profile_printer = AgentPrinter(
            agent_id=agent.id,
            name="Epson L4260",
            system_name="EPSONB0294C (L4260 Series)",
            printer_type=PRINTER_TYPE_LABEL,
            is_default=False,
            is_active=True,
        )
        self.db.add_all([self.label_default, self.profile_printer])
        self.db.flush()

        self.db.add(
            PrintingDefault(
                tenant_id=1,
                warehouse_id=1,
                printer_type=PRINTER_TYPE_LABEL,
                agent_printer_id=self.label_default.id,
            )
        )

        self.workstation = WmsWorkstation(
            tenant_id=1,
            warehouse_id=1,
            name="Pack Desk",
            station_type=STATION_TYPE_PACKING,
            is_active=True,
            printer_agent_id=agent.id,
        )
        self.db.add(self.workstation)
        self.db.flush()
        self.db.add(
            WorkstationPrinterMapping(
                workstation_id=self.workstation.id,
                print_type=PRINT_TYPE_LABELS,
                agent_printer_id=self.label_default.id,
            )
        )

        self.profile = PrinterProfile(
            tenant_id=1,
            name="Epson profile",
            agent_printer_id=self.profile_printer.id,
        )
        self.db.add(self.profile)
        self.db.flush()

        self.legacy_printer = Printer(
            tenant_id=1,
            name="Epson profile",
            profile_id=self.profile.id,
            warehouse_id=1,
            connection_type="agent",
            system_printer_name="EPSONB0294C (L4260 Series)",
        )
        self.db.add(self.legacy_printer)
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()


class TestResolveQueuePrinterId(PrintQueuePrinterResolutionTestCase):
    def test_explicit_printer_allowed(self) -> None:
        resolution = resolve_queue_printer_id(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            document_type="label",
            requested_printer_id=self.profile_printer.id,
            requested_profile_id=None,
        )
        self.assertEqual(resolution.printer_id, self.profile_printer.id)
        self.assertEqual(resolution.source, "request")

    def test_profile_id_ignored_without_workstation(self) -> None:
        with self.assertRaises(PrintingError) as ctx:
            resolve_queue_printer_id(
                self.db,
                tenant_id=1,
                warehouse_id=1,
                document_type="label",
                requested_printer_id=None,
                requested_profile_id=self.profile.id,
            )
        self.assertEqual(ctx.exception.code, "NO_WORKSTATION")

    def test_printing_default_not_used_without_workstation(self) -> None:
        with self.assertRaises(PrintingError) as ctx:
            resolve_queue_printer_id(
                self.db,
                tenant_id=1,
                warehouse_id=1,
                document_type="label",
                requested_printer_id=None,
                requested_profile_id=None,
            )
        self.assertEqual(ctx.exception.code, "NO_WORKSTATION")

    def test_workstation_mapping_resolves(self) -> None:
        resolution = resolve_queue_printer_id(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            document_type="label",
            requested_printer_id=None,
            requested_profile_id=None,
            workstation_id=self.workstation.id,
        )
        self.assertEqual(resolution.printer_id, self.label_default.id)
        self.assertEqual(resolution.source, "workstation")
        self.assertEqual(resolution.workstation_id, self.workstation.id)

    def test_missing_mapping_raises(self) -> None:
        self.db.query(WorkstationPrinterMapping).delete()
        self.db.commit()
        with self.assertRaises(PrintingError) as ctx:
            resolve_queue_printer_id(
                self.db,
                tenant_id=1,
                warehouse_id=1,
                document_type="label",
                requested_printer_id=None,
                requested_profile_id=None,
                workstation_id=self.workstation.id,
            )
        self.assertEqual(ctx.exception.code, "NO_WORKSTATION_MAPPING")

    def test_stale_profile_agent_printer_id_is_relinked(self) -> None:
        self.profile.agent_printer_id = 99999
        self.db.commit()

        resolved = resolve_profile_agent_printer_id(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            profile_id=self.profile.id,
        )
        self.assertEqual(resolved, self.profile_printer.id)
        self.db.refresh(self.profile)
        self.assertEqual(self.profile.agent_printer_id, self.profile_printer.id)

    def test_backfill_links_existing_profiles(self) -> None:
        self.profile.agent_printer_id = None
        self.db.commit()

        stats = backfill_profile_agent_printer_links(self.db)
        self.assertGreaterEqual(stats["updated"], 1)
        self.db.refresh(self.profile)
        self.assertEqual(self.profile.agent_printer_id, self.profile_printer.id)


class TestQueuePrintJobPrinterId(PrintQueuePrinterResolutionTestCase):
    @patch("backend.services.printing.queue_service.save_job_pdf")
    @patch("backend.services.printing.queue_service.generate_pdf_bytes", return_value=b"%PDF-1.4")
    def test_queue_job_uses_workstation_mapping(self, _mock_pdf, _mock_save) -> None:
        payload = QueuePrintRequest(
            document_type="label",
            warehouse_id=1,
            workstation_id=self.workstation.id,
            label=LabelQueuePayload(
                template_id=1,
                records=[{"loc_name": "A-01-01"}],
            ),
        )
        job = queue_print_job(
            self.db,
            tenant_id=1,
            payload=payload,
            api_base_url="http://testserver",
            created_by_user_id=1,
        )
        self.assertEqual(job.printer_id, self.label_default.id)
        self.assertEqual(job.workstation_id, self.workstation.id)
        self.assertEqual(job.created_by_user_id, 1)

        stored = self.db.query(PrintJob).filter(PrintJob.id == job.id).first()
        assert stored is not None
        self.assertEqual(stored.printer_id, self.label_default.id)
        self.assertEqual(stored.status, JOB_STATUS_PENDING)
        self.assertEqual(stored.workstation_id, self.workstation.id)
        self.assertEqual(stored.created_by_user_id, 1)


if __name__ == "__main__":
    unittest.main()
