"""
Reproduce GET /wms/picking/product-lines/detail HTTP 500 on PostgreSQL
with the same exception handlers as production (request_id diagnostics).
"""

from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

# Force PG for this diagnostics probe (must run before backend.database import).
os.environ["DATABASE_URL"] = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres@127.0.0.1:55432/wms_local",
)
if not os.environ["DATABASE_URL"].startswith("postgresql"):
    os.environ["DATABASE_URL"] = "postgresql://postgres@127.0.0.1:55432/wms_local"
os.environ["DEBUG_HTTP_500"] = "1"
os.environ["APP_ENV"] = "development"

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.database import DATABASE_URL, engine
from backend.middleware.exception_logging import (
    format_exception_traceback,
    get_or_create_request_id,
    http_500_diagnostic_fields,
    log_request_server_error,
)
from backend.schemas.wms_picking_products import (
    WmsPickingProductLine,
    WmsPickingProductLinesResponse,
)


def _pg_ready() -> bool:
    if not str(DATABASE_URL).startswith("postgresql"):
        return False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def _build_diag_app() -> FastAPI:
    """Minimal app: real picking router + same 500 logging contract as main.py."""
    from backend.api.wms_picking_entry import router as picking_router
    from backend.auth.deps import get_optional_current_user
    from backend.auth.warehouse_deps import require_operable_warehouse
    from backend.database import get_db

    app = FastAPI()

    def _http_500_debug_body_enabled() -> bool:
        return True

    def _internal_server_error_payload(request: Request, exc: Exception) -> dict:
        request_id = get_or_create_request_id(request)
        body: dict = {"detail": "Internal server error", "request_id": request_id}
        if _http_500_debug_body_enabled():
            diag = http_500_diagnostic_fields(exc)
            body.update(
                {
                    "exception_type": diag["exception_type"],
                    "exception_message": diag["exception_message"],
                    "file": diag["file"],
                    "function": diag["function"],
                    "line": diag["line"],
                }
            )
            if "validation_errors" in diag:
                body["validation_errors"] = diag["validation_errors"]
        return body

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        if int(exc.status_code) >= 500:
            log_request_server_error(
                request,
                exc,
                context=f"{request.method} {request.url.path} (http_exception_{exc.status_code})",
            )
            content = _internal_server_error_payload(request, exc)
            if exc.detail is not None and exc.detail != "Internal server error":
                content["detail"] = exc.detail
            return JSONResponse(status_code=exc.status_code, content=content)
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(RequestValidationError)
    async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": exc.errors()})

    try:
        from fastapi.exceptions import ResponseValidationError
    except ImportError:  # pragma: no cover
        ResponseValidationError = None  # type: ignore[misc, assignment]

    if ResponseValidationError is not None:

        @app.exception_handler(ResponseValidationError)
        async def response_validation_exception_handler(request: Request, exc: ResponseValidationError):
            log_request_server_error(
                request,
                exc,
                context=f"{request.method} {request.url.path} (exception_handler)",
            )
            return JSONResponse(
                status_code=500,
                content=_internal_server_error_payload(request, exc),
            )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        log_request_server_error(
            request,
            exc,
            context=f"{request.method} {request.url.path} (exception_handler)",
        )
        return JSONResponse(
            status_code=500,
            content=_internal_server_error_payload(request, exc),
        )

    def _override_db():
        db = MagicMock()
        # orders_q.all() / product lookups → empty
        chain = db.query.return_value
        chain.options.return_value = chain
        chain.filter.return_value = chain
        chain.order_by.return_value = chain
        chain.group_by.return_value = chain
        chain.all.return_value = []
        chain.first.return_value = None
        yield db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[require_operable_warehouse] = lambda: 1
    app.dependency_overrides[get_optional_current_user] = lambda: None
    app.include_router(picking_router, prefix="/api")
    return app


@unittest.skipUnless(_pg_ready(), "PostgreSQL DATABASE_URL not reachable")
class TestProductLinesDetail500DiagnosticsPg(unittest.TestCase):
    def test_detail_bundle_index_zero_logs_exact_service_line(self) -> None:
        fake_line = WmsPickingProductLine(
            product_id=346,
            name="probe",
            total_quantity=1.0,
            picked_quantity=0.0,
            remaining_to_pick=1.0,
        )
        fake_lines = WmsPickingProductLinesResponse(
            products=[fake_line],
            pick_list=[],
            allow_continue_other_lines_after_shortage=True,
        )
        bad_component = SimpleNamespace(
            order_item_id=1,
            product_id=346,
            product_name="probe",
            quantity=1.0,
            picked_quantity=0.0,
            quantity_to_pick=1.0,
            bundle_component_index=0,
            is_current_product=True,
            pick_done=False,
        )
        bad_tree = {
            "order_id": 1,
            "order_number": "1",
            "bundle_id": 1,
            "bundle_name": "bundle",
            "bundle_mode": "KIT",
            "parent_order_line_id": 10,
            "components_total": 1,
            "components_done": 0,
            "components": [bad_component],
        }

        app = _build_diag_app()
        with (
            patch(
                "backend.services.wms_picking_product_list_service.build_wms_picking_product_lines",
                return_value=fake_lines,
            ),
            patch(
                "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
                return_value=[1],
            ),
            patch(
                "backend.services.wms_picking_product_list_service.build_bundle_ux_index_for_orders",
                return_value={},
            ),
            patch(
                "backend.services.wms_picking_product_list_service.build_picking_bundle_trees_for_orders",
                return_value=[bad_tree],
            ),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            with self.assertLogs("wms.exceptions", level="ERROR") as logs:
                res = client.get(
                    "/api/wms/picking/product-lines/detail",
                    params={
                        "tenant_id": 1,
                        "warehouse_id": 1,
                        "source_status_id": 6,
                        "order_type": "all",
                        "product_id": 346,
                        "cart_id": 3,
                    },
                )

        self.assertEqual(res.status_code, 500, res.text)
        body = res.json()
        self.assertEqual(body.get("detail"), "Internal server error")
        self.assertTrue(body.get("request_id"))
        self.assertEqual(body.get("exception_type"), "ValidationError")
        self.assertIn("wms_picking_product_list_service.py", str(body.get("file")))
        self.assertEqual(body.get("function"), "build_wms_picking_product_detail")
        line_no = body.get("line")
        self.assertTrue(isinstance(line_no, int) and int(line_no) >= 1856, body)

        joined = "\n".join(logs.output)
        self.assertIn(f"request_id={body['request_id']}", joined)
        self.assertIn("exception_type=ValidationError", joined)
        self.assertIn("path=/api/wms/picking/product-lines/detail", joined)
        self.assertIn("build_wms_picking_product_detail", joined)
        self.assertIn("wms_picking_product_list_service.py", joined)
        self.assertNotIn("NoneType: None", joined)
        # Keep unused import referenced for lint parity with main handler.
        _ = format_exception_traceback
        print(
            "CONFIRMED_ROOT_CAUSE",
            body.get("exception_type"),
            body.get("file"),
            body.get("function"),
            body.get("line"),
            body.get("exception_message"),
        )


if __name__ == "__main__":
    unittest.main()
