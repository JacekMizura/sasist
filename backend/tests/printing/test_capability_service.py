"""Unit tests for agent print capability negotiation."""

from __future__ import annotations

import unittest

from backend.services.printing.capability_service import (
    agent_supports_format,
    formats_to_json,
    normalize_formats,
    parse_agent_formats,
    resolve_job_format,
)
from backend.models.printing.printer_agent import PrinterAgent


class CapabilityServiceTests(unittest.TestCase):
    def test_normalize_formats(self):
        self.assertEqual(normalize_formats(["PDF", "zpl", "raw_zpl", "nope"]), ["pdf", "zpl"])

    def test_resolve_job_format(self):
        self.assertEqual(resolve_job_format(job_type="pdf", payload={"pdf_url": "x"}), "pdf")
        self.assertEqual(resolve_job_format(job_type="raw_zpl", payload={}), "zpl")
        self.assertEqual(resolve_job_format(job_type="label", payload={"zpl": "^XA"}), "zpl")
        self.assertEqual(resolve_job_format(job_type="pdf", payload={"format": "raw"}), "raw")

    def test_parse_agent_formats_legacy_defaults_to_pdf(self):
        agent = PrinterAgent(tenant_id=1, machine_id="m", name="n", token_hash="h")
        self.assertEqual(parse_agent_formats(agent), {"pdf"})

    def test_parse_agent_formats_from_json(self):
        agent = PrinterAgent(tenant_id=1, machine_id="m", name="n", token_hash="h")
        agent.capabilities_json = formats_to_json(["pdf", "zpl", "raw", "html"])
        self.assertTrue(agent_supports_format(agent, "zpl"))
        self.assertTrue(agent_supports_format(agent, "raw_zpl"))
        self.assertFalse(agent_supports_format(agent, "cpcl"))


if __name__ == "__main__":
    unittest.main()
