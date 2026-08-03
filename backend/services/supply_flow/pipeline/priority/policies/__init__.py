"""Default PriorityPolicy set (Capability Pack 1 factors, architecture for next packs)."""

from __future__ import annotations

from ..policy import PriorityPolicy
from .capacity_policy import CapacityPolicy
from .demand_policy import DemandPolicy
from .eta_policy import ETAPolicy
from .phase_policy import PhasePolicy
from .recovery_policy import RecoveryPolicy
from .slotting_policy import SlottingPolicy


def default_priority_policies() -> list[PriorityPolicy]:
    """Independent policies — order does not affect sum aggregation."""
    return [
        PhasePolicy(),
        ETAPolicy(),
        DemandPolicy(),
        RecoveryPolicy(),
        CapacityPolicy(),
        SlottingPolicy(),
    ]
