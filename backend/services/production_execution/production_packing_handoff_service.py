"""
Handoff ORDERS production → existing Packing module.

- Mark sales order packing-ready (READY_TO_PACK + CARTLESS) after source fulfillment.
- Consume FG buffer inventory on packing finish (classic pick already consumed at pick).
- Detect production-origin for optional UI badge.
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
