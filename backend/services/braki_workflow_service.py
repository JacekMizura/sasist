"""Agregacja statusu workflow kolejki Braki (jeden status na zamówienie)."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ..models.order import Order
from .order_issue_task_service import count_issue_queue_operational_lines
from .order_fulfillment_recompute import (
    order_has_waiting_for_stock_lines,
    order_item_needs_substitute_pick_completion,
)
from .wms_recovery_pick_service import (
    get_open_recovery_task_for_order,
    order_has_waiting_customer_line,
)

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
    BRAKI_FILTER_RELOCATION: "Do rozlokowania",
    BRAKI_FILTER_RELOCATION_PARTIAL: "Do częściowego rozlokowania",
    BRAKI_FILTER_PICK: "Produkty do zebrania z magazynu",
    BRAKI_FILTER_READY_PACK: "Gotowe do pakowania",
    BRAKI_FILTER_PICK_AND_RELOCATION: "Produkty do zebrania oraz rozlokowania",
}


def _order_relocation_alloc_states(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> tuple[int, int, int]:
    """(pending, partial, done) alokacji rozlokowania dla zamówienia."""
    from .wms_relocation_workflow import find_relocation_task_for_order
    from .wms_operational_task_service import _allocation_row_status, _json_loads

    task = find_relocation_task_for_order(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
    )
    if task is None:
        return 0, 0, 0
    payload = _json_loads(getattr(task, "payload_json", None), {})
    if not isinstance(payload, dict):
        return 0, 0, 0
    pending = partial = done = 0
    oid = int(order_id)
    for raw in payload.get("allocations") or []:
        if not isinstance(raw, dict) or int(raw.get("order_id") or 0) != oid:
            continue
        st = _allocation_row_status(raw)
        if st == "pending":
            pending += 1
        elif st == "partial":
            partial += 1
        else:
            done += 1
    return pending, partial, done


def order_needs_warehouse_pick(db: Session, order: Order, *, r_pend: int) -> bool:
    if int(r_pend) > 0:
        return True
    if get_open_recovery_task_for_order(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
    ):
        return True
    for oi in order.items or []:
        if order_item_needs_substitute_pick_completion(db, order, oi):
            return True
    return False


def resolve_braki_workflow_status(
    db: Session,
    order: Order,
    *,
    u_short: int | None = None,
    r_pend: int | None = None,
) -> str:
    """
    Jeden główny status operacyjny zamówienia w kolejce Braki.
    Priorytet: oczekujące → pick+reloc → częściowe rozlokowanie → rozlokowanie → zbieranie → pakowanie.
    """
    if u_short is None or r_pend is None:
        u_short, r_pend = count_issue_queue_operational_lines(db, order)
    u_short = int(u_short)
    r_pend = int(r_pend)

    awaiting = (
        u_short > 0
        or order_has_waiting_customer_line(order)
        or order_has_waiting_for_stock_lines(order)
    )
    needs_pick = order_needs_warehouse_pick(db, order, r_pend=r_pend)
    reloc_pending, reloc_partial, _reloc_done = _order_relocation_alloc_states(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
    )
    needs_reloc = reloc_pending > 0
    needs_reloc_partial = reloc_partial > 0

    if awaiting:
        status = BRAKI_FILTER_AWAITING
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
    else:
        status = BRAKI_FILTER_READY_PACK

    logger.info(
        "[braki.workflow] order_id=%s workflow_status=%s reason=resolve u_short=%s r_pend=%s "
        "reloc_p=%s reloc_part=%s needs_pick=%s awaiting=%s",
        getattr(order, "id", None),
        status,
        u_short,
        r_pend,
        reloc_pending,
        reloc_partial,
        needs_pick,
        awaiting,
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
