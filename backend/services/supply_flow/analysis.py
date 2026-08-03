"""Backward-compatible facade — logic lives in ``pipeline/`` builders (ETAP 3C)."""

from __future__ import annotations

from datetime import datetime

from .engine_input import SupplyFlowEngineInput
from .pipeline import DecisionPipeline, compute_delivery_priority
from .plan_models import SupplyFlowCta, SupplyFlowNextAction, SupplyFlowPlanProjection

__all__ = [
    "analyze_to_projection",
    "compute_delivery_priority",
]


def analyze_to_projection(
    inp: SupplyFlowEngineInput,
    *,
    now: datetime | None = None,
    focus_delivery_id: int | None = None,
    focus_pz_id: int | None = None,
) -> tuple[SupplyFlowPlanProjection, SupplyFlowCta | None, SupplyFlowNextAction | None, int | None]:
    return DecisionPipeline().run(
        inp,
        now=now,
        focus_delivery_id=focus_delivery_id,
        focus_pz_id=focus_pz_id,
    )
