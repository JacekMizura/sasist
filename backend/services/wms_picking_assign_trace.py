"""
PICK_ASSIGN_TRACE — tymczasowa diagnostyka assignmentu po skanie wózka.

Loguje STATUS_COUNT vs eligibility vs gate vs capacity dla każdego zamówienia
w surowym statusie (ten sam filtr co historyczny kafel), z jedną listą REJECTION_REASON.
"""

from __future__ import annotations

import logging
from typing import Sequence

from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from ..services.bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from ..services.order_fulfillment_state import MISSING, PARTIAL, PICKING, READY_TO_PACK
from ..services.wms_order_validation.reasons import (
    REASON_INSUFFICIENT_PICKABLE_STOCK,
    REASON_LOCATION_BLOCKED,
    REASON_MISSING_PICKING_LOCATION,
    REASON_PRODUCT_NOT_PICKABLE,
)
from ..services.wms_order_validation.service import validate_orders_for_picking
from ..services.wms_queue_eligibility import (
    assert_order_wms_fulfillment_not_blocked,
    order_eligible_for_wms_queues,
    WmsConsolidationBlockedError,
)

logger = logging.getLogger(__name__)

_OPEN_FULFILLMENT = frozenset({PICKING, PARTIAL, ""})


def list_raw_status_orders(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
) -> list[Order]:
    """STATUS_COUNT — wszystkie zamówienia z order_ui_status_id (historyczny kafel)."""
    return (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.order_ui_status_id == int(source_status_id),
        )
        .order_by(Order.id.asc())
        .all()
    )


def count_raw_status_orders(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_ids: Sequence[int],
) -> dict[int, int]:
    from sqlalchemy import func

    ids = [int(x) for x in source_status_ids if int(x) > 0]
    if not ids:
        return {}
    rows = (
        db.query(Order.order_ui_status_id, func.count(Order.id))
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.order_ui_status_id.in_(ids),
        )
        .group_by(Order.order_ui_status_id)
        .all()
    )
    return {int(sid): int(n) for sid, n in rows}


def _fulfillment_open(fs: str | None) -> bool:
    if fs is None:
        return True
    u = str(fs).strip().upper()
    return u in _OPEN_FULFILLMENT or u == PICKING


def classify_order_pick_rejection_reasons(
    db: Session,
    *,
    order: Order,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: str = "all",
    validation_by_id: dict[int, object] | None = None,
) -> list[str]:
    """Zwraca pustą listę gdy zamówienie jest eligible do assignmentu (pre-capacity)."""
    reasons: list[str] = []
    oid = int(order.id)

    if getattr(order, "deleted_at", None) is not None:
        reasons.append("OTHER:deleted")

    if int(getattr(order, "tenant_id", 0) or 0) != int(tenant_id):
        reasons.append("WRONG_TENANT")
    if int(getattr(order, "warehouse_id", 0) or 0) != int(warehouse_id):
        reasons.append("WRONG_WAREHOUSE")

    ui = getattr(order, "order_ui_status_id", None)
    if ui is None or int(ui) != int(source_status_id):
        reasons.append("WRONG_STATUS")

    if getattr(order, "cart_id", None) is not None:
        reasons.append("ALREADY_ASSIGNED")

    psid = getattr(order, "picking_session_id", None)
    if psid is not None and int(psid) > 0:
        from ..models.wms_operation_session import WmsOperationSession

        open_sess = (
            db.query(WmsOperationSession.id)
            .filter(
                WmsOperationSession.id == int(psid),
                WmsOperationSession.completed_at.is_(None),
            )
            .first()
        )
        if open_sess is not None:
            reasons.append("ACTIVE_PICKING_SESSION")
        # zamknięta / orphan session_id nie blokuje assignmentu (clear przy detach)

    if getattr(order, "picking_finished_at", None) is not None:
        reasons.append("OTHER:picking_finished")

    fs_raw = getattr(order, "fulfillment_state", None)
    fs = (str(fs_raw).strip().upper() if fs_raw is not None else None) or None
    if fs == MISSING:
        reasons.append("SHORTAGE_ORDER")
    elif fs in (READY_TO_PACK, "PACKING", "NEEDS_DECISION", "TO_PUTAWAY"):
        reasons.append("WRONG_FULFILLMENT_STATE")
    elif fs is not None and not _fulfillment_open(fs_raw):
        reasons.append("WRONG_FULFILLMENT_STATE")

    if not order_eligible_for_wms_queues(
        order,
        db=db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        queue_name="picking_assign_trace",
    ):
        reasons.append("OTHER:fulfillment_mode_excluded")

    try:
        assert_order_wms_fulfillment_not_blocked(order, db, for_picking=True)
    except WmsConsolidationBlockedError as exc:
        reasons.append(f"OTHER:consolidation:{exc}")

    # order_type single/multi — uproszczona ocena linii
    ot = (order_type or "all").strip().lower()
    if ot in ("single", "multi"):
        n_lines = 0
        for oi in order.items or []:
            if order_item_is_replaced_line(oi):
                continue
            if order_item_skip_bundle_commercial_header_for_ops(oi):
                continue
            if float(getattr(oi, "quantity", 0) or 0) <= 1e-9:
                continue
            n_lines += 1
        if ot == "single" and n_lines != 1:
            reasons.append("ORDER_TYPE_FILTER")
        if ot == "multi" and n_lines <= 1:
            reasons.append("ORDER_TYPE_FILTER")

    operational = 0
    all_missing = True
    has_any_line = False
    for oi in order.items or []:
        if order_item_is_replaced_line(oi):
            continue
        if order_item_skip_bundle_commercial_header_for_ops(oi):
            continue
        qty = float(getattr(oi, "quantity", 0) or 0)
        if qty <= 1e-9:
            continue
        has_any_line = True
        operational += 1
        miss = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0)
        decl = float(getattr(oi, "wms_shortage_declared_qty", None) or 0)
        if miss + 1e-9 < qty and decl + 1e-9 < qty:
            all_missing = False
    if not has_any_line or operational <= 0:
        reasons.append("NO_PICKABLE_LINES")
    elif all_missing and has_any_line:
        # Pełny brak na liniach — nadal SHORTAGE jeśli fulfillment nie oznaczony
        if "SHORTAGE_ORDER" not in reasons:
            reasons.append("ALL_LINES_MISSING")

    if validation_by_id is not None:
        res = validation_by_id.get(oid)
        if res is not None and not getattr(res, "ok", False) and not getattr(res, "is_technical_error", False):
            mapped = _map_validation_reasons(res)
            reasons.extend(mapped)
            if not mapped:
                reasons.append("VALIDATION_BLOCKED")

    # dedupe zachowując kolejność
    seen: set[str] = set()
    out: list[str] = []
    for r in reasons:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


def _map_validation_reasons(res: object) -> list[str]:
    out: list[str] = []
    issues = getattr(res, "issues", None) or []
    for iss in issues:
        code = str(getattr(iss, "reason_code", "") or "")
        if code == REASON_MISSING_PICKING_LOCATION:
            out.append("NO_LOCATION")
        elif code == REASON_INSUFFICIENT_PICKABLE_STOCK:
            out.append("NO_STOCK")
        elif code == REASON_LOCATION_BLOCKED:
            out.append("RESERVATION_CONFLICT")
        elif code == REASON_PRODUCT_NOT_PICKABLE:
            out.append("NO_PICKABLE_LINES")
        elif code:
            out.append(f"OTHER:{code}")
    return out


def log_pick_assign_trace(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: str,
    cart_id: int | None,
    cart_code: str | None = None,
    selected_ids: Sequence[int] | None = None,
    assigned_ids: Sequence[int] | None = None,
    commit_result: str = "pending",
    run_validation: bool = True,
) -> dict:
    """
    Pełny dump PICK_ASSIGN_TRACE. Zwraca dict (dla testów).
    """
    raw_orders = list_raw_status_orders(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_id=int(source_status_id),
    )
    status_count = len(raw_orders)
    validation_by_id: dict[int, object] = {}
    if run_validation and raw_orders:
        try:
            results = validate_orders_for_picking(
                db,
                order_ids=[int(o.id) for o in raw_orders],
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
            )
            validation_by_id = {int(r.order_id): r for r in results}
        except Exception:
            logger.exception("PICK_ASSIGN_TRACE validation batch failed")

    per_order: list[dict] = []
    eligible_ids: list[int] = []
    for o in raw_orders:
        reasons = classify_order_pick_rejection_reasons(
            db,
            order=o,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_type=order_type,
            validation_by_id=validation_by_id if run_validation else None,
        )
        # Capacity nie jest tu oceniane per-order (engine) — tylko pre-capacity eligibility
        eligible = len(reasons) == 0
        if eligible:
            eligible_ids.append(int(o.id))
        row = {
            "order_id": int(o.id),
            "status": getattr(o, "status", None),
            "fulfillment_state": getattr(o, "fulfillment_state", None),
            "cart_id": getattr(o, "cart_id", None),
            "picking_session_id": getattr(o, "picking_session_id", None),
            "warehouse_id": getattr(o, "warehouse_id", None),
            "tenant_id": getattr(o, "tenant_id", None),
            "ELIGIBLE": "YES" if eligible else "NO",
            "REJECTION_REASON": reasons,
        }
        per_order.append(row)

    selected = [int(x) for x in (selected_ids or [])]
    assigned = [int(x) for x in (assigned_ids or [])]
    payload = {
        "SOURCE_STATUS_ID": int(source_status_id),
        "ORDER_TYPE/FILTER": order_type,
        "WAREHOUSE_ID": int(warehouse_id),
        "TENANT_ID": int(tenant_id),
        "CART_ID": int(cart_id) if cart_id is not None else None,
        "CART_CODE": cart_code,
        "STATUS_COUNT": status_count,
        "RAW_CANDIDATE_COUNT": status_count,
        "orders": per_order,
        "ELIGIBLE_COUNT": len(eligible_ids),
        "SELECTED_COUNT": len(selected),
        "ASSIGNED_COUNT": len(assigned),
        "COMMIT_RESULT": commit_result,
    }

    logger.info(
        "PICK_ASSIGN_TRACE SOURCE_STATUS_ID=%s ORDER_TYPE=%s WAREHOUSE_ID=%s TENANT_ID=%s "
        "CART=%s/%s STATUS_COUNT=%s RAW_CANDIDATE_COUNT=%s",
        payload["SOURCE_STATUS_ID"],
        payload["ORDER_TYPE/FILTER"],
        payload["WAREHOUSE_ID"],
        payload["TENANT_ID"],
        payload["CART_ID"],
        payload["CART_CODE"],
        payload["STATUS_COUNT"],
        payload["RAW_CANDIDATE_COUNT"],
    )
    for row in per_order:
        logger.info(
            "PICK_ASSIGN_TRACE order_id=%s status=%s fulfillment_state=%s cart_id=%s "
            "picking_session_id=%s warehouse_id=%s tenant_id=%s ELIGIBLE=%s REJECTION_REASON=%s",
            row["order_id"],
            row["status"],
            row["fulfillment_state"],
            row["cart_id"],
            row["picking_session_id"],
            row["warehouse_id"],
            row["tenant_id"],
            row["ELIGIBLE"],
            row["REJECTION_REASON"] or [],
        )
    logger.info(
        "PICK_ASSIGN_TRACE ELIGIBLE_COUNT=%s SELECTED_COUNT=%s ASSIGNED_COUNT=%s COMMIT_RESULT=%s",
        payload["ELIGIBLE_COUNT"],
        payload["SELECTED_COUNT"],
        payload["ASSIGNED_COUNT"],
        payload["COMMIT_RESULT"],
    )
    return payload
