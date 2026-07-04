"""Build and enrich WMS production collection task payloads."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...models.product import Product
from .collection_location_service import build_collection_location_options


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
    required_qty: float,
    collected_qty: float = 0.0,
    selected_location_id: int | None = None,
) -> dict[str, Any]:
    fields = _product_fields(product)
    return {
        "task_key": str(int(component_product_id)),
        "component_product_id": int(component_product_id),
        "product_name": str(product_name),
        "product_sku": product_sku,
        **fields,
        "required_qty": round(float(required_qty), 4),
        "collected_qty": round(float(collected_qty), 4),
        "selected_location_id": int(selected_location_id) if selected_location_id else None,
        "location_id": int(selected_location_id) if selected_location_id else 0,
        "location_code": "",
        "available_qty": None,
        "warehouse_total_available": None,
        "location_options": [],
    }


def normalize_collection_tasks(tasks_raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge legacy per-location tasks into one row per component product."""
    if not tasks_raw:
        return []
    by_pid: dict[int, dict[str, Any]] = {}
    for raw in tasks_raw:
        pid = int(raw.get("component_product_id") or 0)
        if pid < 1:
            continue
        req = float(raw.get("required_qty") or 0)
        col = float(raw.get("collected_qty") or 0)
        loc_id = int(raw.get("selected_location_id") or raw.get("location_id") or 0)
        if pid not in by_pid:
            by_pid[pid] = dict(raw)
            by_pid[pid]["task_key"] = str(pid)
            by_pid[pid]["required_qty"] = req
            by_pid[pid]["collected_qty"] = col
            if loc_id > 0:
                by_pid[pid]["selected_location_id"] = loc_id
                by_pid[pid]["location_id"] = loc_id
                by_pid[pid]["location_code"] = str(raw.get("location_code") or "")
            continue
        row = by_pid[pid]
        row["required_qty"] = round(max(float(row.get("required_qty") or 0), req), 4)
        row["collected_qty"] = round(max(float(row.get("collected_qty") or 0), col), 4)
        if loc_id > 0 and not row.get("selected_location_id"):
            row["selected_location_id"] = loc_id
            row["location_id"] = loc_id
            row["location_code"] = str(raw.get("location_code") or "")
    return list(by_pid.values())


def hydrate_collection_tasks(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    tasks_raw: list[dict[str, Any]],
    preferred_by_product: dict[int, set[int]] | None = None,
) -> list[dict[str, Any]]:
    """Attach live location options, warehouse totals, and product display fields."""
    normalized = normalize_collection_tasks(tasks_raw)
    if not normalized:
        return []

    pids = {int(t.get("component_product_id") or 0) for t in normalized}
    pids.discard(0)
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()} if pids else {}
    pref_map = preferred_by_product or {}

    out: list[dict[str, Any]] = []
    for raw in normalized:
        row = dict(raw)
        pid = int(row.get("component_product_id") or 0)
        p = products.get(pid)
        for key, val in _product_fields(p).items():
            if not row.get(key):
                row[key] = val

        options, wh_total = build_collection_location_options(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=pid,
            preferred_location_ids=pref_map.get(pid),
        )
        row["location_options"] = options
        row["warehouse_total_available"] = round(wh_total, 4)

        sel_id = int(row.get("selected_location_id") or row.get("location_id") or 0)
        selected = next((o for o in options if int(o["location_id"]) == sel_id), None)

        if selected:
            row["selected_location_id"] = sel_id
            row["location_id"] = int(selected["location_id"])
            row["location_code"] = str(selected["location_code"])
            row["available_qty"] = float(selected["available_qty"])
        else:
            row["selected_location_id"] = sel_id if sel_id > 0 else None
            row["location_id"] = sel_id if sel_id > 0 else 0
            row["location_code"] = str(row.get("location_code") or "")
            row["available_qty"] = None

        row["task_key"] = str(pid)
        out.append(row)
    return out


def enrich_collection_tasks(db: Session, tasks_raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Backfill display fields only (no warehouse context)."""
    if not tasks_raw:
        return []
    normalized = normalize_collection_tasks(tasks_raw)
    pids = {int(t.get("component_product_id") or 0) for t in normalized}
    pids.discard(0)
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()} if pids else {}
    out: list[dict[str, Any]] = []
    for raw in normalized:
        row = dict(raw)
        pid = int(row.get("component_product_id") or 0)
        p = products.get(pid)
        for key, val in _product_fields(p).items():
            if not row.get(key):
                row[key] = val
        row["task_key"] = str(pid)
        out.append(row)
    return out
