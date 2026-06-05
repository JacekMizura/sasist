"""Dogrywka zbierki (recovery_pick) — zadanie operacyjne WMS po decyzji OMS."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Literal

from sqlalchemy.orm import Session, joinedload

logger = logging.getLogger(__name__)

from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from ..models.wms_recovery_pick_task import WmsRecoveryPickTask
from .fulfillment_event_service import line_picked_sum_for_order
from .order_fulfillment_recompute import (
    compute_line_missing_qty,
    order_has_pending_replacement_picking,
    order_item_needs_substitute_pick_completion,
    recompute_order_fulfillment,
)
from .order_issue_task_service import count_issue_queue_operational_lines

OmsPatchKind = Literal["replace_product", "remove_missing", "waiting_for_stock", "other"]


def _order_item_meta_dict(item: OrderItem) -> dict[str, Any]:
    raw = getattr(item, "metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def order_has_waiting_customer_line(order: Order) -> bool:
    """OMS oznaczył „czeka na towar” na którejkolwiek linii."""
    for oi in order.items or []:
        if _order_item_meta_dict(oi).get("oms_waiting_for_stock"):
            return True
    return False


def braki_queue_bucket(db: Session, order: Order, *, u_short: int, r_pend: int) -> str:
    """
    Etykieta kolejki Braki — rozdzielenie stanu operacyjnego od statusu OMS.
    waiting_customer | awaiting_oms | recovery_ready | ready_pack
    """
    from .braki_workflow_service import BRAKI_FILTER_READY_PACK, resolve_braki_workflow_status

    workflow = resolve_braki_workflow_status(db, order, u_short=int(u_short), r_pend=int(r_pend))
    if workflow == BRAKI_FILTER_READY_PACK:
        return "ready_pack"
    if order_has_waiting_customer_line(order):
        return "waiting_customer"
    from .braki_order_state_service import order_has_pending_shortage_decision
    from .braki_workflow_service import order_needs_warehouse_pick

    if order_has_pending_shortage_decision(db, order):
        return "awaiting_oms"
    if int(r_pend) > 0 or order_needs_warehouse_pick(db, order, r_pend=int(r_pend)):
        return "recovery_ready"
    from .braki_order_state_service import order_can_show_ready_pack

    if order_can_show_ready_pack(db, order):
        return "ready_pack"
    if order_has_waiting_customer_line(order):
        return "waiting_customer"
    return "recovery_ready"


def _line_skipped_for_recovery(oi: OrderItem) -> bool:
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


def get_unresolved_recovery_lines(
    db: Session,
    order: Order,
    *,
    session_cart_id: int | None = None,
    log: bool = True,
) -> list[dict[str, Any]]:
    """
    Jedno źródło prawdy: linie z pozostałą pracą zbierkową (dogrywka).
    Używane przez kolejkę Braki, finalize-cart, listę recovery i liczniki.
    """
    from .braki_order_state_service import order_line_pick_still_possible, order_line_requires_oms_decision
    from .order_fulfillment_recompute import line_closed_for_picking_finalize, line_shortage_qty_for_picking_finalize
    from .fulfillment_event_service import sum_pick_events_for_line_cart

    oid = int(order.id)
    cid = int(session_cart_id) if session_cart_id is not None and int(session_cart_id) > 0 else None
    out: list[dict[str, Any]] = []

    for oi in sorted(order.items or [], key=lambda x: int(x.id)):
        if _line_skipped_for_recovery(oi):
            continue

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
        shortage_cart = (
            float(line_shortage_qty_for_picking_finalize(db, order, oi, session_cart_id=cid, picked=picked_cart))
            if cid is not None
            else float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
        )

        recovery_eligible = False
        unresolved_qty = 0.0

        if order_line_requires_oms_decision(db, order, oi):
            recovery_eligible = False
        elif cid is not None and line_closed_for_picking_finalize(
            db, order, oi, session_cart_id=cid, picked=picked_cart
        ):
            recovery_eligible = False
        elif order_item_needs_substitute_pick_completion(db, order, oi, session_cart_id=cid):
            recovery_eligible = True
            unresolved_qty = max(0.0, round(ordered - picked, 6))
        elif order_line_pick_still_possible(db, order, oi):
            recovery_eligible = True
            gap = max(0.0, ordered - picked)
            uncovered = max(0.0, gap - shortage_cart)
            unresolved_qty = round(uncovered, 6)

        row = {
            "order_id": oid,
            "order_item_id": int(oi.id),
            "product_id": int(oi.product_id),
            "ordered_qty": round(ordered, 6),
            "picked_qty": round(picked, 6),
            "picked_cart_qty": round(picked_cart, 6),
            "removed_qty": round(removed, 6),
            "replacement_qty": round(replaced, 6),
            "shortage_cart_qty": round(shortage_cart, 6),
            "missing_operational_qty": round(missing_op, 6),
            "unresolved_qty": unresolved_qty,
            "recovery_eligible": recovery_eligible,
        }
        if log:
            logger.info(
                "[wms.recovery.lines] order_id=%s line_id=%s product_id=%s "
                "ordered_qty=%s picked_qty=%s removed_qty=%s replacement_qty=%s "
                "unresolved_qty=%s recovery_eligible=%s",
                oid,
                int(oi.id),
                int(oi.product_id),
                row["ordered_qty"],
                row["picked_qty"],
                row["removed_qty"],
                row["replacement_qty"],
                row["unresolved_qty"],
                recovery_eligible,
            )
        if recovery_eligible and unresolved_qty > 1e-9:
            out.append(row)

    return out


def log_recovery_lines_for_order(
    db: Session,
    order: Order,
    *,
    session_cart_id: int | None = None,
) -> list[dict[str, Any]]:
    """Wymusza log ``[wms.recovery.lines]`` i zwraca nierozwiązane linie dogrywki."""
    return get_unresolved_recovery_lines(db, order, session_cart_id=session_cart_id, log=True)


def _needs_recovery_picking(db: Session, order: Order) -> bool:
    """Pozostała praca magazynowa (zamiennik / TO_PICK) przy braku nierozwiązanych braków OMS na liniach."""
    u, _r = count_issue_queue_operational_lines(db, order)
    if int(u) > 0:
        return False
    if len(get_unresolved_recovery_lines(db, order, log=False)) > 0:
        return True
    if order_has_pending_replacement_picking(db, order):
        return True
    return False


def ensure_recovery_pick_task(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    kind: OmsPatchKind,
) -> WmsRecoveryPickTask | None:
    """
    Po akcji OMS: utwórz / otwórz recovery_pick, jeśli nadal jest co zbierać.
    Dla ``remove_missing`` i ``waiting_for_stock`` — tylko gdy faktycznie zostaje praca magazynowa.
    """
    if kind == "waiting_for_stock":
        return None
    recompute_order_fulfillment(db, int(order.id), commit=False)
    db.refresh(order)
    order = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id == int(order.id))
        .first()
        or order
    )
    if not _needs_recovery_picking(db, order):
        return None

    now = datetime.utcnow()
    row = (
        db.query(WmsRecoveryPickTask)
        .filter(
            WmsRecoveryPickTask.tenant_id == int(tenant_id),
            WmsRecoveryPickTask.warehouse_id == int(warehouse_id),
            WmsRecoveryPickTask.order_id == int(order.id),
        )
        .first()
    )
    if row is None:
        row = WmsRecoveryPickTask(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order.id),
            status="open",
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        db.flush()
        return row
    if row.status != "open":
        row.status = "open"
    row.updated_at = now
    return row


def get_open_recovery_task_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> WmsRecoveryPickTask | None:
    return (
        db.query(WmsRecoveryPickTask)
        .filter(
            WmsRecoveryPickTask.tenant_id == int(tenant_id),
            WmsRecoveryPickTask.warehouse_id == int(warehouse_id),
            WmsRecoveryPickTask.order_id == int(order_id),
            WmsRecoveryPickTask.status == "open",
        )
        .first()
    )


def mark_recovery_task_done(db: Session, task: WmsRecoveryPickTask) -> None:
    task.status = "done"
    task.updated_at = datetime.utcnow()


def order_has_recovery_pick_work(db: Session, order: Order) -> bool:
    """Czy zamówienie ma jeszcze pracę magazynową (dogrywka), bez oczekującej decyzji OMS."""
    u, _r = count_issue_queue_operational_lines(db, order)
    if int(u) > 0:
        return False
    return len(get_unresolved_recovery_lines(db, order, log=False)) > 0


def _recovery_line_stats(db: Session, order: Order) -> dict[str, int]:
    """Liczniki linii dla logów recovery — z ``get_unresolved_recovery_lines``."""
    unresolved_rows = get_unresolved_recovery_lines(db, order, log=False)
    unresolved = len(unresolved_rows)
    removed = 0
    resolved = 0
    for oi in order.items or []:
        if _line_skipped_for_recovery(oi):
            removed += 1
            continue
        if any(int(r["order_item_id"]) == int(oi.id) for r in unresolved_rows):
            continue
        resolved += 1
    return {
        "unresolved_lines_count": unresolved,
        "resolved_lines_count": resolved,
        "removed_lines_count": removed,
    }


def prepare_recovery_picking_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    cart_id: int | None = None,
) -> dict[str, Any]:
    """
    Otwarcie sesji dogrywki z kolejki Braki lub po OMS.
    Tworzy ``WmsRecoveryPickTask`` gdy jest praca do zebrania; nie zwraca 404 gdy brak linii — ``completed=True``.
    """
    recompute_order_fulfillment(db, int(order_id), commit=False)
    order = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(
            Order.id == int(order_id),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if order is None:
        logger.info(
            "[wms.recovery.open] order_id=%s cart_id=%s recovery_mode=recovery ok=false reason=order_not_found",
            order_id,
            cart_id,
        )
        return {
            "ok": False,
            "reason": "order_not_found",
            "completed": False,
            "eligible": False,
        }

    stats = _recovery_line_stats(db, order)
    has_work = order_has_recovery_pick_work(db, order)
    u_short, r_pend = count_issue_queue_operational_lines(db, order)
    task = get_open_recovery_task_for_order(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
    )
    if has_work and task is None:
        task = ensure_recovery_pick_task(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order=order,
            kind="other",
        )

    completed = not has_work
    snap = {
        "ok": True,
        "reason": "completed" if completed else "open",
        "completed": completed,
        "eligible": True,
        "recovery_task_id": int(task.id) if task is not None else None,
        "issue_queue_oms": int(u_short),
        "issue_queue_pick": int(r_pend),
        **stats,
    }
    logger.info(
        "[wms.recovery.open] order_id=%s cart_id=%s recovery_mode=recovery ok=true completed=%s "
        "recovery_task_id=%s unresolved_lines_count=%s removed_lines_count=%s "
        "resolved_lines_count=%s issue_queue_oms=%s issue_queue_pick=%s",
        order_id,
        cart_id,
        completed,
        snap.get("recovery_task_id"),
        stats["unresolved_lines_count"],
        stats["removed_lines_count"],
        stats["resolved_lines_count"],
        u_short,
        r_pend,
    )
    return snap
