"""ExecutionPlan / ExecutionStep — ordered execution of Recommendations (CP3)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

EXECUTION_STATUS_PLANNED = "PLANNED"


@dataclass(frozen=True)
class ExecutionStep:
    """
    One planned execution unit linked to a single Recommendation.

    Does not invent actions — mirrors Recommendation fields + seq / goal / status.
    """

    seq: int
    recommendation_index: int
    action: str
    label: str
    module: str
    goal: str
    status: str = EXECUTION_STATUS_PLANNED
    delivery_id: int | None = None
    pz_id: int | None = None
    phase: str | None = None
    priority: float | None = None
    recommendation_ref: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ExecutionPlan:
    """
    Ordered execution plan derived only from Recommendations.

    Answers: what exactly do we do and in which order?
    """

    steps: list[ExecutionStep] = field(default_factory=list)
    delivery_groups: list[dict[str, Any]] = field(default_factory=list)
    status: str = EXECUTION_STATUS_PLANNED
    step_count: int = 0
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "steps": [s.to_dict() for s in self.steps],
            "delivery_groups": list(self.delivery_groups),
            "status": self.status,
            "step_count": self.step_count,
            "meta": dict(self.meta),
        }
