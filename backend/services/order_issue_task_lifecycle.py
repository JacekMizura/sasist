"""
Lifecycle Braki WMS — idempotentny upsert tasków, linie operacyjne, auto-close, priorytet.

Task + task_items = aktualny stan operacyjny.
Fulfillment events = historia (nie źródło kolejki).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Literal

from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_issue_task import OrderIssueTask
from ..models.order_issue_task_item import OrderIssueTaskItem
from ..services.fulfillment_event_service import line_picked_sum_for_order
from ..services.order_issue_task_service import (
    _append_log,
    build_full_issue_payload_for_order,
    consolidate_duplicate_open_issue_tasks,
    mark_task_done,
)

logger = logging.getLogger(__name__)

ACTIVE_SHORTAGE_TASK_STATUSES: tuple[str, ...] = ("OPEN", "IN_PROGRESS", "WAITING_RECOVERY")
ACTIVE_SHORTAGE_TASK_TYPES: tuple[str, ...] = ("SHORTAGE", "MIXED")
TERMINAL_TASK_STATUSES: tuple[str, ...] = ("DONE", "RESOLVED", "READY_FOR_PACKING", "ARCHIVED")

TaskItemStatus = Literal[
    "OPEN",
    "WAITING_RECOVERY",
    "RECOVERED",
    "CANCELLED",
    "REPLACED",
    "SKIPPED",
]

TaskResolveStatus = Literal["RESOLVED", "READY_FOR_PACKING", "DONE"]


def _now() -> datetime:
    return datetime.utcnow()


def ensure_order_issue_task_lifecycle_schema(db: Session) -> None:
    """Ensure task_items table + lifecycle columns on order_issue_tasks."""
    from ..db.schema_introspection import (
        ensure_order_issue_task_items_table,
        ensure_order_issue_tasks_lifecycle_columns,
        ensure_wms_picking_shortage_settings_columns,
        get_engine,
    )

    bind = db.get_bind()
    if bind is None:
        return
    try:
        engine = get_engine(bind)
    except TypeError:
        return
    ensure_order_issue_task_items_table(engine)
    ensure_order_issue_tasks_lifecycle_columns(engine)
    ensure_wms_picking_shortage_settings_columns(engine)


def _query_active_shortage_task(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    for_update: bool = False,
) -> OrderIssueTask | None:
    q = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
            OrderIssueTask.order_id == int(order_id),
            OrderIssueTask.status.in_(ACTIVE_SHORTAGE_TASK_STATUSES),
            OrderIssueTask.type.in_(ACTIVE_SHORTAGE_TASK_TYPES),
        )
        .order_by(OrderIssueTask.id.desc())
    )
    if for_update:
        try:
            q = q.with_for_update()
        except Exception:
            pass
    return q.first()


def _consolidate_duplicates_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> OrderIssueTask | None:
    """Zostaw najnowsze OPEN zadanie dla zamówienia; pozostałe zamknij."""
    rows = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
            OrderIssueTask.order_id == int(order_id),
            OrderIssueTask.status.in_(ACTIVE_SHORTAGE_TASK_STATUSES),
        )
        .order_by(OrderIssueTask.id.desc())
        .all()
    )
    if not rows:
        return None
    keeper = rows[0]
    for dup in rows[1:]:
        _merge_task_snapshots(keeper, dup)
        mark_task_done(db, dup, "Duplikat zadania braków — scalono w kolejce")
        logger.info(
            "[braki.dedupe.order] closed duplicate task_id=%s kept=%s order_id=%s",
            int(dup.id),
            int(keeper.id),
            order_id,
        )
    return keeper


def _merge_task_snapshots(keeper: OrderIssueTask, dup: OrderIssueTask) -> None:
    """Best-effort merge JSON snapshots before closing duplicate."""
    import json

    try:
        km = json.loads(keeper.missing_items or "[]")
        dm = json.loads(dup.missing_items or "[]")
        if isinstance(km, list) and isinstance(dm, list):
            by_line: dict[int, dict[str, Any]] = {}
            for row in km + dm:
                if isinstance(row, dict) and row.get("order_item_id") is not None:
                    by_line[int(row["order_item_id"])] = row
            keeper.missing_items = json.dumps(list(by_line.values()), ensure_ascii=False)
    except json.JSONDecodeError:
        pass


def _store_task_priority(db: Session, task: OrderIssueTask, order: Order) -> None:
    from .recovery_intelligence import compute_shortage_priority
    from .recovery_workflow_service import resolve_order_recovery_state

    try:
        st = resolve_order_recovery_state(db, order, log=False)
        pr = compute_shortage_priority(db, order, st, task=task)
        task.priority_score = int(pr.get("shortage_priority_score") or 0)
        task.priority_level = str(pr.get("shortage_priority_level") or "NORMAL")
    except Exception:
        logger.exception("[braki.task.priority] task_id=%s order_id=%s", task.id, order.id)
        if getattr(task, "priority_level", None) is None:
            task.priority_level = "NORMAL"
            task.priority_score = 0


def sync_task_items_from_order(
    db: Session,
    task: OrderIssueTask,
    order: Order,
    *,
    source_event_id: str | None = None,
    source_picking_cart_id: int | None = None,
    source_operator_id: int | None = None,
) -> list[int]:
    """
    Utrzymuje ``order_issue_task_items`` zgodnie z operacyjnym brakiem linii.
    ``recovered_qty`` nigdy nie maleje (race-safe).
    """
    from ..services.order_fulfillment_recompute import compute_line_missing_qty

    ensure_order_issue_task_lifecycle_schema(db)
    touched: list[int] = []
    now = _now()
    missing_rows, picked_rows, _baseline = build_full_issue_payload_for_order(db, order=order)
    picked_by_line = {
        int(r["order_item_id"]): float(r.get("quantity_picked") or 0)
        for r in picked_rows
        if isinstance(r, dict) and r.get("order_item_id") is not None
    }
    active_line_ids: set[int] = set()

    for row in missing_rows:
        if not isinstance(row, dict):
            continue
        oi_id = int(row["order_item_id"])
        pid = int(row["product_id"])
        miss = float(row.get("quantity_missing") or 0)
        if miss <= 1e-9:
            continue
        active_line_ids.add(oi_id)
        picked_qty = float(picked_by_line.get(oi_id, 0))
        item = (
            db.query(OrderIssueTaskItem)
            .filter(
                OrderIssueTaskItem.task_id == int(task.id),
                OrderIssueTaskItem.order_item_id == oi_id,
            )
            .first()
        )
        if item is None:
            item = OrderIssueTaskItem(
                task_id=int(task.id),
                order_item_id=oi_id,
                product_id=pid,
                missing_qty=round(miss, 6),
                recovered_qty=round(min(picked_qty, miss), 6),
                status="OPEN",
                source_event_id=source_event_id,
                source_picking_cart_id=source_picking_cart_id,
                source_operator_id=source_operator_id,
                created_at=now,
                updated_at=now,
            )
            db.add(item)
            db.flush()
        else:
            item.missing_qty = round(miss, 6)
            item.recovered_qty = round(max(float(item.recovered_qty or 0), min(picked_qty, miss)), 6)
            if item.status in ("OPEN", "WAITING_RECOVERY") and item.recovered_qty + 1e-9 >= item.missing_qty:
                item.status = "RECOVERED"
            item.updated_at = now
            if source_event_id and not item.source_event_id:
                item.source_event_id = source_event_id
            if source_picking_cart_id and item.source_picking_cart_id is None:
                item.source_picking_cart_id = source_picking_cart_id
            if source_operator_id and item.source_operator_id is None:
                item.source_operator_id = source_operator_id
        touched.append(int(item.id))

    existing_items = (
        db.query(OrderIssueTaskItem)
        .filter(OrderIssueTaskItem.task_id == int(task.id))
        .all()
    )
    for item in existing_items:
        oi_id = int(item.order_item_id)
        if oi_id in active_line_ids:
            continue
        oi = next((x for x in (order.items or []) if int(x.id) == oi_id), None)
        if oi is None:
            if item.status not in ("CANCELLED", "SKIPPED", "REPLACED"):
                item.status = "CANCELLED"
                item.updated_at = now
            continue
        mq = float(compute_line_missing_qty(db, order, oi))
        picked = float(line_picked_sum_for_order(db, oi_id, order))
        if mq <= 1e-9:
            if item.status not in ("RECOVERED", "CANCELLED", "REPLACED", "SKIPPED"):
                item.status = "RECOVERED"
                item.missing_qty = 0.0
                item.recovered_qty = round(max(float(item.recovered_qty or 0), picked), 6)
                item.updated_at = now
        else:
            item.missing_qty = round(mq, 6)
            item.recovered_qty = round(max(float(item.recovered_qty or 0), min(picked, mq)), 6)
            item.updated_at = now

    return touched


def recompute_task_aggregate_from_items(db: Session, task: OrderIssueTask) -> None:
    items = (
        db.query(OrderIssueTaskItem)
        .filter(OrderIssueTaskItem.task_id == int(task.id))
        .all()
    )
    open_items = [i for i in items if i.status in ("OPEN", "WAITING_RECOVERY")]
    if not items:
        return
    if not open_items and all(i.status in ("RECOVERED", "CANCELLED", "REPLACED", "SKIPPED") for i in items):
        task.status = "IN_PROGRESS"
    elif any(i.status == "WAITING_RECOVERY" for i in open_items):
        task.status = "WAITING_RECOVERY"
    task.updated_at = _now()


def resolve_operational_shortage_task(
    db: Session,
    task: OrderIssueTask,
    *,
    status: TaskResolveStatus = "RESOLVED",
    reason: str,
    operator_user_id: int | None = None,
) -> None:
    """Zamknij task operacyjny z audytem — usuwa z aktywnej kolejki."""
    now = _now()
    final = status if status in ("RESOLVED", "READY_FOR_PACKING") else "DONE"
    task.status = final
    task.resolved_at = now
    task.resolve_reason = reason[:64]
    task.resolved_by_user_id = (
        int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    )
    task.updated_at = now
    _append_log(task, reason, "task_resolved")
    _append_log(task, f"resolved_status={final}", "task_resolved")
    logger.info(
        "[braki.task.resolve] task_id=%s order_id=%s status=%s reason=%s",
        int(task.id),
        int(task.order_id),
        final,
        reason,
    )


def maybe_auto_resolve_issue_task(
    db: Session,
    task: OrderIssueTask,
    order: Order,
    *,
    operator_user_id: int | None = None,
) -> bool:
    """Auto-close gdy zamówienie nie wymaga już obsługi braków."""
    from ..services.order_fulfillment_recompute import order_requires_shortage_handling
    from .recovery_workflow_service import can_order_be_packed

    if order_requires_shortage_handling(db, order):
        return False
    if can_order_be_packed(db, order, require_physical_pack=False):
        resolve_operational_shortage_task(
            db,
            task,
            status="READY_FOR_PACKING",
            reason="Wszystkie braki rozliczone — gotowe do pakowania",
            operator_user_id=operator_user_id,
        )
    else:
        resolve_operational_shortage_task(
            db,
            task,
            status="RESOLVED",
            reason="Braki rozliczone operacyjnie",
            operator_user_id=operator_user_id,
        )
    return True


def upsert_operational_shortage_task(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    shortage_product_id: int | None = None,
    source_event_id: str | None = None,
    source_picking_cart_id: int | None = None,
    source_operator_id: int | None = None,
    log_kind: str = "shortage_reported",
) -> int:
    """
    Idempotentny upsert — max 1 aktywny task SHORTAGE per zamówienie + magazyn.
    Aktualizuje snapshot JSON + ``order_issue_task_items``.
    """
    import json

    ensure_order_issue_task_lifecycle_schema(db)
    oid = int(order.id)
    _consolidate_duplicates_for_order(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), order_id=oid
    )
    existing = _query_active_shortage_task(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=oid,
        for_update=True,
    )
    missing, picked, baseline = build_full_issue_payload_for_order(db, order=order)
    now = _now()
    payload_missing = json.dumps(missing, ensure_ascii=False)
    payload_picked = json.dumps(picked, ensure_ascii=False)
    payload_base = json.dumps(baseline, ensure_ascii=False)

    if existing:
        existing.type = "SHORTAGE"
        existing.missing_items = payload_missing
        existing.picked_items = payload_picked
        existing.baseline_order_lines_json = payload_base
        existing.updated_at = now
        if existing.status not in ACTIVE_SHORTAGE_TASK_STATUSES:
            existing.status = "OPEN"
        msg = (
            f"Zaktualizowano braki (SKU #{int(shortage_product_id)})"
            if shortage_product_id is not None
            else "Zaktualizowano braki — synchronizacja operacyjna"
        )
        _append_log(existing, msg, log_kind)
        task = existing
    else:
        task = OrderIssueTask(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=oid,
            type="SHORTAGE",
            status="OPEN",
            missing_items=payload_missing,
            picked_items=payload_picked,
            baseline_order_lines_json=payload_base,
            logs_json="[]",
            created_at=now,
            updated_at=now,
        )
        db.add(task)
        db.flush()
        _append_log(task, "Utworzono zadanie operacyjne Braki WMS", log_kind)

    _store_task_priority(db, task, order)
    sync_task_items_from_order(
        db,
        task,
        order,
        source_event_id=source_event_id,
        source_picking_cart_id=source_picking_cart_id,
        source_operator_id=source_operator_id,
    )
    recompute_task_aggregate_from_items(db, task)
    return int(task.id)


def upsert_operational_shortage_tasks_for_orders(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_ids: list[int],
    shortage_product_id: int,
    source_event_id: str | None = None,
    source_picking_cart_id: int | None = None,
    source_operator_id: int | None = None,
) -> list[int]:
    if not order_ids:
        return []
    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(
            Order.id.in_(list(dict.fromkeys(order_ids))),
            Order.deleted_at.is_(None),
        )
        .all()
    )
    out: list[int] = []
    for order in orders:
        tid = upsert_operational_shortage_task(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order=order,
            shortage_product_id=int(shortage_product_id),
            source_event_id=source_event_id or f"wms_report_shortage:product:{shortage_product_id}",
            source_picking_cart_id=source_picking_cart_id,
            source_operator_id=source_operator_id,
        )
        out.append(tid)
    return out


def sync_open_issue_tasks_lifecycle(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> None:
    """Dedup + auto-resolve przed listą kolejki Braki."""
    ensure_order_issue_task_lifecycle_schema(db)
    purge_stale = consolidate_duplicate_open_issue_tasks
    purge_stale(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    rows = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
            OrderIssueTask.status.in_(ACTIVE_SHORTAGE_TASK_STATUSES),
        )
        .all()
    )
    if not rows:
        return
    order_ids = list({int(t.order_id) for t in rows})
    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id.in_(order_ids), Order.deleted_at.is_(None))
        .all()
    )
    order_map = {int(o.id): o for o in orders}
    for task in rows:
        order = order_map.get(int(task.order_id))
        if order is None:
            mark_task_done(db, task, "Zamówienie usunięte — zamknięto zadanie braków")
            continue
        maybe_auto_resolve_issue_task(db, task, order)
