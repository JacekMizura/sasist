"""Operational phase transitions + purchase/phase matrix validation (no axis sync)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ...models.inbound_delivery import InboundDelivery
from ...models.supply_flow import SupplyFlowPhaseHistory
from .constants import (
    PHASE_HISTORY_SOURCE_SYSTEM,
    PURCHASE_OPERATIONAL_PHASE_MATRIX,
    PURCHASE_STATUSES,
    SUPPLY_FLOW_PHASE_AWIZOWANA,
    SUPPLY_FLOW_PHASE_TRANSITIONS,
    SUPPLY_FLOW_PHASES,
)


class SupplyFlowLifecycleError(ValueError):
    pass


def assert_valid_phase(phase: str) -> str:
    p = (phase or "").strip().upper()
    if p not in SUPPLY_FLOW_PHASES:
        raise SupplyFlowLifecycleError(f"Nieznana faza operacyjna Supply Flow: {phase!r}")
    return p


def normalize_purchase_status(purchase_status: str | None) -> str:
    s = (purchase_status or "").strip().lower()
    if s not in PURCHASE_STATUSES:
        raise SupplyFlowLifecycleError(f"Nieznany status zakupowy dostawy: {purchase_status!r}")
    return s


def allowed_phases_for_purchase_status(purchase_status: str | None) -> frozenset[str]:
    return PURCHASE_OPERATIONAL_PHASE_MATRIX[normalize_purchase_status(purchase_status)]


def is_purchase_phase_combination_allowed(
    purchase_status: str | None, operational_phase: str | None
) -> bool:
    """Validate matrix only — never mutates either axis."""
    try:
        phase = assert_valid_phase(operational_phase or SUPPLY_FLOW_PHASE_AWIZOWANA)
        allowed = allowed_phases_for_purchase_status(purchase_status)
    except SupplyFlowLifecycleError:
        return False
    return phase in allowed


def assert_purchase_phase_combination_allowed(
    purchase_status: str | None, operational_phase: str | None
) -> None:
    phase = assert_valid_phase(operational_phase or SUPPLY_FLOW_PHASE_AWIZOWANA)
    purchase = normalize_purchase_status(purchase_status)
    allowed = PURCHASE_OPERATIONAL_PHASE_MATRIX[purchase]
    if phase not in allowed:
        raise SupplyFlowLifecycleError(
            f"Niedozwolona kombinacja osi: status zakupowy={purchase!r}, "
            f"faza operacyjna={phase!r}. Dozwolone fazy: {sorted(allowed)}"
        )


def can_transition(from_phase: str | None, to_phase: str) -> bool:
    to_p = assert_valid_phase(to_phase)
    if not from_phase:
        return True
    from_p = assert_valid_phase(from_phase)
    if from_p == to_p:
        return True
    allowed = SUPPLY_FLOW_PHASE_TRANSITIONS.get(from_p, frozenset())
    return to_p in allowed


def set_operational_phase(
    db: Session,
    *,
    delivery: InboundDelivery,
    to_phase: str,
    user_id: int | None = None,
    source: str = PHASE_HISTORY_SOURCE_SYSTEM,
    comment: str | None = None,
    is_automatic: bool = True,
    force: bool = False,
    now: datetime | None = None,
) -> SupplyFlowPhaseHistory:
    """
    Persist operational phase + history row.

    Does not mutate purchase ``status``. Validates transition graph and
    purchase×phase matrix (unless ``force=True``).
    """
    to_p = assert_valid_phase(to_phase)
    from_p = (delivery.operational_phase or "").strip().upper() or None
    if from_p and from_p not in SUPPLY_FLOW_PHASES:
        from_p = None
    if not force and not can_transition(from_p, to_p):
        raise SupplyFlowLifecycleError(
            f"Niedozwolone przejście fazy Supply Flow: {from_p or '—'} → {to_p}"
        )
    if not force:
        assert_purchase_phase_combination_allowed(delivery.status, to_p)

    ts = now or datetime.utcnow()
    delivery.operational_phase = to_p
    delivery.operational_phase_changed_at = ts

    row = SupplyFlowPhaseHistory(
        tenant_id=int(delivery.tenant_id),
        delivery_id=int(delivery.id),
        from_phase=from_p,
        to_phase=to_p,
        changed_at=ts,
        user_id=user_id,
        source=(source or PHASE_HISTORY_SOURCE_SYSTEM).strip()[:64],
        comment=(comment or None),
        is_automatic=bool(is_automatic),
    )
    db.add(row)
    db.flush()
    return row
