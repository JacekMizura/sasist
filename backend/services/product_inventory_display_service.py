"""
Single source of truth for product stock + location payloads (list + detail).

Semantics (do NOT conflate these):
- ``stock_quantity`` / ``visible_on_hand``: total physical on-hand from ``inventory`` (all visible rows).
- ``location_allocated_quantity``: sum of quantities in returned location/inventory rows (bin attribution).
- ``unallocated_quantity``: max(0, stock_quantity - location_allocated_quantity) — e.g. buffer/receiving
  rows hidden from badge payload, legacy filters, or stock not yet put away to named bins.
- ``reserved_quantity``: active ``StockReservation`` rows (status ``reserved``); reduces *available*, not on-hand.
- ``available_quantity``: on_hand - reserved (operational sellable/pickable hint).

``stock_quantity`` is NEVER derived as sum(locations).
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session

from ..models.product import Product
from .product_inventory_snapshot_service import inventory_snapshots_for_products, visible_on_hand_by_product

logger = logging.getLogger(__name__)

StockKey = Tuple[int, int]  # (product_id, tenant_id)


def _allocated_quantity_from_rows(
    locations: Sequence[dict],
    inventory: Sequence[dict],
) -> int:
    """Sum of quantities attributed to named locations in the API payload (not total on-hand)."""
    rows = list(inventory) if inventory else list(locations)
    total = 0.0
    for row in rows:
        if not isinstance(row, dict):
            continue
        total += float(row.get("quantity") or 0)
    return int(round(total))


def _inventory_operational_metrics(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    warehouse_id: Optional[int],
    on_hand: int,
) -> dict[str, int]:
    snaps = inventory_snapshots_for_products(db, tenant_id, warehouse_id, [int(product_id)])
    ops = snaps.get(int(product_id), {})
    reserved = int(round(float(ops.get("reserved") or 0)))
    available = int(round(float(ops.get("available") or max(0, on_hand - reserved))))
    return {
        "reserved_quantity": reserved,
        "available_quantity": available,
    }


def log_product_inventory_compare(
    *,
    product_id: int,
    tenant_id: int,
    warehouse_id: Optional[int],
    stock_total: int,
    allocated: int,
    unallocated: int,
    locations: Sequence[dict],
    source: str,
) -> None:
    """Structured compare log for list vs detail parity debugging."""
    loc_payload = []
    for loc in locations:
        if not isinstance(loc, dict):
            continue
        loc_payload.append(
            {
                "id": loc.get("id"),
                "code": (str(loc.get("code") or loc.get("name") or "").strip() or None),
                "quantity": loc.get("quantity"),
                "warehouse_id": loc.get("warehouse_id"),
                "location_uuid": loc.get("location_uuid"),
            }
        )
    logger.info(
        "[product.inventory.compare] %s",
        json.dumps(
            {
                "product_id": int(product_id),
                "tenant_id": int(tenant_id),
                "warehouse_id": int(warehouse_id) if warehouse_id is not None else None,
                "stock_total": int(stock_total),
                "allocated": int(allocated),
                "unallocated": int(unallocated),
                "locations_count": len(loc_payload),
                "locations": loc_payload,
                "source": str(source),
            },
            ensure_ascii=False,
        ),
    )


def _log_stock_event(
    tag: str,
    *,
    product_id: int,
    tenant_id: int,
    warehouse_id: Optional[int],
    total_stock: int,
    locations: Sequence[dict],
    allocated: int = 0,
    unallocated: int = 0,
) -> None:
    log_product_inventory_compare(
        product_id=product_id,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        stock_total=total_stock,
        allocated=allocated,
        unallocated=unallocated,
        locations=locations,
        source=tag,
    )


def inventory_display_maps_for_products(
    db: Session,
    products: Sequence[Product],
    *,
    warehouse_id: Optional[int] = None,
) -> tuple[Dict[StockKey, int], Dict[int, List[dict]], Dict[int, List[dict]]]:
    """
    Batch stock + locations for API list/detail.

    Returns (stock_by_pid_tid, locations_by_pid, inventory_by_pid).
    """
    if not products:
        return {}, {}, {}

    from ..api.product import _inventory_payload_for_product_ids, _stock_map_visible_by_product_tenant

    product_ids = [int(p.id) for p in products]
    loc_map, inv_map = _inventory_payload_for_product_ids(db, product_ids, warehouse_id=warehouse_id)

    stock_map: Dict[StockKey, int] = {}
    if warehouse_id is not None:
        by_tid: Dict[int, List[int]] = defaultdict(list)
        for p in products:
            by_tid[int(p.tenant_id)].append(int(p.id))
        for tid, pids in by_tid.items():
            oh = visible_on_hand_by_product(db, tid, warehouse_id, pids)
            for pid, qty in oh.items():
                stock_map[(int(pid), int(tid))] = int(round(float(qty)))
        for p in products:
            key = (int(p.id), int(p.tenant_id))
            stock_map.setdefault(key, 0)
    else:
        raw = _stock_map_visible_by_product_tenant(db, product_ids)
        stock_map = dict(raw)
        for p in products:
            key = (int(p.id), int(p.tenant_id))
            stock_map.setdefault(key, 0)

    return stock_map, loc_map, inv_map


def get_product_inventory_display_snapshot(
    db: Session,
    *,
    product_id: int,
    tenant_id: int,
    warehouse_id: Optional[int] = None,
    locations_data_failed: bool = False,
) -> Dict[str, Any]:
    """
    Single-product inventory display snapshot for list + detail parity.

    Keys: stock_quantity, location_allocated_quantity, unallocated_quantity, reserved_quantity,
    available_quantity, locations, inventory, locations_load_incomplete (only on load failure).
    """
    product = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        return {
            "stock_quantity": 0,
            "location_allocated_quantity": 0,
            "unallocated_quantity": 0,
            "reserved_quantity": 0,
            "available_quantity": 0,
            "locations": [],
            "inventory": [],
            "locations_load_incomplete": False,
        }

    stock_map, loc_map, inv_map = inventory_display_maps_for_products(
        db, [product], warehouse_id=warehouse_id
    )
    pid = int(product.id)
    tid = int(product.tenant_id)
    stock = int(stock_map.get((pid, tid), 0))
    locations = list(loc_map.get(pid, []))
    inventory = list(inv_map.get(pid, []))
    allocated = _allocated_quantity_from_rows(locations, inventory)
    unallocated = max(0, stock - allocated)
    ops = _inventory_operational_metrics(db, tenant_id=tid, product_id=pid, warehouse_id=warehouse_id, on_hand=stock)
    return {
        "stock_quantity": stock,
        "location_allocated_quantity": allocated,
        "unallocated_quantity": unallocated,
        "reserved_quantity": ops["reserved_quantity"],
        "available_quantity": ops["available_quantity"],
        "locations": locations,
        "inventory": inventory,
        "locations_load_incomplete": bool(locations_data_failed),
    }


def apply_inventory_display_to_dict(
    db: Session,
    out: dict[str, Any],
    product: Product,
    *,
    warehouse_id: Optional[int] = None,
    log_tag: Optional[str] = None,
    locations_data_failed: bool = False,
) -> None:
    """Mutates *out* with stock_quantity, locations, inventory from shared snapshot."""
    snap = get_product_inventory_display_snapshot(
        db,
        product_id=int(product.id),
        tenant_id=int(product.tenant_id),
        warehouse_id=warehouse_id,
        locations_data_failed=locations_data_failed,
    )
    out["stock_quantity"] = snap["stock_quantity"]
    out["location_allocated_quantity"] = snap["location_allocated_quantity"]
    out["unallocated_quantity"] = snap["unallocated_quantity"]
    out["reserved_quantity"] = snap["reserved_quantity"]
    out["available_quantity"] = snap["available_quantity"]
    out["locations"] = snap["locations"]
    out["inventory"] = snap["inventory"]
    if snap.get("locations_load_incomplete"):
        out["locations_load_incomplete"] = True
    if log_tag:
        _log_stock_event(
            log_tag,
            product_id=int(product.id),
            tenant_id=int(product.tenant_id),
            warehouse_id=warehouse_id,
            total_stock=int(snap["stock_quantity"]),
            locations=snap["locations"],
            allocated=int(snap.get("location_allocated_quantity") or 0),
            unallocated=int(snap.get("unallocated_quantity") or 0),
        )


# Spec alias: display snapshot (stock + locations) for list/detail parity.
get_product_inventory_snapshot = get_product_inventory_display_snapshot
