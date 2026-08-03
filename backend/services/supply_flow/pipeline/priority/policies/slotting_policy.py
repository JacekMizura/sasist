"""SlottingPolicy — slotted product overlap / warehouse slotting readiness."""

from __future__ import annotations

from ....constants import (
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_ROZLOKOWANIE,
)
from ..context import PriorityContext
from ..contribution import PriorityContribution

_PUTAWAY_PHASES = frozenset(
    {SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA, SUPPLY_FLOW_PHASE_ROZLOKOWANIE}
)


class SlottingPolicy:
    name = "SlottingPolicy"

    def evaluate(self, ctx: PriorityContext) -> list[PriorityContribution]:
        phase = (ctx.phase or "").upper()
        if ctx.slotted_product_overlap > 0:
            score = min(20.0, float(ctx.slotted_product_overlap) * 4.0)
            reason = f"Nakładanie produktów ze slottingiem: {ctx.slotted_product_overlap}"
        elif ctx.slotted_warehouse_count > 0 and phase in _PUTAWAY_PHASES:
            score = 3.0
            reason = "Magazyn ma dane slotting; brak nakładania produktów dostawy"
        else:
            score = 0.0
            reason = "Brak sygnału slotting"
        return [
            PriorityContribution(
                score=score,
                reason=reason,
                weight=4.0 if ctx.slotted_product_overlap > 0 else 1.0,
                source="slotting",
            )
        ]
