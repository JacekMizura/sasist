"""HTTP 500 must be logged inside the exception handler (not only middleware)."""

from __future__ import annotations

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.middleware.exception_logging import (
    get_or_create_request_id,
    log_request_server_error,
    outer_request_logger_middleware,
)
from fastapi.responses import JSONResponse
from fastapi import Request


def _build_app() -> FastAPI:
    app = FastAPI()

    @app.exception_handler(Exception)
    async def _handler(request: Request, exc: Exception):
        rid = get_or_create_request_id(request)
        log_request_server_error(
            request,
            exc,
            context=f"{request.method} {request.url.path} (exception_handler)",
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "request_id": rid},
        )

    @app.get("/boom")
    def boom():
        raise RuntimeError("forced-500-for-log-test")

    app.middleware("http")(outer_request_logger_middleware)
    return app


class TestHandlerLogsHttp500(unittest.TestCase):
    def test_exception_handler_emits_traceback_log(self) -> None:
        client = TestClient(_build_app(), raise_server_exceptions=False)
        with self.assertLogs("wms.exceptions", level="ERROR") as logs:
            res = client.get("/boom?tenant_id=9&warehouse_id=3")

        self.assertEqual(res.status_code, 500)
        body = res.json()
        self.assertEqual(body["detail"], "Internal server error")
        self.assertTrue(body.get("request_id"))

        joined = "\n".join(logs.output)
        self.assertIn("ERROR [HTTP 500]", joined)
        self.assertIn(f"request_id={body['request_id']}", joined)
        self.assertIn("method=GET", joined)
        self.assertIn("path=/boom", joined)
        self.assertIn("exception_type=RuntimeError", joined)
        self.assertIn("forced-500-for-log-test", joined)
        self.assertIn("tenant=9", joined)
        self.assertIn("warehouse=3", joined)
        # Real stack frames (not NoneType: None)
        self.assertIn("RuntimeError", joined)
        self.assertIn("boom", joined)
        self.assertNotIn("NoneType: None", joined)


if __name__ == "__main__":
    unittest.main()
