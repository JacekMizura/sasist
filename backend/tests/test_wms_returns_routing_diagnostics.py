"""WMS Returns routing diagnostics — FastAPI >= 0.137 (no flat app.routes SSOT)."""

from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout

import fastapi
from fastapi.testclient import TestClient

from backend.api.wms_returns import lookup_router, returns_id_router, router as static_router
from backend.main import app
from backend.wms_returns_routing_diagnostics import (
    WMS_RETURNS_EXPECTED_PATHS,
    count_included_router,
    inspect_wms_returns_mount,
    log_wms_returns_mount,
    openapi_wms_returns_paths,
)


class WmsReturnsRoutingDiagnosticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app, raise_server_exceptions=False)

    def test_i_fastapi_is_production_minor(self) -> None:
        self.assertTrue(
            fastapi.__version__.startswith("0.141."),
            f"expected fastapi 0.141.x (production pin), got {fastapi.__version__}",
        )

    def test_a_lookup_test_exists(self) -> None:
        r = self.client.get("/api/wms/returns/orders/lookup-test")
        self.assertEqual(r.status_code, 200, r.text[:400])
        self.assertEqual(r.json(), [{"ok": True}])

    def test_b_lookup_exists(self) -> None:
        r = self.client.get("/api/wms/returns/orders/lookup")
        self.assertEqual(r.status_code, 422, r.text[:400])
        locs = {tuple(e.get("loc") or ()) for e in r.json().get("detail") or []}
        self.assertIn(("query", "tenant_id"), locs)
        self.assertIn(("query", "q"), locs)

    def test_c_advanced_lookup_exists(self) -> None:
        r = self.client.get("/api/wms/returns/orders/advanced-lookup")
        self.assertEqual(r.status_code, 422, r.text[:400])
        locs = {tuple(e.get("loc") or ()) for e in r.json().get("detail") or []}
        self.assertIn(("query", "tenant_id"), locs)

    def test_d_alias_lookup_exists_outside_openapi(self) -> None:
        r = self.client.get("/api/wms/returns/lookup")
        self.assertEqual(r.status_code, 422, r.text[:400])
        paths = openapi_wms_returns_paths(app)
        self.assertNotIn("/api/wms/returns/lookup", paths)
        flags = inspect_wms_returns_mount(app)
        self.assertTrue(flags["alias_lookup"])

    def test_e_queue_counts_exists(self) -> None:
        r = self.client.get("/api/wms/returns/queue-counts")
        self.assertEqual(r.status_code, 422, r.text[:400])
        locs = {tuple(e.get("loc") or ()) for e in r.json().get("detail") or []}
        self.assertIn(("query", "tenant_id"), locs)

    def test_f_router_not_included_multiple_times(self) -> None:
        self.assertEqual(count_included_router(app, lookup_router), 1)
        self.assertEqual(count_included_router(app, static_router), 1)
        self.assertEqual(count_included_router(app, returns_id_router), 1)

    def test_g_lookup_not_shadowed_by_dynamic_routes(self) -> None:
        lookup = self.client.get("/api/wms/returns/orders/lookup")
        alias = self.client.get("/api/wms/returns/lookup")
        self.assertEqual(lookup.status_code, 422)
        self.assertEqual(alias.status_code, 422)
        self.assertNotEqual(lookup.status_code, 404)
        self.assertNotEqual(alias.status_code, 404)
        self.assertNotEqual(lookup.status_code, 405)
        self.assertNotEqual(alias.status_code, 405)
        order_returns = self.client.get("/api/wms/returns/orders/lookup/returns")
        self.assertIn(order_returns.status_code, (404, 405, 422))
        if order_returns.status_code == 422:
            locs = {tuple(e.get("loc") or ()) for e in order_returns.json().get("detail") or []}
            self.assertFalse(("query", "q") in locs and ("query", "tenant_id") in locs)

    def test_h_diagnostic_no_false_critical(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            flags = log_wms_returns_mount(app)
        out = buf.getvalue()
        self.assertTrue(flags["mounted"])
        self.assertIn("[routes] wms_returns mounted=true", out)
        self.assertIn("[routes] lookup=true", out)
        self.assertIn("[routes] advanced_lookup=true", out)
        self.assertIn("[routes] alias_lookup=true", out)
        self.assertIn("[routes] queue_counts=true", out)
        self.assertNotIn("CRITICAL: no /api/wms/returns/* mounted", out)
        self.assertNotIn("REMOUNT", out)
        self.assertNotIn("[routes] MISSING /api/wms/returns", out)
        self.assertNotIn("CRITICAL:", out)

    def test_named_paths_and_openapi_schema_paths(self) -> None:
        flags = inspect_wms_returns_mount(app)
        self.assertEqual(flags, {
            "lookup_test": True,
            "lookup": True,
            "advanced_lookup": True,
            "alias_lookup": True,
            "queue_counts": True,
            "mounted": True,
        })
        paths = openapi_wms_returns_paths(app)
        self.assertIn(WMS_RETURNS_EXPECTED_PATHS["lookup"], paths)
        self.assertIn(WMS_RETURNS_EXPECTED_PATHS["advanced_lookup"], paths)
        self.assertIn(WMS_RETURNS_EXPECTED_PATHS["lookup_test"], paths)
        self.assertIn(WMS_RETURNS_EXPECTED_PATHS["queue_counts"], paths)
        op_ids: list[str] = []
        spec_paths = app.openapi().get("paths") or {}
        for path, ops in spec_paths.items():
            if not str(path).startswith("/api/wms/returns"):
                continue
            if not isinstance(ops, dict):
                continue
            for method, op in ops.items():
                if method.startswith("x-") or not isinstance(op, dict):
                    continue
                oid = op.get("operationId")
                if oid:
                    op_ids.append(str(oid))
        self.assertTrue(op_ids)
        self.assertEqual(len(op_ids), len(set(op_ids)), op_ids)


if __name__ == "__main__":
    unittest.main()
