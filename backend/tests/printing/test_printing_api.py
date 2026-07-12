"""
Printing MVP API and service tests.

  python -m pytest backend/tests/printing/ -q
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.database import get_db
from backend.main import app
from backend.models.printing.agent_printer import AgentPrinter
from backend.models.printing.constants import JOB_STATUS_PENDING, JOB_STATUS_PRINTED, JOB_STATUS_PROCESSING
from backend.models.printing.print_job import PrintJob
from backend.models.printing.printer_agent import PrinterAgent
from backend.platform_state import mark_tier0_ready
from backend.services.printing.agent_auth_service import hash_agent_token
from backend.services.printing.agent_service import register_agent
from backend.services.printing.errors import JobTransitionConflictError
from backend.services.printing.job_service import claim_print_job
from backend.schemas.printing.agent import AgentRegisterRequest, RegisterAgentPrinterPayload
from backend.tests.printing._helpers import (
    auth_headers,
    create_printing_test_engine,
    make_session_factory,
    register_agent_via_api,
    user_override,
)


class PrintingTestCase(unittest.TestCase):
    engine = None
    SessionLocal = None
    db: Session | None = None

    @classmethod
    def setUpClass(cls) -> None:
        mark_tier0_ready()
        cls.engine = create_printing_test_engine()
        cls.SessionLocal = make_session_factory(cls.engine)

        def _override_get_db():
            db = cls.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _override_get_db
        app.dependency_overrides[get_current_user] = lambda: user_override()
        cls.client = TestClient(app, raise_server_exceptions=True)

    @classmethod
    def tearDownClass(cls) -> None:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    def setUp(self) -> None:
        assert self.SessionLocal is not None
        self.db = self.SessionLocal()
        with self.engine.begin() as conn:
            conn.execute(__import__("sqlalchemy").text("DELETE FROM print_jobs"))
            conn.execute(__import__("sqlalchemy").text("DELETE FROM printing_auto_settings"))
            conn.execute(__import__("sqlalchemy").text("DELETE FROM printing_defaults"))
            conn.execute(__import__("sqlalchemy").text("DELETE FROM agent_printers"))
            conn.execute(__import__("sqlalchemy").text("DELETE FROM printer_agents"))

    def tearDown(self) -> None:
        if self.db is not None:
            self.db.close()


class TestAgentRegistration(PrintingTestCase):
    def test_register_creates_agent_and_returns_token(self):
        data = register_agent_via_api(self.client)
        self.assertTrue(data["token"].startswith("spt_"))
        self.assertEqual(data["machine_id"], "WIN-TEST-001")

        with self.SessionLocal() as db:
            agent = db.query(PrinterAgent).filter(PrinterAgent.id == data["agent_id"]).first()
            self.assertIsNotNone(agent)
            assert agent is not None
            self.assertNotEqual(agent.token_hash, data["token"])
            self.assertEqual(agent.token_hash, hash_agent_token(data["token"]))

    def test_register_updates_existing_agent_and_rotates_token(self):
        first = register_agent_via_api(self.client)
        second = register_agent_via_api(self.client)
        self.assertEqual(first["agent_id"], second["agent_id"])
        self.assertNotEqual(first["token"], second["token"])

    def test_register_syncs_printers(self):
        data = register_agent_via_api(self.client)
        with self.SessionLocal() as db:
            printers = (
                db.query(AgentPrinter)
                .filter(AgentPrinter.agent_id == data["agent_id"])
                .order_by(AgentPrinter.system_name.asc())
                .all()
            )
            self.assertEqual(len(printers), 2)
            self.assertEqual(printers[0].system_name, "HP LaserJet")
            self.assertTrue(printers[0].is_default)

    def test_register_deactivates_removed_printers(self):
        data = register_agent_via_api(self.client)
        self.client.post(
            "/api/printing/agents/register",
            params={"tenant_id": 1},
            json={
                "machine_id": "WIN-TEST-001",
                "name": "Test PC",
                "version": "1.0.1",
                "warehouse_id": 1,
                "printers": [
                    {
                        "name": "HP A4",
                        "system_name": "HP LaserJet",
                        "printer_type": "a4",
                        "is_default": True,
                    }
                ],
            },
        )
        with self.SessionLocal() as db:
            zebra = (
                db.query(AgentPrinter)
                .filter(
                    AgentPrinter.agent_id == data["agent_id"],
                    AgentPrinter.system_name == "ZDesigner",
                )
                .first()
            )
            self.assertIsNotNone(zebra)
            assert zebra is not None
            self.assertFalse(zebra.is_active)


class TestAgentHeartbeat(PrintingTestCase):
    def test_heartbeat_requires_agent_token(self):
        response = self.client.post("/api/printing/agents/heartbeat")
        self.assertEqual(response.status_code, 401)

    def test_heartbeat_updates_online_state(self):
        reg = register_agent_via_api(self.client)
        response = self.client.post(
            "/api/printing/agents/heartbeat",
            headers=auth_headers(reg["token"]),
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["is_online"])
        self.assertIsNotNone(body["last_seen_at"])


class TestAgentListing(PrintingTestCase):
    def test_list_agents_requires_jwt(self):
        app.dependency_overrides.pop(get_current_user, None)
        try:
            response = self.client.get("/api/printing/agents", params={"tenant_id": 1})
            self.assertEqual(response.status_code, 401)
        finally:
            app.dependency_overrides[get_current_user] = lambda: user_override()

    def test_list_agents_dynamic_online_status(self):
        register_agent_via_api(self.client)
        response = self.client.get("/api/printing/agents", params={"tenant_id": 1})
        self.assertEqual(response.status_code, 200)
        agents = response.json()
        self.assertEqual(len(agents), 1)
        self.assertTrue(agents[0]["is_online"])

        with self.SessionLocal() as db:
            agent = db.query(PrinterAgent).first()
            assert agent is not None
            agent.last_seen_at = datetime.utcnow() - timedelta(minutes=5)
            db.commit()

        response = self.client.get("/api/printing/agents", params={"tenant_id": 1})
        agents = response.json()
        self.assertFalse(agents[0]["is_online"])


class TestPrintJobs(PrintingTestCase):
    def _register_and_get_printer_id(self) -> tuple[str, int]:
        reg = register_agent_via_api(self.client)
        with self.SessionLocal() as db:
            printer = (
                db.query(AgentPrinter)
                .filter(AgentPrinter.agent_id == reg["agent_id"], AgentPrinter.printer_type == "a4")
                .first()
            )
            assert printer is not None
            return reg["token"], printer.id

    def test_create_job(self):
        _, printer_id = self._register_and_get_printer_id()
        response = self.client.post(
            "/api/printing/jobs",
            params={"tenant_id": 1},
            json={
                "printer_id": printer_id,
                "document_type": "stock_document",
                "document_id": 42,
                "payload": {"pdf_url": "https://example.com/doc.pdf", "copies": 1},
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], JOB_STATUS_PENDING)
        self.assertEqual(body["document_id"], 42)

    def test_pending_returns_only_agent_printers_jobs(self):
        reg_a = register_agent_via_api(self.client, machine_id="WIN-A")
        reg_b = register_agent_via_api(self.client, machine_id="WIN-B", tenant_id=1)

        with self.SessionLocal() as db:
            printer_a = db.query(AgentPrinter).filter(AgentPrinter.agent_id == reg_a["agent_id"]).first()
            printer_b = db.query(AgentPrinter).filter(AgentPrinter.agent_id == reg_b["agent_id"]).first()
            assert printer_a and printer_b

        for printer_id in (printer_a.id, printer_b.id):
            self.client.post(
                "/api/printing/jobs",
                params={"tenant_id": 1},
                json={
                    "printer_id": printer_id,
                    "document_type": "stock_document",
                    "document_id": printer_id,
                    "payload": {"pdf_url": "https://example.com/a.pdf", "copies": 1},
                },
            )

        pending_a = self.client.get(
            "/api/printing/jobs/pending",
            headers=auth_headers(reg_a["token"]),
        )
        self.assertEqual(pending_a.status_code, 200)
        jobs_a = pending_a.json()["jobs"]
        self.assertEqual(len(jobs_a), 1)
        self.assertEqual(jobs_a[0]["printer_id"], printer_a.id)

    def test_job_lifecycle_printed(self):
        token, printer_id = self._register_and_get_printer_id()
        created = self.client.post(
            "/api/printing/jobs",
            params={"tenant_id": 1},
            json={
                "printer_id": printer_id,
                "document_type": "stock_document",
                "document_id": 99,
                "payload": {"pdf_url": "https://example.com/x.pdf", "copies": 1},
            },
        ).json()
        job_id = created["id"]

        processing = self.client.post(
            f"/api/printing/jobs/{job_id}/processing",
            headers=auth_headers(token),
        )
        self.assertEqual(processing.status_code, 200)
        self.assertEqual(processing.json()["status"], JOB_STATUS_PROCESSING)

        complete = self.client.post(
            f"/api/printing/jobs/{job_id}/complete",
            headers=auth_headers(token),
            json={},
        )
        self.assertEqual(complete.status_code, 200)
        self.assertEqual(complete.json()["status"], JOB_STATUS_PRINTED)

    def test_job_lifecycle_failed(self):
        token, printer_id = self._register_and_get_printer_id()
        job_id = self.client.post(
            "/api/printing/jobs",
            params={"tenant_id": 1},
            json={
                "printer_id": printer_id,
                "document_type": "stock_document",
                "document_id": 100,
                "payload": {"pdf_url": "https://example.com/y.pdf", "copies": 1},
            },
        ).json()["id"]

        self.client.post(f"/api/printing/jobs/{job_id}/processing", headers=auth_headers(token))
        failed = self.client.post(
            f"/api/printing/jobs/{job_id}/failed",
            headers=auth_headers(token),
            json={"error_message": "Spooler error"},
        )
        self.assertEqual(failed.status_code, 200)
        self.assertEqual(failed.json()["status"], "failed")
        self.assertEqual(failed.json()["error_message"], "Spooler error")

    def test_invalid_transitions_return_409(self):
        token, printer_id = self._register_and_get_printer_id()
        job_id = self.client.post(
            "/api/printing/jobs",
            params={"tenant_id": 1},
            json={
                "printer_id": printer_id,
                "document_type": "stock_document",
                "document_id": 101,
                "payload": {"pdf_url": "https://example.com/z.pdf", "copies": 1},
            },
        ).json()["id"]

        complete = self.client.post(
            f"/api/printing/jobs/{job_id}/complete",
            headers=auth_headers(token),
            json={},
        )
        self.assertEqual(complete.status_code, 409)

        self.client.post(f"/api/printing/jobs/{job_id}/processing", headers=auth_headers(token))
        again = self.client.post(
            f"/api/printing/jobs/{job_id}/processing",
            headers=auth_headers(token),
        )
        self.assertEqual(again.status_code, 409)

    def test_atomic_claim_race(self):
        with self.SessionLocal() as db:
            agent, token = register_agent(
                db,
                tenant_id=1,
                payload=AgentRegisterRequest(
                    machine_id="RACE-001",
                    name="Race PC",
                    printers=[
                        RegisterAgentPrinterPayload(
                            name="P1",
                            system_name="SYS1",
                            printer_type="a4",
                            is_default=True,
                        )
                    ],
                ),
            )
            printer_id = db.query(AgentPrinter).filter(AgentPrinter.agent_id == agent.id).first().id
            job = PrintJob(
                tenant_id=1,
                printer_id=printer_id,
                document_type="stock_document",
                document_id=1,
                payload_json='{"pdf_url":"https://x","copies":1}',
                status=JOB_STATUS_PENDING,
            )
            db.add(job)
            db.commit()
            db.refresh(job)

            claim_print_job(db, job_id=job.id, agent=agent)
            with self.assertRaises(JobTransitionConflictError):
                claim_print_job(db, job_id=job.id, agent=agent)


class TestPrintersAndDefaults(PrintingTestCase):
    def test_patch_enforces_single_default_per_type(self):
        reg = register_agent_via_api(self.client)
        with self.SessionLocal() as db:
            printers = db.query(AgentPrinter).filter(AgentPrinter.agent_id == reg["agent_id"]).all()
            a4 = next(p for p in printers if p.printer_type == "a4")
            label = next(p for p in printers if p.printer_type == "label")

        self.client.post(
            "/api/printing/agents/register",
            params={"tenant_id": 1},
            json={
                "machine_id": "WIN-TEST-001",
                "name": "Test PC",
                "printers": [
                    {"name": "HP A4", "system_name": "HP LaserJet", "printer_type": "a4", "is_default": True},
                    {"name": "HP A4 B", "system_name": "HP LaserJet B", "printer_type": "a4", "is_default": False},
                    {"name": "Zebra", "system_name": "ZDesigner", "printer_type": "label", "is_default": True},
                ],
            },
        )
        with self.SessionLocal() as db:
            new_a4 = db.query(AgentPrinter).filter(AgentPrinter.system_name == "HP LaserJet B").first()
            assert new_a4 is not None

        patched = self.client.patch(
            f"/api/printing/printers/{new_a4.id}",
            params={"tenant_id": 1},
            json={"is_default": True},
        )
        self.assertEqual(patched.status_code, 200)
        self.assertTrue(patched.json()["is_default"])

        with self.SessionLocal() as db:
            old_a4 = db.query(AgentPrinter).filter(AgentPrinter.id == a4.id).first()
            assert old_a4 is not None
            self.assertFalse(old_a4.is_default)

    def test_defaults_crud(self):
        reg = register_agent_via_api(self.client)
        with self.SessionLocal() as db:
            a4 = (
                db.query(AgentPrinter)
                .filter(AgentPrinter.agent_id == reg["agent_id"], AgentPrinter.printer_type == "a4")
                .first()
            )
            assert a4 is not None

        put = self.client.put(
            "/api/printing/defaults",
            params={"tenant_id": 1},
            json={"a4_printer_id": a4.id, "label_printer_id": None},
        )
        self.assertEqual(put.status_code, 200)
        self.assertEqual(put.json()["a4_printer_id"], a4.id)

        got = self.client.get("/api/printing/defaults", params={"tenant_id": 1})
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["a4_printer_id"], a4.id)

        cleared = self.client.put(
            "/api/printing/defaults",
            params={"tenant_id": 1},
            json={"a4_printer_id": None},
        )
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.json()["a4_printer_id"])


if __name__ == "__main__":
    unittest.main()
