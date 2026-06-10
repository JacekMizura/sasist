"""Enrich direct-sale session lines for operator terminal UI."""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ...models.location import Location
from ...models.product import Product
from ..location_stock_service import build_location_stock


def _margin_percent(sale: float | None, purchase: float | None) -> float | None:
    if sale is None or purchase is None:
        return None
    s = float(sale)
    p = float(purchase)
    if s <= 0 or p < 0:
        return None
    return round((s - p) / s * 100.0, 1)


def enrich_session_lines(db: Session, sess: DirectSaleSession) -> list[dict]:
    lines = [ln for ln in (sess.lines or []) if getattr(ln, "product_id", None) is not None]
    if not lines:
        return []

    pids = {int(ln.product_id) for ln in lines}
    loc_ids = {
        int(x)
        for ln in lines
        for x in (ln.source_location_id, ln.suggested_location_id)
        if x is not None
    }

    products = {
        int(p.id): p
        for p in db.query(Product).filter(Product.id.in_(pids)).all()
    }
    locations = {
        int(loc.id): loc
        for loc in db.query(Location).filter(Location.id.in_(loc_ids)).all()
    } if loc_ids else {}

    stock_cache: dict[int, float] = {}
    out: list[dict] = []
    for ln in lines:
        pid = int(ln.product_id)
        pr = products.get(pid)
        src = locations.get(int(ln.source_location_id)) if ln.source_location_id else None
        if pid not in stock_cache:
            try:
                snap = build_location_stock(
                    db,
                    tenant_id=int(sess.tenant_id),
                    warehouse_id=int(sess.warehouse_id),
                    product_id=pid,
                    available_only=False,
                )
                summary = snap.get("summary") if isinstance(snap.get("summary"), dict) else {}
                stock_cache[pid] = float(summary.get("available") or snap.get("total_available") or 0)
            except Exception:
                stock_cache[pid] = 0.0
        has_hold = bool(ln.stock_reservation_id)
        if not has_hold and ln.metadata_json:
            try:
                meta = json.loads(ln.metadata_json)
                has_hold = bool(meta.get("soft_hold"))
            except (json.JSONDecodeError, TypeError):
                pass
        sale = float(pr.sale_price) if pr and pr.sale_price is not None else None
        purchase = float(pr.purchase_price) if pr and pr.purchase_price is not None else None
        out.append(
            {
                "line": ln,
                "product_name": str(pr.name) if pr else None,
                "product_sku": str(pr.sku or pr.symbol or "") if pr else None,
                "product_ean": str(pr.ean or "") if pr else None,
                "product_catalog_number": str(getattr(pr, "catalog_number", None) or "") or None if pr else None,
                "margin_percent": _margin_percent(sale, purchase),
                "image_url": str(pr.image_url or "") if pr and pr.image_url else None,
                "source_location_code": str(src.name) if src else None,
                "operational_zone_type": (
                    str(getattr(src, "operational_zone_type", None) or "") or None if src else None
                ),
                "available_qty_hint": stock_cache.get(pid, 0.0),
                "has_reservation": has_hold,
            }
        )
    return out
