"""
Detail endpoint must return 200 when raw UX meta had NULL/0 indices
(former ValidationError → HTTP 500). Uses in-process FastAPI app (no live DB).
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("DEBUG_HTTP_500", "0")
os.environ.setdefault("APP_ENV", "development")

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from backend.middleware.exception_logging import (
    get_or_create_request_id,
    http_500_diagnostic_fields,
    log_request_server_error,
)
from backend.schemas.wms_picking_products import (
    WmsPickingProductLine,
    WmsPickingProductLinesResponse,
)


def _build_diag_app() -> FastAPI:
    from backend.api.wms_picking_entry import router as picking_router
    from backend.auth.deps import get_optional_current_user
    from backend.auth.warehouse_deps import require_operable_warehouse
    from backend.database import get_db

    app = FastAPI()

    def _payload(request: Request, exc: Exception) -> dict:
        body: dict = {
            "detail": "Internal server error",
            "request_id": get_or_create_request_id(request),
        }
        if (os.environ.get("DEBUG_HTTP_500") or "").strip().lower() in ("1", "true", "yes", "on"):
            body.update(http_500_diagnostic_fields(exc))
        return body

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        if int(exc.status_code) >= 500:
            log_request_server_error(request, exc, context="http_exception")
            return JSONResponse(status_code=exc.status_code, content=_payload(request, exc))
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(RequestValidationError)
    async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": exc.errors()})

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        log_request_server_error(request, exc, context="exception_handler")
        return JSONResponse(status_code=500, content=_payload(request, exc))

    app.dependency_overrides[require_operable_warehouse] = lambda: 1
    app.dependency_overrides[get_optional_current_user] = lambda: None
    app.include_router(picking_router, prefix="/api")
    return app


class TestProductLinesDetailNoLonger500OnNullIndex(unittest.TestCase):
    def test_detail_returns_200_after_index_normalization(self) -> None:
        from backend.database import get_db
        from backend.models.order import Order
        from backend.models.order_item import OrderItem
        from backend.models.product import Product
        from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY
        from backend.services.bundles.bundle_operational_ux_service import BundleOperationalUxMeta

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
        p_a = Product(id=101, tenant_id=1, name="A")
        p_b = Product(id=346, tenant_id=1, name="probe")
        parent = OrderItem(id=50, order_id=1, product_id=999, quantity=1, is_bundle_parent=True)
        i1 = OrderItem(id=51, order_id=1, product_id=101, quantity=1, parent_bundle_order_item_id=50, product=p_a)
        i2 = OrderItem(id=52, order_id=1, product_id=346, quantity=1, parent_bundle_order_item_id=50, product=p_b)
        order = Order(id=1, number="1", cart_id=3, items=[parent, i1, i2])
        bad_ux = {
            51: BundleOperationalUxMeta(
                bundle_id=7,
                bundle_name="bundle",
                bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=None,
                is_bundle_component=True,
                parent_bundle_order_line_id=50,
            ),
            52: BundleOperationalUxMeta(
                bundle_id=7,
                bundle_name="bundle",
                bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=0,
                is_bundle_component=True,
                parent_bundle_order_line_id=50,
            ),
        }

        app = _build_diag_app()

        def _db_with_order():
            db = MagicMock()
            chain = db.query.return_value
            chain.options.return_value = chain
            chain.filter.return_value = chain
            chain.order_by.return_value = chain
            chain.group_by.return_value = chain
            chain.all.return_value = [order]
            chain.first.return_value = None
            yield db

        app.dependency_overrides[get_db] = _db_with_order

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
                return_value=bad_ux,
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
        trees = body.get("order_bundle_trees") or []
        self.assertTrue(len(trees) >= 1)
        idxs = [int(c["bundle_component_index"]) for t in trees for c in t["components"]]
        self.assertTrue(all(i >= 1 for i in idxs))
        self.assertNotIn(0, idxs)


if __name__ == "__main__":
    unittest.main()
