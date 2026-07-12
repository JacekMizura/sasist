"""Integration API key types, prefixes, and scope catalog."""

from __future__ import annotations

API_KEY_TYPES: frozenset[str] = frozenset(
    {
        "printer_agent",
        "integration",
        "public_api",
        "webhook",
    }
)

API_KEY_PREFIXES: tuple[str, ...] = ("spa_", "sasist_")
DEFAULT_API_KEY_PREFIX = "spa_"
PUBLIC_API_KEY_PREFIX = "sasist_"

API_KEY_TYPE_LABELS: dict[str, str] = {
    "printer_agent": "Printer Agent",
    "integration": "Integration",
    "public_api": "Public API",
    "webhook": "Webhook",
}

API_KEY_SCOPES: frozenset[str] = frozenset(
    {
        "printing.agent",
        "printing.read",
        "orders.read",
        "orders.write",
        "products.read",
        "products.write",
        "warehouse.read",
        "warehouse.write",
        "api.full_access",
    }
)

DEFAULT_SCOPES_BY_TYPE: dict[str, list[str]] = {
    "printer_agent": ["printing.agent"],
    "integration": ["orders.read", "products.read", "warehouse.read"],
    "public_api": ["api.full_access"],
    "webhook": ["orders.read"],
}

FULL_ACCESS_SCOPE = "api.full_access"
