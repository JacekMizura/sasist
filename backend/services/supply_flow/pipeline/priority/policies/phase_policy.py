"""PhasePolicy — operational phase urgency."""

from __future__ import annotations

from ....constants import (
    SUPPLY_FLOW_PHASE_AWIZOWANA,
    SUPPLY_FLOW_PHASE_NA_RAMPIE,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_ROZLADUNEK,
    SUPPLY_FLOW_PHASE_ROZLOKOWANIE,
    SUPPLY_FLOW_PHASE_W_DRODZE,
    SUPPLY_FLOW_PHASE_ZAKONCZONA,
)
from ..context import PriorityContext
from ..contribution import PriorityContribution

_PHASE_URGENCY: dict[str, float] = {
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA: 100.0,
    SUPPLY_FLOW_PHASE_ROZLOKOWANIE: 95.0,
    SUPPLY_FLOW_PHASE_ROZLADUNEK: 80.0,
    SUPPLY_FLOW_PHASE_NA_RAMPIE: 70.0,
    SUPPLY_FLOW_PHASE_W_DRODZE: 40.0,
    SUPPLY_FLOW_PHASE_AWIZOWANA: 20.0,
    SUPPLY_FLOW_PHASE_ZAKONCZONA: 0.0,
}


class PhasePolicy:
    name = "PhasePolicy"

    def evaluate(self, ctx: PriorityContext) -> list[PriorityContribution]:
        phase = (ctx.phase or "").upper()
        score = float(_PHASE_URGENCY.get(phase, 10.0))
        return [
            PriorityContribution(
                score=score,
                reason=f"Faza operacyjna {phase or '—'}",
                weight=1.0,
                source="phase",
            )
        ]
