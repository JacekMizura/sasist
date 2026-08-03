"""ExecutionState — runtime overlay for ExecutionPlan (Capability Pack 4)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any

from .status import EXECUTION_STATUS_PLANNED


@dataclass
class StepExecutionState:
    """Runtime status of one ExecutionStep — linked by ``seq`` only."""

    seq: int
    status: str = EXECUTION_STATUS_PLANNED
    delivery_id: int | None = None
    pz_id: int | None = None
    action: str | None = None
    last_event: str | None = None
    updated_at: str | None = None
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> StepExecutionState:
        return cls(
            seq=int(raw["seq"]),
            status=str(raw.get("status") or EXECUTION_STATUS_PLANNED),
            delivery_id=int(raw["delivery_id"]) if raw.get("delivery_id") is not None else None,
            pz_id=int(raw["pz_id"]) if raw.get("pz_id") is not None else None,
            action=str(raw["action"]) if raw.get("action") is not None else None,
            last_event=str(raw["last_event"]) if raw.get("last_event") is not None else None,
            updated_at=str(raw["updated_at"]) if raw.get("updated_at") is not None else None,
            note=str(raw["note"]) if raw.get("note") is not None else None,
        )


@dataclass
class ExecutionState:
    """
    Monitors execution of an ExecutionPlan without mutating the plan contract.

    Steps are aligned by ``seq`` with ``ExecutionPlan.steps``.
    """

    steps: list[StepExecutionState] = field(default_factory=list)
    status: str = EXECUTION_STATUS_PLANNED
    plan_step_count: int = 0
    plan_version: int | None = None
    updated_at: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "steps": [s.to_dict() for s in self.steps],
            "status": self.status,
            "plan_step_count": self.plan_step_count,
            "plan_version": self.plan_version,
            "updated_at": self.updated_at,
            "meta": dict(self.meta),
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any] | None) -> ExecutionState:
        if not raw:
            return cls()
        return cls(
            steps=[StepExecutionState.from_dict(s) for s in (raw.get("steps") or [])],
            status=str(raw.get("status") or EXECUTION_STATUS_PLANNED),
            plan_step_count=int(raw.get("plan_step_count") or 0),
            plan_version=int(raw["plan_version"]) if raw.get("plan_version") is not None else None,
            updated_at=str(raw["updated_at"]) if raw.get("updated_at") is not None else None,
            meta=dict(raw.get("meta") or {}),
        )

    def step_by_seq(self, seq: int) -> StepExecutionState | None:
        for s in self.steps:
            if int(s.seq) == int(seq):
                return s
        return None
