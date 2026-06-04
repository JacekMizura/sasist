"""Jednolite przeliczenie braków na liniach zamówienia (OMS + WMS)."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session, joinedload

from ..models.fulfillment_event import FE_MISSING, FE_WAITING
from ..models.order import Order
from ..models.order_item import (
    OMS_LINE_STATUS_REPLACED,
    OMS_LINE_STATUS_TO_PICK,
    OrderItem,
    order_item_is_replaced_line,
)
from ..models.order_issue_task import OrderIssueTask
from ..services.fulfillment_event_service import line_picked_sum_for_order, sum_line_events, sum_pick_events_for_line_cart
from ..services.order_fulfillment_state import (
    MISSING as FS_MISSING,
    NEEDS_DECISION as FS_NEEDS_DECISION,
    PICKING as FS_PICKING,
    READY_TO_PACK as FS_READY_TO_PACK,
)
from ..services.order_issue_task_service import mark_task_done

if TYPE_CHECKING:
    pass


def _order_item_meta_dict(item: OrderItem) -> dict:
    raw = getattr(item, "metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def _oms_waiting_for_stock(item: OrderItem) -> bool:
    return bool(_order_item_meta_dict(item).get("oms_waiting_for_stock"))


def _oms_waiting_missing_cover_qty(item: OrderItem) -> float:
    """Ilość braku objęta „czeka na towar`` (snapshot); 0 = zachowanie legacy (cały shortfall)."""
    raw = _order_item_meta_dict(item).get("oms_waiting_missing_qty")
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, v)


def line_shortage_display_kind(oi: OrderItem, computed_missing: float) -> str:
    """
    Etykieta UI WMS/OMS: ``shortage`` | ``waiting`` | ``resolved`` | ``none``.
    ``resolved`` = zgłoszono brak z WMS (``wms_shortage_declared_qty``), a bieżący brak operacyjny = 0 (np. po decyzji OMS).
    """
    mq = float(computed_missing or 0.0)
    if mq > 1e-9:
        return "shortage"
    if _oms_waiting_for_stock(oi):
        return "waiting"
    declared = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
    if declared > 1e-9:
        return "resolved"
    return "none"


def compute_line_missing_qty(
    db: Session,
    order: Order,
    oi: OrderItem,
    *,
    session_cart_id: int | None = None,
) -> float:
    """
    missing = ordered - picked - removed - replaced - waiting

    ``waiting``: jeśli OMS oznaczył „czeka na towar”, odejmujemy cały pozostały luz (brak widoczny = 0).
    ``removed`` / ``replaced``: ilości z metadanych operacji OMS (domyślnie 0).
    ``wms_shortage_declared_qty``: zgłoszenie braku z WMS — nie więcej niż luz (ordered - picked).

    ``session_cart_id``: gdy podane (lub gdy ``order.cart_id`` jest ustawione), luz liczony jest jak przy
    domykaniu wózka — suma zdarzeń PICK **tylko z tego wózka**, a nie globalna suma linii po zamówieniu.
    Dzięki temu ``wms_picking_line_missing_qty`` jest spójne z walidacją ``finalize-cart``.
    """
    if (getattr(oi, "oms_line_status", None) or "").strip().upper() == OMS_LINE_STATUS_REPLACED:
        return 0.0
    ordered = float(oi.quantity or 0)
    cid: int | None = None
    if session_cart_id is not None and int(session_cart_id) > 0:
        cid = int(session_cart_id)
    elif getattr(order, "cart_id", None) is not None and int(order.cart_id) > 0:
        cid = int(order.cart_id)
    if cid is not None:
        picked = float(sum_pick_events_for_line_cart(db, int(oi.id), cid))
    else:
        picked = float(line_picked_sum_for_order(db, int(oi.id), order))
    gap = max(0.0, ordered - picked)
    declared = float(sum_line_events(db, int(oi.id), FE_MISSING))
    if declared < 1e-9:
        declared = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
    # Brak magazynowy liczymy po zgłoszeniu z WMS (suma zdarzeń MISSING lub legacy kolumna).
    if declared < 1e-9:
        shortfall = 0.0
    else:
        shortfall = min(gap, max(0.0, declared))
    removed = float(getattr(oi, "oms_removed_qty", None) or 0.0)
    replaced = float(getattr(oi, "oms_replaced_qty", None) or 0.0)
    if _oms_waiting_for_stock(oi):
        cover = float(sum_line_events(db, int(oi.id), FE_WAITING))
        if cover < 1e-9:
            cover = _oms_waiting_missing_cover_qty(oi)
        if cover > 1e-9:
            waiting_term = min(shortfall, cover)
        else:
            waiting_term = shortfall
    else:
        waiting_term = 0.0
    missing = shortfall - removed - replaced - waiting_term
    return max(0.0, round(missing, 6))


def order_item_needs_substitute_pick_completion(db: Session, order: Order, oi: OrderItem) -> bool:
    """
    Linia zastępcza po zamianie: ``replaced_from_order_item_id`` lub nadal ``TO_PICK`` —
    dopóki suma PICK < ``quantity``, zadanie Braków i kompletacja muszą widzieć pracę magazynową.
    """
    if order_item_is_replaced_line(oi):
        return False
    rid = getattr(oi, "replaced_from_order_item_id", None)
    st = (getattr(oi, "oms_line_status", None) or "").strip().upper()
    if not ((rid is not None and int(rid) > 0) or st == OMS_LINE_STATUS_TO_PICK):
        return False
    ordered = float(oi.quantity or 0)
    if ordered <= 1e-9:
        return False
    cid = getattr(order, "cart_id", None)
    if cid is not None and int(cid) > 0:
        picked = float(sum_pick_events_for_line_cart(db, int(oi.id), int(cid)))
    else:
        picked = float(line_picked_sum_for_order(db, int(oi.id), order))
    if picked + 1e-9 >= ordered:
        return False
    miss_ln = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0)
    if miss_ln + picked + 1e-9 >= ordered:
        return False
    return True


def order_has_pending_replacement_picking(db: Session, order: Order) -> bool:
    """Niepełna zbiórka linii zastępczej po zamianie (nie zależy od wyczyszczenia ``oms_line_status`` po częściowym picku)."""
    for oi in order.items or []:
        if order_item_needs_substitute_pick_completion(db, order, oi):
            return True
    return False


def oms_replacement_new_product_name(oi: OrderItem) -> str | None:
    """Nazwa nowego produktu z metadanych zamiany (linia ``REPLACED``)."""
    ols = (getattr(oi, "oms_line_status", None) or "").strip().upper()
    if ols != OMS_LINE_STATUS_REPLACED:
        return None
    meta = _order_item_meta_dict(oi)
    rep = meta.get("oms_replacement") if isinstance(meta.get("oms_replacement"), dict) else {}
    new_name = str(rep.get("new_product_name") or "").strip()
    return new_name or None


def oms_line_secondary_trace_text(db: Session, order: Order, oi: OrderItem) -> str | None:
    """Tekst audytowy pod linią: stary produkt po zamianie / nowy zamiennik (OMS)."""
    _ = db, order
    ols = (getattr(oi, "oms_line_status", None) or "").strip().upper()
    if ols == OMS_LINE_STATUS_REPLACED:
        new_name = oms_replacement_new_product_name(oi)
        if new_name:
            return f"Zamieniono → nowy produkt {new_name}"
        return "Zamieniono → nowy produkt (bez nazwy w metadanych)."
    rep_oid = getattr(oi, "replaced_from_order_item_id", None)
    if rep_oid is not None and int(rep_oid) > 0:
        old = (getattr(oi, "replaced_from_product_name", None) or "").strip()
        if old:
            return f"Dodano jako zamiennik za produkt {old}"
    return None


def order_has_waiting_for_stock_lines(order: Order) -> bool:
    """OMS oznaczył „czeka na towar” na którejkolwiek linii — zamówienie nadal w workflow braków."""
    for oi in order.items or []:
        if _oms_waiting_for_stock(oi):
            return True
    return False


def order_requires_shortage_handling(db: Session, order: Order) -> bool:
    """Delegacja do centralnego ``braki_order_state_service`` (pick ≠ koniec workflow)."""
    from .braki_order_state_service import order_requires_shortage_handling as _central

    return _central(db, order)


def _recompute_line_missing_columns(
    db: Session,
    order: Order,
    *,
    session_cart_id: int | None = None,
) -> None:
    for oi in order.items or []:
        mq = compute_line_missing_qty(db, order, oi, session_cart_id=session_cart_id)
        oi.wms_picking_line_missing_qty = mq
        if mq <= 1e-9:
            st = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()
            if st == "missing":
                oi.wms_picking_line_status = None


def _resolve_panel_status_after_shortage_cleared(db: Session, order: Order) -> None:
    """Zdejmuje status panelu „Braki” po pełnym rozwiązaniu workflow braków."""
    from ..models.picking_config import PickingConfig
    from ..models.wms_packing_settings import WmsPackingSettings
    from .wms_picking_shortage_settings_service import get_or_create_wms_picking_shortage_settings

    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    ss = get_or_create_wms_picking_shortage_settings(db, tenant_id=tid, warehouse_id=wid)
    rep_sid = getattr(ss, "shortage_reported_order_ui_status_id", None)
    if rep_sid is None or int(rep_sid) <= 0:
        return
    cur_sid = getattr(order, "order_ui_status_id", None)
    if cur_sid is None or int(cur_sid) != int(rep_sid):
        return

    next_sid = getattr(ss, "recovery_completed_order_ui_status_id", None)
    if next_sid is None or int(next_sid) <= 0:
        pack = (
            db.query(WmsPackingSettings)
            .filter(
                WmsPackingSettings.tenant_id == tid,
                WmsPackingSettings.warehouse_id == wid,
            )
            .first()
        )
        if pack is not None and getattr(pack, "start_status_id", None) is not None:
            next_sid = int(pack.start_status_id)
    if next_sid is None or int(next_sid) <= 0:
        pc = (
            db.query(PickingConfig)
            .filter(
                PickingConfig.tenant_id == tid,
                PickingConfig.warehouse_id == wid,
            )
            .order_by(PickingConfig.id.asc())
            .first()
        )
        if pc is not None and getattr(pc, "target_status_id", None) is not None:
            next_sid = int(pc.target_status_id)
    if next_sid is not None and int(next_sid) > 0:
        order.order_ui_status_id = int(next_sid)


def _order_fully_picked_for_fulfillment(db: Session, order: Order) -> bool:
    """Czy wszystkie aktywne linie mają zebraną pełną ilość (bez operacyjnego braku)."""
    eps = 1e-5
    for oi in order.items or []:
        if (getattr(oi, "oms_line_status", None) or "").strip().upper() == OMS_LINE_STATUS_REPLACED:
            qty = float(oi.quantity or 0)
            if qty <= eps:
                continue
            picked = float(line_picked_sum_for_order(db, int(oi.id), order))
            if picked + eps < qty:
                return False
            continue
        qty = float(oi.quantity or 0)
        if qty <= eps:
            continue
        if float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0) > eps:
            return False
        picked = float(line_picked_sum_for_order(db, int(oi.id), order))
        if picked + eps < qty:
            return False
    return True


def _enforce_packing_queue_eligibility(db: Session, order: Order) -> None:
    """Zamówienia z aktywnym workflow braków nie mogą mieć ``READY_TO_PACK`` (kolejka pakowania)."""
    from .braki_order_state_service import order_can_show_ready_pack

    cur = (getattr(order, "fulfillment_state", None) or "").strip().upper()
    if cur == FS_READY_TO_PACK and not order_can_show_ready_pack(db, order):
        order.fulfillment_state = FS_NEEDS_DECISION


def sync_shortage_workflow_for_order(db: Session, order: Order) -> None:
    """
    Utrzymuje spójność: kolejka WMS Braki (``OrderIssueTask``), status panelu OMS, ``fulfillment_state``.
    """
    from .braki_order_state_service import (
        log_braki_shortage_sync,
        log_braki_workflow_resolution,
        order_braki_workflow_complete,
    )
    from .order_issue_task_service import ensure_open_issue_task_for_order
    from .wms_operational_task_service import (
        close_operational_tasks_for_order,
        dual_write_enabled,
        sync_operational_tasks_for_order,
    )

    _enforce_packing_queue_eligibility(db, order)
    if not order_braki_workflow_complete(db, order):
        ensure_open_issue_task_for_order(db, order)
        log_braki_shortage_sync(db, order, reason="sync_open")
        log_braki_workflow_resolution(db, order, reason="sync_open")
        if dual_write_enabled():
            try:
                sync_operational_tasks_for_order(db, order)
            except Exception:
                import logging

                logging.getLogger(__name__).warning(
                    "wms_operational_task sync failed order_id=%s",
                    getattr(order, "id", None),
                    exc_info=True,
                )
        return

    _close_open_issue_tasks_if_no_shortage(db, order)
    _enforce_packing_queue_eligibility(db, order)
    log_braki_shortage_sync(db, order, reason="sync_close")
    log_braki_workflow_resolution(db, order, reason="sync_close")
    if dual_write_enabled():
        try:
            close_operational_tasks_for_order(db, order)
        except Exception:
            import logging

            logging.getLogger(__name__).warning(
                "wms_operational_task close failed order_id=%s",
                getattr(order, "id", None),
                exc_info=True,
            )
    _resolve_panel_status_after_shortage_cleared(db, order)
    _clear_fulfillment_shortage_state_if_resolved(db, order)


def recalculate_order_shortage_state(
    db: Session,
    order_id: int,
    *,
    commit: bool = True,
    session_cart_id: int | None = None,
) -> None:
    """
    Jednolite przeliczenie po każdej akcji braku (OMS / WMS):
    ilości braków na liniach + kolejka Braki + status zamówienia + fulfillment_state.
    """
    order = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id == int(order_id))
        .first()
    )
    if order is None:
        return
    _recompute_line_missing_columns(db, order, session_cart_id=session_cart_id)
    sync_shortage_workflow_for_order(db, order)
    if commit:
        db.commit()


def recompute_order_fulfillment(
    db: Session,
    order_id: int,
    *,
    commit: bool = True,
    session_cart_id: int | None = None,
) -> None:
    """Przelicza braki na liniach i synchronizuje workflow braków (alias: ``recalculate_order_shortage_state``)."""
    recalculate_order_shortage_state(
        db,
        int(order_id),
        commit=commit,
        session_cart_id=session_cart_id,
    )


def _close_open_issue_tasks_if_no_shortage(db: Session, order: Order) -> None:
    """Zamyka OPEN ``order_issue_tasks`` gdy workflow braków jest faktycznie zakończony."""
    from .braki_order_state_service import order_braki_workflow_complete

    if not order_braki_workflow_complete(db, order):
        return
    tasks = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.order_id == int(order.id),
            OrderIssueTask.status == "OPEN",
        )
        .all()
    )
    for t in tasks:
        mark_task_done(db, t, "Braki wyzerowane — zamknięto z kolejki (OMS/recompute)")


def _clear_fulfillment_shortage_state_if_resolved(db: Session, order: Order) -> None:
    """Gdy workflow braków zakończony — wyjście z NEEDS_DECISION/MISSING do PICKING lub READY_TO_PACK."""
    if order_requires_shortage_handling(db, order):
        return
    cur = (getattr(order, "fulfillment_state", None) or "").strip().upper()
    if cur not in (FS_MISSING, FS_NEEDS_DECISION):
        return
    if _order_fully_picked_for_fulfillment(db, order):
        order.fulfillment_state = FS_READY_TO_PACK
    else:
        order.fulfillment_state = FS_PICKING
