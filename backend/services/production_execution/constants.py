"""Shared production execution vocabulary — batch + MO (WMS terminal)."""

from __future__ import annotations

from typing import Literal

ProductionExecutionKind = Literal["batch", "order"]
ProductionExecutionPhase = Literal["collecting", "execute", "putaway"]

EXECUTION_STATUSES = frozenset(
    {
        "draft",
        "planned",
        "collecting",
        "in_progress",
        "awaiting_putaway",
        "putaway",
        "completed",
        "cancelled",
    }
)
TERMINAL_EXECUTION_STATUSES = frozenset({"completed", "cancelled"})

# KPI / dashboard — single vocabulary (batch + MO share the same buckets).
PLANNED_BATCH_STATUSES = frozenset({"draft", "planned"})
EXECUTING_BATCH_STATUSES = frozenset({"collecting", "in_progress"})
AWAITING_PUTAWAY_BATCH_STATUSES = frozenset({"awaiting_putaway", "putaway"})

# User-facing labels — single map for batch + MO (frontend mirrors via API enum).
EXECUTION_STATUS_LABELS: dict[str, str] = {
    "draft": "Robocza",
    "planned": "Zaplanowana",
    "collecting": "Zbieranie",
    "in_progress": "W realizacji",
    "awaiting_putaway": "Oczekuje na rozlokowanie",
    "putaway": "Rozlokowanie w toku",
    "completed": "Ukończona",
    "cancelled": "Anulowana",
}

# Legacy MO summary mapping (batch rows in product history only).
BATCH_STATUS_TO_LEGACY_SUMMARY = {
    "draft": "draft",
    "planned": "planned",
    "collecting": "in_progress",
    "in_progress": "in_progress",
    "awaiting_putaway": "in_progress",
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
    if key in ("awaiting_putaway", "putaway"):
        return "putaway"
    return None


def normalize_order_status(raw: str | None) -> str:
    """Map legacy in_progress (pre-WMS phases) when auxiliary timestamps exist."""
    key = str(raw or "draft").strip().lower()
    if key not in EXECUTION_STATUSES:
        if key == "in_progress":
            return "in_progress"
        return "planned"
    return key
