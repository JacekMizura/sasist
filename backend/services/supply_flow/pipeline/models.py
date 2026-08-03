"""Intermediate pipeline types — candidates flow; Recommendation is only the final artifact."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..plan_models import SupplyFlowCta, SupplyFlowNextAction


@dataclass(frozen=True)
class CandidateAction:
    """Possible action before priority / CTA / recommendation assembly."""

    action: str
    label: str
    module: str
    delivery_id: int | None = None
    pz_id: int | None = None
    phase: str | None = None


@dataclass(frozen=True)
class RankedAction:
    """Candidate after PriorityResolver — same facts + deterministic priority."""

    candidate: CandidateAction
    priority: float

    @property
    def action(self) -> str:
        return self.candidate.action

    @property
    def delivery_id(self) -> int | None:
        return self.candidate.delivery_id

    @property
    def pz_id(self) -> int | None:
        return self.candidate.pz_id

    @property
    def phase(self) -> str | None:
        return self.candidate.phase

    @property
    def label(self) -> str:
        return self.candidate.label

    @property
    def module(self) -> str:
        return self.candidate.module


@dataclass
class PriorityResolution:
    delivery_priorities: dict[str, float]
    ranked_actions: list[RankedAction]
    execution_order: list[dict[str, Any]]
    active_delivery_rows: list[dict[str, Any]]


@dataclass
class CtaResolution:
    cta: SupplyFlowCta | None
    next_action: SupplyFlowNextAction | None
    focus_delivery_id: int | None
    focus_pz_id: int | None
    focus_phase: str | None


@dataclass
class PipelineArtifacts:
    """Accumulated outputs of each pipeline stage (no SSOT copies)."""

    candidates: list[CandidateAction] = field(default_factory=list)
    priorities: PriorityResolution | None = None
    business_effect: dict[str, Any] = field(default_factory=dict)
    cta: CtaResolution | None = None
    recommendations: list[dict[str, Any]] = field(default_factory=list)
    explainable_decisions: list[dict[str, Any]] = field(default_factory=list)
    execution_plan: dict[str, Any] = field(default_factory=dict)
