"""Unit tests: quiet print-agent access filter + poll/heartbeat log levels."""

from __future__ import annotations

import logging
import unittest
from unittest.mock import patch

from backend.api.printing import agents as agents_api
from backend.logging_filters import (
    QuietPrintingAgentAccessFilter,
    install_quiet_printing_agent_access_filter,
    parse_uvicorn_access_record,
)
from backend.services.printing.assignment_service import log_print_poll


def _access_record(
    *,
    method: str,
    path: str,
    status: int,
    client: str = "127.0.0.1:12345",
    http_version: str = "1.1",
) -> logging.LogRecord:
    # Mirrors uvicorn 0.x: '%s - "%s %s HTTP/%s" %d'
    return logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg='%s - "%s %s HTTP/%s" %d',
        args=(client, method, path, http_version, status),
        exc_info=None,
    )


class TestQuietPrintingAgentAccessFilter(unittest.TestCase):
    def setUp(self) -> None:
        self.filt = QuietPrintingAgentAccessFilter()

    def test_a_pending_200_suppressed(self) -> None:
        rec = _access_record(method="GET", path="/api/printing/jobs/pending", status=200)
        self.assertFalse(self.filt.filter(rec))

    def test_b_pending_204_suppressed(self) -> None:
        rec = _access_record(method="GET", path="/api/printing/jobs/pending", status=204)
        self.assertFalse(self.filt.filter(rec))

    def test_c_pending_401_not_suppressed(self) -> None:
        rec = _access_record(method="GET", path="/api/printing/jobs/pending", status=401)
        self.assertTrue(self.filt.filter(rec))

    def test_d_pending_500_not_suppressed(self) -> None:
        rec = _access_record(method="GET", path="/api/printing/jobs/pending", status=500)
        self.assertTrue(self.filt.filter(rec))

    def test_e_heartbeat_200_suppressed(self) -> None:
        rec = _access_record(method="POST", path="/api/printing/agents/heartbeat", status=200)
        self.assertFalse(self.filt.filter(rec))

    def test_f_devices_sync_200_suppressed(self) -> None:
        rec = _access_record(method="POST", path="/api/agent/devices/sync", status=200)
        self.assertFalse(self.filt.filter(rec))

    def test_g_orders_200_not_suppressed(self) -> None:
        rec = _access_record(method="GET", path="/api/orders", status=200)
        self.assertTrue(self.filt.filter(rec))

    def test_h_unknown_format_not_suppressed(self) -> None:
        rec = logging.LogRecord(
            name="uvicorn.access",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="weird %s",
            args=("only-one",),
            exc_info=None,
        )
        self.assertTrue(self.filt.filter(rec))
        self.assertIsNone(parse_uvicorn_access_record(rec))

    def test_query_string_still_matched(self) -> None:
        rec = _access_record(
            method="GET",
            path="/api/printing/jobs/pending?x=1",
            status=200,
        )
        self.assertFalse(self.filt.filter(rec))

    def test_install_idempotent(self) -> None:
        access = logging.getLogger("uvicorn.access")
        before = len(access.filters)
        install_quiet_printing_agent_access_filter()
        install_quiet_printing_agent_access_filter()
        after = len(access.filters)
        # At least one QuietPrintingAgentAccessFilter; second install must not double-add.
        quiet = [f for f in access.filters if isinstance(f, QuietPrintingAgentAccessFilter)]
        self.assertGreaterEqual(len(quiet), 1)
        self.assertLessEqual(after - before, 1)


class TestLogPrintPollLevels(unittest.TestCase):
    def test_empty_poll_is_debug(self) -> None:
        with patch("backend.services.printing.assignment_service.logger") as mock_log:
            log_print_poll(
                agent_id=3,
                machine_id="m1",
                active_printers=[1],
                jobs_count=0,
                job_ids=[],
            )
            mock_log.log.assert_called_once()
            self.assertEqual(mock_log.log.call_args[0][0], logging.DEBUG)

    def test_nonempty_poll_is_info(self) -> None:
        with patch("backend.services.printing.assignment_service.logger") as mock_log:
            log_print_poll(
                agent_id=3,
                machine_id="m1",
                active_printers=[1],
                jobs_count=1,
                job_ids=[99],
            )
            mock_log.log.assert_called_once()
            self.assertEqual(mock_log.log.call_args[0][0], logging.INFO)


class TestHeartbeatLogLevel(unittest.TestCase):
    def test_success_uses_debug(self) -> None:
        # Source-level: agents module must call logger.debug for success path.
        import inspect

        src = inspect.getsource(agents_api.agent_heartbeat)
        self.assertIn("logger.debug(", src)
        self.assertNotIn("logger.info(\n        \"printing.agents.heartbeat", src)


if __name__ == "__main__":
    unittest.main()
