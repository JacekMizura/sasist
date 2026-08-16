"""
Handoff ORDERS production → existing Packing module.

- Mark sales order packing-ready (READY_TO_PACK + CARTLESS) after source fulfillment.
- Consume FG buffer inventory on packing finish (classic pick already consumed at pick).
- Detect production-origin for optional UI badge.
- Optional auto-pack when all newly-ready orders already have shipping labels
  (reuses ``packing_pack_all_lines`` + ``packing_finish_order`` — no second finalize path).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.fulfillment_event import FE_PICK, FulfillmentEvent
from ...models.order import Order
from ...models.order_item_pick_allocation import OrderItemPickAllocation
from ...models.picking_config import (
    AFTER_PRODUCTION_ACTION_STATUS_ONLY,
    AFTER_PRODUCTION_ACTIONS,
)
from ...models.production import ProductionOrder
from ..order_fulfillment_state import READY_TO_PACK
from ..order_item_pick_allocation_service import consume_inventory_fifo_slices
from ..order_shipping_label_service import (
    count_active_shipping_labels,
    has_shipping_label,
    list_active_shipping_label_documents,
)
from ..picking_handoff_service import apply_cartless_picking_handoff
from ..production_config_query import get_production_config_by_id
from ..stock_disposition import STOCK_DISPOSITION_SALEABLE

logger = logging.getLogger(__name__)

_CONSUMED_META_KEY = "production_buffer_consumed"


def _event_meta(ev: FulfillmentEvent) -> dict[str, Any]:
    raw = getattr(ev, "metadata_json", None)
    if not raw:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    try:
        parsed = json.loads(str(raw))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def resolve_after_production_action(db: Session, mo: ProductionOrder) -> str:
    """Config preference for operator UI (STATUS_ONLY | OPEN_PACKING). Default STATUS_ONLY."""
    pc_id = getattr(mo, "picking_config_id", None)
    if pc_id is None:
        return AFTER_PRODUCTION_ACTION_STATUS_ONLY
    pc = get_production_config_by_id(db, int(pc_id), require_active=False)
    if pc is None:
        return AFTER_PRODUCTION_ACTION_STATUS_ONLY
    raw = str(getattr(pc, "after_production_action", None) or AFTER_PRODUCTION_ACTION_STATUS_ONLY).strip().upper()
    return raw if raw in AFTER_PRODUCTION_ACTIONS else AFTER_PRODUCTION_ACTION_STATUS_ONLY


def mark_order_ready_for_packing_after_production(db: Session, order: Order) -> None:
    """
    Sales order finished production: enter normal packing cohort without a pick cart.
    Does not invent a second lifecycle — only packing provenance + fulfillment_state.
    """
    apply_cartless_picking_handoff(order)
    order.fulfillment_state = READY_TO_PACK
    if getattr(order, "picking_finished_at", None) is None:
        order.picking_finished_at = datetime.utcnow()
    db.add(order)


def order_awaits_packing_after_orders_production(order: Order) -> bool:
    """
    True when a sales order (already FG-fulfilled by ORDERS MO) still needs packing.

    Production source ``fulfilled`` means FG allocated — not packing done.
    Finished packing / shipped / DONE panel group → False.
    """
    st = getattr(order, "order_ui_status", None)
    main = str(getattr(st, "main_group", None) or "").strip().upper() if st is not None else ""
    if main == "DONE":
        return False
    name = str(getattr(st, "name", None) or "").strip().lower() if st is not None else ""
    if name and any(p in name for p in ("spakow", "packed", "wysł", "wysl", "shipped")):
        return False
    phase = str(getattr(order, "fulfillment_assignment_phase", None) or "").strip().upper()
    if phase == "SHIPPED":
        return False
    fs = str(getattr(order, "fulfillment_state", None) or "").strip().upper()
    if fs in ("PACKED", "SHIPPED", "COMPLETED", "DONE"):
        return False
    return True


def order_is_from_production(db: Session, order: Order) -> bool:
    """True when packing artifacts were credited from ORDERS production."""
    oid = int(order.id)
    oi_ids = [
        int(r[0])
        for r in db.query(OrderItemPickAllocation.order_item_id)
        .filter(
            OrderItemPickAllocation.order_id == oid,
            OrderItemPickAllocation.pick_id.is_(None),
        )
        .distinct()
        .all()
    ]
    if not oi_ids:
        return False
    events = (
        db.query(FulfillmentEvent)
        .filter(
            FulfillmentEvent.order_item_id.in_(oi_ids),
            FulfillmentEvent.type == FE_PICK,
        )
        .all()
    )
    for e in events:
        if str(_event_meta(e).get("source") or "") == "production_order":
            return True
    return False


def consume_production_buffer_stock_on_packing_finish(
    db: Session,
    *,
    order: Order,
    operator_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Classic picking depletes Inventory at pick time. Production credits FG on buffer and
    leaves stock until packing finish — consume allocation locations here (idempotent).
    """
    del operator_user_id
    oid = int(order.id)
    rows = (
        db.query(OrderItemPickAllocation)
        .filter(
            OrderItemPickAllocation.order_id == oid,
            OrderItemPickAllocation.pick_id.is_(None),
        )
        .order_by(OrderItemPickAllocation.id.asc())
        .all()
    )
    if not rows:
        return {"result": "SKIPPED", "reason": "no_production_allocations", "consumed": 0.0}

    oi_ids = {int(r.order_item_id) for r in rows}
    events = (
        db.query(FulfillmentEvent)
        .filter(
            FulfillmentEvent.order_item_id.in_(oi_ids),
            FulfillmentEvent.type == FE_PICK,
        )
        .all()
    )
    prod_events_by_oi: dict[int, list[FulfillmentEvent]] = {}
    for e in events:
        meta = _event_meta(e)
        if str(meta.get("source") or "") != "production_order":
            continue
        prod_events_by_oi.setdefault(int(e.order_item_id), []).append(e)

    if not prod_events_by_oi:
        return {"result": "SKIPPED", "reason": "not_production", "consumed": 0.0}

    consumed_total = 0.0
    for r in rows:
        oiid = int(r.order_item_id)
        evs = prod_events_by_oi.get(oiid) or []
        if not evs:
            continue
        if any(_event_meta(e).get(_CONSUMED_META_KEY) for e in evs):
            continue
        qty = float(r.quantity or 0)
        if qty <= 1e-9:
            continue
        consume_inventory_fifo_slices(
            db,
            tenant_id=int(r.tenant_id),
            warehouse_id=int(r.warehouse_id),
            product_id=int(r.product_id),
            location_id=int(r.location_id),
            quantity=qty,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
        consumed_total += qty
        for e in evs:
            meta = _event_meta(e)
            meta[_CONSUMED_META_KEY] = True
            e.metadata_json = json.dumps(meta, ensure_ascii=False)
            db.add(e)

    db.flush()
    return {"result": "OK", "consumed": float(consumed_total)}


def _count_waybill_urls_in_pipeline(pipeline: list[Any]) -> int:
    """Ile unikalnych URL listów w krokach post-pack (jak FE collectWaybillUrls)."""
    urls: list[str] = []
    seen: set[str] = set()
    for step in pipeline or []:
        msg = str(getattr(step, "message", None) or "")
        if not msg or not getattr(step, "ok", False) or getattr(step, "skipped", False):
            continue
        parts: dict[str, str] = {}
        for part in msg.split(";"):
            idx = part.index("=") if "=" in part else -1
            if idx <= 0:
                continue
            parts[part[:idx].strip()] = part[idx + 1 :].strip()
        multi = (parts.get("file_urls") or "").strip()
        if multi:
            for u in multi.split("|"):
                u = u.strip()
                if u and u not in seen:
                    seen.add(u)
                    urls.append(u)
            continue
        one = (parts.get("file_url") or "").strip()
        if one and one not in seen:
            seen.add(one)
            urls.append(one)
    return len(urls)


def try_auto_pack_newly_ready_orders(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    newly_ready_orders: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    All-or-nothing auto finalize for production → packing handoff cohort.

    Preflight: every order must have ``has_shipping_label``. One missing → no mutations.
    On success: pack-all + packing_finish_order (commit=False, system_auto) per order
    inside a SAVEPOINT — fail-safe rolls back to standard packing UI.
    """
    empty = {
        "attempted": False,
        "succeeded": False,
        "fallback_reason": None,
        "waybill_print_count": 0,
        "waybill_file_urls": [],
        "orders": [],
    }
    if not newly_ready_orders:
        return empty

    order_ids = [int(m["order_id"]) for m in newly_ready_orders if m.get("order_id")]
    if not order_ids:
        return empty

    orders = (
        db.query(Order)
        .filter(
            Order.id.in_(order_ids),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.deleted_at.is_(None),
        )
        .all()
    )
    by_id = {int(o.id): o for o in orders}
    if len(by_id) != len(set(order_ids)):
        return {
            **empty,
            "attempted": True,
            "fallback_reason": "orders_not_found",
        }

    # Preflight — no mutations yet.
    already_finished = [
        oid
        for oid in order_ids
        if getattr(by_id[oid], "wms_packing_automation_finished_at", None) is not None
    ]
    if already_finished and len(already_finished) == len(set(order_ids)):
        # Idempotent replay — packing_finish already ran; do not double-finalize.
        return {
            "attempted": True,
            "succeeded": True,
            "fallback_reason": None,
            "waybill_print_count": 0,
            "waybill_file_urls": [],
            "orders": [
                {
                    "order_id": oid,
                    "order_number": str(by_id[oid].number or oid),
                    "ok": True,
                    "has_shipping_label": True,
                    "label_count": count_active_shipping_labels(db, by_id[oid]),
                    "post_pack_pipeline": [],
                    "waybill_print_count": 0,
                    "idempotent_replay": True,
                }
                for oid in order_ids
            ],
        }
    if already_finished:
        return {
            **empty,
            "attempted": True,
            "fallback_reason": "mixed_packing_finished_state",
        }

    for oid in order_ids:
        order = by_id[oid]
        try:
            if not has_shipping_label(db, order):
                return {
                    **empty,
                    "attempted": True,
                    "fallback_reason": "missing_shipping_label",
                    "orders": [
                        {
                            "order_id": oid,
                            "order_number": str(order.number or oid),
                            "ok": False,
                            "has_shipping_label": False,
                            "post_pack_pipeline": [],
                        }
                    ],
                }
            docs = list_active_shipping_label_documents(db, order)
            if not docs:
                return {
                    **empty,
                    "attempted": True,
                    "fallback_reason": "ambiguous_shipping_label",
                }
        except Exception:
            logger.exception("auto-pack preflight label read failed order_id=%s", oid)
            return {
                **empty,
                "attempted": True,
                "fallback_reason": "label_read_error",
            }

    from ..wms_audit_service import append_order_activity_for_wms
    from ..wms_packing_service import PackingScanError, packing_finish_order, packing_pack_all_lines

    order_results: list[dict[str, Any]] = []
    all_urls: list[str] = []
    url_seen: set[str] = set()
    nested = db.begin_nested()
    try:
        for m in newly_ready_orders:
            oid = int(m["order_id"])
            order = by_id[oid]
            status_id = int(getattr(order, "order_ui_status_id", 0) or 0)
            if status_id < 1:
                raise PackingScanError("ORDER_NOT_IN_QUEUE", message="missing packing status")

            packing_pack_all_lines(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                status_id=status_id,
                mode="no_cart",
                cart_id=None,
                order_id=oid,
                operator_user_id=None,
                commit=False,
            )
            out = packing_finish_order(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                status_id=status_id,
                mode="no_cart",
                cart_id=None,
                order_id=oid,
                operator_user_id=None,
                allow_without_carton=True,
                packaging_carton_ids=None,
                current_user=None,
                order_type="all",
                commit=False,
                system_auto=True,
            )
            pipeline = list(getattr(out, "post_pack_pipeline", None) or [])
            for d in list_active_shipping_label_documents(db, order):
                u = str(getattr(d, "file_url", None) or "").strip()
                if u and u not in url_seen:
                    url_seen.add(u)
                    all_urls.append(u)
            order_results.append(
                {
                    "order_id": oid,
                    "order_number": str(m.get("order_number") or order.number or oid),
                    "ok": True,
                    "has_shipping_label": True,
                    "label_count": count_active_shipping_labels(db, order),
                    "post_pack_pipeline": pipeline,
                    "waybill_print_count": _count_waybill_urls_in_pipeline(pipeline),
                }
            )
            append_order_activity_for_wms(
                db,
                order_id=oid,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                event_type="PACKING_AUTO_AFTER_PRODUCTION",
                message=(
                    "Automatycznie zakończono pakowanie — list przewozowy był już wygenerowany."
                ),
                operator_user_id=None,
                metadata={
                    "source": "production_auto_pack",
                    "waybill_count": count_active_shipping_labels(db, order),
                },
            )
        nested.commit()
    except Exception as exc:
        nested.rollback()
        logger.info(
            "production auto-pack fallback tenant=%s wh=%s reason=%s",
            tenant_id,
            warehouse_id,
            str(exc)[:300],
        )
        reason = "packing_validation_blocker"
        if isinstance(exc, PackingScanError):
            reason = str(getattr(exc, "code", None) or reason)
        elif isinstance(exc, ValueError):
            reason = str(exc)[:120] or reason
        return {
            "attempted": True,
            "succeeded": False,
            "fallback_reason": reason,
            "waybill_print_count": 0,
            "waybill_file_urls": [],
            "orders": [],
        }

    waybill_n = sum(int(r.get("waybill_print_count") or 0) for r in order_results)
    if waybill_n < 1:
        waybill_n = len(all_urls)
    for r in order_results:
        if int(r.get("waybill_print_count") or 0) > 0:
            append_order_activity_for_wms(
                db,
                order_id=int(r["order_id"]),
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                event_type="PACKING_AUTO_WAYBILL_PRINT",
                message="Wydrukowano list przewozowy.",
                operator_user_id=None,
                metadata={"source": "production_auto_pack"},
            )

    return {
        "attempted": True,
        "succeeded": True,
        "fallback_reason": None,
        "waybill_print_count": int(waybill_n),
        "waybill_file_urls": all_urls,
        "orders": order_results,
    }
