"""Cartless shortage report — bez WarehouseCart / detach / release."""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import Optional, Sequence

from sqlalchemy.orm import Session, joinedload

from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.wms_picking_shortage_report import WmsPickingShortageReport
from ...schemas.wms_picking_products import WmsPickingOrderTypeFilter
from ..fulfillment_event_service import append_event, sync_declared_shortage_column_from_missing_events
from ...models.fulfillment_event import FE_MISSING
from ..order_fulfillment_recompute import recompute_order_fulfillment
from ..order_fulfillment_state import touch_picking_in_progress
from ..order_issue_task_service import upsert_order_issue_tasks_from_shortage
from ..wms_audit_service import emit_line_shortage_reported
from ..picking_config_query import resolve_picking_config_for_shortage_report
from ..wms_picking_product_list_service import (
    _allowed_pick_location_ids_for_product,
    _line_eligible_for_shortage_report,
    _order_type_filter,
    _report_shortage_reject,
    _shortage_line_report_context,
    resolve_wms_picking_order_ids,
)
from ..wms_picking_shortage_settings_service import get_or_create_wms_picking_shortage_settings
from .scope import get_cartless_session_or_raise, sum_picks_for_order_item_cartless
from .undo_service import undo_cartless_session_picks

logger = logging.getLogger(__name__)


def _line_shortage_qty_cartless(db: Session, oi: OrderItem) -> dict[str, float]:
    qty = float(oi.quantity or 0)
    picked_raw = float(sum_picks_for_order_item_cartless(db, order_item_id=int(oi.id)))
    from ..fulfillment_event_service import sum_line_events

    raw_miss_col = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0)
    declared_col = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
    raw_event_miss = float(sum_line_events(db, int(oi.id), FE_MISSING))
    miss_uncapped = max(raw_miss_col, raw_event_miss, declared_col)
    gap = max(0.0, qty - min(picked_raw, qty))
    miss_ln = min(miss_uncapped, gap) if gap > 1e-12 else 0.0
    declared = min(max(declared_col, raw_event_miss), gap) if gap > 1e-12 else 0.0
    picked_eff = min(picked_raw, max(0.0, qty - miss_ln))
    remaining_qty = max(0.0, qty - picked_eff - miss_ln)
    shortage_existing = max(miss_ln, declared)
    declarable_qty = max(0.0, qty - miss_ln)
    return {
        "required_qty": qty,
        "picked_qty": picked_eff,
        "picked_qty_raw": picked_raw,
        "shortage_qty_existing": shortage_existing,
        "missing_qty_line": miss_ln,
        "declared_qty": declared,
        "remaining_qty": remaining_qty,
        "declarable_qty": declarable_qty,
    }


def report_cartless_picking_product_shortage(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: WmsPickingOrderTypeFilter,
    product_id: int,
    location_id: Optional[int],
    missing_qty: float,
    picking_session_id: int,
    ui_order_ids: Optional[Sequence[int]] = None,
    order_item_id: int | None = None,
    operator_user_id: int | None = None,
) -> dict:
    """
    Zgłoszenie braku w sesji cartless.
    Semantyka biznesowa jak przy cart picking, bez detach/release WarehouseCart.
    """
    get_cartless_session_or_raise(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        session_id=int(picking_session_id),
        operator_user_id=int(operator_user_id) if operator_user_id else None,
        require_open=True,
    )

    payload_log = {
        "product_id": int(product_id),
        "location_id": int(location_id) if location_id is not None else None,
        "missing_qty": float(missing_qty),
        "picking_session_id": int(picking_session_id),
        "cart_id": None,
        "order_ids": list(ui_order_ids) if ui_order_ids is not None else None,
        "order_item_id": int(order_item_id) if order_item_id is not None else None,
    }
    pid = int(product_id)
    target_item_id = int(order_item_id) if order_item_id is not None and int(order_item_id) > 0 else None

    pc, picking_ctx = resolve_picking_config_for_shortage_report(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_id=int(source_status_id),
        order_item_id=target_item_id,
        recovery_order_id=None,
    )
    workflow_scoped = bool(picking_ctx.get("workflow_scoped"))
    if pc is None and not workflow_scoped:
        _report_shortage_reject(
            "Brak konfiguracji zbierania dla tego statusu źródłowego.",
            payload=payload_log,
            picking_context=picking_ctx,
        )

    ot = _order_type_filter(order_type)
    session_scope_ids = resolve_wms_picking_order_ids(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        source_status_id=source_status_id,
        order_type=ot,
        picking_session_id=int(picking_session_id),
    )
    if target_item_id is not None:
        oi_target = db.query(OrderItem).filter(OrderItem.id == int(target_item_id)).first()
        if oi_target is None:
            _report_shortage_reject("Nie znaleziono linii zamówienia (order_item_id).", payload=payload_log)
        if int(oi_target.product_id) != pid:
            _report_shortage_reject("product_id nie odpowiada wskazanej linii zamówienia.", payload=payload_log)
        ok_ln, why_ln = _line_eligible_for_shortage_report(oi_target)
        if not ok_ln:
            _report_shortage_reject(f"Linia nie kwalifikuje się do zgłoszenia braku ({why_ln}).", payload=payload_log)
        session_scope_ids = [int(oi_target.order_id)]

    if not session_scope_ids:
        _report_shortage_reject("Brak zamówień w tej sesji zbierania.", payload=payload_log)

    if ui_order_ids is not None and len(list(ui_order_ids)) > 0:
        want = [int(x) for x in ui_order_ids if int(x) > 0]
        allowed = set(session_scope_ids)
        session_scope_ids = list(dict.fromkeys([oid for oid in want if oid in allowed]))

    if not session_scope_ids:
        _report_shortage_reject("Brak zamówień w bieżącej sesji zbierania.", payload=payload_log)

    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id.in_(session_scope_ids))
        .order_by(Order.id.asc())
        .all()
    )
    for o in orders:
        if getattr(o, "cart_id", None) is not None:
            _report_shortage_reject(
                f"Zamówienie #{o.number or o.id} ma cart_id — to nie jest sesja cartless.",
                payload=payload_log,
            )

    if location_id is not None:
        allowed_locs = _allowed_pick_location_ids_for_product(
            db, tenant_id=tenant_id, order_ids=session_scope_ids, product_id=pid
        )
        if allowed_locs and int(location_id) not in allowed_locs:
            _report_shortage_reject(
                "Lokalizacja nie należy do trasy zbiórki tego produktu.",
                payload=payload_log,
            )

    def _iter_report_lines(o: Order):
        for oi in sorted(o.items or [], key=lambda x: int(x.id)):
            if target_item_id is not None and int(oi.id) != int(target_item_id):
                continue
            if int(oi.product_id) != pid:
                continue
            ok, _reason = _line_eligible_for_shortage_report(oi)
            if not ok:
                continue
            yield oi, _line_shortage_qty_cartless(db, oi)

    candidate_item_ids: list[int] = []
    for o in orders:
        for oi, _q in _iter_report_lines(o):
            candidate_item_ids.append(int(oi.id))
    if candidate_item_ids:
        locked_rows = list(
            db.query(OrderItem)
            .filter(OrderItem.id.in_(list(dict.fromkeys(candidate_item_ids))))
            .with_for_update()
            .all()
        )
        if locked_rows:
            locked_by_id = {int(r.id): r for r in locked_rows}
            for o in orders:
                refreshed: list[OrderItem] = []
                for oi in o.items or []:
                    locked = locked_by_id.get(int(oi.id))
                    refreshed.append(locked if locked is not None else oi)
                o.items = refreshed

    affected: list[int] = []
    for o in orders:
        for oi, q in _iter_report_lines(o):
            if float(q["declarable_qty"]) > 1e-9:
                affected.append(int(o.id))
                break

    ss_ui_early = get_or_create_wms_picking_shortage_settings(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    allow_continue_early = bool(getattr(ss_ui_early, "allow_continue_other_lines_after_shortage", True))

    if not affected:
        _report_shortage_reject(
            "Cała wymagana ilość została już rozliczona (zebrano + brak = zamówione).",
            payload=payload_log,
        )

    aff_set = list(dict.fromkeys(affected))
    max_declarable = 0.0
    for o in orders:
        if int(o.id) not in aff_set:
            continue
        for _oi, q in _iter_report_lines(o):
            max_declarable += max(0.0, float(q["declarable_qty"]))
    max_declarable = round(max_declarable, 6)
    if float(missing_qty) > max_declarable + 1e-6:
        _report_shortage_reject(
            f"Nie można zgłosić więcej niż {max_declarable:g} szt. braku.",
            payload=payload_log,
            max_declarable=max_declarable,
        )

    remaining_budget = max(0.0, float(missing_qty))
    line_audit_rows: list[tuple[Order, OrderItem, float]] = []

    def _apply_shortage_take(o: Order, oi: OrderItem, *, take: float, rem_before: float) -> None:
        nonlocal remaining_budget
        if take <= 1e-9:
            return
        remaining_budget = max(0.0, remaining_budget - take)
        declared_ln = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
        oi.wms_shortage_declared_qty = round(declared_ln + take, 6)
        miss_ln = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0)
        oi.wms_picking_line_missing_qty = round(miss_ln + take, 6)
        oi.wms_picking_line_status = "missing"
        need_undo = max(0.0, float(take) - float(rem_before))
        if need_undo > 1e-9:
            undo_cartless_session_picks(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=int(oi.product_id),
                quantity=float(need_undo),
                location_id=int(location_id) if location_id is not None else None,
                order_ids=[int(o.id)],
                order_item_id=int(oi.id),
                operator_user_id=operator_user_id,
            )
        append_event(
            db,
            order_item_id=int(oi.id),
            event_type=FE_MISSING,
            quantity=float(take),
            metadata={
                "cart_id": None,
                "picking_session_id": int(picking_session_id),
                "source": "wms_report_shortage_cartless",
                "undid_picks_qty": float(need_undo),
                "order_id": int(o.id),
                "product_id": int(oi.product_id),
            },
        )
        sync_declared_shortage_column_from_missing_events(db, int(oi.id))
        line_audit_rows.append((o, oi, float(take)))

    for o in orders:
        if int(o.id) not in aff_set or remaining_budget <= 1e-9:
            continue
        touch_picking_in_progress(o)
        for oi, q in _iter_report_lines(o):
            if remaining_budget <= 1e-9:
                break
            rem_only = float(q["remaining_qty"])
            if rem_only <= 1e-9:
                continue
            take = min(rem_only, remaining_budget)
            _apply_shortage_take(o, oi, take=take, rem_before=rem_only)

    if remaining_budget > 1e-9:
        for o in orders:
            if int(o.id) not in aff_set or remaining_budget <= 1e-9:
                continue
            touch_picking_in_progress(o)
            for oi, q in _iter_report_lines(o):
                if remaining_budget <= 1e-9:
                    break
                q2 = _line_shortage_qty_cartless(db, oi)
                rem_left = float(q2["remaining_qty"])
                convert_cap = max(0.0, float(q2["declarable_qty"]) - rem_left)
                if convert_cap <= 1e-9:
                    continue
                take = min(convert_cap, remaining_budget)
                _apply_shortage_take(o, oi, take=take, rem_before=rem_left)

    for oid in aff_set:
        recompute_order_fulfillment(db, int(oid), commit=False, session_cart_id=None)

    for o, oi, take in line_audit_rows:
        if take <= 1e-9:
            continue
        ctx = _shortage_line_report_context(db, oi, is_recovery=False)
        q_after = _line_shortage_qty_cartless(db, oi)
        pr = oi.product if getattr(oi, "product", None) is not None else None
        ean_v = getattr(pr, "ean", None) if pr is not None else None
        sku_v = getattr(pr, "sku", None) if pr is not None else None
        emit_line_shortage_reported(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(o.id),
            order_item_id=int(oi.id),
            product_id=int(pid),
            product_name=str(ctx["product_name"]),
            location_id=int(location_id) if location_id is not None else None,
            cart_id=None,
            shortage_qty=float(take),
            operator_user_id=operator_user_id,
            reason="wms_report_shortage_cartless",
            order_number=str(getattr(o, "number", None) or f"#{o.id}"),
            ean=str(ean_v).strip() if ean_v else None,
            sku=str(sku_v).strip() if sku_v else None,
            required_qty=float(q_after["required_qty"]),
            picked_qty=float(q_after["picked_qty"]),
            remaining_qty=float(q_after["remaining_qty"]),
            cart_code=None,
            picking_session_id=int(picking_session_id),
        )

    effective_source_status_id = int(
        picking_ctx.get("resolved_source_status_id") or int(source_status_id)
    )
    rep = WmsPickingShortageReport(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_id=effective_source_status_id,
        order_type=str(order_type),
        product_id=pid,
        location_id=int(location_id) if location_id is not None else None,
        missing_qty=float(missing_qty),
        order_ids_json=json.dumps(aff_set),
    )
    db.add(rep)

    task_ids = upsert_order_issue_tasks_from_shortage(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_ids=list(aff_set),
        shortage_product_id=pid,
        source_picking_cart_id=None,
        source_operator_id=operator_user_id,
    )

    logger.info(
        "cartless.shortage OK session_id=%s order_ids=%s task_ids=%s",
        int(picking_session_id),
        aff_set,
        task_ids,
    )
    return {
        "ok": True,
        "already_resolved": False,
        "orders_updated": len(aff_set),
        "target_status_id": None,
        "order_ids": aff_set,
        "order_issue_task_ids": task_ids,
        "allow_continue_other_lines_after_shortage": allow_continue_early,
        "cart_id": None,
        "picking_session_id": int(picking_session_id),
    }
