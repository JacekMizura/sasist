"""Read-only WMS Returns mount checks (FastAPI >= 0.137 route tree).

Uses public ``app.url_path_for`` — does not flatten or remount ``app.routes``.
"""

from __future__ import annotations

from typing import Mapping

from fastapi import FastAPI
from starlette.routing import NoMatchFound

WMS_RETURNS_MOUNT_PREFIX = "/api/wms/returns"

# Operation ``name=`` values (stable url_path_for keys).
WMS_RETURNS_ROUTE_NAMES: dict[str, str] = {
    "lookup_test": "wms_returns_orders_lookup_test",
    "lookup": "wms_returns_orders_lookup",
    "advanced_lookup": "wms_returns_orders_advanced_lookup",
    "alias_lookup": "wms_returns_lookup_alias",
    "queue_counts": "wms_returns_queue_counts",
}

WMS_RETURNS_EXPECTED_PATHS: dict[str, str] = {
    "lookup_test": f"{WMS_RETURNS_MOUNT_PREFIX}/orders/lookup-test",
    "lookup": f"{WMS_RETURNS_MOUNT_PREFIX}/orders/lookup",
    "advanced_lookup": f"{WMS_RETURNS_MOUNT_PREFIX}/orders/advanced-lookup",
    "alias_lookup": f"{WMS_RETURNS_MOUNT_PREFIX}/lookup",
    "queue_counts": f"{WMS_RETURNS_MOUNT_PREFIX}/queue-counts",
}


def resolve_wms_returns_path(app: FastAPI, route_name: str) -> str | None:
    try:
        return app.url_path_for(route_name)
    except NoMatchFound:
        return None
    except Exception:
        return None


def inspect_wms_returns_mount(app: FastAPI) -> dict[str, bool]:
    flags: dict[str, bool] = {}
    for key, name in WMS_RETURNS_ROUTE_NAMES.items():
        flags[key] = resolve_wms_returns_path(app, name) == WMS_RETURNS_EXPECTED_PATHS[key]
    flags["mounted"] = all(flags[k] for k in WMS_RETURNS_ROUTE_NAMES)
    return flags


def count_included_router(app: FastAPI, router: object) -> int:
    """How many top-level include wrappers point at ``router`` (FastAPI >= 0.137)."""
    return sum(1 for route in app.routes if getattr(route, "original_router", None) is router)


def log_wms_returns_mount(app: FastAPI) -> dict[str, bool]:
    flags = inspect_wms_returns_mount(app)
    print(f"[routes] wms_returns mounted={str(flags['mounted']).lower()}", flush=True)
    print(f"[routes] lookup_test={str(flags['lookup_test']).lower()}", flush=True)
    print(f"[routes] lookup={str(flags['lookup']).lower()}", flush=True)
    print(f"[routes] advanced_lookup={str(flags['advanced_lookup']).lower()}", flush=True)
    print(f"[routes] alias_lookup={str(flags['alias_lookup']).lower()}", flush=True)
    print(f"[routes] queue_counts={str(flags['queue_counts']).lower()}", flush=True)
    if not flags["mounted"]:
        missing = [k for k in WMS_RETURNS_ROUTE_NAMES if not flags[k]]
        print(
            f"[routes] CRITICAL: WMS Returns routes missing: {', '.join(missing)}",
            flush=True,
        )
    return flags


def openapi_wms_returns_paths(app: FastAPI) -> set[str]:
    spec = app.openapi()
    paths: Mapping[str, object] = spec.get("paths") or {}
    return {p for p in paths if str(p).startswith(WMS_RETURNS_MOUNT_PREFIX)}
