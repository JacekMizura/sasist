"""Direct-sale product typeahead — warehouse-aware, fast counter search."""

from __future__ import annotations

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.location import Location
from ...models.product import Product
from ..direct_sales_settings_service import resolve_direct_sales_settings
from ..location_priority_service import suggest_sales_locations
from ..wms_mm_transfer_service import _assert_warehouse_for_tenant


def search_direct_sale_products(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    query: str,
    limit: int = 12,
) -> list[dict]:
    q = (query or "").strip()
    if len(q) < 1:
        return []
    _assert_warehouse_for_tenant(db, tenant_id, warehouse_id)
    try:
        ds_cfg = resolve_direct_sales_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)).resolved
        prefer_store_locations = bool(ds_cfg.prefer_store_locations)
    except Exception:
        prefer_store_locations = True
    lim = max(1, min(int(limit), 24))
    pattern = f"%{q}%"
    q_lower = q.lower()

    products = (
        db.query(Product)
        .filter(
            Product.tenant_id == int(tenant_id),
            Product.deleted_at.is_(None),
            or_(
                Product.name.ilike(pattern),
                Product.ean.ilike(pattern),
                Product.bulk_ean.ilike(pattern),
                Product.sku.ilike(pattern),
                Product.symbol.ilike(pattern),
                Product.catalog_number.ilike(pattern),
                Product.barcode.ilike(pattern),
            ),
        )
        .order_by(Product.name.asc())
        .limit(lim * 3)
        .all()
    )
    if not products:
        if q.isdigit():
            row = (
                db.query(Product)
                .filter(Product.tenant_id == int(tenant_id), Product.id == int(q), Product.deleted_at.is_(None))
                .first()
            )
            if row:
                products = [row]
        if not products:
            return []

    scored: list[tuple[int, Product]] = []
    for p in products:
        name = (p.name or "").lower()
        ean = (p.ean or "").lower()
        sku = (p.sku or p.symbol or "").lower()
        if name == q_lower or ean == q_lower or sku == q_lower:
            score = 100
        elif name.startswith(q_lower) or ean.startswith(q_lower) or sku.startswith(q_lower):
            score = 80
        elif q_lower in name or q_lower in ean or q_lower in sku:
            score = 50
        else:
            score = 10
        scored.append((score, p))
    scored.sort(key=lambda x: (-x[0], (x[1].name or "").lower()))
    picked = [p for _, p in scored[:lim]]
    pids = [int(p.id) for p in picked]

    inv_by_pid: dict[int, float] = {}
    loc_rows_by_pid: dict[int, list[dict]] = {}
    inv_rows = (
        db.query(
            Inventory.product_id,
            Inventory.location_id,
            func.sum(Inventory.quantity).label("qty"),
        )
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id.in_(pids),
            Inventory.stock_disposition == "SALEABLE",
            Inventory.quantity > 0,
        )
        .group_by(Inventory.product_id, Inventory.location_id)
        .all()
    )
    loc_ids_set: set[int] = set()
    for pid, lid, qty_raw in inv_rows:
        pid_i = int(pid)
        qty = float(qty_raw or 0)
        inv_by_pid[pid_i] = inv_by_pid.get(pid_i, 0.0) + qty
        if lid is not None:
            lid_i = int(lid)
            loc_ids_set.add(lid_i)
            loc_rows_by_pid.setdefault(pid_i, []).append(
                {"location_id": lid_i, "available": qty, "suggested_qty": qty}
            )

    loc_ids = list(loc_ids_set)
    loc_map: dict[int, Location] = {}
    if loc_ids:
        for loc in db.query(Location).filter(Location.id.in_(loc_ids)).all():
            loc_map[int(loc.id)] = loc

    out: list[dict] = []
    for p in picked:
        pid = int(p.id)
        ranked = suggest_sales_locations(
            [
                {
                    **row,
                    "operational_zone_type": (
                        str(getattr(loc_map.get(int(row["location_id"])), "operational_zone_type", None) or "")
                        or None
                        if loc_map.get(int(row["location_id"]))
                        else None
                    ),
                    "sales_priority": getattr(loc_map.get(int(row["location_id"])), "sales_priority", None),
                }
                for row in loc_rows_by_pid.get(pid, [])
            ],
            quantity=1.0,
            prefer_store_locations=prefer_store_locations,
        )
        pref_lid = int(ranked[0]["location_id"]) if ranked else None
        loc = loc_map.get(pref_lid) if pref_lid else None
        price = float(p.sale_price) if getattr(p, "sale_price", None) is not None else None
        out.append(
            {
                "product_id": pid,
                "name": str(p.name or ""),
                "sku": str(p.sku or p.symbol or "") or None,
                "ean": str(p.ean or "") or None,
                "catalog_number": str(getattr(p, "catalog_number", None) or "") or None,
                "image_url": str(p.image_url or "") or None,
                "unit_price": price,
                "available_qty": round(inv_by_pid.get(pid, 0.0), 3),
                "preferred_location_id": int(loc.id) if loc else None,
                "preferred_location_code": str(loc.name or "") if loc else None,
                "operational_zone_type": (
                    str(getattr(loc, "operational_zone_type", None) or "") or None if loc else None
                ),
            }
        )
    return out
