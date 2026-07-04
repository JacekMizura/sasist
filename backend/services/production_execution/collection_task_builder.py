"""Build and enrich WMS production collection task payloads."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...models.product import Product


def _location_available_map(suggested_locations: list[Any]) -> dict[int, float]:
    out: dict[int, float] = {}
    for s in suggested_locations or []:
        loc_id = int(getattr(s, "location_id", 0) or 0)
        if loc_id < 1:
            continue
        out[loc_id] = round(float(getattr(s, "available", 0) or 0), 4)
    return out


def _product_fields(p: Product | None) -> dict[str, Any]:
    if p is None:
        return {
            "product_ean": None,
            "product_catalog_number": None,
            "product_unit": None,
            "product_image_url": None,
        }
    return {
        "product_ean": (p.ean or "").strip() or None,
        "product_catalog_number": (p.symbol or "").strip() or None,
        "product_unit": (p.unit or "").strip() or None,
        "product_image_url": (p.image_url or "").strip() or None,
    }


def build_collection_task_row(
    *,
    component_product_id: int,
    product_name: str,
    product_sku: str | None,
    product: Product | None,
    location_id: int,
    location_code: str,
    required_qty: float,
    suggested_locations: list[Any],
    warehouse_available: float | None = None,
) -> dict[str, Any]:
    loc_avail = _location_available_map(suggested_locations)
    available_qty = loc_avail.get(int(location_id))
    if available_qty is None and warehouse_available is not None:
        available_qty = float(warehouse_available)
    fields = _product_fields(product)
    return {
        "task_key": f"{int(component_product_id)}-{int(location_id)}",
        "component_product_id": int(component_product_id),
        "product_name": str(product_name),
        "product_sku": product_sku,
        **fields,
        "location_id": int(location_id),
        "location_code": str(location_code),
        "required_qty": round(float(required_qty), 4),
        "available_qty": available_qty,
        "collected_qty": 0.0,
    }


def enrich_collection_tasks(db: Session, tasks_raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Backfill display fields for tasks persisted before terminal settings rollout."""
    if not tasks_raw:
        return []
    pids = {int(t.get("component_product_id") or 0) for t in tasks_raw}
    pids.discard(0)
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()} if pids else {}
    out: list[dict[str, Any]] = []
    for raw in tasks_raw:
        row = dict(raw)
        pid = int(row.get("component_product_id") or 0)
        p = products.get(pid)
        fields = _product_fields(p)
        for key, val in fields.items():
            if not row.get(key):
                row[key] = val
        if row.get("available_qty") is None and p is not None:
            row["available_qty"] = None
        out.append(row)
    return out
