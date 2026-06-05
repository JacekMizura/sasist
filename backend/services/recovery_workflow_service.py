"""
Centralny resolver stanu workflow recovery / braki / rozlokowanie / pakowanie.

Jedno źródło prawdy — wszystkie ekrany WMS delegują tutaj zamiast duplikować filtry.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Literal

from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from .fulfillment_event_service import line_picked_sum_for_order, sum_pick_events_for_line_cart

logger = logging.getLogger(__name__)

RecoveryStatus = Literal[
    "none",
    "awaiting_oms",
    "recovery_pending",
    "relocation_pending",
    "ready_pack",
]

_EPS = 1e-9
STATE_VERSION = 1


class RecoveryWorkflowError(Exception):
    """Błąd stanu operacyjnego recovery — mapowany na 400/404/409 w API."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "recovery_state_invalid",
        http_status: int = 400,
        order_id: int | None = None,
        order_item_id: int | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = int(http_status)
        self.order_id = order_id
        self.order_item_id = order_item_id

    def to_api_detail(self) -> dict[str, Any]:
        return {
            "message": self.message,
            "error": self.message,
            "code": self.code,
            "order_id": self.order_id,
            "order_item_id": self.order_item_id,
        }


@dataclass
class RecoveryLineState:
    order_line_id: int
    product_id: int
    ordered_qty: float
    picked_qty: float
    removed_qty: float
    replacement_qty: float
    unresolved_qty: float
    recovery_qty: float
    shortage_reported: bool
    replacement_applied: bool
    relocation_required: bool
    active_recovery: bool
    recovery_completed: bool
    visible_in_queue: bool
    visible_in_recovery_pick: bool
    visible_in_relocation: bool
    visible_in_finalize: bool
    packing_eligible: bool
    finalize_allowed: bool
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RecoveryTotals:
    unresolved_lines: int = 0
    recovery_lines: int = 0
    relocation_lines: int = 0
    oms_decision_lines: int = 0
    packing_blocked_lines: int = 0

    def to_dict(self) -> dict[str, int]:
        return asdict(self)


@dataclass
class OrderRecoveryState:
    order_id: int
    recovery_status: RecoveryStatus
    lines: list[RecoveryLineState] = field(default_factory=list)
    totals: RecoveryTotals = field(default_factory=RecoveryTotals)
    has_recovery_work: bool = False
    has_relocation_work: bool = False
    packing_allowed: bool = False
    finalize_allowed: bool = False
    state_version: int = STATE_VERSION
    state_hash: str = ""
    resolved_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "order_id": self.order_id,
            "recovery_status": self.recovery_status,
            "lines": [ln.to_dict() for ln in self.lines],
            "totals": self.totals.to_dict(),
            "has_recovery_work": self.has_recovery_work,
            "has_relocation_work": self.has_relocation_work,
            "packing_allowed": self.packing_allowed,
            "finalize_allowed": self.finalize_allowed,
            "state_version": self.state_version,
            "state_hash": self.state_hash,
            "resolved_at": self.resolved_at,
        }


def _compute_state_hash(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def log_recovery_state_snapshot(state: OrderRecoveryState, *, tag: str = "recovery.snapshot") -> None:
    logger.info(
        "[%s] order_id=%s state_version=%s state_hash=%s resolved_at=%s "
        "recovery_status=%s packing_allowed=%s finalize_allowed=%s "
        "unresolved_lines=%s recovery_lines=%s relocation_lines=%s snapshot=%s",
        tag,
        state.order_id,
        state.state_version,
        state.state_hash,
        state.resolved_at,
        state.recovery_status,
        state.packing_allowed,
        state.finalize_allowed,
        state.totals.unresolved_lines,
        state.totals.recovery_lines,
        state.totals.relocation_lines,
        state.to_dict(),
    )


def _order_item_meta_dict(item: OrderItem) -> dict[str, Any]:
    raw = getattr(item, "metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def line_skipped_for_recovery(oi: OrderItem) -> bool:
    """Linie wyłączone z workflow recovery (bundle, archiwum, usunięte OMS)."""
    return _line_skipped(oi)


def _line_skipped(oi: OrderItem) -> bool:
    if getattr(oi, "parent_bundle_order_item_id", None) is not None:
        return True
    if bool(getattr(oi, "is_bundle_parent", False)):
        return True
    if order_item_is_replaced_line(oi):
        return True
    if int(oi.quantity or 0) <= 0:
        return True
    if _order_item_meta_dict(oi).get("oms_line_removed"):
        return True
    return False


def _line_relocation_required(
    *,
    ordered: float,
    picked: float,
    removed: float,
    replaced: float,
    meta_removed: bool,
    is_substitute_line: bool,
) -> bool:
    """Rozlokowanie tylko dla fizycznie zebranego towaru po usunięciu / zamienniku — nie zwykły brak."""
    if picked <= _EPS:
        return False
    if meta_removed or removed >= ordered - _EPS:
        return True
    if is_substitute_line and picked > max(0.0, ordered - removed - replaced) + _EPS:
        return True
    if replaced > _EPS and picked > max(0.0, ordered - removed - replaced) + _EPS:
        return True
    return False


def _load_order(db: Session, order_or_id: Order | int) -> Order | None:
    if isinstance(order_or_id, int):
        return (
            db.query(Order)
            .options(joinedload(Order.items))
            .filter(Order.id == int(order_or_id))
            .first()
        )
    items = getattr(order_or_id, "items", None)
    if items is not None:
        return order_or_id
    oid = int(getattr(order_or_id, "id", 0) or 0)
    if oid <= 0:
        return None
    loaded = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id == oid)
        .first()
    )
    return loaded or order_or_id


def resolve_order_recovery_state(
    db: Session,
    order_or_id: Order | int,
    *,
    session_cart_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    log: bool = True,
) -> OrderRecoveryState:
    """
    Kanoniczny stan recovery dla zamówienia — używany przez kolejkę, dogrywkę, finalize, rozlokowanie, pakowanie.
    """
    from .braki_order_state_service import order_line_pick_still_possible, order_line_requires_oms_decision
    from .order_fulfillment_recompute import (
        compute_line_missing_qty,
        line_closed_for_picking_finalize,
        line_shortage_qty_for_picking_finalize,
        order_item_needs_substitute_pick_completion,
    )
    from .wms_relocation_workflow import relocation_alloc_counts_for_order

    order = _load_order(db, order_or_id)
    if order is None:
        raise RecoveryWorkflowError(
            "Zamówienie nie znalezione.",
            code="order_not_found",
            http_status=404,
            order_id=int(order_or_id) if not isinstance(order_or_id, Order) else int(order_or_id.id),
        )

    oid = int(order.id)
    tid = int(tenant_id if tenant_id is not None else getattr(order, "tenant_id", None) or 1)
    wid = int(warehouse_id if warehouse_id is not None else getattr(order, "warehouse_id", None) or 1)
    cid = int(session_cart_id) if session_cart_id is not None and int(session_cart_id) > 0 else None

    reloc_pending, reloc_partial, _reloc_done = relocation_alloc_counts_for_order(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        order_id=oid,
        log_checks=False,
    )
    has_active_relocation_task = int(reloc_pending) + int(reloc_partial) > 0

    line_states: list[RecoveryLineState] = []
    totals = RecoveryTotals()

    for oi in sorted(order.items or [], key=lambda x: int(x.id)):
        if _line_skipped(oi):
            continue

        meta = _order_item_meta_dict(oi)
        meta_removed = bool(meta.get("oms_line_removed"))
        ordered = float(oi.quantity or 0)
        picked = float(line_picked_sum_for_order(db, int(oi.id), order))
        picked_cart = (
            float(sum_pick_events_for_line_cart(db, int(oi.id), cid))
            if cid is not None
            else picked
        )
        removed = float(getattr(oi, "oms_removed_qty", None) or 0.0)
        replaced = float(getattr(oi, "oms_replaced_qty", None) or 0.0)
        missing_op = float(compute_line_missing_qty(db, order, oi, session_cart_id=cid))
        declared_shortage = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
        shortage_cart = (
            float(line_shortage_qty_for_picking_finalize(db, order, oi, session_cart_id=cid, picked=picked_cart))
            if cid is not None
            else declared_shortage
        )
        shortage_reported = declared_shortage > _EPS or shortage_cart > _EPS

        rep_oid = getattr(oi, "replaced_from_order_item_id", None)
        ols_u = str(getattr(oi, "oms_line_status", None) or "").strip().upper()
        is_substitute = (rep_oid is not None and int(rep_oid) > 0) or ols_u == "TO_PICK"
        replacement_applied = replaced > _EPS or is_substitute

        requires_oms = bool(order_line_requires_oms_decision(db, order, oi))
        needs_substitute_pick = bool(order_item_needs_substitute_pick_completion(db, order, oi, session_cart_id=cid))
        line_closed = bool(
            cid is not None
            and line_closed_for_picking_finalize(db, order, oi, session_cart_id=cid, picked=picked_cart)
        )

        recovery_eligible = False
        unresolved_qty = 0.0
        reason = "resolved"

        if requires_oms:
            reason = "awaiting_oms"
        elif line_closed and cid is not None:
            reason = "session_line_closed"
        elif needs_substitute_pick:
            recovery_eligible = True
            fulfillable = max(0.0, ordered - removed - replaced)
            unresolved_qty = max(0.0, round(fulfillable - picked, 6))
            reason = "substitute_pick_pending"
        elif order_line_pick_still_possible(db, order, oi):
            recovery_eligible = True
            fulfillable = max(0.0, ordered - removed - replaced)
            gap = max(0.0, fulfillable - picked)
            uncovered = max(0.0, gap - shortage_cart)
            unresolved_qty = round(uncovered, 6)
            reason = "recovery_pick_pending" if uncovered > _EPS else "shortage_covers_gap"

        recovery_qty = unresolved_qty if recovery_eligible and unresolved_qty > _EPS else 0.0
        active_recovery = recovery_qty > _EPS and not requires_oms
        recovery_completed = not active_recovery and not requires_oms and missing_op <= _EPS

        relocation_required = _line_relocation_required(
            ordered=ordered,
            picked=picked,
            removed=removed,
            replaced=replaced,
            meta_removed=meta_removed,
            is_substitute_line=is_substitute,
        )

        fulfillable = max(0.0, ordered - removed - replaced)
        fully_picked = picked + shortage_cart >= ordered - _EPS or picked >= fulfillable - _EPS
        line_resolved = (
            fully_picked
            or meta_removed
            or removed >= ordered - _EPS
            or (is_substitute and picked >= fulfillable - _EPS)
        )
        blocks_finalize = not line_resolved and not active_recovery and requires_oms
        visible_in_finalize = not _line_skipped(oi)

        visible_in_recovery_pick = active_recovery
        visible_in_queue = requires_oms or active_recovery
        visible_in_relocation = relocation_required or has_active_relocation_task

        packing_eligible = line_resolved and not active_recovery and not requires_oms
        finalize_allowed = (
            packing_eligible
            or active_recovery
            or (shortage_reported and unresolved_qty <= _EPS)
            or (line_closed and cid is not None)
        )

        if requires_oms:
            totals.oms_decision_lines += 1
        if active_recovery:
            totals.recovery_lines += 1
            totals.unresolved_lines += 1
        if relocation_required:
            totals.relocation_lines += 1
        if not packing_eligible:
            totals.packing_blocked_lines += 1

        row = RecoveryLineState(
            order_line_id=int(oi.id),
            product_id=int(oi.product_id or 0),
            ordered_qty=round(ordered, 6),
            picked_qty=round(picked, 6),
            removed_qty=round(removed, 6),
            replacement_qty=round(replaced, 6),
            unresolved_qty=round(unresolved_qty, 6),
            recovery_qty=round(recovery_qty, 6),
            shortage_reported=shortage_reported,
            replacement_applied=replacement_applied,
            relocation_required=relocation_required,
            active_recovery=active_recovery,
            recovery_completed=recovery_completed,
            visible_in_queue=visible_in_queue,
            visible_in_recovery_pick=visible_in_recovery_pick,
            visible_in_relocation=visible_in_relocation,
            visible_in_finalize=visible_in_finalize,
            packing_eligible=packing_eligible,
            finalize_allowed=finalize_allowed,
            reason=reason if not blocks_finalize else "finalize_blocked",
        )
        line_states.append(row)

        if log:
            logger.info(
                "[recovery.state] order_id=%s line_id=%s product_id=%s "
                "ordered_qty=%s picked_qty=%s unresolved_qty=%s recovery_qty=%s "
                "relocation_required=%s active_recovery=%s visible_in_queue=%s "
                "visible_in_recovery_pick=%s visible_in_finalize=%s visible_in_relocation=%s reason=%s",
                oid,
                row.order_line_id,
                row.product_id,
                row.ordered_qty,
                row.picked_qty,
                row.unresolved_qty,
                row.recovery_qty,
                row.relocation_required,
                row.active_recovery,
                row.visible_in_queue,
                row.visible_in_recovery_pick,
                row.visible_in_finalize,
                row.visible_in_relocation,
                row.reason,
            )

    has_recovery_work = totals.recovery_lines > 0 and totals.oms_decision_lines == 0
    has_relocation_work = has_active_relocation_task or totals.relocation_lines > 0
    packing_allowed = (
        totals.packing_blocked_lines == 0
        and totals.oms_decision_lines == 0
        and totals.recovery_lines == 0
        and not has_active_relocation_task
    )
    finalize_allowed = all(ln.finalize_allowed for ln in line_states) if line_states else True

    if totals.oms_decision_lines > 0:
        recovery_status: RecoveryStatus = "awaiting_oms"
    elif has_recovery_work:
        recovery_status = "recovery_pending"
    elif has_relocation_work:
        recovery_status = "relocation_pending"
    elif packing_allowed:
        recovery_status = "ready_pack"
    else:
        recovery_status = "none"

    resolved_at = datetime.utcnow().isoformat() + "Z"
    state = OrderRecoveryState(
        order_id=oid,
        recovery_status=recovery_status,
        lines=line_states,
        totals=totals,
        has_recovery_work=has_recovery_work,
        has_relocation_work=has_relocation_work,
        packing_allowed=packing_allowed,
        finalize_allowed=finalize_allowed,
        state_version=STATE_VERSION,
        resolved_at=resolved_at,
    )
    state.state_hash = _compute_state_hash(
        {
            "order_id": oid,
            "recovery_status": recovery_status,
            "totals": totals.to_dict(),
            "lines": [ln.to_dict() for ln in line_states],
        }
    )
    if log:
        log_recovery_state_snapshot(state, tag="recovery.state.snapshot")
    return state


def get_recovery_pick_lines(
    db: Session,
    order: Order,
    *,
    session_cart_id: int | None = None,
    log: bool = False,
) -> list[dict[str, Any]]:
    """Linie widoczne w dogrywce — kompatybilność wsteczna z ``get_unresolved_recovery_lines``."""
    state = resolve_order_recovery_state(db, order, session_cart_id=session_cart_id, log=log)
    out: list[dict[str, Any]] = []
    for ln in state.lines:
        if not ln.visible_in_recovery_pick or ln.recovery_qty <= _EPS:
            continue
        out.append(
            {
                "order_id": int(state.order_id),
                "order_item_id": int(ln.order_line_id),
                "product_id": int(ln.product_id),
                "ordered_qty": ln.ordered_qty,
                "picked_qty": ln.picked_qty,
                "picked_cart_qty": ln.picked_qty,
                "removed_qty": ln.removed_qty,
                "replacement_qty": ln.replacement_qty,
                "shortage_cart_qty": 0.0,
                "missing_operational_qty": ln.unresolved_qty,
                "unresolved_qty": ln.recovery_qty,
                "recovery_eligible": True,
            }
        )
    return out


def count_recovery_operational_lines(db: Session, order: Order) -> tuple[int, int]:
    """(linie OMS, linie dogrywki) — delegacja do resolvera."""
    state = resolve_order_recovery_state(db, order, log=False)
    return state.totals.oms_decision_lines, state.totals.recovery_lines


def can_order_be_packed(
    db: Session,
    order_or_id: Order | int,
    *,
    session_cart_id: int | None = None,
    require_physical_pack: bool = False,
) -> bool:
    """
    Jedno źródło prawdy: czy zamówienie może wejść / domknąć pakowanie.
    Wymaga braku recovery, OMS, relocation oraz rozliczonych linii.
    """
    state = resolve_order_recovery_state(db, order_or_id, session_cart_id=session_cart_id, log=False)
    if not state.packing_allowed:
        return False
    if not require_physical_pack:
        return True
    order = _load_order(db, order_or_id)
    if order is None:
        return False
    from .braki_order_state_service import order_fully_packed

    return order_fully_packed(db, order)


def order_has_relocation_work(
    db: Session,
    order_or_id: Order | int,
    *,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
) -> bool:
    """Czy zamówienie ma aktywną lub wymaganą pracę rozlokowania — z resolvera."""
    state = resolve_order_recovery_state(
        db,
        order_or_id,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        log=False,
    )
    return bool(state.has_relocation_work)


def sync_relocation_tasks_from_recovery_state(
    db: Session,
    order: Order,
    state: OrderRecoveryState,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_event_id: str,
    picked_from_location: str | None = None,
) -> list[int]:
    """
    Tworzy zadania RELOCATION wyłącznie dla linii z ``relocation_required`` w stanie resolvera.
    Nigdy dla zwykłych braków bez zebranego towaru.
    """
    from .braki_order_state_service import ensure_relocation_for_order_item_picks
    from .wms_relocation_workflow import order_has_active_relocation_work

    oid = int(order.id)
    if order_has_active_relocation_work(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=oid,
        log_checks=False,
    ):
        logger.info(
            "[recovery.relocation.sync] order_id=%s skip=active_task_exists source=%s",
            oid,
            source_event_id,
        )
        return []

    task_ids: list[int] = []
    for ln in state.lines:
        if not ln.relocation_required or ln.picked_qty <= _EPS:
            continue
        ids = ensure_relocation_for_order_item_picks(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order=order,
            order_item_id=int(ln.order_line_id),
            source_event_id=source_event_id,
            picked_from_location=picked_from_location,
        )
        task_ids.extend(ids)
        logger.info(
            "[recovery.relocation.sync] order_id=%s line_id=%s product_id=%s "
            "picked_qty=%s relocation_required=%s task_ids=%s source=%s",
            oid,
            ln.order_line_id,
            ln.product_id,
            ln.picked_qty,
            ln.relocation_required,
            ids,
            source_event_id,
        )
    return task_ids


def validate_order_finalize_allowed(
    state: OrderRecoveryState,
    *,
    order_number: str | int,
) -> None:
    """Walidacja finalize-cart wyłącznie z resolvera — bez duplikowanych filtrów."""
    if state.finalize_allowed:
        return
    blocking = [ln for ln in state.lines if not ln.finalize_allowed]
    first = blocking[0] if blocking else None
    if first is not None and first.reason == "awaiting_oms":
        raise RecoveryWorkflowError(
            f"Zamówienie #{order_number}: wymagana decyzja OMS przed domknięciem wózka.",
            code="oms_decision_required",
            http_status=400,
            order_id=int(state.order_id),
            order_item_id=int(first.order_line_id),
        )
    line_hint = f" (linia {first.order_line_id})" if first is not None else ""
    raise RecoveryWorkflowError(
        f"Zamówienie #{order_number}: nie wszystkie pozycje są domknięte{line_hint}.",
        code="line_not_resolved",
        http_status=400,
        order_id=int(state.order_id),
        order_item_id=int(first.order_line_id) if first is not None else None,
    )
