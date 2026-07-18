"""HTTP 500 must be logged inside the exception handler (not only middleware)."""

from __future__ import annotations

import os
import unittest
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from backend.middleware.exception_logging import (
    get_or_create_request_id,
    http_500_diagnostic_fields,
    log_request_server_error,
    outer_request_logger_middleware,
)


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
        body: dict[str, Any] = {"detail": "Internal server error", "request_id": rid}
        if (os.environ.get("DEBUG_HTTP_500") or "").strip() in ("1", "true"):
            body.update(http_500_diagnostic_fields(exc))
        return JSONResponse(status_code=500, content=body)

    @app.exception_handler(HTTPException)
    async def _http_handler(request: Request, exc: HTTPException):
        if int(exc.status_code) >= 500:
            log_request_server_error(
                request,
                exc,
                context=f"{request.method} {request.url.path} (http_exception)",
            )
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    try:
        from fastapi.exceptions import ResponseValidationError
    except ImportError:  # pragma: no cover
        ResponseValidationError = None  # type: ignore[misc, assignment]

    if ResponseValidationError is not None:

        @app.exception_handler(ResponseValidationError)
        async def _resp_val_handler(request: Request, exc: ResponseValidationError):
            rid = get_or_create_request_id(request)
            log_request_server_error(
                request,
                exc,
                context=f"{request.method} {request.url.path} (response_validation)",
            )
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "request_id": rid},
            )

    @app.get("/boom")
    def boom():
        raise RuntimeError("forced-500-for-log-test")

    @app.get("/wrapped-500")
    def wrapped_500():
        try:
            raise ValueError("root-cause-hidden-by-from-none-anti-pattern")
        except ValueError as e:
            # Correct pattern: keep cause for the HTTP 500 logger.
            raise HTTPException(status_code=500, detail="Internal server error") from e

    @app.get("/erased-500")
    def erased_500():
        try:
            raise ValueError("should-not-appear-when-from-none")
        except ValueError:
            raise HTTPException(status_code=500, detail="Internal server error") from None

    class _StrictOut(BaseModel):
        bundle_component_index: int = Field(..., ge=1)

    @app.get("/response-validation", response_model=_StrictOut)
    def response_validation():
        # Triggers ResponseValidationError after the route returns (detail-endpoint class).
        return {"bundle_component_index": 0}

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
        self.assertIn("file=", joined)
        self.assertIn("function=", joined)
        self.assertIn("line=", joined)
        # Real stack frames (not NoneType: None)
        self.assertIn("RuntimeError", joined)
        self.assertIn("boom", joined)
        self.assertNotIn("NoneType: None", joined)

    def test_http_exception_from_e_logs_root_cause(self) -> None:
        client = TestClient(_build_app(), raise_server_exceptions=False)
        with self.assertLogs("wms.exceptions", level="ERROR") as logs:
            res = client.get("/wrapped-500")

        self.assertEqual(res.status_code, 500)
        joined = "\n".join(logs.output)
        self.assertIn("exception_type=ValueError", joined)
        self.assertIn("root-cause-hidden-by-from-none-anti-pattern", joined)
        self.assertIn("function=wrapped_500", joined)
        self.assertNotIn("NoneType: None", joined)

    def test_http_exception_from_none_still_logs_context(self) -> None:
        """``from None`` clears __cause__; logger still walks HTTPException.__context__."""
        client = TestClient(_build_app(), raise_server_exceptions=False)
        with self.assertLogs("wms.exceptions", level="ERROR") as logs:
            res = client.get("/erased-500")

        self.assertEqual(res.status_code, 500)
        joined = "\n".join(logs.output)
        self.assertIn("exception_type=ValueError", joined)
        self.assertIn("should-not-appear-when-from-none", joined)
        self.assertIn("function=erased_500", joined)

    def test_response_validation_error_logs_file_function_line(self) -> None:
        client = TestClient(_build_app(), raise_server_exceptions=False)
        with self.assertLogs("wms.exceptions", level="ERROR") as logs:
            res = client.get("/response-validation")

        self.assertEqual(res.status_code, 500)
        body = res.json()
        self.assertTrue(body.get("request_id"))
        joined = "\n".join(logs.output)
        self.assertIn(f"request_id={body['request_id']}", joined)
        self.assertIn("path=/response-validation", joined)
        self.assertIn("exception_type=", joined)
        self.assertIn("file=", joined)
        self.assertIn("function=", joined)
        self.assertIn("line=", joined)
        self.assertNotIn("NoneType: None", joined)


if __name__ == "__main__":
    unittest.main()
