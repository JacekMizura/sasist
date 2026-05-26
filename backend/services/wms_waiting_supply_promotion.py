"""
WAITING_SUPPLY → inbound (PZ / receiving / putaway) → RECOLLECT or RELOCATION.

Product-centric waiting tasks; order refs are lightweight allocations only.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable

from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.warehouse_carrier import WarehouseCarrier
from ..models.wms_operational_task import (
    ACTIVE_STATUSES,
    TASK_RELOCATION,
    TASK_WAITING_SUPPLY,
    WmsOperationalTask,
)
from .fulfillment_event_service import append_event, delete_line_events_of_type
from .order_fulfillment_recompute import (
    _oms_waiting_for_stock,
    _oms_waiting_missing_cover_qty,
    _order_item_meta_dict,
    recalculate_order_shortage_state,
)
from .wms_operational_task_service import (
    EPS,
    _close_task,
    _json_dumps,
    _json_loads,
    _now,
    _target_zone_for_order,
    _upsert_task,
    group_key_waiting,
    merge_relocation_task,
    recompute_waiting_supply_for_product,
)

logger = logging.getLogger(__name__)

INBOUND_STORAGE = "storage"
INBOUND_CARRIER = "carrier"
INBOUND_CROSSDOCK = "crossdock"

HISTORY_MAX = 80


@dataclass
class InboundProductReceipt:
    """One inbound quantity line for promotion."""

    product_id: int
    qty: float
    inbound_mode: str = INBOUND_STORAGE
    carrier_id: int | None = None
    carrier_label: str | None = None
    source_location_label: str | None = None
    stock_document_id: int | None = None
    stock_document_item_id: int | None = None


@dataclass
class PromotionResult:
    product_id: int
    promoted_qty: float = 0.0
    relocation_qty: float = 0.0
    recollect_lines: int = 0
    waiting_remaining_qty: float = 0.0
    skipped_idempotent: bool = False


def _carrier_label(db: Session, tenant_id: int, carrier_id: int | None) -> str | None:
    if carrier_id is None or int(carrier_id) < 1:
        return None
    c = (
        db.query(WarehouseCarrier)
        .filter(
            WarehouseCarrier.id == int(carrier_id),
            WarehouseCarrier.tenant_id == int(tenant_id),
        )
        .first()
    )
    if not c:
        return f"Nośnik #{carrier_id}"
    return (c.barcode or c.code or c.name or "").strip() or f"Nośnik #{c.id}"


def _append_waiting_audit(payload: dict[str, Any], entry: dict[str, Any]) -> None:
    hist = payload.get("audit")
    if not isinstance(hist, list):
        hist = []
    hist.append(entry)
    payload["audit"] = hist[-HISTORY_MAX:]


def _event_processed(payload: dict[str, Any], source_event_id: str) -> bool:
    raw = payload.get("processed_inbound_ids")
    if not isinstance(raw, list):
        return False
    return str(source_event_id) in {str(x) for x in raw}


def _mark_event_processed(payload: dict[str, Any], source_event_id: str) -> None:
    raw = payload.get("processed_inbound_ids")
    if not isinstance(raw, list):
        raw = []
    sid = str(source_event_id)
    if sid not in raw:
        raw.append(sid)
    payload["processed_inbound_ids"] = raw[-200:]


def _inbound_targets_relocation(mode: str) -> bool:
    return str(mode or "").strip().lower() in (INBOUND_CARRIER, INBOUND_CROSSDOCK, "batch_inbound", "crossdock")


def _consume_waiting_cover(
    db: Session,
    *,
    order: Order,
    oi: OrderItem,
    consume_qty: float,
) -> float:
    """Reduce OMS waiting cover on a line; returns qty actually consumed."""
    from ..models.fulfillment_event import FE_WAITING

    if not _oms_waiting_for_stock(oi):
        return 0.0
    meta = _order_item_meta_dict(oi)
    cover = float(_oms_waiting_missing_cover_qty(oi))
    if cover < EPS:
        cover = float(consume_qty)
    consumed = round(min(max(0.0, float(consume_qty)), cover), 6)
    if consumed < EPS:
        return 0.0
    remaining = round(max(0.0, cover - consumed), 6)
    if remaining < EPS:
        meta.pop("oms_waiting_for_stock", None)
        meta.pop("oms_waiting_missing_qty", None)
        delete_line_events_of_type(db, int(oi.id), FE_WAITING)
    else:
        meta["oms_waiting_for_stock"] = True
        meta["oms_waiting_missing_qty"] = remaining
        delete_line_events_of_type(db, int(oi.id), FE_WAITING)
        append_event(
            db,
            order_item_id=int(oi.id),
            event_type=FE_WAITING,
            quantity=remaining,
            metadata=None,
        )
    oi.metadata_json = json.dumps(meta, ensure_ascii=False) if meta else None
    db.add(oi)
    return consumed


def _lock_waiting_task(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> WmsOperationalTask | None:
    gk = group_key_waiting(int(warehouse_id), int(product_id))
    return (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.warehouse_id == int(warehouse_id),
            WmsOperationalTask.product_id == int(product_id),
            WmsOperationalTask.task_type == TASK_WAITING_SUPPLY,
            WmsOperationalTask.group_key == gk,
            WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
        )
        .with_for_update(of=WmsOperationalTask)
        .first()
    )


def promote_waiting_supply_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    inbound_qty: float,
    source_event_id: str,
    inbound_mode: str = INBOUND_STORAGE,
    carrier_id: int | None = None,
    carrier_label: str | None = None,
    picked_from_location: str | None = None,
) -> PromotionResult:
    """
    Promote up to ``inbound_qty`` units from WAITING_SUPPLY refs into RECOLLECT or RELOCATION.
    Idempotent per ``source_event_id`` on the waiting task payload.
    """
    pid = int(product_id)
    wid = int(warehouse_id)
    tid = int(tenant_id)
    pool = round(max(0.0, float(inbound_qty)), 6)
    result = PromotionResult(product_id=pid)

    if pool < EPS:
        return result

    task = _lock_waiting_task(db, tenant_id=tid, warehouse_id=wid, product_id=pid)
    if not task:
        return result

    payload = _json_loads(task.payload_json, {})
    if not isinstance(payload, dict):
        payload = {}

    if _event_processed(payload, str(source_event_id)):
        result.skipped_idempotent = True
        return result

    refs_raw = payload.get("refs")
    if not isinstance(refs_raw, list) or not refs_raw:
        _close_task(db, task, reason="waiting_empty_on_promote")
        _mark_event_processed(payload, str(source_event_id))
        task.payload_json = _json_dumps(payload)
        return result

    refs = sorted(
        [r for r in refs_raw if isinstance(r, dict)],
        key=lambda r: (int(r.get("order_id") or 0), int(r.get("order_item_id") or 0)),
    )

    to_relocation = _inbound_targets_relocation(inbound_mode)
    reloc_label = carrier_label or picked_from_location
    if to_relocation and not reloc_label and carrier_id:
        reloc_label = _carrier_label(db, tid, carrier_id)

    relocation_allocs: list[dict[str, Any]] = []
    orders_to_sync: set[int] = set()
    remaining_refs: list[dict[str, Any]] = []
    promoted_total = 0.0

    order_cache: dict[int, Order] = {}

    for ref in refs:
        if pool < EPS:
            remaining_refs.append(ref)
            continue
        oid = int(ref.get("order_id") or 0)
        oiid = int(ref.get("order_item_id") or 0)
        need = round(max(0.0, float(ref.get("qty") or 0)), 6)
        if oid < 1 or oiid < 1 or need < EPS:
            continue

        promote = round(min(need, pool), 6)
        if promote < EPS:
            remaining_refs.append(ref)
            continue

        if oid not in order_cache:
            order_cache[oid] = (
                db.query(Order)
                .options(joinedload(Order.items), joinedload(Order.picking_zones))
                .filter(Order.id == oid, Order.tenant_id == tid)
                .first()
            )
        order = order_cache.get(oid)
        if not order:
            remaining_refs.append(ref)
            continue
        oi = next((x for x in (order.items or []) if int(x.id) == oiid), None)
        if oi is None:
            remaining_refs.append(ref)
            continue

        consumed = _consume_waiting_cover(db, order=order, oi=oi, consume_qty=promote)
        if consumed < EPS:
            remaining_refs.append(ref)
            continue

        pool = round(pool - consumed, 6)
        promoted_total += consumed
        orders_to_sync.add(oid)

        leftover = round(max(0.0, need - consumed), 6)
        if leftover >= EPS:
            remaining_refs.append(
                {
                    "order_id": oid,
                    "order_item_id": oiid,
                    "qty": leftover,
                }
            )

        if to_relocation:
            relocation_allocs.append(
                {
                    "order_id": oid,
                    "order_item_id": oiid,
                    "qty": consumed,
                    "target_zone": _target_zone_for_order(order) or None,
                }
            )
            result.relocation_qty = round(result.relocation_qty + consumed, 6)
        else:
            result.recollect_lines += 1

    if relocation_allocs:
        merge_relocation_task(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            product_id=pid,
            allocations=relocation_allocs,
            picked_from_location=reloc_label,
            source_event_id=f"waiting_promote:{source_event_id}",
        )

    for oid in orders_to_sync:
        try:
            recalculate_order_shortage_state(db, int(oid), commit=False)
        except Exception:
            logger.warning("promote waiting: shortage recompute failed order_id=%s", oid, exc_info=True)

    now = _now()
    _append_waiting_audit(
        payload,
        {
            "at": now.isoformat(),
            "action": "waiting_partial_promoted" if remaining_refs and promoted_total > EPS else "waiting_promoted",
            "source_event_id": str(source_event_id),
            "qty": promoted_total,
            "inbound_mode": inbound_mode,
            "carrier_id": int(carrier_id) if carrier_id else None,
            "relocation": to_relocation,
        },
    )
    _mark_event_processed(payload, str(source_event_id))

    if promoted_total < EPS:
        task.payload_json = _json_dumps(payload)
        return result

    result.promoted_qty = promoted_total
    task.payload_json = _json_dumps(payload)
    task.updated_at = now

    recompute_waiting_supply_for_product(db, tenant_id=tid, warehouse_id=wid, product_id=pid)
    task_after = _lock_waiting_task(db, tenant_id=tid, warehouse_id=wid, product_id=pid)
    if task_after:
        result.waiting_remaining_qty = max(
            0.0,
            float(task_after.quantity_required or 0) - float(task_after.quantity_done or 0),
        )
    else:
        result.waiting_remaining_qty = 0.0
    return result


def promote_waiting_supply_tasks(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    receipts: Iterable[InboundProductReceipt],
    source_event_id: str,
) -> list[PromotionResult]:
    """Promote waiting supply for each product in ``receipts`` (aggregated per product)."""
    by_product: dict[int, dict[str, Any]] = {}
    for r in receipts:
        pid = int(r.product_id)
        if pid < 1:
            continue
        qty = round(max(0.0, float(r.qty)), 6)
        if qty < EPS:
            continue
        bucket = by_product.setdefault(
            pid,
            {
                "qty": 0.0,
                "mode": INBOUND_STORAGE,
                "carrier_id": None,
                "carrier_label": None,
                "picked_from": None,
            },
        )
        bucket["qty"] = round(float(bucket["qty"]) + qty, 6)
        mode = str(r.inbound_mode or INBOUND_STORAGE).strip().lower()
        if _inbound_targets_relocation(mode):
            bucket["mode"] = mode
            if r.carrier_id:
                bucket["carrier_id"] = int(r.carrier_id)
            if r.carrier_label:
                bucket["carrier_label"] = r.carrier_label
            if r.source_location_label:
                bucket["picked_from"] = r.source_location_label
        elif bucket["mode"] == INBOUND_STORAGE and mode != INBOUND_STORAGE:
            bucket["mode"] = mode

    if not by_product:
        return []

    results: list[PromotionResult] = []
    base_sid = str(source_event_id)
    for pid, meta in by_product.items():
        sid = f"{base_sid}:prod:{pid}"
        try:
            res = promote_waiting_supply_for_product(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=int(pid),
                inbound_qty=float(meta["qty"]),
                source_event_id=sid,
                inbound_mode=str(meta["mode"]),
                carrier_id=meta.get("carrier_id"),
                carrier_label=meta.get("carrier_label"),
                picked_from_location=meta.get("picked_from"),
            )
            results.append(res)
        except Exception:
            logger.exception(
                "promote_waiting_supply failed wh=%s product=%s event=%s",
                warehouse_id,
                pid,
                sid,
            )
    return results


def receipts_from_pz_accept(
    db: Session,
    *,
    tenant_id: int,
    doc: Any,
    items: list[Any],
) -> list[InboundProductReceipt]:
    """Build promotion receipts from posted PZ lines (dock inventory)."""
    from .stock_document_service import effective_putaway_quantity_for_line

    wh_id = int(getattr(doc, "warehouse_id", 0) or 0)
    if wh_id < 1:
        return []
    by_product: dict[int, InboundProductReceipt] = {}
    dock_label = None
    loc_id = getattr(doc, "location_id", None)
    if loc_id:
        from ..models.location import Location

        loc = db.query(Location).filter(Location.id == int(loc_id)).first()
        if loc:
            dock_label = (loc.name or loc.code or "").strip() or None

    for sdi in items:
        pid = getattr(sdi, "product_id", None)
        if pid is None or int(pid) < 1:
            continue
        rec = float(getattr(sdi, "received_quantity", 0) or 0)
        put = effective_putaway_quantity_for_line(db, sdi)
        to_dock = round(max(0.0, rec - put), 6)
        if to_dock < EPS:
            continue
        pid_i = int(pid)
        wc = getattr(sdi, "warehouse_carrier_id", None)
        mode = INBOUND_CARRIER if wc else INBOUND_STORAGE
        existing = by_product.get(pid_i)
        if existing:
            existing.qty = round(existing.qty + to_dock, 6)
            if wc and not existing.carrier_id:
                existing.carrier_id = int(wc)
                existing.inbound_mode = INBOUND_CARRIER
                existing.carrier_label = _carrier_label(db, int(tenant_id), int(wc))
        else:
            by_product[pid_i] = InboundProductReceipt(
                product_id=pid_i,
                qty=to_dock,
                inbound_mode=mode,
                carrier_id=int(wc) if wc else None,
                carrier_label=_carrier_label(db, int(tenant_id), int(wc)) if wc else None,
                source_location_label=dock_label,
                stock_document_id=int(getattr(doc, "id", 0) or 0),
                stock_document_item_id=int(getattr(sdi, "id", 0) or 0),
            )
    return list(by_product.values())


def receipt_from_receiving_line(
    db: Session,
    *,
    tenant_id: int,
    doc: Any,
    line: Any,
    add_qty: float,
    warehouse_carrier_id: int | None,
) -> InboundProductReceipt | None:
    pid = getattr(line, "product_id", None)
    if pid is None or int(pid) < 1:
        return None
    qty = round(max(0.0, float(add_qty)), 6)
    if qty < EPS:
        return None
    mode = INBOUND_CARRIER if warehouse_carrier_id else INBOUND_CROSSDOCK
    if warehouse_carrier_id:
        mode = INBOUND_CARRIER
    label = _carrier_label(db, int(tenant_id), warehouse_carrier_id)
    return InboundProductReceipt(
        product_id=int(pid),
        qty=qty,
        inbound_mode=mode,
        carrier_id=int(warehouse_carrier_id) if warehouse_carrier_id else None,
        carrier_label=label,
        source_location_label=label,
        stock_document_id=int(getattr(doc, "id", 0) or 0),
        stock_document_item_id=int(getattr(line, "id", 0) or 0),
    )


def receipt_from_putaway(
    db: Session,
    *,
    tenant_id: int,
    doc: Any,
    line: Any,
    qty: float,
    to_carrier_id: int | None,
    line_carrier_id: int | None,
) -> InboundProductReceipt | None:
    """Putaway to storage bins → RECOLLECT path; staying on carrier → RELOCATION."""
    pid = getattr(line, "product_id", None)
    if pid is None or int(pid) < 1:
        return None
    q = round(max(0.0, float(qty)), 6)
    if q < EPS:
        return None
    cid = to_carrier_id or line_carrier_id
    if cid:
        label = _carrier_label(db, int(tenant_id), int(cid))
        return InboundProductReceipt(
            product_id=int(pid),
            qty=q,
            inbound_mode=INBOUND_CARRIER,
            carrier_id=int(cid),
            carrier_label=label,
            source_location_label=label,
            stock_document_id=int(getattr(doc, "id", 0) or 0),
            stock_document_item_id=int(getattr(line, "id", 0) or 0),
        )
    return InboundProductReceipt(
        product_id=int(pid),
        qty=q,
        inbound_mode=INBOUND_STORAGE,
        stock_document_id=int(getattr(doc, "id", 0) or 0),
        stock_document_item_id=int(getattr(line, "id", 0) or 0),
    )


def run_promotion_after_inbound(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    receipts: list[InboundProductReceipt],
    source_event_id: str,
) -> None:
    if not receipts:
        return
    from .wms_operational_task_service import dual_write_enabled

    if not dual_write_enabled():
        return
    promote_waiting_supply_tasks(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        receipts=receipts,
        source_event_id=str(source_event_id),
    )
