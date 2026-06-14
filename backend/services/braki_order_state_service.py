"""Centralna logika workflow kolejki Braki (OMS ↔ WMS) — jedno źródło prawdy."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from ..models.order_issue_task import OrderIssueTask
from ..models.pick import Pick
from ..services.order_fulfillment_state import (
    MISSING as FS_MISSING,
    NEEDS_DECISION as FS_NEEDS_DECISION,
    READY_TO_PACK as FS_READY_TO_PACK,
)

logger = logging.getLogger(__name__)

NO_LOCATION_LABEL = "Brak lokalizacji"


def _order_item_meta_dict(item: OrderItem) -> dict[str, Any]:
    raw = getattr(item, "metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def order_has_waiting_for_stock_lines(order: Order, *, db: Session | None = None) -> bool:
    from .order_fulfillment_recompute import order_has_waiting_for_stock_lines as _impl

    return _impl(order, db=db)


def order_line_pick_still_possible(db: Session, order: Order, oi: OrderItem) -> bool:
    """
    Magazyn może jeszcze zbierać / dogrywać linię — brak NIE wymaga jeszcze decyzji OMS.
    """
    from .fulfillment_event_service import line_picked_sum_for_order
    from .order_fulfillment_recompute import (
        _oms_waiting_for_stock,
        compute_line_missing_qty,
        order_item_needs_substitute_pick_completion,
    )
    from .wms_operational_task_service import _line_remaining_qty
    from .bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops

    if order_item_skip_bundle_commercial_header_for_ops(oi):
        return False
    if order_item_is_replaced_line(oi):
        return False
    if order_item_needs_substitute_pick_completion(db, order, oi):
        return True

    remaining = float(_line_remaining_qty(db, order, oi))
    if remaining <= 1e-9:
        return False

    if _oms_waiting_for_stock(oi):
        missing = float(compute_line_missing_qty(db, order, oi))
        if missing <= 1e-9:
            return False

    ordered = float(oi.quantity or 0)
    picked = float(line_picked_sum_for_order(db, int(oi.id), order))
    return picked + 1e-9 < ordered


def order_line_requires_oms_decision(db: Session, order: Order, oi: OrderItem) -> bool:
    """
    Linia wymaga decyzji OMS — dopiero po eskalacji / gdy magazyn nie może już kontynuować zbierania.
    Samo ``missing_qty > 0`` przy możliwej dogrywce NIE wystarcza.
    """
    from .order_fulfillment_recompute import _oms_waiting_for_stock, compute_line_missing_qty
    from .bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops

    if order_item_skip_bundle_commercial_header_for_ops(oi):
        return False
    if order_item_is_replaced_line(oi):
        return False

    missing = float(compute_line_missing_qty(db, order, oi))

    if _oms_waiting_for_stock(oi):
        if order_line_pick_still_possible(db, order, oi) and missing <= 1e-9:
            return False
        return True

    if missing <= 1e-9:
        return False

    if order_line_pick_still_possible(db, order, oi):
        return False

    return True


def order_has_pending_shortage_decision(db: Session, order: Order) -> bool:
    """Aktywna decyzja OMS — tylko gdy magazyn nie może już sam rozliczyć linii."""
    for oi in order.items or []:
        if order_line_requires_oms_decision(db, order, oi):
            return True
    return False


def log_wms_order_status_compute(db: Session, order: Order, *, source: str = "") -> dict[str, Any]:
    """Diagnoza fazy UI — ``[wms.order.status.compute]``."""
    from .order_fulfillment_recompute import compute_line_missing_qty
    from .braki_workflow_service import resolve_braki_workflow_status
    from .wms_relocation_workflow import relocation_alloc_counts_for_order

    oid = int(order.id)
    pending_decisions = 0
    resolved_shortages = 0
    for oi in order.items or []:
        mq = float(compute_line_missing_qty(db, order, oi))
        declared = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
        if mq > 1e-9:
            pending_decisions += 1
        elif declared > 1e-9:
            resolved_shortages += 1
    u_short, r_pend = count_issue_queue_operational_lines(db, order)
    reloc_p, reloc_part, _ = relocation_alloc_counts_for_order(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=oid,
        log_checks=False,
    )
    packing_ready = order_can_show_ready_pack(db, order)
    pending_decision = order_has_pending_shortage_decision(db, order)
    fs = (getattr(order, "fulfillment_state", None) or "").strip().upper()
    wf = resolve_braki_workflow_status(db, order, u_short=u_short, r_pend=r_pend)
    from .wms_workflow_phase import compute_wms_workflow_phase

    phase = compute_wms_workflow_phase(order, db=db)
    snap = {
        "order_id": oid,
        "source": source or "—",
        "has_shortages": pending_decisions > 0 or int(u_short) > 0,
        "pending_decisions_count": pending_decisions,
        "resolved_shortages_count": resolved_shortages,
        "relocation_required": reloc_p > 0 or reloc_part > 0,
        "packing_ready": packing_ready,
        "pending_decision": pending_decision,
        "fulfillment_state": fs or None,
        "braki_workflow_status": wf,
        "final_status": phase,
        "u_short": u_short,
        "r_pend": r_pend,
    }
    logger.info(
        "[wms.order.status.compute] order_id=%s source=%s has_shortages=%s pending_decisions=%s "
        "resolved_shortages=%s relocation_required=%s packing_ready=%s pending_decision=%s "
        "fulfillment_state=%s braki_workflow=%s final_status=%s",
        oid,
        snap["source"],
        snap["has_shortages"],
        pending_decisions,
        resolved_shortages,
        snap["relocation_required"],
        packing_ready,
        pending_decision,
        fs or "—",
        wf,
        phase or "—",
    )
    return snap


def order_line_awaiting_oms_attention(db: Session, order: Order, oi: OrderItem) -> bool:
    """Linia wymaga aktywnej decyzji OMS (alias ``order_line_requires_oms_decision``)."""
    return order_line_requires_oms_decision(db, order, oi)


def order_has_pending_relocation_work(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> bool:
    from .recovery_workflow_service import order_has_relocation_work

    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if order is None:
        return False
    return order_has_relocation_work(
        db,
        order,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )


def order_has_active_braki_operations(db: Session, order: Order) -> bool:
    """Operacyjna praca magazynowa / OMS — kanoniczny stan z ``RecoveryWorkflowService``."""
    from .recovery_workflow_service import resolve_order_recovery_state
    from .wms_recovery_pick_service import get_open_recovery_task_for_order

    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    oid = int(order.id)

    state = resolve_order_recovery_state(db, order, log=False)
    if state.totals.oms_decision_lines > 0:
        return True
    if state.has_recovery_work:
        return True
    if get_open_recovery_task_for_order(db, tenant_id=tid, warehouse_id=wid, order_id=oid):
        return True
    if state.has_relocation_work:
        return True
    return False


def order_fully_packed(db: Session, order: Order) -> bool:
    """Wszystkie aktywne linie mają packing_quantity_packed >= wymaganej ilości (po brakach OMS)."""
    from .wms_packing_service import order_item_required_pack_qty

    for oi in sorted(order.items or [], key=lambda x: int(x.id)):
        from .bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops

        if order_item_skip_bundle_commercial_header_for_ops(oi):
            continue
        if order_item_is_replaced_line(oi) and float(oi.quantity or 0) <= 1e-9:
            continue
        required = order_item_required_pack_qty(db, order, oi)
        if required < 1:
            continue
        packed = int(getattr(oi, "packing_quantity_packed", 0) or 0)
        if packed < required:
            return False
    return True


def order_had_braki_workflow_signals(db: Session, order: Order) -> bool:
    """Czy zamówienie przeszło przez workflow braków (nie zamykać przed pakowaniem)."""
    fs = (getattr(order, "fulfillment_state", None) or "").strip().upper()
    if fs in (FS_NEEDS_DECISION, FS_MISSING):
        return True
    open_task = (
        db.query(OrderIssueTask.id)
        .filter(
            OrderIssueTask.order_id == int(order.id),
            OrderIssueTask.status == "OPEN",
        )
        .first()
    )
    if open_task is not None:
        return True
    for oi in order.items or []:
        if float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0) > 1e-9:
            return True
        if getattr(oi, "replaced_from_order_item_id", None) is not None and int(oi.replaced_from_order_item_id) > 0:
            return True
        if _order_item_meta_dict(oi).get("oms_waiting_for_stock"):
            return True
    if order_has_pending_relocation_work(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
    ):
        return True
    return False


def order_braki_picking_resolved(db: Session, order: Order) -> bool:
    """Braki rozliczone magazynowo — ``can_order_be_packed`` z resolvera."""
    from .recovery_workflow_service import can_order_be_packed

    return can_order_be_packed(db, order, require_physical_pack=False)


def order_braki_workflow_complete(db: Session, order: Order) -> bool:
    """Pełne domknięcie workflow braków (w tym pakowanie po sygnałach braków)."""
    if not order_braki_picking_resolved(db, order):
        return False
    if order_had_braki_workflow_signals(db, order) and not order_fully_packed(db, order):
        return False
    return True


def order_requires_shortage_handling(db: Session, order: Order) -> bool:
    """Czy zamówienie pozostaje w kolejce Braki WMS."""
    if order_has_waiting_for_stock_lines(order, db=db):
        return True
    if not order_braki_picking_resolved(db, order):
        return True
    if order_had_braki_workflow_signals(db, order) and not order_fully_packed(db, order):
        return True
    return False


def order_has_open_issue_task(db: Session, order: Order) -> bool:
    return (
        db.query(OrderIssueTask.id)
        .filter(
            OrderIssueTask.order_id == int(order.id),
            OrderIssueTask.status == "OPEN",
        )
        .first()
        is not None
    )


def order_can_show_ready_pack(db: Session, order: Order) -> bool:
    """``ready_pack`` — delegacja do ``RecoveryWorkflowService.can_order_be_packed``."""
    from .recovery_workflow_service import can_order_be_packed

    return can_order_be_packed(db, order, require_physical_pack=False)


def evaluate_order_braki_state(
    db: Session,
    order: Order,
    *,
    workflow_status: str | None = None,
) -> dict[str, Any]:
    """Diagnoza stanu zamówienia — log ``[braki.workflow] ORDER_STATE_EVAL``."""
    from .wms_recovery_pick_service import get_open_recovery_task_for_order

    u_short, r_pend = count_issue_queue_operational_lines(db, order)
    has_open_shortages = int(u_short) > 0
    has_open_issue_task = order_has_open_issue_task(db, order)
    has_pending_recovery = (
        get_open_recovery_task_for_order(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            order_id=int(order.id),
        )
        is not None
    )
    has_awaiting = order_has_waiting_for_stock_lines(order, db=db) or any(
        order_line_awaiting_oms_attention(db, order, oi) for oi in (order.items or [])
    )
    resolved = order_can_show_ready_pack(db, order)
    final_status = (workflow_status or "").strip() or ("ready_pack" if resolved else "awaiting")

    logger.info(
        "[braki.workflow] ORDER_STATE_EVAL order_id=%s has_open_shortages=%s "
        "has_open_issue_task=%s has_pending_recovery=%s has_awaiting_decision=%s "
        "resolved=%s final_status=%s u_short=%s r_pend=%s",
        int(order.id),
        has_open_shortages,
        has_open_issue_task,
        has_pending_recovery,
        has_awaiting,
        resolved,
        final_status,
        u_short,
        r_pend,
    )
    return {
        "has_open_shortages": has_open_shortages,
        "has_open_issue_task": has_open_issue_task,
        "has_pending_recovery": has_pending_recovery,
        "has_awaiting_decision": has_awaiting,
        "resolved": resolved,
        "final_status": final_status,
        "u_short": u_short,
        "r_pend": r_pend,
    }


def log_braki_shortage_sync(
    db: Session,
    order: Order,
    *,
    reason: str = "",
) -> None:
    from .order_issue_task_service import count_issue_queue_operational_lines
    from .braki_workflow_service import resolve_braki_workflow_status
    from .wms_recovery_pick_service import get_open_recovery_task_for_order

    u_short, r_pend = count_issue_queue_operational_lines(db, order)
    wf = resolve_braki_workflow_status(db, order, u_short=u_short, r_pend=r_pend)
    rt = get_open_recovery_task_for_order(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
    )
    reloc = order_has_pending_relocation_work(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
    )
    logger.info(
        "[braki.shortage_sync] order_id=%s workflow=%s remaining_shortages=%s recovery_open=%s "
        "relocation=%s pack_ready=%s requires_queue=%s reason=%s",
        order.id,
        wf,
        u_short,
        rt is not None,
        reloc,
        order_fully_packed(db, order),
        order_requires_shortage_handling(db, order),
        reason or "—",
    )


def log_braki_workflow_resolution(
    db: Session,
    order: Order,
    *,
    reason: str = "",
    workflow_status: str | None = None,
) -> None:
    from .braki_workflow_service import resolve_braki_workflow_status

    u_short, r_pend = count_issue_queue_operational_lines(db, order)
    status = workflow_status or resolve_braki_workflow_status(db, order, u_short=u_short, r_pend=r_pend)
    logger.info(
        "[braki.workflow] order_id=%s workflow_status=%s reason=%s u_short=%s r_pend=%s "
        "requires_queue=%s pack_complete=%s",
        order.id,
        status,
        reason or "—",
        u_short,
        r_pend,
        order_requires_shortage_handling(db, order),
        order_fully_packed(db, order),
    )


def build_order_issue_customer_fields(order: Order | None) -> dict[str, str]:
    """Dane klienta z addresses_json + relacja Customer (jak zwroty / OMS)."""
    from ..api.wms_returns import _customer_names_from_order

    out: dict[str, str] = {
        "customer_name": "—",
        "delivery_name": "—",
        "phone": "—",
        "email": "—",
        "address": "—",
    }
    if order is None:
        return out

    fn, ln = _customer_names_from_order(order)
    parts = [p for p in (fn, ln) if p and str(p).strip()]
    name = " ".join(parts).strip()
    if not name:
        c = getattr(order, "customer", None)
        if c is not None:
            cfn = (getattr(c, "first_name", None) or "").strip()
            cln = (getattr(c, "last_name", None) or "").strip()
            name = f"{cfn} {cln}".strip()
            if not name:
                comp = (getattr(c, "company_name", None) or "").strip()
                name = comp
    if name:
        out["customer_name"] = name
        out["delivery_name"] = name

    raw = getattr(order, "addresses_json", None) or ""
    ship: dict[str, Any] = {}
    if str(raw).strip():
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                sh = data.get("shipping")
                if isinstance(sh, dict):
                    ship = sh
                elif isinstance(data.get("delivery"), dict):
                    ship = data.get("delivery")  # type: ignore[assignment]
        except json.JSONDecodeError:
            ship = {}

    def _pick(block: dict[str, Any], *keys: str) -> str:
        for k in keys:
            v = block.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return ""

    phone = _pick(ship, "phone", "telefon", "Telefon", "mobile")
    email = _pick(ship, "email", "Email", "e-mail")
    street = _pick(ship, "street", "address", "ulica", "Ulica", "address1")
    city = _pick(ship, "city", "miasto", "Miasto")
    postal = _pick(ship, "postal_code", "zip", "postcode", "kod", "Kod pocztowy")
    country = _pick(ship, "country", "kraj", "Kraj")
    addr_parts = [p for p in (street, postal, city, country) if p]
    if addr_parts:
        out["address"] = ", ".join(addr_parts)
    if phone:
        out["phone"] = phone
    if email:
        out["email"] = email
    ship_name = _pick(ship, "name", "full_name", "Imię i nazwisko", "company")
    if ship_name:
        out["delivery_name"] = ship_name

    return out


def nearest_pick_location_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_id: int,
) -> tuple[Optional[int], str, float]:
    """
    Najbliższa lokalizacja wg trasy zbierania (PickingRoutingService), fallback: stan magazynowy.
    """
    from .picking_routing_service import PickingRoutingService
    from .wms_packing_service import _primary_location_for_product

    pid = int(product_id)
    oid = int(order_id)
    try:
        routing = PickingRoutingService(db).build_location_pick_list([oid], tenant_id=int(tenant_id))
        for row in routing.pick_list:
            if int(row.product_id) == pid:
                return (
                    int(row.location_id),
                    str(row.location_code or "").strip() or NO_LOCATION_LABEL,
                    float(row.total_quantity or 0),
                )
    except Exception:
        logger.debug("nearest_pick_location routing failed order=%s product=%s", oid, pid, exc_info=True)

    label, qty, _hint = _primary_location_for_product(db, int(tenant_id), int(warehouse_id), pid)
    loc_id: Optional[int] = None
    if label and str(label).strip():
        from ..models.location import Location

        loc = (
            db.query(Location.id)
            .filter(
                Location.warehouse_id == int(warehouse_id),
                Location.name == str(label).strip(),
            )
            .first()
        )
        if loc:
            loc_id = int(loc[0])
        return loc_id, str(label).strip(), float(qty or 0)
    return None, NO_LOCATION_LABEL, 0.0


def enrich_shortage_line_location_fields(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_id: int,
    row: dict[str, Any],
) -> dict[str, Any]:
    loc_id, loc_code, avail = nearest_pick_location_for_product(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        product_id=int(product_id),
    )
    existing = str(row.get("location_code") or "").strip()
    code = existing or loc_code or NO_LOCATION_LABEL
    row["nearest_location_id"] = loc_id
    row["nearest_location_code"] = code
    row["location_code"] = code
    row["available_qty"] = round(float(avail), 6)
    return row


def ensure_relocation_for_order_item_picks(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    order_item_id: int,
    source_event_id: str,
    picked_from_location: str | None = None,
    removal_type: str | None = None,
) -> list[int]:
    """
    Zebrany fizycznie towar po usunięciu linii z OMS → zadanie RELOCATION.

    Używa rekordów Pick (``picked_at`` lub ilość > 0) albo sumy zdarzeń PICK na linii.
    """
    from ..models.order_item import OrderItem
    from .fulfillment_event_service import line_picked_sum_for_order
    from .order_item_removal_service import REMOVAL_TYPE_MANUAL_OMS, normalize_removal_type
    from .relocation_reason import RELOCATION_REASON_PICKED_ITEM_REMOVED
    from .wms_operational_task_service import merge_relocation_from_picks, merge_relocation_task

    oid = int(order.id)
    oiid = int(order_item_id)
    rt = normalize_removal_type(removal_type or REMOVAL_TYPE_MANUAL_OMS)

    oi = db.query(OrderItem).filter(OrderItem.id == oiid, OrderItem.order_id == oid).first()
    if oi is None:
        logger.info(
            "[wms.relocation.create] skip order_id=%s order_item_id=%s reason=no_line",
            oid,
            oiid,
        )
        return []

    from .recovery_workflow_service import resolve_order_recovery_state

    rec_state = resolve_order_recovery_state(db, order, log=False)
    line_state = next((ln for ln in rec_state.lines if int(ln.order_line_id) == oiid), None)
    if line_state is None or not line_state.visible_in_relocation:
        logger.info(
            "[wms.relocation.create] skip order_id=%s order_item_id=%s picked_qty=%s "
            "reason=resolver_relocation_not_required relocation_required=%s source=%s",
            oid,
            oiid,
            float(line_state.picked_qty) if line_state is not None else 0.0,
            bool(line_state.relocation_required) if line_state is not None else False,
            source_event_id,
        )
        return []

    picked_qty = float(line_picked_sum_for_order(db, oiid, order))
    picks = (
        db.query(Pick)
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.order_id == oid,
            Pick.order_item_id == oiid,
        )
        .all()
    )
    finalized = [p for p in picks if getattr(p, "picked_at", None) is not None]
    if not finalized and picked_qty > 1e-9:
        finalized = [p for p in picks if float(getattr(p, "quantity", 0) or 0) > 1e-9]

    cart_label = (picked_from_location or "").strip()
    if not cart_label:
        cid = getattr(order, "cart_id", None)
        if cid:
            from ..models.cart import Cart

            cart = db.query(Cart).filter(Cart.id == int(cid)).first()
            if cart:
                cart_label = (getattr(cart, "code", None) or getattr(cart, "name", None) or "").strip()
    cart_label = cart_label or f"KOSZYK-{getattr(order, 'cart_id', 0)}"

    task_ids: list[int] = []
    if finalized:
        tasks = merge_relocation_from_picks(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            picks=finalized,
            picked_from_location=cart_label,
            source_event_id=source_event_id,
            close_recollect_for_items=True,
            relocation_reason=RELOCATION_REASON_PICKED_ITEM_REMOVED,
        )
        task_ids = [int(t.id) for t in tasks if getattr(t, "id", None)]
    elif picked_qty > 1e-9 and oi.product_id:
        from .wms_operational_task_service import _target_zone_for_order

        zone = _target_zone_for_order(order)
        task = merge_relocation_task(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(oi.product_id),
            allocations=[
                {
                    "order_id": oid,
                    "order_item_id": oiid,
                    "qty": round(picked_qty, 6),
                    "target_zone": zone or None,
                    "relocation_reason": RELOCATION_REASON_PICKED_ITEM_REMOVED,
                }
            ],
            picked_from_location=cart_label,
            source_event_id=source_event_id,
            relocation_reason=RELOCATION_REASON_PICKED_ITEM_REMOVED,
        )
        if task is not None:
            task_ids = [int(task.id)]
    else:
        logger.info(
            "[wms.relocation.create] skip order_id=%s order_item_id=%s picked_qty=%s "
            "pick_rows=%s removal_type=%s reason=no_picked_stock",
            oid,
            oiid,
            picked_qty,
            len(picks),
            rt,
        )
        return []

    logger.info(
        "[wms.relocation.create] order_id=%s order_item_id=%s picked_qty=%s "
        "removal_type=%s relocation_task_id=%s source=%s",
        oid,
        oiid,
        picked_qty,
        rt,
        task_ids[0] if task_ids else None,
        source_event_id,
    )
    return task_ids


def count_issue_queue_operational_lines(db: Session, order: Order) -> tuple[int, int]:
    """(linie wymagające decyzji OMS, linie do zebrania / dogrywki) — ``RecoveryWorkflowService``."""
    from .recovery_workflow_service import count_recovery_operational_lines

    return count_recovery_operational_lines(db, order)
