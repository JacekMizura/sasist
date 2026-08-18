"""Read-only FastAPI >= 0.137 route presence checks.

Top-level ``app.routes`` is an include tree (``_IncludedRouter`` has no ``.path``).
Do not flatten, remount, or treat ``getattr(route, "path")`` on ``app.routes`` as SSOT.

Public checks:
1. ``app.url_path_for(route_name)`` when the operation has a stable name
2. OpenAPI ``app.openapi()["paths"]`` for schema-visible endpoints

``include_in_schema=False`` aliases must use ``route_name`` / ``url_path_for``.
"""

from __future__ import annotations

from typing import Mapping

from fastapi import FastAPI
from starlette.routing import NoMatchFound

# (expected_path, FastAPI/Starlette route name) — names default to endpoint __name__.
CRITICAL_ROUTE_CHECKS: tuple[tuple[str, str], ...] = (
    ("/api/wms/settings/product-validation", "get_wms_product_validation_settings"),
    ("/api/wms/settings/production", "get_wms_production_settings"),
    ("/api/production/planning/demand", "api_get_production_demand_planning"),
)

INVENTORY_COUNT_CHECK: tuple[str, str] = (
    "/api/wms/inventory-count/tasks",
    "wms_inventory_tasks_legacy",
)


def resolve_registered_route(
    app: FastAPI,
    *,
    expected_path: str,
    route_name: str | None = None,
) -> str | None:
    """Return ``expected_path`` if registered, else ``None``. Does not mutate ``app``."""
    expected = str(expected_path)
    if route_name:
        resolved = _url_path_for(app, route_name)
        if resolved == expected:
            return expected
    if _openapi_has_path(app, expected):
        return expected
    return None


def is_route_registered(
    app: FastAPI,
    *,
    expected_path: str,
    route_name: str | None = None,
) -> bool:
    return resolve_registered_route(app, expected_path=expected_path, route_name=route_name) is not None


def log_critical_routes(app: FastAPI) -> dict[str, bool]:
    """Print mount flags for critical + inventory-count probes. Read-only."""
    flags: dict[str, bool] = {}
    for path, name in CRITICAL_ROUTE_CHECKS:
        mounted = is_route_registered(app, expected_path=path, route_name=name)
        flags[path] = mounted
        print(f"[routes] critical {path} mounted={str(mounted).lower()}", flush=True)
        if not mounted:
            print(f"[routes] CRITICAL MISSING {path}", flush=True)
    inv_path, inv_name = INVENTORY_COUNT_CHECK
    inv_mounted = is_route_registered(app, expected_path=inv_path, route_name=inv_name)
    flags[inv_path] = inv_mounted
    print(f"[routes] inventory_count {inv_path} mounted={str(inv_mounted).lower()}", flush=True)
    if not inv_mounted:
        print(f"[routes] CRITICAL MISSING {inv_path}", flush=True)
    return flags


def _url_path_for(app: FastAPI, route_name: str) -> str | None:
    try:
        return app.url_path_for(route_name)
    except NoMatchFound:
        return None
    except Exception:
        return None


def _openapi_has_path(app: FastAPI, expected_path: str) -> bool:
    try:
        spec = app.openapi()
    except Exception:
        return False
    paths: Mapping[str, object] = spec.get("paths") or {}
    return expected_path in paths
