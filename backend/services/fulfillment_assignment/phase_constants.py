"""P3 — order fulfillment assignment phase (lifecycle SSOT)."""

from __future__ import annotations

PHASE_UNASSIGNED = "UNASSIGNED"
PHASE_FULFILLMENT_ASSIGNED = "FULFILLMENT_ASSIGNED"
PHASE_CONSOLIDATION_REQUIRED = "CONSOLIDATION_REQUIRED"
PHASE_CONSOLIDATING = "CONSOLIDATING"
PHASE_MANUAL_REVIEW_REQUIRED = "MANUAL_REVIEW_REQUIRED"
PHASE_WAVE_CREATED = "WAVE_CREATED"
PHASE_PICKING = "PICKING"
PHASE_PACKING = "PACKING"
PHASE_SHIPPED = "SHIPPED"

FULFILLMENT_ASSIGNMENT_PHASES = (
    PHASE_UNASSIGNED,
    PHASE_FULFILLMENT_ASSIGNED,
    PHASE_CONSOLIDATION_REQUIRED,
    PHASE_CONSOLIDATING,
    PHASE_MANUAL_REVIEW_REQUIRED,
    PHASE_WAVE_CREATED,
    PHASE_PICKING,
    PHASE_PACKING,
    PHASE_SHIPPED,
)

DEFAULT_FULFILLMENT_ASSIGNMENT_PHASE = PHASE_FULFILLMENT_ASSIGNED

_PHASE_RANK: dict[str, int] = {p: i for i, p in enumerate(FULFILLMENT_ASSIGNMENT_PHASES)}

# Od WAVE_CREATED — brak zmiany magazynu realizacji (P3.5).
WAREHOUSE_CHANGE_LOCKED_PHASES = frozenset(
    {
        PHASE_CONSOLIDATION_REQUIRED,
        PHASE_CONSOLIDATING,
        PHASE_MANUAL_REVIEW_REQUIRED,
        PHASE_WAVE_CREATED,
        PHASE_PICKING,
        PHASE_PACKING,
        PHASE_SHIPPED,
    }
)

# Import OMS nie nadpisuje WH / fazy od FULFILLMENT_ASSIGNED wzwyż (P3.7).
IMPORT_WAREHOUSE_LOCKED_PHASES = frozenset(
    {
        PHASE_FULFILLMENT_ASSIGNED,
        PHASE_CONSOLIDATION_REQUIRED,
        PHASE_CONSOLIDATING,
        PHASE_MANUAL_REVIEW_REQUIRED,
        PHASE_WAVE_CREATED,
        PHASE_PICKING,
        PHASE_PACKING,
        PHASE_SHIPPED,
    }
)

# P5 — fala kompletacji zablokowana do zakończenia konsolidacji.
CONSOLIDATION_WAVE_BLOCKED_PHASES = frozenset(
    {
        PHASE_CONSOLIDATION_REQUIRED,
        PHASE_CONSOLIDATING,
        PHASE_MANUAL_REVIEW_REQUIRED,
    }
)


def normalize_fulfillment_assignment_phase(raw: str | None) -> str:
    p = (raw or "").strip().upper()
    if p not in FULFILLMENT_ASSIGNMENT_PHASES:
        return DEFAULT_FULFILLMENT_ASSIGNMENT_PHASE
    return p


def phase_rank(phase: str | None) -> int:
    return _PHASE_RANK.get(normalize_fulfillment_assignment_phase(phase), 1)


def is_warehouse_change_locked(phase: str | None) -> bool:
    return normalize_fulfillment_assignment_phase(phase) in WAREHOUSE_CHANGE_LOCKED_PHASES


def is_import_warehouse_locked(phase: str | None) -> bool:
    return normalize_fulfillment_assignment_phase(phase) in IMPORT_WAREHOUSE_LOCKED_PHASES


def is_consolidation_wave_blocked(phase: str | None) -> bool:
    return normalize_fulfillment_assignment_phase(phase) in CONSOLIDATION_WAVE_BLOCKED_PHASES
