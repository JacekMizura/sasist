"""Production demand planning (MRP-lite)."""

from __future__ import annotations

from typing import Any

__all__ = ["get_production_demand_planning"]


def __getattr__(name: str) -> Any:
    if name == "get_production_demand_planning":
        from .demand_engine_service import get_production_demand_planning

        return get_production_demand_planning
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
