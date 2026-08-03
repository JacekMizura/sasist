"""In-memory shapes for Living SupplyFlowPlan projection (no SSOT copies)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class EmptyRecommendationStub:
    """Placeholder until algorithms land — keeps contract shape."""

    action: str | None = None
    target: dict[str, Any] = field(default_factory=dict)
    priority: float | None = None
    confidence: float | None = None
    rationale: list[str] = field(default_factory=list)
    why_not: list[str] = field(default_factory=list)
    business_effect: dict[str, Any] = field(default_factory=dict)


@dataclass
class SupplyFlowPlanProjection:
    """
    Orchestration-only payload stored in ``SupplyFlowPlan.projection_json``.

    Must not embed inventory rows, location rows, recovery state, or slotting tables.
    References by id are allowed.
    """

    recommendations: list[dict[str, Any]] = field(default_factory=list)
    delivery_priorities: dict[str, float] = field(default_factory=dict)
    operator_queues: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    business_effect: dict[str, Any] = field(default_factory=dict)
    explainable_decisions: list[dict[str, Any]] = field(default_factory=list)
    execution_plan: dict[str, Any] = field(default_factory=dict)
    execution_state: dict[str, Any] = field(default_factory=dict)
    confidence: dict[str, Any] = field(default_factory=dict)
    rationale: list[str] = field(default_factory=list)
    why_not: list[str] = field(default_factory=list)
    conflicts: list[dict[str, Any]] = field(default_factory=list)
    unload_sequence: list[dict[str, Any]] = field(default_factory=list)
    putaway_sequence: list[dict[str, Any]] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def empty(cls, *, note: str | None = None) -> SupplyFlowPlanProjection:
        meta: dict[str, Any] = {"stage": "foundation", "algorithms": "pending"}
        if note:
            meta["note"] = note
        return cls(meta=meta)


@dataclass
class SupplyFlowCta:
    """Soft CTA for existing WMS modules (paths / hints only)."""

    module: str | None = None
    path: str | None = None
    label: str | None = None
    delivery_id: int | None = None
    extras: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SupplyFlowNextAction:
    """Soft next step for operator terminal — not a static assignment."""

    kind: str | None = None
    delivery_id: int | None = None
    line_id: int | None = None
    path: str | None = None
    label: str | None = None
    plan_version: int | None = None
    extras: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class LivingPlanResult:
    tenant_id: int
    warehouse_id: int
    plan_version: int
    computed_at: datetime
    optimization_goal: str
    planning_horizon_hours: int
    projection: SupplyFlowPlanProjection
    cta: SupplyFlowCta | None = None
    next_action: SupplyFlowNextAction | None = None
    last_recompute_trigger: str | None = None
