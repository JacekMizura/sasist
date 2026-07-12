"""Tests for printer assignment repair and queue guards."""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timedelta

from backend.models.printing.agent_printer import AgentPrinter
from backend.models.printing.constants import JOB_STATUS_PENDING, PRINTER_TYPE_A4
from backend.models.printing.print_job import PrintJob
from backend.models.printing.printing_default import PrintingDefault
from backend.models.printing.printer_agent import PrinterAgent
from backend.schemas.printing.agent import AgentRegisterRequest, RegisterAgentPrinterPayload
from backend.services.printing.agent_service import register_agent
from backend.services.printing.assignment_service import (
    OFFLINE_AGENT_QUEUE_MESSAGE,
    ensure_queue_target_agent_online,
    migrate_pending_jobs,
    repair_warehouse_printer_assignments,
)
from backend.services.printing.errors import PrintingError
from backend.services.printing.printer_service import sync_agent_printers
from backend.tests.printing._helpers import register_agent_via_api
from backend.tests.printing.test_printing_api import PrintingTestCase


class TestPrinterAssignment(PrintingTestCase):
    def _register_offline_agent(self, db, *, machine_id: str = "WIN-OFFLINE") -> tuple[PrinterAgent, AgentPrinter]:
        payload = AgentRegisterRequest(
            machine_id=machine_id,
            name="Offline PC",
            version="1.0.0",
            warehouse_id=1,
            printers=[
                RegisterAgentPrinterPayload(
                    name="HP",
                    system_name="HP-Offline",
                    printer_type="a4",
                    is_default=True,
                )
            ],
        )
        agent, _token = register_agent(db, tenant_id=1, payload=payload)
        agent.last_seen_at = datetime.utcnow() - timedelta(hours=2)
        db.commit()
        db.refresh(agent)
        printer = db.query(AgentPrinter).filter(AgentPrinter.agent_id == agent.id).first()
        assert printer is not None
        return agent, printer

    def test_queue_rejects_offline_default_agent(self):
        with self.SessionLocal() as db:
            _agent, printer = self._register_offline_agent(db)
            with self.assertRaises(PrintingError) as ctx:
                ensure_queue_target_agent_online(db, tenant_id=1, printer_id=printer.id)
            self.assertEqual(ctx.exception.status_code, 409)
            self.assertEqual(ctx.exception.message, OFFLINE_AGENT_QUEUE_MESSAGE)

    def test_sync_migrates_pending_jobs_to_replacement_printer(self):
        reg_online = register_agent_via_api(self.client, machine_id="WIN-ONLINE")
        with self.SessionLocal() as db:
            offline_agent, offline_printer = self._register_offline_agent(db, machine_id="WIN-OFFLINE-2")
            online_agent = db.query(PrinterAgent).filter(PrinterAgent.id == reg_online["agent_id"]).first()
            assert online_agent is not None
            replacement = AgentPrinter(
                agent_id=online_agent.id,
                name="HP",
                system_name="HP-Offline",
                printer_type="a4",
                is_default=True,
                is_active=True,
            )
            db.add(replacement)
            db.flush()

            job = PrintJob(
                tenant_id=1,
                warehouse_id=1,
                printer_id=offline_printer.id,
                document_type="stock_document",
                document_id=99,
                payload_json=json.dumps({"pdf_url": "http://x", "copies": 1}),
                status=JOB_STATUS_PENDING,
            )
            db.add(job)
            db.commit()

            sync_agent_printers(db, offline_agent, [])
            db.commit()
            db.refresh(job)
            self.assertEqual(job.printer_id, replacement.id)

    def test_migrate_pending_jobs_helper(self):
        with self.SessionLocal() as db:
            payload = AgentRegisterRequest(
                machine_id="WIN-MIG",
                name="PC",
                version="1.0.0",
                warehouse_id=1,
                printers=[
                    RegisterAgentPrinterPayload(
                        name="HP",
                        system_name="HP-1",
                        printer_type="a4",
                        is_default=True,
                    )
                ],
            )
            agent, _ = register_agent(db, tenant_id=1, payload=payload)
            old_printer = db.query(AgentPrinter).filter(AgentPrinter.agent_id == agent.id).first()
            assert old_printer is not None
            new_printer = AgentPrinter(
                agent_id=agent.id,
                name="HP 2",
                system_name="HP-2",
                printer_type="a4",
                is_active=True,
            )
            db.add(new_printer)
            db.flush()
            job = PrintJob(
                tenant_id=1,
                warehouse_id=1,
                printer_id=old_printer.id,
                document_type="test",
                document_id=1,
                payload_json="{}",
                status=JOB_STATUS_PENDING,
            )
            db.add(job)
            db.commit()

            count = migrate_pending_jobs(db, old_printer_id=old_printer.id, new_printer_id=new_printer.id)
            db.commit()
            db.refresh(job)
            self.assertEqual(count, 1)
            self.assertEqual(job.printer_id, new_printer.id)

    def test_repair_remaps_defaults_and_jobs(self):
        reg_online = register_agent_via_api(self.client, machine_id="WIN-REPAIR-ON")
        with self.SessionLocal() as db:
            _offline_agent, offline_printer = self._register_offline_agent(db, machine_id="WIN-REPAIR-OFF")
            db.add(
                PrintingDefault(
                    tenant_id=1,
                    warehouse_id=1,
                    printer_type=PRINTER_TYPE_A4,
                    agent_printer_id=offline_printer.id,
                )
            )
            job = PrintJob(
                tenant_id=1,
                warehouse_id=1,
                printer_id=offline_printer.id,
                document_type="stock_document",
                document_id=7,
                payload_json=json.dumps({"pdf_url": "http://x", "copies": 1}),
                status=JOB_STATUS_PENDING,
            )
            db.add(job)
            db.commit()

            online_printer = (
                db.query(AgentPrinter)
                .filter(AgentPrinter.agent_id == reg_online["agent_id"], AgentPrinter.printer_type == "a4")
                .first()
            )
            assert online_printer is not None

            result = repair_warehouse_printer_assignments(db, tenant_id=1, warehouse_id=1)
            self.assertGreaterEqual(result["defaults_remapped"], 1)
            self.assertGreaterEqual(result["jobs_migrated"], 1)
            self.assertEqual(result["primary_agent_id"], reg_online["agent_id"])

            default = (
                db.query(PrintingDefault)
                .filter(
                    PrintingDefault.tenant_id == 1,
                    PrintingDefault.warehouse_id == 1,
                    PrintingDefault.printer_type == PRINTER_TYPE_A4,
                )
                .first()
            )
            assert default is not None
            self.assertEqual(default.agent_printer_id, online_printer.id)
            db.refresh(job)
            self.assertEqual(job.printer_id, online_printer.id)

    def test_repair_api(self):
        reg = register_agent_via_api(self.client, machine_id="WIN-REPAIR-API")
        with self.SessionLocal() as db:
            _offline_agent, offline_printer = self._register_offline_agent(db, machine_id="WIN-REPAIR-API-OFF")
            db.add(
                PrintingDefault(
                    tenant_id=1,
                    warehouse_id=1,
                    printer_type=PRINTER_TYPE_A4,
                    agent_printer_id=offline_printer.id,
                )
            )
            db.commit()

        response = self.client.post(
            "/api/printing/defaults/repair",
            params={"tenant_id": 1, "warehouse_id": 1},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["primary_agent_id"], reg["agent_id"])
        self.assertGreaterEqual(body["defaults_remapped"], 1)


if __name__ == "__main__":
    unittest.main()
