"""ExecutionStatus — allowed runtime statuses for ExecutionMonitor (CP4)."""

from __future__ import annotations

from typing import Literal

EXECUTION_STATUS_PLANNED = "PLANNED"
EXECUTION_STATUS_READY = "READY"
EXECUTION_STATUS_IN_PROGRESS = "IN_PROGRESS"
EXECUTION_STATUS_DONE = "DONE"
EXECUTION_STATUS_BLOCKED = "BLOCKED"
EXECUTION_STATUS_SKIPPED = "SKIPPED"
EXECUTION_STATUS_FAILED = "FAILED"

ExecutionStatus = Literal[
    "PLANNED",
    "READY",
    "IN_PROGRESS",
    "DONE",
    "BLOCKED",
    "SKIPPED",
    "FAILED",
]

EXECUTION_STATUSES: tuple[str, ...] = (
    EXECUTION_STATUS_PLANNED,
    EXECUTION_STATUS_READY,
    EXECUTION_STATUS_IN_PROGRESS,
    EXECUTION_STATUS_DONE,
    EXECUTION_STATUS_BLOCKED,
    EXECUTION_STATUS_SKIPPED,
    EXECUTION_STATUS_FAILED,
)

# Terminal statuses — monitor does not advance them further (except FAILED/BLOCKED overrides).
_TERMINAL = frozenset(
    {
        EXECUTION_STATUS_DONE,
        EXECUTION_STATUS_SKIPPED,
        EXECUTION_STATUS_FAILED,
    }
)


def is_terminal(status: str) -> bool:
    return str(status or "").upper() in _TERMINAL
