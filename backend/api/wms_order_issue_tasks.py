"""WMS — lista zadań Order Issues (braki przy zbieraniu)."""

from __future__ import annotations

import json
import logging
import time
from contextlib import contextmanager
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import event
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload, selectinload

from ..auth.deps import get_optional_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.order_issue_task import OrderIssueTask
from ..schemas.order_issue_task import (
    NewProductLineHint,
    OrderIssueDetailLine,
    OrderIssueOrderContext,
    OrderIssueShortageLine,
    OrderIssueTaskArchiveBody,
    OrderIssueTaskDoneBody,
    OrderIssueTaskListItem,
    OrderIssueTaskListResponse,
    OrderIssueTaskLogBody,
    OrderIssueTaskLogEntry,
    OrderIssueTaskSkippedItem,
)
logger = logging.getLogger(__name__)
from ..services.order_fulfillment_recompute import order_requires_shortage_handling
from ..services.order_issue_task_service import (
    build_fallback_shortage_lines_from_task_snapshot,
    build_order_issue_detail_context,
    build_shortage_lines_for_order,
    compute_recommended_action,
    count_issue_queue_operational_lines,
    compute_ui_decision,
    find_order_by_scan,
    first_pending_substitute_product,
    format_braki_issue_summary_line,
    format_issue_queue_status_label,
    format_issue_queue_summary_line,
    log_operator_event,
    mark_task_done,
    archive_order_issue_task,
    order_customer_display_name,
    sync_open_issue_tasks_for_warehouse,
    ensure_order_issue_task_table_schema,
    list_open_order_issue_tasks_for_warehouse,
    order_issue_task_debug_snapshot,
)
from ..services.braki_workflow_service import (
    BRAKI_FILTER_ALL,
    compute_braki_filter_counts,
    resolve_braki_workflow_status,
    braki_workflow_status_label,
)
from ..services.recovery_workflow_service import (
    build_braki_remaining_pick_lines_from_state,
    build_braki_shortage_lines_from_state,
    recovery_state_for_braki_task,
    resolve_order_recovery_state,
)
from ..services.wms_recovery_pick_service import braki_queue_bucket
from ..services.wms_audit_service import complete_wms_operation_session, touch_wms_operation_session

router = APIRouter(prefix="/wms", tags=["WMS order issues"])

_SERIALIZE_ERROR_CODE = "TASK_SERIALIZATION_FAILED"


@contextmanager
def _noop_count():
    yield


@contextmanager
def _count_sql_queries(engine, counter: list[int]):
    """Licznik zapytań SQL w bloku (profilowanie kolejki)."""

    def _before(_conn, _cursor, _statement, _parameters, _context, _executemany):
        counter[0] += 1

    event.listen(engine, "before_cursor_execute", _before)
    try:
        yield
    finally:
        event.remove(engine, "before_cursor_execute", _before)


def _fetch_orders_by_id(
    db: Session,
    order_ids: list[int],
) -> dict[int, Order]:
    """Jedno zapytanie z eager load — bez N+1 w pętli listy."""
    if not order_ids:
        return {}
    rows = (
        db.query(Order)
        .options(
            joinedload(Order.order_ui_status),
            joinedload(Order.customer),
            selectinload(Order.items).joinedload(OrderItem.product),
        )
        .filter(Order.id.in_(order_ids), Order.deleted_at.is_(None))
        .all()
    )
    return {int(o.id): o for o in rows}


def _public_serialize_error_message(exc: Exception) -> str:
    """Never expose raw Python tracebacks / NameError text to API clients."""
    if isinstance(exc, NameError):
        return "Nie udało się zbudować karty zadania (błąd wewnętrzny mapowania)."
    if isinstance(exc, (KeyError, AttributeError, TypeError)):
        return "Nie udało się zbudować karty zadania (niekompletne dane zamówienia)."
    msg = str(exc).strip()
    if not msg or msg.startswith("name ") and " is not defined" in msg:
        return "Nie udało się zbudować karty zadania braków."
    if len(msg) > 200 or "Traceback" in msg or "File \"" in msg:
        return "Nie udało się zbudować karty zadania braków."
    return msg[:200]


def _missing_skus_label(missing: list[dict]) -> str:
    parts: list[str] = []
    for m in missing[:12]:
        sku = str(m.get("sku") or m.get("ean") or m.get("product_id") or "").strip()
        q = m.get("quantity_missing")
        if sku and q is not None:
            parts.append(f"{sku}×{q}")
        elif sku:
            parts.append(sku)
    if len(missing) > 12:
        parts.append("…")
    return ", ".join(parts) if parts else "—"


def _parse_task_json_lists(t: OrderIssueTask) -> tuple[list[dict], list[dict], list[OrderIssueTaskLogEntry]]:
    try:
        missing = json.loads(t.missing_items or "[]")
    except json.JSONDecodeError:
        missing = []
    try:
        picked = json.loads(t.picked_items or "[]")
    except json.JSONDecodeError:
        picked = []
    if not isinstance(missing, list):
        missing = []
    if not isinstance(picked, list):
        picked = []
    try:
        logs_raw = json.loads(t.logs_json or "[]")
    except json.JSONDecodeError:
        logs_raw = []
    logs: list[OrderIssueTaskLogEntry] = []
    if isinstance(logs_raw, list):
        for e in logs_raw:
            if not isinstance(e, dict):
                continue
            logs.append(
                OrderIssueTaskLogEntry(
                    at=str(e.get("at") or ""),
                    message=str(e.get("message") or ""),
                    kind=str(e.get("kind") or ""),
                )
            )
    return missing, picked, logs


def _shortage_session_metadata(t: OrderIssueTask, item: OrderIssueTaskListItem | None = None) -> dict:
    total = float(len(item.shortage_lines) if item is not None else 1)
    done = 0.0 if str(t.status or "").upper() == "OPEN" else total
    return {
        "screen": "order_issue_task",
        "task_id": int(t.id),
        "order_id": int(t.order_id),
        "task_type": str(t.type or ""),
        "status": str(t.status or ""),
        "progress_done": done,
        "progress_total": total,
        "progress_percent": int(round((done / total) * 100)) if total > 0 else 0,
    }


def serialize_order_issue_task_item(
    db: Session,
    t: OrderIssueTask,
    o: Order | None,
) -> OrderIssueTaskListItem:
    missing, picked, logs = _parse_task_json_lists(t)
    ui_name = None
    if o and o.order_ui_status is not None:
        ui_name = str(o.order_ui_status.name or "").strip() or None
    rec = compute_recommended_action(db, task=t, order=o)
    ui_kind, hint_rows = compute_ui_decision(db, task=t, order=o)
    hint_models = [NewProductLineHint.model_validate(h) for h in hint_rows]
    shortage_line_models: list[OrderIssueShortageLine] = []
    order_context_model = OrderIssueOrderContext()
    u_short = 0
    r_pend = 0
    sub_pid = 0
    sub_name = ""
    from ..services.braki_order_state_service import build_order_issue_customer_fields

    cust_fields = build_order_issue_customer_fields(o)
    cust_name = cust_fields.get("customer_name") or order_customer_display_name(o)
    summary_line = ""
    status_line = ""
    bucket = "awaiting_oms"
    workflow_status = "awaiting"
    workflow_label = braki_workflow_status_label(workflow_status)
    if o is not None:
        from ..services.recovery_workflow_service import repair_order_relocation_consistency

        repair_order_relocation_consistency(
            db,
            o,
            tenant_id=int(t.tenant_id),
            warehouse_id=int(t.warehouse_id),
            source_event_id=f"braki.api.serialize:{int(t.id)}",
        )
        u_short, r_pend = count_issue_queue_operational_lines(db, o)
        bucket = braki_queue_bucket(db, o, u_short=u_short, r_pend=r_pend)
        workflow_status = resolve_braki_workflow_status(db, o, u_short=u_short, r_pend=r_pend)
        workflow_label = braki_workflow_status_label(workflow_status)
        from ..services.wms_recovery_pick_service import order_has_waiting_customer_line

        from ..services.braki_order_state_service import order_has_waiting_for_stock_lines as braki_waiting_stock

        oms_wait = order_has_waiting_customer_line(o) or braki_waiting_stock(o, db=db)
        summary_line = format_braki_issue_summary_line(
            workflow_status,
            unresolved=u_short,
            repl_pending=r_pend,
            oms_waiting=oms_wait,
        )
        status_line = format_issue_queue_status_label(u_short, r_pend)
        sub_pid, sub_name = first_pending_substitute_product(db, o)
        ctx = build_order_issue_detail_context(
            db,
            tenant_id=int(t.tenant_id),
            warehouse_id=int(t.warehouse_id),
            order=o,
        )
        rec_st = resolve_order_recovery_state(db, o, log=False)
        resolver_rows = build_braki_shortage_lines_from_state(
            db,
            o,
            rec_st,
            tenant_id=int(t.tenant_id),
            warehouse_id=int(t.warehouse_id),
        )
        for row in resolver_rows:
            shortage_line_models.append(OrderIssueShortageLine.model_validate(row))
        order_context_model = OrderIssueOrderContext(
            collected_lines=[OrderIssueDetailLine.model_validate(r) for r in ctx.get("collected_lines", [])],
            shortage_decision_lines=[
                OrderIssueDetailLine.model_validate(r)
                for r in resolver_rows
                if (r.get("line_kind") or "") == "shortage_unresolved"
            ],
            remaining_pick_lines=[
                OrderIssueDetailLine.model_validate(r)
                for r in resolver_rows
                if (r.get("line_kind") or "") == "remaining"
            ],
        )
        if u_short > 0 and not shortage_line_models and missing:
            for row in build_fallback_shortage_lines_from_task_snapshot(
                db,
                tenant_id=int(t.tenant_id),
                warehouse_id=int(t.warehouse_id),
                order=o,
                missing_snapshot=missing,
            ):
                shortage_line_models.append(OrderIssueShortageLine.model_validate(row))
        if not shortage_line_models and order_context_model.shortage_decision_lines:
            for dl in order_context_model.shortage_decision_lines:
                if float(dl.missing_qty or 0) > 1e-6:
                    shortage_line_models.append(OrderIssueShortageLine.model_validate(dl.model_dump()))
    recovery_fields: dict = {}
    if o is not None:
        recovery_fields = recovery_state_for_braki_task(db, o)

    created = t.created_at.isoformat() + "Z" if isinstance(t.created_at, datetime) else str(t.created_at)
    last_shortage_at = created
    for e in reversed(logs):
        if str(e.kind or "") == "shortage_reported" and str(e.at or "").strip():
            last_shortage_at = str(e.at).strip()
            break
    return OrderIssueTaskListItem(
        id=int(t.id),
        order_id=int(t.order_id),
        order_number=str(o.number or f"#{t.order_id}") if o else f"#{t.order_id}",
        order_status=str(o.status or "") if o else "",
        customer_name=cust_name,
        delivery_name=cust_fields.get("delivery_name") or "—",
        customer_phone=cust_fields.get("phone") or "—",
        customer_email=cust_fields.get("email") or "—",
        customer_address=cust_fields.get("address") or "—",
        unresolved_shortage_count=u_short,
        replacement_pick_pending_count=r_pend,
        issue_queue_summary_line=summary_line,
        issue_queue_status_label=status_line,
        substitute_product_id=int(sub_pid),
        substitute_product_name=sub_name,
        order_ui_status_name=ui_name,
        task_type=str(t.type),
        recommended_action=str(rec),
        ui_decision=str(ui_kind),
        new_product_lines=hint_models,
        shortage_lines=shortage_line_models,
        order_context=order_context_model,
        status=str(t.status),
        missing_items=missing,
        picked_items=picked,
        missing_skus_label=_missing_skus_label(missing),
        logs=logs,
        created_at=created,
        last_shortage_at=last_shortage_at,
        braki_queue_bucket=bucket,
        braki_workflow_status=workflow_status,
        braki_workflow_status_label=workflow_label,
        **recovery_fields,
    )


def serialize_order_issue_task_list_card(
    db: Session,
    t: OrderIssueTask,
    o: Order | None,
    *,
    u_short: int,
    r_pend: int,
    workflow_status: str,
) -> OrderIssueTaskListItem:
    """
    Lekka karta kolejki — bez order_context, logów, lokalizacji produktów ani pełnych shortage_lines.
    Szczegóły: GET /order-issue-tasks/{id}.
    """
    from ..services.braki_order_state_service import build_order_issue_customer_fields
    from ..services.wms_recovery_pick_service import order_has_waiting_customer_line

    from ..services.braki_order_state_service import order_has_waiting_for_stock_lines as braki_waiting_stock

    cust_fields = build_order_issue_customer_fields(o)
    cust_name = cust_fields.get("customer_name") or order_customer_display_name(o)
    ui_name = None
    if o and o.order_ui_status is not None:
        ui_name = str(o.order_ui_status.name or "").strip() or None

    bucket = "awaiting_oms"
    workflow_label = braki_workflow_status_label(workflow_status)
    summary_line = ""
    status_line = format_issue_queue_status_label(u_short, r_pend)
    if o is not None:
        bucket = braki_queue_bucket(db, o, u_short=u_short, r_pend=r_pend)
        oms_wait = order_has_waiting_customer_line(o) or braki_waiting_stock(o, db=db)
        summary_line = format_braki_issue_summary_line(
            workflow_status,
            unresolved=u_short,
            repl_pending=r_pend,
            oms_waiting=oms_wait,
        )

    _missing, _picked, logs = _parse_task_json_lists(t)
    recovery_fields: dict = recovery_state_for_braki_task(db, o) if o is not None else {}
    created = t.created_at.isoformat() + "Z" if isinstance(t.created_at, datetime) else str(t.created_at)
    last_shortage_at = created
    for e in reversed(logs):
        if str(e.kind or "") == "shortage_reported" and str(e.at or "").strip():
            last_shortage_at = str(e.at).strip()
            break

    return OrderIssueTaskListItem(
        id=int(t.id),
        order_id=int(t.order_id),
        order_number=str(o.number or f"#{t.order_id}") if o else f"#{t.order_id}",
        order_status=str(o.status or "") if o else "",
        customer_name=cust_name,
        delivery_name=cust_fields.get("delivery_name") or "—",
        customer_phone=cust_fields.get("phone") or "—",
        customer_email=cust_fields.get("email") or "—",
        customer_address=cust_fields.get("address") or "—",
        unresolved_shortage_count=int(u_short),
        replacement_pick_pending_count=int(r_pend),
        issue_queue_summary_line=summary_line,
        issue_queue_status_label=status_line,
        substitute_product_id=0,
        substitute_product_name="",
        order_ui_status_name=ui_name,
        task_type=str(t.type),
        recommended_action="MIXED",
        ui_decision="PARTIAL",
        new_product_lines=[],
        shortage_lines=[],
        order_context=OrderIssueOrderContext(),
        status=str(t.status),
        missing_items=[],
        picked_items=[],
        missing_skus_label="",
        logs=[],
        created_at=created,
        last_shortage_at=last_shortage_at,
        braki_queue_bucket=bucket,
        braki_workflow_status=workflow_status,
        braki_workflow_status_label=workflow_label,
        **recovery_fields,
    )


@router.get("/order-issue-tasks/resolve-scan", response_model=OrderIssueTaskListItem)
def resolve_order_issue_task_scan(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    scan: str = Query(..., min_length=1, description="Kod kreskowy zamówienia lub numer"),
    db: Session = Depends(get_db),
    current_user: AppUser | None = Depends(get_optional_current_user),
):
    ensure_order_issue_task_table_schema(db)
    try:
        sync_open_issue_tasks_for_warehouse(
            db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), full_recalc=True
        )
    except Exception:
        logger.exception("sync_open_issue_tasks_for_warehouse failed tenant=%s wh=%s", tenant_id, warehouse_id)
    db.commit()
    o = find_order_by_scan(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        scan=scan.strip(),
    )
    if not o:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia.")
    t = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
            OrderIssueTask.order_id == int(o.id),
            OrderIssueTask.status == "OPEN",
        )
        .order_by(OrderIssueTask.id.desc())
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Brak otwartego zgłoszenia braków dla tego zamówienia.")
    o_full = (
        db.query(Order)
        .options(
            joinedload(Order.order_ui_status),
            joinedload(Order.customer),
            joinedload(Order.items).joinedload(OrderItem.product),
        )
        .filter(Order.id == int(o.id))
        .first()
    )
    if o_full is None:
        mark_task_done(db, t, "Zamówienie usunięte — zamknięto zadanie braków")
        db.commit()
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia.")
    try:
        item = serialize_order_issue_task_item(db, t, o_full)
    except Exception as exc:
        logger.exception("resolve_order_issue_task_scan serialize failed task_id=%s", t.id)
        raise HTTPException(status_code=500, detail="Nie udało się wczytać zadania braków.") from exc
    if not order_requires_shortage_handling(db, o_full):
        mark_task_done(db, t, "Braki rozwiązane — usunięto z kolejki WMS")
        db.commit()
        raise HTTPException(status_code=404, detail="Brak aktywnych nierozwiązanych braków dla tego zamówienia.")
    if current_user is not None and current_user.id is not None:
        touch_wms_operation_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            session_kind="shortage_active",
            operator_user_id=int(current_user.id),
            order_id=int(t.order_id),
            metadata=_shortage_session_metadata(t, item),
        )
        db.commit()
    return item


@router.get("/order-issue-tasks/{task_id}", response_model=OrderIssueTaskListItem)
def get_order_issue_task(
    task_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser | None = Depends(get_optional_current_user),
):
    ensure_order_issue_task_table_schema(db)
    t = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.id == int(task_id),
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione.")
    if str(t.status or "").upper() != "OPEN":
        raise HTTPException(status_code=404, detail="Zadanie braków jest już zamknięte.")
    o = (
        db.query(Order)
        .options(
            joinedload(Order.order_ui_status),
            joinedload(Order.customer),
            joinedload(Order.items).joinedload(OrderItem.product),
        )
        .filter(Order.id == int(t.order_id))
        .first()
    )
    if o is None or getattr(o, "deleted_at", None) is not None:
        mark_task_done(db, t, "Zamówienie usunięte — zamknięto zadanie braków")
        db.commit()
        raise HTTPException(status_code=404, detail="Zamówienie nie istnieje.")
    try:
        item = serialize_order_issue_task_item(db, t, o)
    except Exception as exc:
        logger.exception("get_order_issue_task serialize failed task_id=%s", t.id)
        raise HTTPException(status_code=500, detail="Nie udało się wczytać zadania braków.") from exc
    logger.info(
        "[braki.detail] task_id=%s order_id=%s workflow=%s customer=%s remaining_lines=%s shortage_lines=%s",
        t.id,
        t.order_id,
        item.braki_workflow_status,
        (item.customer_name or "")[:80],
        len(item.order_context.remaining_pick_lines or []),
        len(item.shortage_lines or []),
    )
    if not order_requires_shortage_handling(db, o):
        mark_task_done(db, t, "Braki rozwiązane — usunięto z kolejki WMS")
        db.commit()
        raise HTTPException(status_code=404, detail="Brak aktywnych nierozwiązanych braków na tym zamówieniu.")
    if current_user is not None and current_user.id is not None:
        touch_wms_operation_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            session_kind="shortage_active",
            operator_user_id=int(current_user.id),
            order_id=int(t.order_id),
            metadata=_shortage_session_metadata(t, item),
        )
        db.commit()
    return item


def _build_order_issue_tasks_list(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    full_recalc: bool = False,
) -> OrderIssueTaskListResponse:
    ensure_order_issue_task_table_schema(db)
    t0 = time.perf_counter()
    sql_counter = [0]
    bind = db.get_bind()
    engine = bind.engine if bind is not None and hasattr(bind, "engine") else bind
    cm = _count_sql_queries(engine, sql_counter) if engine is not None else _noop_count()

    with cm:
        try:
            sync_open_issue_tasks_for_warehouse(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                full_recalc=full_recalc,
            )
        except Exception:
            logger.exception(
                "[wms.order_issue_tasks.fetch] sync_open_failed tenant_id=%s warehouse_id=%s",
                tenant_id,
                warehouse_id,
            )
        db.commit()

        t_fetch_start = time.perf_counter()
        rows = list_open_order_issue_tasks_for_warehouse(
            db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
        )
        db_fetch_ms = int((time.perf_counter() - t_fetch_start) * 1000)

        deduped_rows: list[OrderIssueTask] = []
        seen_orders: set[int] = set()
        for t in rows:
            oid = int(t.order_id)
            if oid in seen_orders:
                logger.debug("[braki.dedupe] skip duplicate task_id=%s order_id=%s", t.id, oid)
                continue
            seen_orders.add(oid)
            deduped_rows.append(t)
        if len(deduped_rows) < len(rows):
            logger.info(
                "[braki.dedupe] list tenant=%s wh=%s tasks %s -> %s unique orders",
                tenant_id,
                warehouse_id,
                len(rows),
                len(deduped_rows),
            )

        order_map = _fetch_orders_by_id(db, [int(t.order_id) for t in deduped_rows])

        out: list[OrderIssueTaskListItem] = []
        skipped: list[OrderIssueTaskSkippedItem] = []
        t_serialize_start = time.perf_counter()
        for t in deduped_rows:
            o: Order | None = None
            wf_status: str = "awaiting"
            u_short = 0
            r_pend = 0
            try:
                o = order_map.get(int(t.order_id))
                if o is None:
                    mark_task_done(db, t, "Zamówienie usunięte — zamknięto zadanie braków")
                    continue
                try:
                    from ..services.recovery_workflow_service import repair_order_relocation_consistency

                    repair_order_relocation_consistency(
                        db,
                        o,
                        tenant_id=int(tenant_id),
                        warehouse_id=int(warehouse_id),
                        source_event_id=f"braki.api.list:{int(t.id)}",
                    )
                    u_short, r_pend = count_issue_queue_operational_lines(db, o)
                    wf_status = resolve_braki_workflow_status(db, o, u_short=u_short, r_pend=r_pend)
                except Exception as wf_exc:
                    logger.warning(
                        "[wms.order_issue_tasks.invalid_state] task_id=%s order_id=%s err=%s",
                        getattr(t, "id", None),
                        getattr(t, "order_id", None),
                        wf_exc,
                    )
                    wf_status = "awaiting"
                item = serialize_order_issue_task_list_card(
                    db,
                    t,
                    o,
                    u_short=u_short,
                    r_pend=r_pend,
                    workflow_status=wf_status,
                )
                if not order_requires_shortage_handling(db, o):
                    mark_task_done(db, t, "Braki rozliczone — usunięto z kolejki WMS")
                    continue
                out.append(item)
            except Exception as exc:
                err_public = _public_serialize_error_message(exc)
                snap = order_issue_task_debug_snapshot(db, t, o, workflow_status=wf_status)
                logger.exception(
                    "[wms.order_issue.serialize] task_id=%s order_id=%s workflow_status=%s "
                    "relocation_required=%s archived=%s closed_at=%s error_code=%s err=%s",
                    snap.get("task_id"),
                    snap.get("order_id"),
                    snap.get("workflow_status"),
                    snap.get("relocation_required"),
                    snap.get("archived"),
                    snap.get("closed_at"),
                    _SERIALIZE_ERROR_CODE,
                    exc,
                )
                skipped.append(
                    OrderIssueTaskSkippedItem(
                        task_id=int(t.id),
                        order_id=int(t.order_id),
                        order_number=str((o.number if o is not None else None) or f"#{t.order_id}"),
                        error_code=_SERIALIZE_ERROR_CODE,
                        error_message=err_public,
                    )
                )
                continue
        serialization_ms = int((time.perf_counter() - t_serialize_start) * 1000)

        try:
            db.commit()
        except Exception:
            logger.exception(
                "[wms.order_issue_tasks.fetch] commit_after_list_failed tenant_id=%s warehouse_id=%s",
                tenant_id,
                warehouse_id,
            )
            db.rollback()

        if skipped:
            logger.warning(
                "[wms.order_issue_tasks.fetch] skipped_count=%s tenant_id=%s warehouse_id=%s returned=%s",
                len(skipped),
                tenant_id,
                warehouse_id,
                len(out),
            )
        try:
            filter_counts = compute_braki_filter_counts(out)
        except Exception:
            logger.exception(
                "[wms.order_issue_tasks.fetch] filter_counts_failed tenant_id=%s warehouse_id=%s",
                tenant_id,
                warehouse_id,
            )
            filter_counts = {BRAKI_FILTER_ALL: len(out)}
        if BRAKI_FILTER_ALL not in filter_counts:
            filter_counts[BRAKI_FILTER_ALL] = len(out)

        response_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "[wms.issue_queue.performance] tenant_id=%s warehouse_id=%s total_tasks=%s returned=%s "
            "skipped=%s db_fetch_ms=%s serialization_ms=%s response_ms=%s sql_query_count=%s full_recalc=%s",
            tenant_id,
            warehouse_id,
            len(deduped_rows),
            len(out),
            len(skipped),
            db_fetch_ms,
            serialization_ms,
            response_ms,
            sql_counter[0],
            full_recalc,
        )
        return OrderIssueTaskListResponse(
            success=True,
            tasks=out,
            skipped_tasks=skipped,
            filter_counts=filter_counts,
        )


@router.get("/order-issue-tasks", response_model=OrderIssueTaskListResponse)
def list_order_issue_tasks(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    sync: bool = Query(
        False,
        description="Pełne przeliczenie stanów braków przed listą (wolniejsze; użyj przy ręcznym odświeżeniu)",
    ),
    db: Session = Depends(get_db),
):
    try:
        return _build_order_issue_tasks_list(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            full_recalc=bool(sync),
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception(
            "[wms.order_issue_tasks.fetch] db_failed tenant_id=%s warehouse_id=%s",
            tenant_id,
            warehouse_id,
        )
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "order_issue_tasks_fetch_failed",
                "message": str(exc)[:500],
            },
        ) from exc
    except Exception as exc:
        db.rollback()
        logger.exception(
            "[wms.order_issue_tasks.fetch] failed tenant_id=%s warehouse_id=%s",
            tenant_id,
            warehouse_id,
        )
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "order_issue_tasks_fetch_failed",
                "message": str(exc)[:500],
            },
        ) from exc


@router.post("/order-issue-tasks/{task_id}/log")
def post_order_issue_task_log(
    task_id: int,
    body: OrderIssueTaskLogBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    ensure_order_issue_task_table_schema(db)
    t = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.id == int(task_id),
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione.")
    log_operator_event(db, t, body.message, body.kind)
    db.commit()
    return {"ok": True}


@router.post("/order-issue-tasks/{task_id}/done")
def post_order_issue_task_done(
    task_id: int,
    body: OrderIssueTaskDoneBody | None = None,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser | None = Depends(get_optional_current_user),
):
    ensure_order_issue_task_table_schema(db)
    t = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.id == int(task_id),
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione.")
    mark_task_done(db, t, body.message if body else None)
    if current_user is not None and current_user.id is not None:
        complete_wms_operation_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            session_kind="shortage_active",
            operator_user_id=int(current_user.id),
            order_id=int(t.order_id),
            completed_reason="finished",
            metadata=_shortage_session_metadata(t),
        )
    db.commit()
    return {"ok": True}


@router.post("/order-issue-tasks/{task_id}/archive")
def post_order_issue_task_archive(
    task_id: int,
    body: OrderIssueTaskArchiveBody | None = None,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser | None = Depends(get_optional_current_user),
):
    ensure_order_issue_task_table_schema(db)
    t = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.id == int(task_id),
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione.")
    o = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id == int(t.order_id))
        .first()
    )
    if o is None:
        raise HTTPException(status_code=404, detail="Zamówienie nie znalezione.")
    try:
        result = archive_order_issue_task(
            db,
            t,
            o,
            message=body.message if body else None,
            operator_user_id=int(current_user.id) if current_user and current_user.id else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            "[wms.shortage.archive] failed task_id=%s order_id=%s",
            task_id,
            getattr(t, "order_id", None),
        )
        db.rollback()
        raise HTTPException(status_code=500, detail="Archive failed") from exc
    db.commit()
    return {
        "success": True,
        "archived": bool(result.get("archived")),
        "already_archived": bool(result.get("already_archived")),
    }
