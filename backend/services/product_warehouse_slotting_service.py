"""Per-warehouse product slotting — read/write SSOT (multi-WH)."""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime
from typing import Any, Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.product import Product
from ..models.product_warehouse_slotting import ProductWarehouseSlotting
from ..models.tenant_warehouse import TenantWarehouse
from ..models.warehouse import Bin, Rack, WarehouseLayout
from ..storage_types import is_pickable
from ..config import product_refactor_flags as pr_flags

logger = logging.getLogger(__name__)


def _normalize_uuid(raw: Any) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip()
    return s or None


def location_uuids_from_entries(entries: list[dict] | None) -> list[str]:
    if not entries:
        return []
    out: list[str] = []
    for ent in entries:
        if not isinstance(ent, dict):
            continue
        u = _normalize_uuid(ent.get("locationUUID") or ent.get("location_uuid"))
        if u:
            out.append(u)
    return list(dict.fromkeys(out))


def parse_assigned_locations_json(raw: Any) -> list[dict]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [e for e in raw if isinstance(e, dict)]
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        try:
            parsed = json.loads(s)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [e for e in parsed if isinstance(e, dict)]
    return []


def resolve_warehouse_ids_for_uuids(
    db: Session,
    *,
    tenant_id: int,
    uuids: Iterable[str],
) -> dict[str, int]:
    """Map location_uuid -> warehouse_id for bins linked to tenant warehouses."""
    unique = list(dict.fromkeys(u for u in uuids if u))
    if not unique:
        return {}
    rows = (
        db.query(Bin.location_uuid, WarehouseLayout.warehouse_id)
        .join(Rack, Bin.rack_id == Rack.id)
        .join(WarehouseLayout, Rack.layout_id == WarehouseLayout.id)
        .join(
            TenantWarehouse,
            (TenantWarehouse.warehouse_id == WarehouseLayout.warehouse_id)
            & (TenantWarehouse.tenant_id == tenant_id),
        )
        .filter(Bin.location_uuid.in_(unique))
        .all()
    )
    out: dict[str, int] = {}
    for loc_uuid, wh_id in rows:
        u = _normalize_uuid(loc_uuid)
        if u and u not in out:
            out[u] = int(wh_id)
    return out


def _raise_invalid_slotting(
    *,
    invalid_uuids: list[str],
    not_found: list[str] | None = None,
    inactive: list[str] | None = None,
    wrong_warehouse: list[str] | None = None,
) -> None:
    detail: dict = {
        "detail": "Invalid location assignment",
        "invalid_uuids": sorted(dict.fromkeys(invalid_uuids)),
    }
    if not_found:
        detail["not_found"] = sorted(dict.fromkeys(not_found))
    if inactive:
        detail["inactive"] = sorted(dict.fromkeys(inactive))
    if wrong_warehouse:
        detail["wrong_warehouse"] = sorted(dict.fromkeys(wrong_warehouse))
    raise HTTPException(status_code=400, detail=detail)


def validate_slotting_entries_for_warehouse(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    entries: list[dict] | None,
) -> None:
    """Every UUID must resolve to an active bin in the given warehouse for this tenant."""
    uuids = location_uuids_from_entries(entries)
    if not uuids:
        return

    wh_link = (
        db.query(TenantWarehouse.id)
        .filter(
            TenantWarehouse.tenant_id == tenant_id,
            TenantWarehouse.warehouse_id == warehouse_id,
        )
        .first()
    )
    if wh_link is None:
        raise HTTPException(status_code=404, detail="Warehouse not linked to tenant")

    rows = (
        db.query(Bin.location_uuid)
        .join(Rack, Bin.rack_id == Rack.id)
        .join(WarehouseLayout, Rack.layout_id == WarehouseLayout.id)
        .filter(
            WarehouseLayout.warehouse_id == warehouse_id,
            Bin.location_uuid.in_(uuids),
        )
        .all()
    )
    found = {_normalize_uuid(r[0]) for r in rows if _normalize_uuid(r[0])}
    if len(found) == len(uuids):
        return

    not_found: list[str] = []
    inactive: list[str] = []
    wrong_warehouse: list[str] = []

    missing = [u for u in uuids if u not in found]
    if missing:
        broad_rows = (
            db.query(Bin.location_uuid, WarehouseLayout.warehouse_id, Bin.is_active, Rack.is_active)
            .join(Rack, Bin.rack_id == Rack.id)
            .join(WarehouseLayout, Rack.layout_id == WarehouseLayout.id)
            .filter(Bin.location_uuid.in_(missing))
            .execution_options(include_inactive=True)
            .all()
        )
        by_uuid: dict[str, list[tuple[int, bool, bool]]] = defaultdict(list)
        for loc_uuid, wh_id, bin_active, rack_active in broad_rows:
            u = _normalize_uuid(loc_uuid)
            if u:
                by_uuid[u].append((int(wh_id), bool(bin_active), bool(rack_active)))

        for u in missing:
            entries_for_u = by_uuid.get(u) or []
            if not entries_for_u:
                not_found.append(u)
                continue
            wh_entries = [e for e in entries_for_u if e[0] == warehouse_id]
            if not wh_entries:
                wrong_warehouse.append(u)
            elif any(b and r for _, b, r in wh_entries):
                inactive.append(u)
            else:
                inactive.append(u)

    _raise_invalid_slotting(
        invalid_uuids=uuids,
        not_found=not_found,
        inactive=inactive,
        wrong_warehouse=wrong_warehouse,
    )


def apply_slotting_to_product_dicts(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_dicts: list[dict],
) -> None:
    """Replace assigned_locations on product dicts with SSOT rows for one warehouse."""
    if not product_dicts:
        return
    product_ids = [int(d["id"]) for d in product_dicts if d.get("id") is not None]
    slot_map = get_warehouse_slotting_map(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=product_ids
    )
    for d in product_dicts:
        pid = d.get("id")
        if pid is None:
            continue
        d["assigned_locations"] = slot_map.get(int(pid), [])


def slotting_row_to_api_entry(row: ProductWarehouseSlotting) -> dict:
    return {
        "locationUUID": row.location_uuid,
        "quantity": float(row.quantity or 0),
        "locationAddress": None,
        "storageType": row.storage_type,
    }


def get_product_slotting_entries(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    warehouse_id: int,
) -> list[dict]:
    rows = (
        db.query(ProductWarehouseSlotting)
        .filter(
            ProductWarehouseSlotting.tenant_id == tenant_id,
            ProductWarehouseSlotting.product_id == product_id,
            ProductWarehouseSlotting.warehouse_id == warehouse_id,
        )
        .order_by(ProductWarehouseSlotting.id.asc())
        .all()
    )
    return [slotting_row_to_api_entry(r) for r in rows]


def get_warehouse_slotting_map(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int] | None = None,
) -> dict[int, list[dict]]:
    q = db.query(ProductWarehouseSlotting).filter(
        ProductWarehouseSlotting.tenant_id == tenant_id,
        ProductWarehouseSlotting.warehouse_id == warehouse_id,
    )
    if product_ids:
        q = q.filter(ProductWarehouseSlotting.product_id.in_(product_ids))
    rows = q.order_by(ProductWarehouseSlotting.product_id.asc(), ProductWarehouseSlotting.id.asc()).all()
    out: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        out[int(row.product_id)].append(slotting_row_to_api_entry(row))
    return dict(out)


def first_pickable_cluster_key_from_entries(entries: list[dict]) -> str:
    """First pickable location key (UUID preferred) for wave location_clustering."""
    for loc in entries:
        if not isinstance(loc, dict):
            continue
        if not is_pickable(loc.get("storageType") or loc.get("storage_type")):
            continue
        key = (
            loc.get("locationUUID")
            or loc.get("location_uuid")
            or loc.get("locationAddress")
            or loc.get("label")
            or ""
        )
        s = str(key).strip()
        if s:
            return s
    return ""


def get_wave_cluster_location_key_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int],
) -> dict[int, str]:
    """
    Warehouse-scoped pick cluster key per product for wave location_clustering.

    SSOT: product_warehouse_slotting. Legacy products.assigned_locations is used only when
    there are no slotting rows for (product, warehouse) and
    WAVE_CLUSTERING_LEGACY_ASSIGNED_LOCATIONS_FALLBACK is enabled — entries filtered by UUID→WH.
    """
    if not product_ids:
        return {}

    unique_pids = list(dict.fromkeys(int(p) for p in product_ids))
    slot_map = get_warehouse_slotting_map(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_ids=unique_pids,
    )

    out: dict[int, str] = {}
    missing_for_fallback: list[int] = []

    for pid in unique_pids:
        entries = slot_map.get(pid) or []
        if entries:
            key = first_pickable_cluster_key_from_entries(entries)
            out[pid] = key
        else:
            missing_for_fallback.append(pid)

    if not missing_for_fallback or not pr_flags.wave_clustering_legacy_assigned_locations_fallback:
        for pid in missing_for_fallback:
            out.setdefault(pid, "")
        return out

    products = (
        db.query(Product)
        .filter(Product.id.in_(missing_for_fallback), Product.tenant_id == tenant_id)
        .all()
    )
    for product in products:
        pid = int(product.id)
        legacy_entries = parse_assigned_locations_json(product.assigned_locations)
        if not legacy_entries:
            out[pid] = ""
            continue
        uuids = location_uuids_from_entries(legacy_entries)
        wh_by_uuid = resolve_warehouse_ids_for_uuids(db, tenant_id=tenant_id, uuids=uuids)
        wh_scoped = []
        for ent in legacy_entries:
            if not isinstance(ent, dict):
                continue
            u = _normalize_uuid(ent.get("locationUUID") or ent.get("location_uuid"))
            if u and wh_by_uuid.get(u) == warehouse_id:
                wh_scoped.append(ent)
        out[pid] = first_pickable_cluster_key_from_entries(wh_scoped)

    for pid in missing_for_fallback:
        out.setdefault(pid, "")

    return out


def get_wave_cluster_order_location_sets(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_ids: list[int],
) -> dict[int, set[str]]:
    """For each order_id return set of location keys from warehouse-scoped slotting SSOT."""
    from ..models.order_item import OrderItem

    if not order_ids:
        return {}

    items = (
        db.query(OrderItem.order_id, OrderItem.product_id)
        .filter(OrderItem.order_id.in_(order_ids))
        .all()
    )
    product_ids = list({int(i.product_id) for i in items})
    keys_by_product = get_wave_cluster_location_key_by_product(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_ids=product_ids,
    )

    order_locs: dict[int, set[str]] = {int(oid): set() for oid in order_ids}
    for oid, pid in items:
        key = keys_by_product.get(int(pid), "")
        if key:
            order_locs[int(oid)].add(key)
    return order_locs


def replace_product_slotting_for_warehouse(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    warehouse_id: int,
    entries: list[dict],
) -> list[dict]:
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.tenant_id == tenant_id, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    validate_slotting_entries_for_warehouse(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        entries=entries,
    )

    db.query(ProductWarehouseSlotting).filter(
        ProductWarehouseSlotting.tenant_id == tenant_id,
        ProductWarehouseSlotting.product_id == product_id,
        ProductWarehouseSlotting.warehouse_id == warehouse_id,
    ).delete(synchronize_session=False)

    now = datetime.utcnow()
    for ent in entries or []:
        if not isinstance(ent, dict):
            continue
        loc_uuid = _normalize_uuid(ent.get("locationUUID") or ent.get("location_uuid"))
        if not loc_uuid:
            continue
        qty_raw = ent.get("quantity", 0)
        try:
            qty = float(qty_raw)
        except (TypeError, ValueError):
            qty = 0.0
        if qty < 0:
            qty = 0.0
        storage = ent.get("storageType") or ent.get("storage_type")
        storage_s = str(storage).strip() if storage is not None else None
        db.add(
            ProductWarehouseSlotting(
                tenant_id=tenant_id,
                product_id=product_id,
                warehouse_id=warehouse_id,
                location_uuid=loc_uuid,
                quantity=qty,
                storage_type=storage_s or None,
                created_at=now,
                updated_at=now,
            )
        )
    db.flush()
    return get_product_slotting_entries(
        db, tenant_id=tenant_id, product_id=product_id, warehouse_id=warehouse_id
    )


def backfill_slotting_from_assigned_locations(
    db: Session,
    *,
    tenant_id: int | None = None,
    dry_run: bool = False,
) -> dict[str, int]:
    """
    Idempotent backfill: products.assigned_locations JSON -> product_warehouse_slotting.
    Skips rows that already exist (same product, warehouse, uuid).
    """
    q = db.query(Product).filter(Product.deleted_at.is_(None))
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == tenant_id)
    products = q.order_by(Product.id.asc()).all()

    existing_keys: set[tuple[int, int, str]] = set()
    existing_q = db.query(
        ProductWarehouseSlotting.product_id,
        ProductWarehouseSlotting.warehouse_id,
        ProductWarehouseSlotting.location_uuid,
    )
    if tenant_id is not None:
        existing_q = existing_q.filter(ProductWarehouseSlotting.tenant_id == tenant_id)
    for pid, wh_id, loc_uuid in existing_q.all():
        u = _normalize_uuid(loc_uuid)
        if u:
            existing_keys.add((int(pid), int(wh_id), u))

    inserted = 0
    skipped_existing = 0
    skipped_unresolved = 0
    products_scanned = 0

    for product in products:
        entries = parse_assigned_locations_json(product.assigned_locations)
        if not entries:
            continue
        products_scanned += 1
        tid = int(product.tenant_id)
        pid = int(product.id)
        uuids = location_uuids_from_entries(entries)
        wh_map = resolve_warehouse_ids_for_uuids(db, tenant_id=tid, uuids=uuids)
        now = datetime.utcnow()
        for ent in entries:
            loc_uuid = _normalize_uuid(ent.get("locationUUID") or ent.get("location_uuid"))
            if not loc_uuid:
                continue
            wh_id = wh_map.get(loc_uuid)
            if wh_id is None:
                skipped_unresolved += 1
                continue
            key = (pid, wh_id, loc_uuid)
            if key in existing_keys:
                skipped_existing += 1
                continue
            qty_raw = ent.get("quantity", 0)
            try:
                qty = float(qty_raw)
            except (TypeError, ValueError):
                qty = 0.0
            storage = ent.get("storageType") or ent.get("storage_type")
            storage_s = str(storage).strip() if storage is not None else None
            if not dry_run:
                db.add(
                    ProductWarehouseSlotting(
                        tenant_id=tid,
                        product_id=pid,
                        warehouse_id=wh_id,
                        location_uuid=loc_uuid,
                        quantity=max(0.0, qty),
                        storage_type=storage_s or None,
                        created_at=now,
                        updated_at=now,
                    )
                )
            existing_keys.add(key)
            inserted += 1

    if not dry_run and inserted > 0:
        db.flush()

    return {
        "products_scanned": products_scanned,
        "inserted": inserted,
        "skipped_existing": skipped_existing,
        "skipped_unresolved_uuid": skipped_unresolved,
    }


def cleanup_slotting_after_layout_save(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    layout_id: int,
) -> int:
    """Remove slotting rows whose UUID no longer exists on this layout (any bin state)."""
    layout_uuids_rows = (
        db.query(Bin.location_uuid)
        .join(Rack, Bin.rack_id == Rack.id)
        .filter(Rack.layout_id == layout_id, Bin.location_uuid.isnot(None))
        .execution_options(include_inactive=True)
        .all()
    )
    layout_uuids = {_normalize_uuid(r[0]) for r in layout_uuids_rows if _normalize_uuid(r[0])}

    rows = (
        db.query(ProductWarehouseSlotting)
        .filter(
            ProductWarehouseSlotting.tenant_id == tenant_id,
            ProductWarehouseSlotting.warehouse_id == warehouse_id,
        )
        .all()
    )
    removed = 0
    for row in rows:
        u = _normalize_uuid(row.location_uuid)
        if u and u not in layout_uuids:
            db.delete(row)
            removed += 1
    if removed:
        db.flush()
    return removed
