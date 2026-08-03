"""BusinessEffectBuilder — uses PriorityResolver output (Capability Pack 1)."""

from __future__ import annotations

from typing import Any

from ..constants import (
    SUPPLY_FLOW_PHASE_AWIZOWANA,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_W_DRODZE,
)
from ..engine_input import SupplyFlowEngineInput
from .models import CandidateAction, PriorityResolution


class BusinessEffectBuilder:
    """
    Responsibility: qualitative business effect.

    Capability Pack 1: consumes PriorityResolution (unlockable orders, top priority).
    """

    def build(
        self,
        inp: SupplyFlowEngineInput,
        candidates: list[CandidateAction] | None = None,
        priorities: PriorityResolution | None = None,
    ) -> dict[str, Any]:
        _ = candidates
        recovery_n = int(inp.recovery.get("open_issue_task_count") or 0)
        awaiting_putaway = [
            d
            for d in inp.active_deliveries()
            if str(d.operational_phase) == SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA
        ]
        in_transit = [
            d
            for d in inp.active_deliveries()
            if str(d.operational_phase) in (SUPPLY_FLOW_PHASE_AWIZOWANA, SUPPLY_FLOW_PHASE_W_DRODZE)
        ]

        unlockable_total = 0
        top_priority = None
        top_delivery_id = None
        if priorities is not None:
            for row in priorities.active_delivery_rows:
                unlockable_total += int(row.get("unlockable_order_count") or 0)
            if priorities.execution_order:
                top_delivery_id = int(priorities.execution_order[0]["delivery_id"])
                top_priority = float(priorities.execution_order[0]["priority"])

        effects: list[str] = []
        if unlockable_total > 0:
            effects.append(
                f"możliwe odblokowanie zamówień Recovery po rozlokowaniu (szacunek: {unlockable_total})"
            )
        elif recovery_n > 0:
            effects.append("dostawy wpływają na Recovery (są otwarte braki)")
        if awaiting_putaway:
            effects.append("możliwe odblokowanie zamówień po rozlokowaniu")
        if in_transit and not awaiting_putaway:
            effects.append("oczekiwanie na kolejne dostawy")
        if not effects:
            effects.append("brak wpływu")

        return {
            "summary": effects[0],
            "notes": effects,
            "recovery_open_count": recovery_n,
            "awaiting_putaway_delivery_count": len(awaiting_putaway),
            "inbound_pending_count": len(in_transit),
            "unlockable_order_estimate": unlockable_total,
            "top_priority_delivery_id": top_delivery_id,
            "top_priority_value": top_priority,
            "quantitative": False,
            "source": "PriorityResolver",
        }
