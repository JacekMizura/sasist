"""CTABuilder — map ranked focus to existing WMS module paths only."""

from __future__ import annotations

from ..cta import cta_for_phase, next_action_for_phase
from ..engine_input import SupplyFlowEngineInput
from .models import CtaResolution, PriorityResolution


class CTABuilder:
    """
    Responsibility: map the focus delivery/action to soft CTA / next_action.

    Never creates new screens or workflows — only existing WMS paths.
    """

    def build(
        self,
        inp: SupplyFlowEngineInput,
        priorities: PriorityResolution,
        *,
        focus_delivery_id: int | None = None,
        focus_pz_id: int | None = None,
    ) -> CtaResolution:
        focus_id = focus_delivery_id
        focus_pz = focus_pz_id
        focus_phase: str | None = None

        if focus_id is None and priorities.execution_order:
            focus_id = int(priorities.execution_order[0]["delivery_id"])
            focus_phase = str(priorities.execution_order[0]["phase"])
        elif focus_id is not None:
            for row in priorities.execution_order:
                if int(row["delivery_id"]) == int(focus_id):
                    focus_phase = str(row["phase"])
                    break
            if focus_phase is None:
                for d in inp.deliveries:
                    if int(d.id) == int(focus_id):
                        focus_phase = str(d.operational_phase)
                        break

        if focus_id is not None and focus_pz is None:
            pzs = inp.pz_ids_for_delivery(int(focus_id))
            focus_pz = pzs[0] if pzs else None

        if focus_phase is None and priorities.ranked_actions:
            top = priorities.ranked_actions[0]
            if top.delivery_id is not None:
                focus_id = int(top.delivery_id)
                focus_phase = top.phase
                focus_pz = top.pz_id

        cta = (
            cta_for_phase(focus_phase, delivery_id=focus_id, pz_id=focus_pz)
            if focus_phase
            else None
        )
        next_action = (
            next_action_for_phase(focus_phase, delivery_id=focus_id, pz_id=focus_pz)
            if focus_phase
            else None
        )
        return CtaResolution(
            cta=cta,
            next_action=next_action,
            focus_delivery_id=focus_id,
            focus_pz_id=focus_pz,
            focus_phase=focus_phase,
        )
