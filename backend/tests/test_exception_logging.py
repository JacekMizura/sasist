"""Exception logging must use exc.__traceback__ (not format_exc in handlers)."""

from __future__ import annotations

import unittest

from backend.middleware.exception_logging import (
    exception_origin,
    format_exception_traceback,
    log_unhandled_exception,
)


class TestExceptionTracebackFormatting(unittest.TestCase):
    def test_format_uses_exception_traceback_not_sys_exc_info(self) -> None:
        def _inner() -> None:
            raise RuntimeError("boom-diag")

        try:
            _inner()
        except RuntimeError as exc:
            # Simulate FastAPI handler context: exc_info already cleared.
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


if __name__ == "__main__":
    unittest.main()
