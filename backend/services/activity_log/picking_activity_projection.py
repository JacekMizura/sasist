"""Immutable Order › Logi projection of picking picks (aggregates).

``wms_order_events.PICKED_ITEM`` remains per-scan SSOT.
At picking finish we emit one Activity row per (product, location) with total qty.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.order import Order
from ...models.pick import Pick
from ...models.product import Product
from ...models.wms_order_event import EVT_PICKED_ITEM, WmsOrderEvent

logger = logging.getLogger(__name__)

EVT_PICK_AGGREGATE = "PICK_AGGREGATE"


def _fmt_qty(q: float) -> str:
    if abs(q - round(q)) < 1e-6:
        return str(int(round(q)))
    return f"{q:g}"


def aggregate_picks_from_wms_events(
    db: Session,
    *,
    order_id: int,
    since: Any | None = None,
) -> list[dict[str, Any]]:
    """
    Aggregate PICKED_ITEM rows: one group per product_id + source_location_id.
    Prefer WMS SSOT events; fall back to Pick table if no events.
    """
    q = db.query(WmsOrderEvent).filter(
        WmsOrderEvent.order_id == int(order_id),
        WmsOrderEvent.event_type == EVT_PICKED_ITEM,
    )
    if since is not None:
        q = q.filter(WmsOrderEvent.created_at >= since)
    events = q.order_by(WmsOrderEvent.id.asc()).all()

    buckets: dict[tuple[int, int], dict[str, Any]] = {}
    if events:
        for ev in events:
            pid = int(ev.product_id or 0)
            lid = int(ev.source_location_id or 0)
            if pid <= 0:
                continue
            key = (pid, lid)
            b = buckets.get(key)
            qty = float(ev.quantity or 0)
            if b is None:
                meta = {}
                if ev.metadata_json:
                    try:
                        import json

                        meta = json.loads(ev.metadata_json) or {}
                    except Exception:
                        meta = {}
                buckets[key] = {
                    "product_id": pid,
                    "location_id": lid if lid > 0 else None,
                    "quantity": qty,
                    "sku": meta.get("sku"),
                    "source_location": meta.get("source_location"),
                    "operator_user_id": ev.operator_user_id,
                }
            else:
                b["quantity"] = float(b["quantity"]) + qty
                if ev.operator_user_id and not b.get("operator_user_id"):
                    b["operator_user_id"] = ev.operator_user_id
        return list(buckets.values())

    # Fallback: factual Pick rows for the order
    rows = (
        db.query(
            Pick.product_id,
            Pick.location_id,
            func.coalesce(func.sum(Pick.quantity), 0.0),
            func.max(Pick.picker_id),
        )
        .filter(
            Pick.order_id == int(order_id),
            Pick.status.in_(("done", "picking", "waiting")),
        )
        .group_by(Pick.product_id, Pick.location_id)
        .all()
    )
    out: list[dict[str, Any]] = []
    for pid, lid, qty, picker in rows:
        if pid is None or float(qty or 0) <= 1e-9:
            continue
        out.append(
            {
                "product_id": int(pid),
                "location_id": int(lid) if lid is not None else None,
                "quantity": float(qty),
                "sku": None,
                "source_location": None,
                "operator_user_id": int(picker) if picker is not None else None,
            }
        )
    return out


def enrich_pick_aggregate_row(db: Session, row: dict[str, Any]) -> dict[str, Any]:
    pid = int(row.get("product_id") or 0)
    product = db.query(Product).filter(Product.id == pid).first() if pid > 0 else None
    name = (getattr(product, "name", None) or "").strip() if product else ""
    sku = (row.get("sku") or getattr(product, "sku", None) or "").strip() or (f"#{pid}" if pid else "—")
    ean = (getattr(product, "ean", None) or "").strip() if product else ""
    lid = row.get("location_id")
    loc_label = row.get("source_location")
    if not loc_label and lid is not None and int(lid) > 0:
        loc = db.query(Location).filter(Location.id == int(lid)).first()
        loc_label = (getattr(loc, "name", None) or getattr(loc, "code", None) or "").strip() if loc else f"#{lid}"
    qty = float(row.get("quantity") or 0)
    return {
        **row,
        "product_name": name or sku,
        "sku": sku,
        "ean": ean or None,
        "source_location": loc_label or "—",
        "quantity": qty,
        "quantity_label": _fmt_qty(qty),
    }


def picking_finish_summary_from_aggregates(rows: list[dict[str, Any]]) -> dict[str, Any]:
    products = {int(r["product_id"]) for r in rows if r.get("product_id")}
    locs = {
        int(r["location_id"])
        for r in rows
        if r.get("location_id") is not None and int(r["location_id"]) > 0
    }
    units = sum(float(r.get("quantity") or 0) for r in rows)
    return {
        "products_count": len(products),
        "units_count": int(round(units)) if abs(units - round(units)) < 1e-6 else round(units, 3),
        "locations_count": len(locs),
    }


def emit_picking_pick_aggregates_to_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    operator_user_id: Optional[int],
    picking_finished_event_id: int,
    since: Any | None = None,
) -> list[dict[str, Any]]:
    """
    Idempotent: correlation per (order, product, location, finish_event).
    Does not mutate prior Activity rows.
    """
    from ..wms_audit_service import append_order_activity_for_wms

    raw = aggregate_picks_from_wms_events(db, order_id=int(order.id), since=since)
    emitted: list[dict[str, Any]] = []
    finish_id = int(picking_finished_event_id)
    default_uid = (
        int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    )

    for row in raw:
        enriched = enrich_pick_aggregate_row(db, row)
        pid = int(enriched["product_id"])
        lid = int(enriched["location_id"] or 0)
        cid = f"wms-pick-agg:{int(order.id)}:{pid}:{lid}:{finish_id}"[:64]
        qty_lbl = enriched["quantity_label"]
        name = enriched["product_name"]
        loc = enriched["source_location"]
        msg = f"Pobrano {qty_lbl} × {name} z lokalizacji {loc}."
        meta = {
            "product_id": pid,
            "product_name": name,
            "sku": enriched.get("sku"),
            "ean": enriched.get("ean"),
            "location_id": lid if lid > 0 else None,
            "source_location": loc,
            "quantity": enriched["quantity"],
            "picking_finished_event_id": finish_id,
            "aggregate": True,
        }
        uid = (
            int(enriched["operator_user_id"])
            if enriched.get("operator_user_id") is not None
            else default_uid
        )
        append_order_activity_for_wms(
            db,
            order_id=int(order.id),
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            event_type=EVT_PICK_AGGREGATE,
            message=msg,
            operator_user_id=uid,
            metadata=meta,
            correlation_id=cid,
        )
        emitted.append(enriched)
    return emitted
