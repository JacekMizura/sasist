"""CapacityPolicy — warehouse utilization pressure (CP1 formula preserved)."""

from __future__ import annotations

from ....constants import (
    SUPPLY_FLOW_PHASE_NA_RAMPIE,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_ROZLADUNEK,
    SUPPLY_FLOW_PHASE_ROZLOKOWANIE,
)
from ..context import PriorityContext
from ..contribution import PriorityContribution

_PUTAWAY_PHASES = frozenset(
    {SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA, SUPPLY_FLOW_PHASE_ROZLOKOWANIE}
)


class CapacityPolicy:
    name = "CapacityPolicy"

    def evaluate(self, ctx: PriorityContext) -> list[PriorityContribution]:
        phase = (ctx.phase or "").upper()
        util = max(0.0, float(ctx.avg_utilization_percent or 0.0))
        if phase in _PUTAWAY_PHASES:
            score = min(25.0, util / 4.0)
        elif phase in (SUPPLY_FLOW_PHASE_NA_RAMPIE, SUPPLY_FLOW_PHASE_ROZLADUNEK) and util >= 85.0:
            score = 8.0
        else:
            score = 0.0
        return [
            PriorityContribution(
                score=score,
                reason=f"Wykorzystanie pojemności: {util:.1f}% (faza {phase or '—'})",
                weight=1.0,
                source="capacity",
            )
        ]
