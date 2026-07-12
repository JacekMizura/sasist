"""
Printing Phase 2 — queue admin, retry, cancel, soft delete, test page.
"""

from __future__ import annotations

import json
import unittest
from datetime import datetime

from backend.models.printing.constants import (
    JOB_STATUS_CANCELLED,
    JOB_STATUS_FAILED,
    JOB_STATUS_PENDING,
    JOB_STATUS_PRINTED,
    JOB_STATUS_PROCESSING,
)
from backend.models.printing.agent_printer import AgentPrinter
from backend.models.printing.print_job import PrintJob
from backend.services.printing.file_service import save_job_pdf
from backend.tests.printing._helpers import (
    auth_headers,
    register_agent_via_api,
)
from backend.tests.printing.test_printing_api import PrintingTestCase


class PrintingPhase2TestCase(PrintingTestCase):
    def _create_job(
        self,
        *,
        status: str = JOB_STATUS_PENDING,
        agent_reg: dict | None = None,
        **extra,
    ) -> PrintJob:
        reg = agent_reg or register_agent_via_api(self.client)
        printer_id = self.db.query(AgentPrinter).filter_by(agent_id=reg["agent_id"]).first().id
        job = PrintJob(
            tenant_id=1,
            warehouse_id=1,
            printer_id=printer_id,
            document_type="stock_document",
            document_id=42,
            payload_json=json.dumps({"pdf_url": "http://test/file", "copies": 2}),
            status=status,
            copies=2,
            source_module="warehouse",
            job_type="pdf",
            created_at=datetime.utcnow(),
            **extra,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        save_job_pdf(job.id, b"%PDF-1.4 test")
        return job

    def test_list_jobs_with_status_filter(self):
        self._create_job(status=JOB_STATUS_PENDING)
        self._create_job(status=JOB_STATUS_FAILED, error_message="x")

        all_resp = self.client.get("/api/printing/jobs", params={"tenant_id": 1})
        self.assertEqual(all_resp.status_code, 200)
        self.assertEqual(len(all_resp.json()), 2)

        failed_resp = self.client.get(
            "/api/printing/jobs",
            params={"tenant_id": 1, "status": "failed"},
        )
        self.assertEqual(len(failed_resp.json()), 1)
        self.assertEqual(failed_resp.json()[0]["status"], "failed")

    def test_retry_creates_child_job(self):
        parent = self._create_job(status=JOB_STATUS_FAILED, error_message="paper jam")
        resp = self.client.post(
            f"/api/printing/jobs/{parent.id}/retry",
            params={"tenant_id": 1},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        child = resp.json()
        self.assertNotEqual(child["id"], parent.id)
        self.assertEqual(child["parent_job_id"], parent.id)
        self.assertEqual(child["retry_number"], 1)
        self.assertEqual(child["status"], JOB_STATUS_PENDING)

        detail = self.client.get(
            f"/api/printing/jobs/{child['id']}",
            params={"tenant_id": 1},
        ).json()
        self.assertEqual(detail["retry_count"], 2)

    def test_retry_rejects_pending(self):
        parent = self._create_job(status=JOB_STATUS_PENDING)
        resp = self.client.post(
            f"/api/printing/jobs/{parent.id}/retry",
            params={"tenant_id": 1},
        )
        self.assertEqual(resp.status_code, 409)

    def test_cancel_pending_and_processing(self):
        pending = self._create_job(status=JOB_STATUS_PENDING)
        resp = self.client.post(
            f"/api/printing/jobs/{pending.id}/cancel",
            params={"tenant_id": 1},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], JOB_STATUS_CANCELLED)

        processing = self._create_job(status=JOB_STATUS_PROCESSING, started_at=datetime.utcnow())
        resp2 = self.client.post(
            f"/api/printing/jobs/{processing.id}/cancel",
            params={"tenant_id": 1},
        )
        self.assertEqual(resp2.status_code, 200)

    def test_cancel_rejects_printed(self):
        job = self._create_job(status=JOB_STATUS_PRINTED, finished_at=datetime.utcnow())
        resp = self.client.post(
            f"/api/printing/jobs/{job.id}/cancel",
            params={"tenant_id": 1},
        )
        self.assertEqual(resp.status_code, 409)

    def test_soft_delete_hides_from_list(self):
        job = self._create_job(status=JOB_STATUS_PRINTED, finished_at=datetime.utcnow())
        resp = self.client.delete(
            f"/api/printing/jobs/{job.id}",
            params={"tenant_id": 1},
        )
        self.assertEqual(resp.status_code, 200)

        listed = self.client.get("/api/printing/jobs", params={"tenant_id": 1}).json()
        self.assertEqual(len(listed), 0)

        self.db.refresh(job)
        self.assertIsNotNone(job.deleted_at)

    def test_pending_excludes_cancelled_and_deleted(self):
        reg = register_agent_via_api(self.client, machine_id="WIN-POLL-002")
        token = reg["token"]
        self._create_job(status=JOB_STATUS_PENDING, agent_reg=reg)
        cancelled = self._create_job(status=JOB_STATUS_PENDING, agent_reg=reg)
        cancel_resp = self.client.post(
            f"/api/printing/jobs/{cancelled.id}/cancel",
            params={"tenant_id": 1},
        )
        self.assertEqual(cancel_resp.status_code, 200)

        deleted = self._create_job(status=JOB_STATUS_PENDING, agent_reg=reg)
        self.client.delete(f"/api/printing/jobs/{deleted.id}", params={"tenant_id": 1})

        pending = self.client.get(
            "/api/printing/jobs/pending",
            headers=auth_headers(token),
        ).json()["jobs"]
        self.assertEqual(len(pending), 1)

    def test_agent_test_page_creates_job(self):
        reg = register_agent_via_api(self.client, machine_id="WIN-TESTPAGE")
        resp = self.client.post(
            f"/api/printing/agents/{reg['agent_id']}/test-page",
            params={"tenant_id": 1},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertEqual(body["document_type"], "test_page")
        self.assertEqual(body["job_type"], "pdf")
        self.assertEqual(body["source_module"], "settings")
        self.assertEqual(body["status"], JOB_STATUS_PENDING)

    def test_heartbeat_accepts_diagnostics(self):
        reg = register_agent_via_api(self.client, machine_id="WIN-HB-DIAG")
        token = reg["token"]
        now = datetime.utcnow().isoformat()
        resp = self.client.post(
            "/api/printing/agents/heartbeat",
            headers=auth_headers(token),
            json={"last_poll_at": now, "last_error": "poll timeout"},
        )
        self.assertEqual(resp.status_code, 200)

        agents = self.client.get("/api/printing/agents", params={"tenant_id": 1}).json()
        agent = next(row for row in agents if row["id"] == reg["agent_id"])
        self.assertEqual(agent["last_error"], "poll timeout")
        self.assertIsNotNone(agent["last_poll_at"])


if __name__ == "__main__":
    unittest.main()
