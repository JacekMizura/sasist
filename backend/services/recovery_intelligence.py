"""
Rozszerzenia inteligencji resolvera — priorytety, batch dogrywki, miękkie rezerwacje.

NIE jest osobnym silnikiem workflow. Wywoływane wyłącznie z RecoveryWorkflowService / recovery pick.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.inventory_unit import InventoryUnit
from ..models.order import Order
from ..models.order_issue_task import OrderIssueTask
from ..models.wms_recovery_batch_session import WmsRecoveryBatchSession
from ..models.wms_recovery_soft_reservation import WmsRecoverySoftReservation

logger = logging.getLogger(__name__)

ShortagePriorityLevel = Literal["CRITICAL", "HIGH", "NORMAL", "LOW"]

PRIORITY_LEVEL_THRESHOLDS: list[tuple[int, ShortagePriorityLevel]] = [
    (150, "CRITICAL"),
    (100, "HIGH"),
    (50, "NORMAL"),
    (0, "LOW"),
]

PRIORITY_FACTOR_WEIGHTS: dict[str, int] = {
    "vip_customer": 100,
    "marketplace_sla_express": 50,
    "partial_packing": 60,
    "single_shortage_blocking": 80,
    "waiting_over_24h": 20,
    "recovered_stock_available": 70,
}

_EPS = 1e-9


def _priority_level_from_score(score: int) -> ShortagePriorityLevel:
    for threshold, level in PRIORITY_LEVEL_THRESHOLDS:
        if score >= threshold:
            return level
    return "LOW"


def _priority_level_label_pl(level: ShortagePriorityLevel) -> str:
    return {
        "CRITICAL": "Krytyczny",
        "HIGH": "Wysoki",
        "NORMAL": "Normalny",
        "LOW": "Niski",
    }.get(level, level)


def _parse_order_import_meta(order: Order) -> dict[str, Any]:
    raw = getattr(order, "import_metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def _is_vip_order(order: Order) -> bool:
    pc = (getattr(order, "priority_color", None) or "").strip().lower()
    if pc in ("red", "orange"):
        return True
    meta = _parse_order_import_meta(order)
    if meta.get("vip") is True or str(meta.get("customer_tier") or "").lower() in ("vip", "premium"):
        return True
    cust = getattr(order, "customer", None)
    if cust is not None and str(getattr(cust, "notes", "") or "").lower().find("vip") >= 0:
        return True
    return False


def _is_express_shipment(order: Order) -> bool:
    sm = (getattr(order, "shipping_method", None) or "").strip().lower()
    if any(k in sm for k in ("express", "ekspres", "next day", "24h", "overnight")):
        return True
    row = getattr(order, "shipping_method_row", None)
    if row is not None:
        name = (getattr(row, "name", None) or "").strip().lower()
        if any(k in name for k in ("express", "ekspres", "24", "overnight")):
            return True
    meta = _parse_order_import_meta(order)
    if meta.get("express") is True or str(meta.get("sla") or "").lower() in ("express", "priority"):
        return True
    return False


def _order_partially_packed(order: Order, *, state: Any) -> bool:
    if getattr(order, "packing_started_at", None) is not None:
        return True
    if getattr(order, "selected_carton_id", None):
        return True
    return bool(getattr(state, "packing_allowed", False)) and any(
        ln.picked_qty > _EPS for ln in getattr(state, "lines", [])
    )


def _single_shortage_blocking_pack(state: Any) -> bool:
    lines = list(getattr(state, "lines", []) or [])
    if not lines:
        return False
    recovery = [ln for ln in lines if ln.visible_in_recovery_pick]
    if len(recovery) != 1:
        return False
    others_ready = sum(
        1
        for ln in lines
        if not ln.visible_in_recovery_pick
        and (ln.packing_eligible or ln.picked_qty + _EPS >= ln.ordered_qty)
    )
    return others_ready >= max(0, len(lines) - 1)


def _waiting_hours_since_shortage(
    order: Order,
    *,
    task: OrderIssueTask | None = None,
    last_shortage_at: str | None = None,
) -> float:
    ref: datetime | None = None
    if last_shortage_at and str(last_shortage_at).strip():
        try:
            s = str(last_shortage_at).strip().replace("Z", "+00:00")
            ref = datetime.fromisoformat(s)
            if ref.tzinfo is None:
                ref = ref.replace(tzinfo=timezone.utc)
        except ValueError:
            ref = None
    if ref is None and task is not None and getattr(task, "created_at", None):
        ref = task.created_at
        if ref and ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)
    if ref is None and getattr(order, "picking_finished_at", None):
        ref = order.picking_finished_at
    if ref is None:
        return 0.0
    now = datetime.now(timezone.utc)
    return max(0.0, (now - ref).total_seconds() / 3600.0)


def product_sellable_available_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> float:
    rows = (
        db.query(InventoryUnit)
        .filter(
            InventoryUnit.tenant_id == int(tenant_id),
            InventoryUnit.warehouse_id == int(warehouse_id),
            InventoryUnit.product_id == int(product_id),
        )
        .all()
    )
    return round(
        sum(max(0.0, float(r.quantity or 0) - float(r.reserved_quantity or 0)) for r in rows),
        6,
    )


def _recovery_products_need_stock(db: Session, order: Order, state: Any, *, warehouse_id: int) -> bool:
    tid = int(order.tenant_id)
    wid = int(warehouse_id)
    for ln in getattr(state, "lines", []) or []:
        if not ln.visible_in_recovery_pick:
            continue
        avail = product_sellable_available_qty(
            db, tenant_id=tid, warehouse_id=wid, product_id=int(ln.product_id)
        )
        need = ln.recovery_qty if ln.recovery_qty > _EPS else ln.unresolved_qty
        if avail + _EPS >= need > _EPS:
            return True
    return False


def compute_shortage_priority(
    db: Session,
    order: Order,
    state: Any,
    *,
    task: OrderIssueTask | None = None,
    last_shortage_at: str | None = None,
) -> dict[str, Any]:
    """
    Dynamiczny scoring braku — wyłącznie z bieżącego stanu resolvera i zamówienia.
    """
    factors: list[dict[str, Any]] = []
    score = 0

    def add_factor(key: str, applied: bool, detail: str = "") -> None:
        nonlocal score
        weight = PRIORITY_FACTOR_WEIGHTS.get(key, 0)
        if applied and weight > 0:
            score += weight
            factors.append({"key": key, "weight": weight, "detail": detail or key})

    add_factor("vip_customer", _is_vip_order(order), "Klient VIP / priorytet")
    add_factor("marketplace_sla_express", _is_express_shipment(order), "Wysyłka ekspres / SLA")
    add_factor(
        "partial_packing",
        _order_partially_packed(order, state=state),
        "Zamówienie częściowo spakowane",
    )
    add_factor(
        "single_shortage_blocking",
        _single_shortage_blocking_pack(state),
        "Jeden brak blokuje resztę zamówienia",
    )
    hours = _waiting_hours_since_shortage(order, task=task, last_shortage_at=last_shortage_at)
    add_factor(
        "waiting_over_24h",
        hours >= 24.0,
        f"Oczekiwanie {int(hours)}h",
    )
    add_factor(
        "recovered_stock_available",
        _recovery_products_need_stock(db, order, state, warehouse_id=int(order.warehouse_id)),
        "Dostępny stan na magazynie dla SKU dogrywki",
    )

    level = _priority_level_from_score(score)
    return {
        "shortage_priority_score": int(score),
        "shortage_priority_level": level,
        "shortage_priority_label": _priority_level_label_pl(level),
        "shortage_priority_factors": factors,
    }


def priority_fields_for_braki_task(
    db: Session,
    order: Order,
    state: Any,
    *,
    task: OrderIssueTask | None = None,
    last_shortage_at: str | None = None,
) -> dict[str, Any]:
    return compute_shortage_priority(
        db, order, state, task=task, last_shortage_at=last_shortage_at
    )


def _next_batch_label(db: Session, *, tenant_id: int, warehouse_id: int) -> str:
    n = (
        db.query(func.count(WmsRecoveryBatchSession.id))
        .filter(
            WmsRecoveryBatchSession.tenant_id == int(tenant_id),
            WmsRecoveryBatchSession.warehouse_id == int(warehouse_id),
        )
        .scalar()
        or 0
    )
    return f"DOGRYWKA #{int(n) + 1}"


def _location_sort_key(loc_code: str) -> tuple:
    code = (loc_code or "").strip().upper()
    parts = code.replace("-", ".").split(".")
    out: list[Any] = []
    for p in parts:
        if p.isdigit():
            out.append((0, int(p)))
        else:
            out.append((1, p))
    return tuple(out) if out else ((1, code),)


def build_recovery_batch_route_groups(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    line_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Grupowanie linii dogrywki po lokalizacji (strefa / alejka / bliskość)."""
    from .braki_order_state_service import enrich_shortage_line_location_fields

    by_loc: dict[str, list[dict[str, Any]]] = {}
    for raw in line_rows:
        row = dict(raw)
        enrich_shortage_line_location_fields(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(row.get("order_id") or 0),
            product_id=int(row.get("product_id") or 0),
            row=row,
        )
        loc = (row.get("nearest_location_code") or row.get("location_code") or "—").strip() or "—"
        row["location_code"] = loc
        by_loc.setdefault(loc, []).append(row)

    groups: list[dict[str, Any]] = []
    for loc in sorted(by_loc.keys(), key=_location_sort_key):
        items = by_loc[loc]
        order_ids = sorted({int(i.get("order_id") or 0) for i in items if int(i.get("order_id") or 0) > 0})
        groups.append(
            {
                "location_code": loc,
                "line_count": len(items),
                "order_ids": order_ids,
                "lines": items,
            }
        )
    return groups


def create_recovery_batch_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_ids: list[int] | None = None,
    max_orders: int = 8,
    operator_user_id: int | None = None,
) -> WmsRecoveryBatchSession:
    """
    Tworzy sesję batch dogrywki — domyślnie top N zamówień wg priority score.
    """
    from .order_issue_task_service import list_open_order_issue_tasks_for_warehouse
    from .recovery_workflow_service import resolve_order_recovery_state, get_recovery_pick_lines

    tid, wid = int(tenant_id), int(warehouse_id)
    candidates: list[tuple[int, int, list[dict[str, Any]]]] = []

    if order_ids:
        oid_list = [int(x) for x in order_ids if int(x) > 0]
    else:
        tasks = list_open_order_issue_tasks_for_warehouse(db, tenant_id=tid, warehouse_id=wid)
        scored: list[tuple[int, int]] = []
        for t in tasks:
            o = (
                db.query(Order)
                .options(joinedload(Order.items))
                .filter(Order.id == int(t.order_id))
                .first()
            )
            if o is None:
                continue
            st = resolve_order_recovery_state(db, o, log=False)
            if not st.has_recovery_pick_work:
                continue
            pr = compute_shortage_priority(db, o, st, task=t)
            scored.append((int(pr["shortage_priority_score"]), int(o.id)))
        scored.sort(key=lambda x: (-x[0], x[1]))
        oid_list = [oid for _, oid in scored[: max(1, int(max_orders))]]

    for oid in oid_list:
        o = (
            db.query(Order)
            .options(joinedload(Order.items))
            .filter(Order.id == int(oid), Order.tenant_id == tid, Order.warehouse_id == wid)
            .first()
        )
        if o is None:
            continue
        lines = get_recovery_pick_lines(db, o, log=False)
        if not lines:
            continue
        st = resolve_order_recovery_state(db, o, log=False)
        pr = compute_shortage_priority(db, o, st)
        candidates.append((int(pr["shortage_priority_score"]), int(oid), lines))

    if not candidates:
        raise ValueError("Brak zamówień z aktywną dogrywką do grupowania.")

    candidates.sort(key=lambda x: (-x[0], x[1]))
    all_lines: list[dict[str, Any]] = []
    batch_order_ids: list[int] = []
    for _, oid, lines in candidates:
        batch_order_ids.append(int(oid))
        for ln in lines:
            row = dict(ln)
            row["order_id"] = int(oid)
            all_lines.append(row)

    route_groups = build_recovery_batch_route_groups(
        db, tenant_id=tid, warehouse_id=wid, line_rows=all_lines
    )
    payload = {
        "order_ids": batch_order_ids,
        "order_count": len(batch_order_ids),
        "line_count": len(all_lines),
        "route_groups": route_groups,
        "created_from": "priority_engine",
    }
    sess = WmsRecoveryBatchSession(
        tenant_id=tid,
        warehouse_id=wid,
        operator_user_id=int(operator_user_id) if operator_user_id else None,
        label=_next_batch_label(db, tenant_id=tid, warehouse_id=wid),
        status="open",
        payload_json=json.dumps(payload, ensure_ascii=False),
    )
    db.add(sess)
    db.flush()
    logger.info(
        "[recovery.batch.create] batch_id=%s orders=%s lines=%s groups=%s",
        sess.id,
        batch_order_ids,
        len(all_lines),
        len(route_groups),
    )
    return sess


def get_recovery_batch_session(
    db: Session,
    batch_id: int,
    *,
    tenant_id: int,
) -> WmsRecoveryBatchSession | None:
    return (
        db.query(WmsRecoveryBatchSession)
        .filter(
            WmsRecoveryBatchSession.id == int(batch_id),
            WmsRecoveryBatchSession.tenant_id == int(tenant_id),
        )
        .first()
    )


def batch_session_payload(sess: WmsRecoveryBatchSession) -> dict[str, Any]:
    raw = getattr(sess, "payload_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def process_recovery_stock_increase(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    qty_added: float,
    source_event: str,
) -> dict[str, Any]:
    """
    Po wzroście stanu: znajdź aktywne braki na SKU, rankuj, utwórz soft reservation.
    Nie mutuje workflow — tylko rezerwacja + opcjonalnie ensure_recovery_pick_task.
    """
    from ..models.order_issue_task import OrderIssueTask
    from .recovery_workflow_service import resolve_order_recovery_state, get_recovery_pick_lines
    from .wms_recovery_pick_service import ensure_recovery_pick_task

    q_add = round(max(0.0, float(qty_added)), 6)
    if q_add <= _EPS:
        return {"reserved_qty": 0.0, "lines": []}

    tid, wid, pid = int(tenant_id), int(warehouse_id), int(product_id)
    tasks = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.tenant_id == tid,
            OrderIssueTask.warehouse_id == wid,
            OrderIssueTask.status == "OPEN",
        )
        .all()
    )

    demand_rows: list[tuple[int, int, int, float, int]] = []
    for t in tasks:
        o = (
            db.query(Order)
            .options(joinedload(Order.items))
            .filter(Order.id == int(t.order_id))
            .first()
        )
        if o is None:
            continue
        st = resolve_order_recovery_state(db, o, log=False)
        if not st.has_recovery_pick_work:
            continue
        pr = compute_shortage_priority(db, o, st, task=t)
        score = int(pr["shortage_priority_score"])
        for ln in get_recovery_pick_lines(db, o, log=False):
            if int(ln.get("product_id") or 0) != pid:
                continue
            need = float(ln.get("unresolved_qty") or ln.get("missing_operational_qty") or 0)
            if need <= _EPS:
                continue
            oiid = int(ln.get("order_item_id") or 0)
            if oiid < 1:
                continue
            demand_rows.append((score, int(o.id), oiid, need, int(t.id)))

    demand_rows.sort(key=lambda x: (-x[0], x[1]))
    remaining = q_add
    reserved_total = 0.0
    touched_orders: set[int] = set()
    out_lines: list[dict[str, Any]] = []

    for score, oid, oiid, need, _task_id in demand_rows:
        if remaining <= _EPS:
            break
        alloc = min(remaining, need)
        if alloc <= _EPS:
            continue
        existing = (
            db.query(WmsRecoverySoftReservation)
            .filter(
                WmsRecoverySoftReservation.tenant_id == tid,
                WmsRecoverySoftReservation.warehouse_id == wid,
                WmsRecoverySoftReservation.order_id == oid,
                WmsRecoverySoftReservation.order_item_id == oiid,
                WmsRecoverySoftReservation.product_id == pid,
                WmsRecoverySoftReservation.status == "soft",
            )
            .first()
        )
        if existing is not None:
            existing.qty_reserved = round(float(existing.qty_reserved or 0) + alloc, 6)
            existing.priority_score = max(int(existing.priority_score or 0), score)
            existing.source_event = (source_event or "")[:64] or existing.source_event
        else:
            db.add(
                WmsRecoverySoftReservation(
                    tenant_id=tid,
                    warehouse_id=wid,
                    order_id=oid,
                    order_item_id=oiid,
                    product_id=pid,
                    qty_reserved=round(alloc, 6),
                    priority_score=score,
                    source_event=(source_event or "")[:64] or None,
                    status="soft",
                )
            )
        remaining = round(remaining - alloc, 6)
        reserved_total = round(reserved_total + alloc, 6)
        touched_orders.add(oid)
        out_lines.append(
            {"order_id": oid, "order_item_id": oiid, "qty_reserved": alloc, "priority_score": score}
        )

    for oid in touched_orders:
        o = db.query(Order).options(joinedload(Order.items)).filter(Order.id == int(oid)).first()
        if o is not None:
            ensure_recovery_pick_task(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                order=o,
                kind="other",
            )

    if reserved_total > _EPS:
        logger.info(
            "[recovery.stock.reserve] product_id=%s qty_added=%s reserved=%s source=%s lines=%s",
            pid,
            q_add,
            reserved_total,
            source_event,
            len(out_lines),
        )
    return {"reserved_qty": reserved_total, "lines": out_lines}
