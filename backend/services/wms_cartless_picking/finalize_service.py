"""Finalize cartless picking session — bez WarehouseCart lifecycle."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Literal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ...models.app_user import AppUser
from ...models.order import Order
from ...models.order_item import order_item_is_replaced_line
from ...models.pick import Pick
from ...models.picking_config import PickingConfig
from ...schemas.wms_picking_products import WmsPickingOrderTypeFilter
from ..fulfillment_event_service import mark_pick_events_finalized_for_pick_ids
from ..order_fulfillment_recompute import recompute_order_fulfillment
from ..order_fulfillment_state import (
    MISSING as FS_MISSING,
    NEEDS_DECISION as FS_NEEDS_DECISION,
    PACKING as FS_PACKING,
    apply_fulfillment_state,
    clear_order_picking_session_context,
)
from ..order_issue_task_service import ensure_open_issue_task_for_order
from ..wms_audit_service import emit_wms_picking_finished
from ..wms_picking_product_list_service import (
    PickingFinalizeError,
    _decrement_inventory_for_wms_pick,
    _order_type_filter,
    _panel_status_after_picking_finalize,
)
from ..wms_picking_shortage_settings_service import get_or_create_wms_picking_shortage_settings
from .scope import get_cartless_session_or_raise, list_order_ids_on_picking_session

logger = logging.getLogger(__name__)

OrderFinalizeKind = Literal["all_picked", "all_missing", "some_missing"]


def _picked_qty_for_order_item_cartless(db: Session, *, order_item_id: int) -> float:
    row = (
        db.query(func.coalesce(func.sum(Pick.quantity), 0.0))
        .filter(
            Pick.order_item_id == int(order_item_id),
            Pick.cart_id.is_(None),
            Pick.status.in_(("done", "picking", "waiting")),
        )
        .scalar()
    )
    return float(row or 0.0)


def finalize_cartless_picking_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: WmsPickingOrderTypeFilter,
    picking_session_id: int,
    operator_user_id: int | None = None,
    performed_by: AppUser | None = None,
) -> dict[str, Any]:
    """
    Domknięcie sesji cartless: klasyfikacja zamówień + issue tasks,
    bez claim/release/detach WarehouseCart. order.cart_id pozostaje NULL.
    """
    _ = _order_type_filter(order_type)
    try:
        sess = get_cartless_session_or_raise(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            session_id=int(picking_session_id),
            operator_user_id=int(operator_user_id) if operator_user_id else None,
            require_open=True,
            allow_system=operator_user_id is None,
        )
    except PermissionError as e:
        raise PickingFinalizeError(
            str(e),
            reason="session_ownership",
            step="start",
            http_status=403,
            code="session_forbidden",
        ) from e
    except ValueError as e:
        raise PickingFinalizeError(
            str(e),
            reason="session_not_found",
            step="start",
            http_status=404,
            code="session_not_found",
        ) from e

    pc = (
        db.query(PickingConfig)
        .filter(
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
            PickingConfig.source_status_id == int(source_status_id),
        )
        .first()
    )
    if not pc:
        raise PickingFinalizeError(
            "Brak konfiguracji zbierania dla tego statusu źródłowego.",
            reason="missing_picking_config",
            step="start",
            http_status=404,
            code="picking_config_not_found",
        )

    order_ids = list_order_ids_on_picking_session(db, session_id=int(picking_session_id))
    if not order_ids:
        raise PickingFinalizeError(
            "Brak zamówień w tej sesji zbierania.",
            reason="empty_cohort",
            step="start",
            http_status=400,
            code="cohort_empty",
        )

    psid = int(picking_session_id)

    try:
        for oid in order_ids:
            recompute_order_fulfillment(db, int(oid), commit=False, session_cart_id=None)
        db.flush()
    except Exception as exc:
        raise PickingFinalizeError(
            f"Nie udało się przeliczyć stanu zamówień: {exc}",
            reason=exc.__class__.__name__,
            step="recompute_fulfillment",
            http_status=409,
            code="fulfillment_recompute_failed",
        ) from exc

    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id.in_(list(order_ids)))
        .all()
    )
    for o in orders:
        if getattr(o, "cart_id", None) is not None:
            raise PickingFinalizeError(
                f"Zamówienie #{o.number or o.id} ma cart_id — to nie jest sesja cartless.",
                reason="unexpected_cart_id",
                order_id=int(o.id),
                step="validate",
                http_status=409,
                code="unexpected_cart_id",
            )
        if int(getattr(o, "picking_session_id", 0) or 0) != psid:
            raise PickingFinalizeError(
                f"Zamówienie #{o.number or o.id} nie należy do tej sesji.",
                reason="wrong_session",
                order_id=int(o.id),
                step="validate",
                http_status=409,
                code="order_wrong_session",
            )

    try:
        pending_picks = (
            db.query(Pick)
            .filter(
                Pick.tenant_id == int(tenant_id),
                Pick.warehouse_id == int(warehouse_id),
                Pick.cart_id.is_(None),
                Pick.order_id.in_(list(order_ids)),
                Pick.picked_at.is_(None),
            )
            .order_by(Pick.id.asc())
            .all()
        )
        now = datetime.utcnow()
        finalized_ids: list[int] = []
        for p in pending_picks:
            finalized_rows = _decrement_inventory_for_wms_pick(
                db, p, performed_by=performed_by, picked_at=now
            )
            for row in finalized_rows:
                row.picked_at = now
                row.status = "done"
                finalized_ids.append(int(row.id))
        mark_pick_events_finalized_for_pick_ids(db, finalized_ids)
    except Exception as exc:
        raise PickingFinalizeError(
            f"Nie udało się spisać stanu magazynu: {exc}",
            reason=exc.__class__.__name__,
            step="inventory",
            http_status=409,
            code="inventory_finalize_failed",
        ) from exc

    ss = get_or_create_wms_picking_shortage_settings(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    rep_sid = getattr(ss, "shortage_reported_order_ui_status_id", None)
    rep_sid_i = int(rep_sid) if rep_sid is not None and int(rep_sid) > 0 else None

    order_kinds: dict[int, OrderFinalizeKind] = {}
    for o in orders:
        any_line = False
        all_missing = True
        all_picked = True
        for oi in o.items or []:
            if order_item_is_replaced_line(oi):
                continue
            qty = float(oi.quantity or 0)
            if qty <= 1e-5:
                continue
            any_line = True
            picked = _picked_qty_for_order_item_cartless(db, order_item_id=int(oi.id))
            miss = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0)
            if miss + 1e-5 < qty:
                all_missing = False
            if picked + miss + 1e-5 < qty:
                all_picked = False
            if picked > 1e-5:
                all_missing = False
        if not any_line or all_picked:
            kind: OrderFinalizeKind = "all_picked"
        elif all_missing:
            kind = "all_missing"
        else:
            kind = "some_missing"
        order_kinds[int(o.id)] = kind

    for o in orders:
        oid = int(o.id)
        kind = order_kinds.get(oid, "all_picked")
        if kind == "all_picked":
            fs = FS_PACKING
        elif kind == "all_missing":
            fs = FS_MISSING
        else:
            fs = FS_NEEDS_DECISION
        o.order_ui_status_id = _panel_status_after_picking_finalize(
            shortage_reported_order_ui_status_id=rep_sid_i,
            pc=pc,
            kind=kind,
        )
        apply_fulfillment_state(o, fs, clear_cart=False, clear_session=False)
        if fs == FS_PACKING:
            o.status = "PACKING"
        clear_order_picking_session_context(o)
        assert getattr(o, "cart_id", None) is None
        db.add(o)
        try:
            emit_wms_picking_finished(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                order=o,
                cart_id=None,
                operator_user_id=operator_user_id,
                new_order_ui_status_id=int(o.order_ui_status_id)
                if getattr(o, "order_ui_status_id", None)
                else None,
            )
        except Exception:
            logger.exception("cartless.finalize emit finished failed order_id=%s", oid)
        if kind != "all_picked":
            try:
                ensure_open_issue_task_for_order(db, o)
            except Exception:
                logger.exception("cartless.finalize issue task failed order_id=%s", oid)

    now = datetime.utcnow()
    sess.completed_at = now
    sess.last_activity_at = now
    sess.completed_reason = "finalize"
    db.add(sess)

    logger.info(
        "cartless.finalize session_id=%s orders=%s kinds=%s cart_id=NULL",
        psid,
        order_ids,
        order_kinds,
    )
    return {
        "ok": True,
        "session_id": psid,
        "cart_id": None,
        "order_ids": order_ids,
        "order_kinds": {str(k): v for k, v in order_kinds.items()},
        "cart_released": False,
        "cart_status": None,
    }
