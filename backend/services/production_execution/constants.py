"""Shared production execution vocabulary — batch + MO (WMS terminal)."""

from __future__ import annotations

from typing import Literal

ProductionExecutionKind = Literal["batch", "order"]
ProductionExecutionPhase = Literal["collecting", "execute"]

EXECUTION_STATUSES = frozenset(
    {"draft", "planned", "collecting", "in_progress", "putaway", "completed", "cancelled"}
)
TERMINAL_EXECUTION_STATUSES = frozenset({"completed", "cancelled"})

# Legacy MO summary mapping (batch rows in product history only).
BATCH_STATUS_TO_LEGACY_SUMMARY = {
    "draft": "draft",
    "planned": "planned",
    "collecting": "in_progress",
    "in_progress": "in_progress",
    "putaway": "in_progress",
    "completed": "completed",
    "cancelled": "cancelled",
}


def execution_phase_for_status(status: str | None) -> ProductionExecutionPhase | None:
    key = str(status or "").strip().lower()
    if key in ("planned", "draft", "collecting"):
        return "collecting"
    if key == "in_progress":
        return "execute"
    return None


def normalize_order_status(raw: str | None) -> str:
    """Map legacy in_progress (pre-WMS phases) when auxiliary timestamps exist."""
    key = str(raw or "draft").strip().lower()
    if key not in EXECUTION_STATUSES:
        if key == "in_progress":
            return "in_progress"
        return "planned"
    return key
