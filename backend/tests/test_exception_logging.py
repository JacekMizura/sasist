"""Exception logging must use exc.__traceback__ (not format_exc in handlers)."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.middleware.exception_logging import (
    exception_origin,
    format_exception_traceback,
    log_http_500_error,
    log_unhandled_exception,
)


class TestExceptionTracebackFormatting(unittest.TestCase):
    def test_format_uses_exception_traceback_not_sys_exc_info(self) -> None:
        def _inner() -> None:
            raise RuntimeError("boom-diag")

        try:
            _inner()
        except RuntimeError as exc:
            tb = format_exception_traceback(exc)

        self.assertIn("RuntimeError: boom-diag", tb)
        self.assertIn("_inner", tb)
        self.assertNotIn("NoneType: None", tb)

    def test_exception_origin_points_at_raise_site(self) -> None:
        def _raise_here() -> None:
            raise ValueError("x")

        try:
            _raise_here()
        except ValueError as exc:
            file_name, func_name, line_no = exception_origin(exc)

        self.assertEqual(func_name, "_raise_here")
        self.assertIsNotNone(file_name)
        self.assertIsInstance(line_no, int)
        self.assertGreater(line_no, 0)

    def test_log_includes_meta_fields(self) -> None:
        try:
            raise KeyError("missing-col")
        except KeyError as exc:
            with self.assertLogs("wms.exceptions", level="ERROR") as logs:
                log_unhandled_exception(
                    "unit-test",
                    exc,
                    request_id="abc123",
                    method="POST",
                    path="/api/wms/picking/start",
                )

        joined = "\n".join(logs.output)
        self.assertIn("request_id=abc123", joined)
        self.assertIn("method=POST", joined)
        self.assertIn("path=/api/wms/picking/start", joined)
        self.assertIn("KeyError", joined)
        self.assertIn("missing-col", joined)

    def test_http_500_middleware_log_shape(self) -> None:
        request = MagicMock()
        request.method = "POST"
        request.url.path = "/api/wms/picking/start"
        request.query_params = {"tenant_id": "1", "warehouse_id": "2"}
        request.headers = {}
        request.state = SimpleNamespace(request_id="rid-1", http_500_logged=False)

        def _boom() -> None:
            raise RuntimeError("pick-fail")

        try:
            _boom()
        except RuntimeError as exc:
            with self.assertLogs("wms.exceptions", level="ERROR") as logs:
                log_http_500_error(request, exc, duration_ms=12.5, context="unit")

        joined = "\n".join(logs.output)
        self.assertIn("ERROR [HTTP 500]", joined)
        self.assertIn("request_id=", joined)
        self.assertIn("method=POST", joined)
        self.assertIn("path=/api/wms/picking/start", joined)
        self.assertIn("tenant=1", joined)
        self.assertIn("warehouse=2", joined)
        self.assertIn("exception_type=RuntimeError", joined)
        self.assertIn("duration_ms=12.50", joined)
        self.assertIn("pick-fail", joined)
        self.assertIn("_boom", joined)


if __name__ == "__main__":
    unittest.main()
