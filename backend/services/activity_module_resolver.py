"""Map HTTP API paths to operational module / action labels for workforce telemetry."""

from __future__ import annotations

import re

# Longest prefix first — first match wins.
_PREFIX_MODULES: tuple[tuple[str, str], ...] = (
    ("/api/wms/order-issue", "WMS_BRAKI"),
    ("/api/wms/receiving", "WMS_RECEIVING"),
    ("/api/wms/putaway", "WMS_PUTAWAY"),
    ("/api/wms/relocation", "WMS_RELOCATION"),
    ("/api/wms/mm-transfer", "WMS_MOVEMENTS"),
    ("/api/wms/replenishment", "WMS_REPLENISHMENT"),
    ("/api/wms/carriers", "WMS_CARRIERS"),
    ("/api/wms/picking", "WMS_PICKING"),
    ("/api/wms/packing", "WMS_PACKING"),
    ("/api/wms/production", "WMS_PRODUCTION"),
    ("/api/wms/inventory", "WMS_INVENTORY"),
    ("/api/wms/returns", "WMS_RETURNS"),
    ("/api/wms/dashboard", "WMS_DASHBOARD"),
    ("/api/wms/operational", "WMS_OPERATIONS"),
    ("/api/inventory-count/wms", "INVENTORY_WMS"),
    ("/api/inventory-count", "INVENTORY"),
    ("/api/stock-documents", "STOCK_DOCUMENTS"),
    ("/api/sale-documents", "SALE_DOCUMENTS"),
    ("/api/document-generation", "DOCUMENTS"),
    ("/api/document-series", "DOCUMENT_SERIES"),
    ("/api/direct-sales", "DIRECT_SALES"),
    ("/api/operational", "OPERATIONS"),
    ("/api/production", "PRODUCTION"),
    ("/api/orders", "ORDERS"),
    ("/api/purchasing", "PURCHASING"),
    ("/api/supplier-orders", "SUPPLIER_ORDERS"),
    ("/api/delivery", "INBOUND"),
    ("/api/returns", "RETURNS"),
    ("/api/complaints", "COMPLAINTS"),
    ("/api/products", "PRODUCTS"),
    ("/api/warehouse", "WAREHOUSE"),
    ("/api/warehouses", "WAREHOUSE"),
    ("/api/location-stock", "STOCK"),
    ("/api/picks", "PICKING"),
    ("/api/wave", "WAVE"),
    ("/api/scan", "SCAN"),
    ("/api/reports", "REPORTS"),
    ("/api/export", "EXPORT"),
    ("/api/import", "IMPORT"),
    ("/api/admin/users", "ADMIN_USERS"),
    ("/api/auth", "AUTH"),
    ("/api/workforce", "WORKFORCE"),
    ("/api/settings", "SETTINGS"),
    ("/api/company-profile", "SETTINGS"),
    ("/api/tenant", "TENANT"),
    ("/api/system", "SYSTEM"),
    ("/api/labels", "LABELS"),
    ("/api/printers", "PRINTERS"),
    ("/api/planning", "PLANNING"),
    ("/api/analysis", "ANALYSIS"),
    ("/api/slotting", "SLOTTING"),
    ("/api/cart", "CART"),
    ("/api/customers", "CUSTOMERS"),
    ("/api/suppliers", "SUPPLIERS"),
)

_SKIP_PREFIXES: tuple[str, ...] = (
    "/",
    "/health",
    "/healthz",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/uploads",
    "/api/workforce/activity-logs",
    "/api/workforce/dashboard",
    "/api/workforce/analytics",
    "/api/workforce/activity",
    "/api/operational-runtime",
    "/api/wms/dashboard",
    "/api/system/health",
    "/api/dev/",
)

# Routes with explicit service-level logging — avoid duplicate generic events.
_DEDUP_PREFIXES: tuple[str, ...] = (
    "/api/auth/login",
    "/api/auth/logout",
    "/api/wms/receiving",
    "/api/wms/putaway",
    "/api/wms/relocation",
    "/api/wms/mm-transfer",
    "/api/wms/replenishment",
    "/api/wms/carriers",
)

# Kept for documentation / future GET-allowlist paths (GETs are currently fully skipped).
_POLLING_SUFFIXES: tuple[str, ...] = (
    "/poll",
    "/heartbeat",
    "/status",
    "/stream",
)


def _normalize_path(path: str) -> str:
    p = (path or "").split("?", 1)[0].rstrip("/") or "/"
    return p


def should_track_request(method: str, path: str) -> bool:
    """Track only mutating requests — GETs (polling / list refresh) are not operational work."""
    m = (method or "").upper()
    if m in ("OPTIONS", "HEAD", "GET"):
        return False
    if m not in ("POST", "PUT", "PATCH", "DELETE"):
        return False
    norm = _normalize_path(path)
    if norm == "/":
        return False
    for prefix in _SKIP_PREFIXES:
        if prefix == "/":
            continue
        if norm == prefix or norm.startswith(prefix):
            return False
    for prefix in _DEDUP_PREFIXES:
        if norm == prefix or norm.startswith(prefix + "/"):
            return False
    return True


def _action_from_request(method: str, path: str) -> str:
    m = (method or "GET").upper()
    norm = _normalize_path(path)
    parts = [p for p in norm.split("/") if p and p != "api"]
    tail = parts[-1] if parts else "root"
    tail = re.sub(r"[^a-zA-Z0-9_-]", "_", tail)[:48]
    if m == "GET":
        return f"view_{tail}" if len(parts) > 2 else "view"
    if m == "POST":
        return f"create_{tail}" if tail not in ("root", "api") else "create"
    if m in ("PUT", "PATCH"):
        return f"update_{tail}" if tail not in ("root", "api") else "update"
    if m == "DELETE":
        return f"delete_{tail}" if tail not in ("root", "api") else "delete"
    return m.lower()


def resolve_module_for_path(path: str) -> str | None:
    """Map API path to a known operational module, or None for unmapped technical traffic."""
    norm = _normalize_path(path)
    for prefix, mod in _PREFIX_MODULES:
        if norm == prefix or norm.startswith(prefix + "/"):
            return mod
    return None


def resolve_api_activity(method: str, path: str) -> tuple[str, str] | None:
    """Return (module, action_type) for a tracked HTTP request.

    Unmapped paths are skipped (no generic ``API`` module) so TOP MODUŁY / throughput
    reflect real business areas, not catch-all HTTP noise.
    """
    if not should_track_request(method, path):
        return None
    module = resolve_module_for_path(path)
    if module is None:
        return None
    action = _action_from_request(method, path)
    return module, action[:96]
