"""Phase orchestration toward targets — validates transitions + matrix, never syncs purchase status."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ...models.inbound_delivery import InboundDelivery
from .constants import (
    PHASE_HISTORY_SOURCE_SYSTEM,
    SUPPLY_FLOW_PHASE_AWIZOWANA,
    SUPPLY_FLOW_PHASE_NA_RAMPIE,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_ROZLADUNEK,
    SUPPLY_FLOW_PHASE_ROZLOKOWANIE,
    SUPPLY_FLOW_PHASE_W_DRODZE,
    SUPPLY_FLOW_PHASE_ZAKONCZONA,
)
from .lifecycle import (
    SupplyFlowLifecycleError,
    assert_purchase_phase_combination_allowed,
    can_transition,
    set_operational_phase,
)

logger = logging.getLogger(__name__)

# Preferred happy-path steps toward a target (operational axis only).
_FORWARD_PATH: tuple[str, ...] = (
    SUPPLY_FLOW_PHASE_AWIZOWANA,
    SUPPLY_FLOW_PHASE_W_DRODZE,
    SUPPLY_FLOW_PHASE_NA_RAMPIE,
    SUPPLY_FLOW_PHASE_ROZLADUNEK,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_ROZLOKOWANIE,
    SUPPLY_FLOW_PHASE_ZAKONCZONA,
)


def _phase_index(phase: str | None) -> int:
    p = (phase or SUPPLY_FLOW_PHASE_AWIZOWANA).strip().upper()
    try:
        return _FORWARD_PATH.index(p)
    except ValueError:
        return 0


def next_step_toward(
    current: str | None,
    target: str,
    *,
    purchase_status: str | None = None,
) -> str | None:
    """Single legal hop from current toward target (graph + optional matrix)."""
    cur_i = _phase_index(current)
    tgt_i = _phase_index(target)
    if cur_i >= tgt_i:
        return None
    for candidate in _FORWARD_PATH[cur_i + 1 : tgt_i + 1]:
        if not can_transition(current, candidate):
            continue
        if purchase_status is not None:
            try:
                assert_purchase_phase_combination_allowed(purchase_status, candidate)
            except SupplyFlowLifecycleError:
                continue
        return candidate
    return None


def advance_toward_phase(
    db: Session,
    *,
    delivery: InboundDelivery,
    target_phase: str,
    source: str = PHASE_HISTORY_SOURCE_SYSTEM,
    comment: str | None = None,
    max_steps: int = 8,
) -> list[str]:
    """
    Advance operational_phase step-by-step toward ``target_phase``.

    Stops when blocked by transition graph or purchase×phase matrix.
    Never mutates purchase ``status``.
    """
    applied: list[str] = []
    for _ in range(max_steps):
        nxt = next_step_toward(
            delivery.operational_phase,
            target_phase,
            purchase_status=delivery.status,
        )
        if nxt is None:
            break
        try:
            set_operational_phase(
                db,
                delivery=delivery,
                to_phase=nxt,
                source=source,
                comment=comment,
                is_automatic=True,
            )
            applied.append(nxt)
        except SupplyFlowLifecycleError as exc:
            logger.info(
                "supply_flow.advance blocked delivery=%s %s→%s (%s)",
                delivery.id,
                delivery.operational_phase,
                nxt,
                exc,
            )
            break
    return applied
