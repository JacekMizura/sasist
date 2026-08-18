"""Global FastAPI 0.141 routing diagnostics — public API, no flat app.routes.path."""

from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout

import fastapi
from fastapi.testclient import TestClient

from backend.api.wms_returns import lookup_router, returns_id_router, router as static_router
from backend.main import _log_registered_api_routers, app
from backend.routing_diagnostics import (
    CRITICAL_ROUTE_CHECKS,
    INVENTORY_COUNT_CHECK,
    is_route_registered,
    log_critical_routes,
    resolve_registered_route,
)
from backend.wms_returns_routing_diagnostics import (
    count_included_router,
    inspect_wms_returns_mount,
    log_wms_returns_mount,
)


_MISSING_PATH = "/api/__diagnostic__/no-such-route"
_OK_STATUSES = {200, 307, 401, 422}


class GlobalRoutingDiagnosticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app, raise_server_exceptions=False)

    def test_i_fastapi_is_production_minor(self) -> None:
        self.assertTrue(
            fastapi.__version__.startswith("0.141."),
            f"expected fastapi 0.141.x (production pin), got {fastapi.__version__}",
        )

    def test_a_wms_settings_product_validation_registered(self) -> None:
        path, name = CRITICAL_ROUTE_CHECKS[0]
        self.assertTrue(is_route_registered(app, expected_path=path, route_name=name))
        self.assertEqual(resolve_registered_route(app, expected_path=path, route_name=name), path)

    def test_b_wms_settings_production_registered(self) -> None:
        path, name = CRITICAL_ROUTE_CHECKS[1]
        self.assertTrue(is_route_registered(app, expected_path=path, route_name=name))

    def test_c_production_planning_demand_registered(self) -> None:
        path, name = CRITICAL_ROUTE_CHECKS[2]
        self.assertTrue(is_route_registered(app, expected_path=path, route_name=name))

    def test_d_wms_returns_named_routes_registered(self) -> None:
        flags = inspect_wms_returns_mount(app)
        self.assertTrue(flags["mounted"])
        self.assertTrue(flags["lookup_test"])
        self.assertTrue(flags["lookup"])
        self.assertTrue(flags["advanced_lookup"])
        self.assertTrue(flags["alias_lookup"])
        self.assertTrue(flags["queue_counts"])
        r = self.client.get("/api/wms/returns/orders/lookup-test")
        self.assertEqual(r.status_code, 200, r.text[:400])

    def test_e_inventory_count_registered(self) -> None:
        path, name = INVENTORY_COUNT_CHECK
        self.assertTrue(is_route_registered(app, expected_path=path, route_name=name))
        r = self.client.get(path)
        self.assertNotEqual(r.status_code, 404, r.text[:400])
        self.assertIn(r.status_code, _OK_STATUSES)

    def test_f_diagnostic_no_false_critical(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            flags = log_critical_routes(app)
        out = buf.getvalue()
        for path, _name in CRITICAL_ROUTE_CHECKS:
            self.assertTrue(flags[path], path)
            self.assertIn(f"[routes] critical {path} mounted=true", out)
        inv_path = INVENTORY_COUNT_CHECK[0]
        self.assertTrue(flags[inv_path])
        self.assertIn(f"[routes] inventory_count {inv_path} mounted=true", out)
        self.assertNotIn("CRITICAL MISSING", out)
        self.assertNotIn("[routes] MISSING /api/wms/settings", out)
        self.assertNotIn("REMOUNT", out)

    def test_g_missing_route_is_false(self) -> None:
        self.assertFalse(is_route_registered(app, expected_path=_MISSING_PATH))
        self.assertIsNone(resolve_registered_route(app, expected_path=_MISSING_PATH))
        self.assertFalse(
            is_route_registered(
                app,
                expected_path=_MISSING_PATH,
                route_name="definitely_not_a_registered_route",
            )
        )

    def test_h_diagnostic_does_not_mutate_app(self) -> None:
        before_ids = [id(route) for route in app.routes]
        before_len = len(app.routes)
        before_includes = (
            count_included_router(app, lookup_router),
            count_included_router(app, static_router),
            count_included_router(app, returns_id_router),
        )
        buf = io.StringIO()
        with redirect_stdout(buf):
            _log_registered_api_routers()
            log_wms_returns_mount(app)
        after_ids = [id(route) for route in app.routes]
        self.assertEqual(before_ids, after_ids)
        self.assertEqual(before_len, len(app.routes))
        self.assertEqual(
            before_includes,
            (
                count_included_router(app, lookup_router),
                count_included_router(app, static_router),
                count_included_router(app, returns_id_router),
            ),
        )
        self.assertEqual(before_includes, (1, 1, 1))

    def test_smoke_representative_modules_not_404(self) -> None:
        probes = (
            ("POST", "/api/auth/login"),
            ("GET", "/api/wms/settings/product-validation"),
            ("GET", "/api/wms/settings/production"),
            ("GET", "/api/wms/picking/configured-statuses"),
            ("GET", "/api/wms/returns/orders/lookup-test"),
            ("GET", "/api/orders"),
            ("GET", "/api/products"),
            ("GET", "/api/production/planning/demand"),
            ("GET", "/api/wms/packing/target-statuses"),
            ("GET", "/api/wms/carts/1/stats"),
            ("GET", "/api/carts"),
            ("POST", "/api/labels/product"),
            ("GET", "/api/label-templates"),
            ("GET", "/api/wms/inventory-count/tasks"),
        )
        for method, path in probes:
            r = self.client.request(method, path)
            self.assertNotEqual(r.status_code, 404, f"{method} {path} -> 404")
            self.assertIn(
                r.status_code,
                _OK_STATUSES,
                f"{method} {path} -> {r.status_code}",
            )


if __name__ == "__main__":
    unittest.main()
