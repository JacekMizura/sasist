"""
Regression: GET /api/wms/picking/product-lines/detail must call
``_safe_touch_picking_session`` with keyword-only args (``**kwargs``).

Production TypeError (request_id 7c0e7367…):
  _safe_touch_picking_session() takes 0 positional arguments but 1 was given

Cause: ``_safe_touch_picking_session(db, tenant_id=...)`` — positional ``db``.
Helper signature is intentionally ``def _safe_touch_picking_session(**kwargs)``.

Previous “detail PASS” tests set ``current_user=None``, so the touch block never ran.
"""

from __future__ import annotations

import inspect
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from backend.api import wms_picking_entry as picking_api
from backend.middleware.exception_logging import get_or_create_request_id, log_request_server_error
from backend.schemas.wms_picking_products import WmsPickingProductDetailResponse


def _minimal_detail_row() -> WmsPickingProductDetailResponse:
    return WmsPickingProductDetailResponse(
        product_id=346,
        name="probe",
        total_quantity=1.0,
        picked_quantity=0.0,
        remaining_to_pick=1.0,
        locations=[],
        orders=[],
        order_bundle_trees=[],
    )


def _build_app(*, with_user: bool) -> FastAPI:
    from backend.auth.deps import get_optional_current_user
    from backend.auth.warehouse_deps import require_operable_warehouse
    from backend.database import get_db

    app = FastAPI()

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        if int(exc.status_code) >= 500:
            log_request_server_error(request, exc, context="http_exception")
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "request_id": get_or_create_request_id(request)},
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": exc.errors()})

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        log_request_server_error(request, exc, context="exception_handler")
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "request_id": get_or_create_request_id(request),
                "exception_type": type(exc).__name__,
                "exception_message": str(exc),
            },
        )

    def _db():
        db = MagicMock()
        yield db

    user = SimpleNamespace(id=7) if with_user else None
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[require_operable_warehouse] = lambda: 1
    app.dependency_overrides[get_optional_current_user] = lambda: user
    app.include_router(picking_api.router, prefix="/api")
    return app


class TestSafeTouchPickingSessionSignature(unittest.TestCase):
    def test_helper_accepts_only_kwargs(self) -> None:
        sig = inspect.signature(picking_api._safe_touch_picking_session)
        # Pure **kwargs — no positional parameters.
        self.assertEqual(list(sig.parameters.keys()), ["kwargs"])
        self.assertEqual(sig.parameters["kwargs"].kind, inspect.Parameter.VAR_KEYWORD)

    def test_positional_db_raises_typeerror(self) -> None:
        with self.assertRaises(TypeError) as ctx:
            picking_api._safe_touch_picking_session(
                MagicMock(),  # positional — production bug
                tenant_id=1,
                warehouse_id=1,
                session_kind="picking_active",
                operator_user_id=1,
                cart_id=3,
            )
        self.assertIn("positional", str(ctx.exception).lower())


class TestProductLinesDetailTouchesSessionViaRouter(unittest.TestCase):
    def test_detail_with_user_and_cart_calls_touch_kwargs_only(self) -> None:
        """
        Full HTTP path:
          router → get_picking_product_detail → build_detail → _safe_touch → serialize
        """
        app = _build_app(with_user=True)
        touch_calls: list[dict] = []

        def _capture_touch(**kwargs):
            touch_calls.append(kwargs)
            return SimpleNamespace(id=99, last_activity_at=None)

        with (
            patch(
                "backend.api.wms_picking_entry.build_wms_picking_product_detail",
                return_value=_minimal_detail_row(),
            ),
            patch(
                "backend.api.wms_picking_entry.touch_wms_operation_session",
                side_effect=_capture_touch,
            ),
        ):
            client = TestClient(app, raise_server_exceptions=False)
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

        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(int(body["product_id"]), 346)
        self.assertEqual(len(touch_calls), 1)
        kw = touch_calls[0]
        self.assertIn("db", kw)
        self.assertEqual(int(kw["tenant_id"]), 1)
        self.assertEqual(int(kw["warehouse_id"]), 1)
        self.assertEqual(kw["session_kind"], "picking_active")
        self.assertEqual(int(kw["operator_user_id"]), 7)
        self.assertEqual(int(kw["cart_id"]), 3)
        self.assertEqual(kw["metadata"]["active_product_id"], 346)

    def test_detail_without_user_skips_touch_but_still_200(self) -> None:
        """Documents why older tests missed the TypeError — no user ⇒ no touch."""
        app = _build_app(with_user=False)
        with (
            patch(
                "backend.api.wms_picking_entry.build_wms_picking_product_detail",
                return_value=_minimal_detail_row(),
            ) as build_mock,
            patch(
                "backend.api.wms_picking_entry.touch_wms_operation_session",
            ) as touch_mock,
        ):
            client = TestClient(app, raise_server_exceptions=False)
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
        self.assertEqual(res.status_code, 200, res.text)
        build_mock.assert_called_once()
        touch_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
