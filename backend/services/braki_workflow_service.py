"""Agregacja statusu workflow kolejki Braki (jeden status na zamówienie)."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ..models.order import Order
from .order_issue_task_service import count_issue_queue_operational_lines
logger = logging.getLogger(__name__)

# Identyfikatory filtrów (API + frontend) — jeden główny status na zamówienie.
BRAKI_FILTER_ALL = "all"
BRAKI_FILTER_AWAITING = "awaiting"
BRAKI_FILTER_RELOCATION = "relocation"
BRAKI_FILTER_RELOCATION_PARTIAL = "relocation_partial"
BRAKI_FILTER_PICK = "pick"
BRAKI_FILTER_READY_PACK = "ready_pack"
BRAKI_FILTER_PICK_AND_RELOCATION = "pick_and_relocation"

BRAKI_FILTER_IDS: tuple[str, ...] = (
    BRAKI_FILTER_ALL,
    BRAKI_FILTER_AWAITING,
    BRAKI_FILTER_RELOCATION,
    BRAKI_FILTER_RELOCATION_PARTIAL,
    BRAKI_FILTER_PICK,
    BRAKI_FILTER_READY_PACK,
    BRAKI_FILTER_PICK_AND_RELOCATION,
)

BRAKI_FILTER_LABELS_PL: dict[str, str] = {
    BRAKI_FILTER_ALL: "Wszystkie statusy",
    BRAKI_FILTER_AWAITING: "Oczekujące",
    BRAKI_FILTER_RELOCATION: "Rozlokowanie produktów",
    BRAKI_FILTER_RELOCATION_PARTIAL: "Częściowe rozlokowanie produktów",
    BRAKI_FILTER_PICK: "Produkty do zebrania z magazynu",
    BRAKI_FILTER_READY_PACK: "Gotowe do pakowania",
    BRAKI_FILTER_PICK_AND_RELOCATION: "Zbieranie i rozlokowanie produktów",
}


def order_needs_warehouse_pick(db: Session, order: Order, *, r_pend: int) -> bool:
    """Delegacja do ``has_recovery_pick_work`` (resolver SSOT)."""
    from .recovery_workflow_service import resolve_order_recovery_state

    _ = r_pend  # legacy callers pass line count; resolver is authoritative
    return resolve_order_recovery_state(db, order, log=False).has_recovery_pick_work


def resolve_braki_workflow_status(
    db: Session,
    order: Order,
    *,
    u_short: int | None = None,
    r_pend: int | None = None,
    previous_status: str | None = None,
    rec_state: Any | None = None,
) -> str:
    """
    Jeden główny status operacyjny zamówienia w kolejce Braki.
    Priorytet: pakowanie → zbieranie/rozlokowanie → decyzja OMS (tylko po eskalacji).
    """
    if u_short is None or r_pend is None:
        u_short, r_pend = count_issue_queue_operational_lines(db, order)
    u_short = int(u_short)
    r_pend = int(r_pend)

    if rec_state is None:
        from .recovery_workflow_service import resolve_order_recovery_state

        rec_state = resolve_order_recovery_state(db, order, log=False)
    needs_pick = rec_state.has_recovery_pick_work
    needs_reloc_partial = rec_state.relocation_alloc_partial > 0
    needs_reloc = rec_state.has_pending_relocation and not needs_reloc_partial
    pack_ready = rec_state.packing_allowed
    pending_oms = rec_state.totals.oms_decision_lines > 0
    recovery_possible = needs_pick

    if pack_ready and not pending_oms:
        status = BRAKI_FILTER_READY_PACK
    elif needs_pick and (needs_reloc or needs_reloc_partial):
        status = BRAKI_FILTER_PICK_AND_RELOCATION
    elif needs_reloc_partial and not needs_pick:
        status = BRAKI_FILTER_RELOCATION_PARTIAL
    elif needs_reloc_partial and needs_pick:
        status = BRAKI_FILTER_PICK_AND_RELOCATION
    elif needs_reloc:
        status = BRAKI_FILTER_RELOCATION
    elif needs_pick:
        status = BRAKI_FILTER_PICK
    elif pending_oms:
        status = BRAKI_FILTER_AWAITING
    elif pack_ready:
        status = BRAKI_FILTER_READY_PACK
    elif rec_state.has_recovery_pick_work:
        status = BRAKI_FILTER_PICK
    elif rec_state.has_pending_relocation:
        status = BRAKI_FILTER_RELOCATION
    else:
        status = BRAKI_FILTER_AWAITING

    if status == BRAKI_FILTER_READY_PACK and not rec_state.packing_allowed:
        if pending_oms:
            status = BRAKI_FILTER_AWAITING
        elif needs_pick:
            status = BRAKI_FILTER_PICK
        else:
            status = BRAKI_FILTER_AWAITING

    shortage_exists = (
        pending_oms
        or rec_state.totals.recovery_lines > 0
        or rec_state.totals.oms_decision_lines > 0
    )
    logger.info(
        "[wms.issue.state_transition] order_id=%s previous_status=%s next_status=%s "
        "shortage_exists=%s escalation_sent=%s recovery_possible=%s unresolved_count=%s r_pend=%s",
        getattr(order, "id", None),
        previous_status or "—",
        status,
        shortage_exists,
        pending_oms,
        recovery_possible,
        u_short,
        r_pend,
    )
    logger.debug(
        "[braki.workflow] order_id=%s workflow_status=%s u_short=%s r_pend=%s "
        "reloc_p=%s reloc_part=%s needs_pick=%s pending_oms=%s resolved=%s",
        getattr(order, "id", None),
        status,
        u_short,
        r_pend,
        rec_state.relocation_alloc_pending,
        rec_state.relocation_alloc_partial,
        needs_pick,
        pending_oms,
        rec_state.packing_allowed,
    )
    return status


def braki_workflow_status_label(status_id: str) -> str:
    return BRAKI_FILTER_LABELS_PL.get(str(status_id or "").strip(), str(status_id or "").strip() or "—")


def compute_braki_filter_counts(items: list[Any]) -> dict[str, int]:
    """Liczniki filtrów dla listy już zdeduplikowanej (po order_id)."""
    counts: dict[str, int] = {fid: 0 for fid in BRAKI_FILTER_IDS if fid != BRAKI_FILTER_ALL}
    for it in items:
        if isinstance(it, dict):
            ws = str(it.get("braki_workflow_status") or "").strip()
        else:
            ws = str(getattr(it, "braki_workflow_status", None) or "").strip()
        if ws in counts:
            counts[ws] += 1
    counts[BRAKI_FILTER_ALL] = len(items)
    return counts
