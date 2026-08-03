"""CandidateActionBuilder — only generates possible actions from engine input."""

from __future__ import annotations

from ..constants import (
    SUPPLY_FLOW_PHASE_AWIZOWANA,
    SUPPLY_FLOW_PHASE_NA_RAMPIE,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_ROZLADUNEK,
    SUPPLY_FLOW_PHASE_ROZLOKOWANIE,
    SUPPLY_FLOW_PHASE_W_DRODZE,
)
from ..engine_input import SupplyFlowEngineInput
from .models import CandidateAction


class CandidateActionBuilder:
    """
    Responsibility: enumerate candidate actions from SSOT-derived input.

    Does not assign priority, CTA paths, or recommendation packaging.
    """

    def build(self, inp: SupplyFlowEngineInput) -> list[CandidateAction]:
        candidates: list[CandidateAction] = []
        recovery_open = int(inp.recovery.get("open_issue_task_count") or 0) > 0
        dock_count = int(inp.capacity.get("dock_location_count") or 0)
        dock_freeish = bool(inp.capacity.get("dock_has_capacity_hint"))

        for d in inp.active_deliveries():
            phase = str(d.operational_phase or "").upper()
            pz_ids = inp.pz_ids_for_delivery(int(d.id))
            pz_id = pz_ids[0] if pz_ids else None

            if phase in (SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA, SUPPLY_FLOW_PHASE_ROZLOKOWANIE):
                candidates.append(
                    CandidateAction(
                        action="START_PUTAWAY",
                        delivery_id=int(d.id),
                        pz_id=pz_id,
                        phase=phase,
                        label="Rozpocznij rozlokowanie",
                        module="putaway",
                    )
                )
                if dock_count > 0 and dock_freeish:
                    candidates.append(
                        CandidateAction(
                            action="CONSIDER_CROSS_DOCK",
                            delivery_id=int(d.id),
                            pz_id=pz_id,
                            phase=phase,
                            label="Możliwość wykorzystania lokalizacji DOCK (cross-dock)",
                            module="putaway",
                        )
                    )
            elif phase in (SUPPLY_FLOW_PHASE_NA_RAMPIE, SUPPLY_FLOW_PHASE_ROZLADUNEK):
                candidates.append(
                    CandidateAction(
                        action="CONTINUE_RECEIVING",
                        delivery_id=int(d.id),
                        pz_id=pz_id,
                        phase=phase,
                        label="Kontynuuj przyjęcie / rozładunek",
                        module="receiving",
                    )
                )
            elif phase in (SUPPLY_FLOW_PHASE_AWIZOWANA, SUPPLY_FLOW_PHASE_W_DRODZE):
                candidates.append(
                    CandidateAction(
                        action="MONITOR_INBOUND",
                        delivery_id=int(d.id),
                        pz_id=None,
                        phase=phase,
                        label="Monitoruj dostawę (awizacja / w drodze)",
                        module="inbound_delivery",
                    )
                )

        if recovery_open and not any(c.action == "START_PUTAWAY" for c in candidates):
            candidates.append(
                CandidateAction(
                    action="RECOVERY_WAITING",
                    delivery_id=None,
                    pz_id=None,
                    phase=None,
                    label="Otwarte pozycje Recovery — rozlokowanie może odblokować braki",
                    module="braki",
                )
            )
        return candidates
