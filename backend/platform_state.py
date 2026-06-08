"""
Platform readiness and production recovery mode.

Tier 0 validated → API traffic allowed.
Recovery mode → all operational features forced OFF (classic OMS/WMS only).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

_tier0_ready: bool = False
_tier0_validation: dict[str, Any] | None = None
_operational_force_disabled: bool = False
_production_schema_valid: bool = False
_production_schema_health: dict[str, Any] | None = None


def _env_truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def is_recovery_mode_env() -> bool:
    return _env_truthy("PLATFORM_RECOVERY_MODE")


def is_operational_features_force_disabled() -> bool:
    """True when recovery mode or explicit post-validation safety latch is active."""
    return _operational_force_disabled or is_recovery_mode_env()


def mark_tier0_ready(*, validation: dict[str, Any] | None = None) -> None:
    global _tier0_ready, _tier0_validation
    _tier0_ready = True
    _tier0_validation = validation


def is_platform_ready() -> bool:
    return _tier0_ready


def get_tier0_validation_snapshot() -> dict[str, Any] | None:
    return _tier0_validation


def mark_production_schema_valid(*, health: dict[str, Any]) -> None:
    """Set after ``run_production_schema_startup_gate`` succeeds."""
    global _production_schema_valid, _production_schema_health
    _production_schema_valid = health.get("status") == "ok"
    _production_schema_health = health


def is_production_schema_valid() -> bool:
    return _production_schema_valid


def get_production_schema_health_snapshot() -> dict[str, Any] | None:
    return _production_schema_health


def clear_production_schema_valid() -> None:
    global _production_schema_valid, _production_schema_health
    _production_schema_valid = False
    _production_schema_health = None


def activate_operational_safety_latch(*, reason: str) -> None:
    """Force legacy OMS/WMS — disable operational runtime resolution."""
    global _operational_force_disabled
    _operational_force_disabled = True


@dataclass(frozen=True)
class PlatformBootStatus:
    ready: bool
    recovery_mode: bool
    operational_forced_off: bool
    dialect: str | None = None
    tier0_validation: dict[str, Any] | None = None
    sql_probe_failures: tuple[dict[str, Any], ...] = field(default_factory=tuple)
