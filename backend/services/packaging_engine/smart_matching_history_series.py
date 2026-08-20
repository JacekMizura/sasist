"""
Smart Matching history-series read projection (learning tracks per composition_key + carton).

Does not change learning / suggestion runtime — presentation only.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, noload

from ...models.carton import Carton
from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.product import Product
from ...models.wms_smart_matching import WmsSmartMatchingHistory, WmsSmartMatchingRule
from .smart_matching_store import VALID_THRESHOLDS, get_or_create_settings


def _carton_name_map(db: Session, carton_ids: set[str]) -> dict[str, str]:
    ids = [c for c in carton_ids if c]
    if not ids:
        return {}
    rows = db.query(Carton).options(noload("*")).filter(Carton.id.in_(ids)).all()
    return {str(c.id): str(getattr(c, "name", None) or "").strip() or str(c.id) for c in rows}


def composition_items_for_order(db: Session, order_id: int) -> list[dict[str, Any]]:
    """Structural composition from live OrderItem rows; empty if order missing."""
    items = (
        db.query(OrderItem)
        .filter(OrderItem.order_id == int(order_id))
        .all()
    )
    out: list[dict[str, Any]] = []
    for it in items:
        pid = int(getattr(it, "product_id", 0) or 0)
        qty = int(getattr(it, "quantity", 0) or 0)
        if pid <= 0 or qty <= 0:
            continue
        prod = db.query(Product).filter(Product.id == pid).first()
        name = str(getattr(prod, "name", None) or getattr(prod, "sku", None) or f"#{pid}")
        out.append({"product_id": pid, "product_name": name, "quantity": qty})
    out.sort(key=lambda x: (x["product_id"], x["quantity"]))
    return out


def _preview_from_items(items: list[dict[str, Any]], fallback_label: str) -> dict[str, Any]:
    if not items:
        label = (fallback_label or "—").strip() or "—"
        return {
            "primary_line": label,
            "extra_count": 0,
            "fallback_label": fallback_label or None,
        }
    first = items[0]
    primary = f"{first['product_name']} ×{first['quantity']}"
    extra = max(0, len(items) - 1)
    return {
        "primary_line": primary,
        "extra_count": extra,
        "fallback_label": fallback_label or None,
    }


def list_history_series(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    page: int = 1,
    limit: int = 50,
) -> dict[str, Any]:
    """
    Paginate learning series by (composition_key, carton_id), newest activity first.
    Each series includes full hit list (hit_index chronological; response newest-first).
    """
    tid = int(tenant_id)
    wid = int(warehouse_id)
    page = max(1, int(page))
    limit = max(1, min(int(limit), 100))

    settings = get_or_create_settings(db, tenant_id=tid, warehouse_id=wid)
    current_threshold = int(settings.identical_orders_threshold or 3)
    if current_threshold not in VALID_THRESHOLDS:
        current_threshold = 3

    # Distinct series keys with last activity — full history scope (not global limit slice).
    agg_rows = (
        db.query(
            WmsSmartMatchingHistory.composition_key,
            WmsSmartMatchingHistory.carton_id,
            func.max(WmsSmartMatchingHistory.created_at).label("last_at"),
            func.max(WmsSmartMatchingHistory.id).label("last_id"),
            func.count(WmsSmartMatchingHistory.id).label("hit_n"),
        )
        .filter(
            WmsSmartMatchingHistory.tenant_id == tid,
            WmsSmartMatchingHistory.warehouse_id == wid,
            WmsSmartMatchingHistory.carton_id.isnot(None),
        )
        .group_by(WmsSmartMatchingHistory.composition_key, WmsSmartMatchingHistory.carton_id)
        .order_by(func.max(WmsSmartMatchingHistory.created_at).desc(), func.max(WmsSmartMatchingHistory.id).desc())
        .all()
    )

    total = len(agg_rows)
    start = (page - 1) * limit
    page_rows = agg_rows[start : start + limit]

    series_out: list[dict[str, Any]] = []
    for composition_key, carton_id, last_at, _last_id, hit_n in page_rows:
        key = str(composition_key)
        cid = str(carton_id)
        series_out.append(
            _build_series(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                composition_key=key,
                carton_id=cid,
                hit_count=int(hit_n or 0),
                last_at=last_at,
                current_threshold=current_threshold,
            )
        )

    return {
        "page": page,
        "limit": limit,
        "total": total,
        "current_threshold": current_threshold,
        "items": series_out,
    }


def _build_series(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    composition_key: str,
    carton_id: str,
    hit_count: int,
    last_at: Any,
    current_threshold: int,
) -> dict[str, Any]:
    hits_asc = (
        db.query(WmsSmartMatchingHistory)
        .filter(
            WmsSmartMatchingHistory.tenant_id == tenant_id,
            WmsSmartMatchingHistory.warehouse_id == warehouse_id,
            WmsSmartMatchingHistory.composition_key == composition_key,
            WmsSmartMatchingHistory.carton_id == carton_id,
        )
        .order_by(WmsSmartMatchingHistory.created_at.asc(), WmsSmartMatchingHistory.id.asc())
        .all()
    )

    rule = (
        db.query(WmsSmartMatchingRule)
        .filter(
            WmsSmartMatchingRule.tenant_id == tenant_id,
            WmsSmartMatchingRule.warehouse_id == warehouse_id,
            WmsSmartMatchingRule.composition_key == composition_key,
            WmsSmartMatchingRule.carton_id == carton_id,
            WmsSmartMatchingRule.is_auto.is_(True),
        )
        .first()
    )

    decisive_id: Optional[int] = None
    created_threshold: Optional[int] = None
    rule_id: Optional[int] = None
    if rule is not None:
        rule_id = int(rule.id)
        if rule.created_from_history_id is not None:
            decisive_id = int(rule.created_from_history_id)
        if rule.created_threshold is not None and int(rule.created_threshold) in VALID_THRESHOLDS:
            created_threshold = int(rule.created_threshold)

    carton_ids: set[str] = {carton_id}
    for h in hits_asc:
        if h.suggested_carton_id:
            carton_ids.add(str(h.suggested_carton_id))
        if h.carton_id:
            carton_ids.add(str(h.carton_id))
    names = _carton_name_map(db, carton_ids)

    # Composition from newest hit's order; fallback older hits; then label.
    items: list[dict[str, Any]] = []
    fallback_label = ""
    for h in reversed(hits_asc):
        fallback_label = fallback_label or (h.composition_label or "")
        items = composition_items_for_order(db, int(h.order_id))
        if items:
            break
    if not fallback_label and hits_asc:
        fallback_label = hits_asc[-1].composition_label or ""

    preview = _preview_from_items(items, fallback_label)
    carton_name = names.get(carton_id) or (hits_asc[-1].carton_name if hits_asc else None) or carton_id

    order_ids = {int(h.order_id) for h in hits_asc}
    orders = {
        int(o.id): o
        for o in db.query(Order).filter(Order.id.in_(order_ids)).all()
    } if order_ids else {}

    hit_payloads: list[dict[str, Any]] = []
    override_count = 0
    for idx, h in enumerate(hits_asc, start=1):
        broke = bool(h.broke_series)
        suggested_id = str(h.suggested_carton_id).strip() if h.suggested_carton_id else None
        chosen_id = str(h.carton_id).strip() if h.carton_id else None
        is_override = broke or bool(suggested_id and chosen_id and suggested_id != chosen_id)
        if is_override:
            override_count += 1
        order = orders.get(int(h.order_id))
        hit_payloads.append(
            {
                "history_id": int(h.id),
                "hit_index": idx,
                "order_id": int(h.order_id),
                "order_number": str(getattr(order, "number", None) or "") or None,
                "operator": h.user_display,
                "created_at": h.created_at.isoformat() if h.created_at else None,
                "carton_id": chosen_id,
                "carton_name": h.carton_name or (names.get(chosen_id) if chosen_id else None),
                "suggested_carton_id": suggested_id,
                "suggested_carton_name": names.get(suggested_id) if suggested_id else None,
                "broke_series": broke,
                "is_override": is_override,
                "is_decisive": bool(decisive_id is not None and int(h.id) == decisive_id),
            }
        )

    # Newest first for popover; hit_index remains chronological.
    hits_desc = list(reversed(hit_payloads))

    last_hit = hits_asc[-1] if hits_asc else None
    display_threshold = created_threshold if created_threshold is not None else current_threshold

    return {
        "composition_key": composition_key,
        "composition_preview": preview["primary_line"],
        "composition_extra_count": preview["extra_count"],
        "composition_items": items,
        "composition_label_fallback": preview["fallback_label"],
        "carton_id": carton_id,
        "carton_name": carton_name,
        "hit_count": int(hit_count),
        "threshold": int(display_threshold),
        "current_threshold": int(current_threshold),
        "created_threshold": created_threshold,
        "has_active_rule": rule is not None,
        "rule_id": rule_id,
        "created_from_history_id": decisive_id,
        "last_operator": last_hit.user_display if last_hit else None,
        "last_at": last_at.isoformat() if last_at is not None else (
            last_hit.created_at.isoformat() if last_hit and last_hit.created_at else None
        ),
        "override_count": override_count,
        "has_overrides": override_count > 0,
        "hits": hits_desc,
    }
