"""Execution Monitor package — Capability Pack 4."""

from __future__ import annotations

from .monitor import ExecutionMonitor
from .state import ExecutionState, StepExecutionState
from .status import (
    EXECUTION_STATUSES,
    EXECUTION_STATUS_BLOCKED,
    EXECUTION_STATUS_DONE,
    EXECUTION_STATUS_FAILED,
    EXECUTION_STATUS_IN_PROGRESS,
    EXECUTION_STATUS_PLANNED,
    EXECUTION_STATUS_READY,
    EXECUTION_STATUS_SKIPPED,
    ExecutionStatus,
)

__all__ = [
    "EXECUTION_STATUSES",
    "EXECUTION_STATUS_BLOCKED",
    "EXECUTION_STATUS_DONE",
    "EXECUTION_STATUS_FAILED",
    "EXECUTION_STATUS_IN_PROGRESS",
    "EXECUTION_STATUS_PLANNED",
    "EXECUTION_STATUS_READY",
    "EXECUTION_STATUS_SKIPPED",
    "ExecutionMonitor",
    "ExecutionState",
    "ExecutionStatus",
    "StepExecutionState",
    "sync_execution_state_for_warehouse",
]


def __getattr__(name: str):
    if name == "sync_execution_state_for_warehouse":
        from .sync import sync_execution_state_for_warehouse as _sync

        return _sync
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
