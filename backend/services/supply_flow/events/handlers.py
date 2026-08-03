"""Event side-effects owned by the pipeline (not by WMS modules). No algorithms."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ....models.inbound_delivery import InboundDelivery
from ..constants import (
    PHASE_HISTORY_SOURCE_PUTAWAY,
    PHASE_HISTORY_SOURCE_RECEIVING,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_ZAKONCZONA,
)
from ..orchestration import advance_toward_phase
from .types import (
    EVENT_PUTAWAY_FINISHED,
    EVENT_UNLOAD_FINISHED,
    SupplyFlowEvent,
)

logger = logging.getLogger(__name__)


def apply_event_side_effects(db: Session, events: list[SupplyFlowEvent]) -> list[str]:
    """
    Orchestration reactions before recompute.

    Stage 3A: only lifecycle advances for unload / putaway.
    No CTA, recommendations, or priority algorithms.
    """
    applied: list[str] = []
    # Process highest-signal lifecycle events once per delivery.
    seen_unload: set[int] = set()
    seen_putaway: set[int] = set()

    ordered = sorted(events, key=lambda e: e.priority())
    for ev in ordered:
        if ev.event_type == EVENT_UNLOAD_FINISHED and ev.delivery_id is not None:
            if ev.delivery_id in seen_unload:
                continue
            seen_unload.add(ev.delivery_id)
            delivery = _load_delivery(db, tenant_id=ev.tenant_id, delivery_id=ev.delivery_id)
            if delivery is None:
                continue
            steps = advance_toward_phase(
                db,
                delivery=delivery,
                target_phase=SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
                source=PHASE_HISTORY_SOURCE_RECEIVING,
                comment=f"event {ev.event_type} pz={ev.pz_id}",
            )
            applied.extend(steps)
        elif ev.event_type == EVENT_PUTAWAY_FINISHED and ev.delivery_id is not None:
            if ev.delivery_id in seen_putaway:
                continue
            seen_putaway.add(ev.delivery_id)
            delivery = _load_delivery(db, tenant_id=ev.tenant_id, delivery_id=ev.delivery_id)
            if delivery is None:
                continue
            steps = advance_toward_phase(
                db,
                delivery=delivery,
                target_phase=SUPPLY_FLOW_PHASE_ZAKONCZONA,
                source=PHASE_HISTORY_SOURCE_PUTAWAY,
                comment=f"event {ev.event_type} pz={ev.pz_id}",
            )
            applied.extend(steps)
    return applied


def _load_delivery(db: Session, *, tenant_id: int, delivery_id: int) -> InboundDelivery | None:
    return (
        db.query(InboundDelivery)
        .filter(
            InboundDelivery.id == int(delivery_id),
            InboundDelivery.tenant_id == int(tenant_id),
        )
        .first()
    )
