"""Printing Phase 3 API tests."""

from __future__ import annotations

import json
import unittest
from datetime import datetime

from backend.models.printing.agent_printer import AgentPrinter
from backend.models.printing.constants import JOB_STATUS_PRINTED
from backend.models.printing.print_job import PrintJob
from backend.services.printing.auto_print_service import get_auto_print_settings, update_auto_print_settings
from backend.schemas.printing.release import PrintingAutoPrintUpdate
from backend.tests.printing._helpers import auth_headers, register_agent_via_api
from backend.tests.printing.test_printing_api import PrintingTestCase


class PrintingPhase3TestCase(PrintingTestCase):
    def _job(self, *, document_id: int, document_type: str = "stock_document") -> PrintJob:
        reg = register_agent_via_api(self.client)
        printer_id = self.db.query(AgentPrinter).filter_by(agent_id=reg["agent_id"]).first().id
        job = PrintJob(
            tenant_id=1,
            warehouse_id=1,
            printer_id=printer_id,
            document_type=document_type,
            document_id=document_id,
            payload_json=json.dumps({"pdf_url": "http://x", "copies": 1}),
            status=JOB_STATUS_PRINTED,
            copies=1,
            source_module="warehouse",
            job_type="pdf",
            created_at=datetime.utcnow(),
            finished_at=datetime.utcnow(),
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def test_jobs_by_document(self):
        self._job(document_id=9001)
        self._job(document_id=9002)
        resp = self.client.get(
            "/api/printing/jobs/by-document",
            params={"tenant_id": 1, "document_type": "stock_document", "document_id": 9001},
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["document_id"], 9001)

    def test_agent_version_endpoint(self):
        reg = register_agent_via_api(self.client, machine_id="WIN-VER-001")
        resp = self.client.get(
            "/api/printing/agent/version",
            params={"tenant_id": 1},
            headers=auth_headers(reg["token"]),
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn("version", body)
        self.assertIn("download_url", body)
        self.assertIn("mandatory", body)

    def test_auto_print_settings_crud(self):
        defaults = get_auto_print_settings(self.db, tenant_id=1)
        self.assertFalse(defaults["labels"])

        updated = update_auto_print_settings(
            self.db,
            tenant_id=1,
            payload=PrintingAutoPrintUpdate(labels=True, stock_documents=True),
        )
        self.assertTrue(updated["labels"])
        self.assertTrue(updated["stock_documents"])

        resp_get = self.client.get("/api/printing/auto-print", params={"tenant_id": 1})
        self.assertEqual(resp_get.status_code, 200)
        self.assertTrue(resp_get.json()["labels"])

        resp_put = self.client.put(
            "/api/printing/auto-print",
            params={"tenant_id": 1},
            json={"sale_documents": True},
        )
        self.assertEqual(resp_put.status_code, 200)
        self.assertTrue(resp_put.json()["sale_documents"])


if __name__ == "__main__":
    unittest.main()
