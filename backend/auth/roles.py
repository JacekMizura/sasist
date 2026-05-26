"""Canonical platform roles — super roles bypass permission rows."""

from __future__ import annotations

# Stored role strings; accept legacy aliases when reading.
SUPER_ROLES = frozenset({"superadmin", "super_admin"})

SYSTEM_ROLE_VALUES: tuple[str, ...] = (
    "super_admin",
    "admin",
    "warehouse_manager",
    "picker",
    "packer",
    "purchasing",
    "analyst",
    "readonly",
    "user",
    # legacy aliases still accepted from DB / old clients
    "superadmin",
)


def is_super_role(role: str | None) -> bool:
    return (role or "").strip().lower() in SUPER_ROLES


def normalize_role_for_storage(role: str) -> str:
    """Prefer canonical snake_case for new rows."""
    r = (role or "").strip().lower()
    if r == "superadmin":
        return "super_admin"
    return r
