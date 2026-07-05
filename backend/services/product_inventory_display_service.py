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
from .product_disposition_snapshot_service import (
    disposition_snapshots_for_products,
    empty_disposition_stock_dict,
)
from .commercial_availability_service import commercial_snapshots_for_products, empty_commercial_snapshot
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
        return dict(_EMPTY_DISPLAY_SNAPSHOT)

    out: dict[str, Any] = {}
    attach_inventory_display_to_product_dicts(
        db,
        products=[product],
        product_dicts=[out],
        warehouse_id=warehouse_id,
        locations_data_failed=locations_data_failed,
        include_disposition_stock=True,
    )
    return {
        "stock_quantity": int(out.get("stock_quantity") or 0),
        "location_allocated_quantity": int(out.get("location_allocated_quantity") or 0),
        "unallocated_quantity": int(out.get("unallocated_quantity") or 0),
        "reserved_quantity": int(out.get("reserved_quantity") or 0),
        "production_reserved_quantity": int(out.get("production_reserved_quantity") or 0),
        "available_quantity": int(out.get("available_quantity") or 0),
        "disposition_stock": out.get("disposition_stock") or empty_disposition_stock_dict(),
        "commercially_sellable_qty": float(out.get("commercially_sellable_qty") or 0.0),
        "sales_blocked_qty": float(out.get("sales_blocked_qty") or 0.0),
        "locations": list(out.get("locations") or []),
        "inventory": list(out.get("inventory") or []),
        "locations_load_incomplete": bool(locations_data_failed),
    }


_EMPTY_DISPLAY_SNAPSHOT: Dict[str, Any] = {
    "stock_quantity": 0,
    "location_allocated_quantity": 0,
    "unallocated_quantity": 0,
    "reserved_quantity": 0,
    "production_reserved_quantity": 0,
    "available_quantity": 0,
    "disposition_stock": empty_disposition_stock_dict(),
    "commercially_sellable_qty": 0.0,
    "sales_blocked_qty": 0.0,
    "locations": [],
    "inventory": [],
    "locations_load_incomplete": False,
}


def _apply_display_fields_to_dict(
    out: dict[str, Any],
    *,
    product_id: int,
    tenant_id: int,
    stock: int,
    locations: List[dict],
    inventory: List[dict],
    reserved_quantity: int,
    available_quantity: int,
    production_reserved_quantity: int = 0,
    disposition: Optional[dict[str, Any]] = None,
    commercial: Optional[dict[str, Any]] = None,
    locations_data_failed: bool = False,
    include_disposition_stock: bool = True,
) -> None:
    allocated = _allocated_quantity_from_rows(locations, inventory)
    unallocated = max(0, stock - allocated)
    out["stock_quantity"] = stock
    out["location_allocated_quantity"] = allocated
    out["unallocated_quantity"] = unallocated
    out["reserved_quantity"] = reserved_quantity
    out["production_reserved_quantity"] = production_reserved_quantity
    out["available_quantity"] = available_quantity
    if include_disposition_stock:
        out["disposition_stock"] = disposition or empty_disposition_stock_dict()
    comm = commercial or empty_commercial_snapshot()
    out["commercially_sellable_qty"] = float(comm.get("commercially_sellable_qty") or 0.0)
    out["sales_blocked_qty"] = float(comm.get("sales_blocked_qty") or 0.0)
    out["locations"] = locations
    out["inventory"] = inventory
    if locations_data_failed:
        out["locations_load_incomplete"] = True


def attach_inventory_display_to_product_dicts(
    db: Session,
    *,
    products: Sequence[Product],
    product_dicts: Sequence[dict[str, Any]],
    warehouse_id: Optional[int] = None,
    log_tag: Optional[str] = None,
    locations_data_failed: bool = False,
    include_disposition_stock: bool = True,
) -> None:
    """
    Batch attach stock + locations + inventory (+ optional disposition/commercial) to list/detail dicts.

    Replaces per-row ``apply_inventory_display_to_dict`` in product list (avoids N+1 SQL).
    """
    if not products or not product_dicts:
        return
    if len(products) != len(product_dicts):
        raise ValueError("products and product_dicts must have the same length")

    stock_map, loc_map, inv_map = inventory_display_maps_for_products(
        db, products, warehouse_id=warehouse_id
    )

    by_tid: Dict[int, List[int]] = defaultdict(list)
    for p in products:
        by_tid[int(p.tenant_id)].append(int(p.id))

    ops_by_pid: Dict[int, Dict[str, float]] = {}
    for tid, pids in by_tid.items():
        ops_by_pid.update(
            inventory_snapshots_for_products(db, tid, warehouse_id, pids)
        )

    disp_by_pid: Dict[int, dict[str, Any]] = {}
    commercial_by_pid: Dict[int, dict[str, Any]] = {}
    if include_disposition_stock:
        empty_disp = empty_disposition_stock_dict()
        empty_comm = empty_commercial_snapshot()
        for tid, pids in by_tid.items():
            disp_by_pid.update(
                disposition_snapshots_for_products(db, tid, warehouse_id, pids)
            )
            if warehouse_id is not None:
                commercial_by_pid.update(
                    commercial_snapshots_for_products(
                        db,
                        tenant_id=tid,
                        warehouse_id=int(warehouse_id),
                        product_ids=pids,
                    )
                )
            else:
                for pid in pids:
                    commercial_by_pid.setdefault(int(pid), empty_comm)
        for pid in (int(p.id) for p in products):
            disp_by_pid.setdefault(pid, empty_disp)

    empty_comm = empty_commercial_snapshot()
    for product, out in zip(products, product_dicts):
        pid = int(product.id)
        tid = int(product.tenant_id)
        stock = int(stock_map.get((pid, tid), 0))
        locations = list(loc_map.get(pid, []))
        inventory = list(inv_map.get(pid, []))
        ops = ops_by_pid.get(pid, {})
        reserved = int(round(float(ops.get("reserved") or 0)))
        production_reserved = int(round(float(ops.get("production_reserved") or 0)))
        available = int(round(float(ops.get("available") or max(0, stock - reserved))))
        _apply_display_fields_to_dict(
            out,
            product_id=pid,
            tenant_id=tid,
            stock=stock,
            locations=locations,
            inventory=inventory,
            reserved_quantity=reserved,
            available_quantity=available,
            production_reserved_quantity=production_reserved,
            disposition=disp_by_pid.get(pid) if include_disposition_stock else None,
            commercial=commercial_by_pid.get(pid, empty_comm) if include_disposition_stock else None,
            locations_data_failed=locations_data_failed,
            include_disposition_stock=include_disposition_stock,
        )
        if log_tag:
            _log_stock_event(
                log_tag,
                product_id=pid,
                tenant_id=tid,
                warehouse_id=warehouse_id,
                total_stock=stock,
                locations=locations,
                allocated=int(out.get("location_allocated_quantity") or 0),
                unallocated=int(out.get("unallocated_quantity") or 0),
            )


def attach_disposition_stock_to_product_dicts(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_dicts: Sequence[dict[str, Any]],
) -> None:
    """Batch attach ``disposition_stock`` (list endpoint — avoids N+1)."""
    pids = [int(d["id"]) for d in product_dicts if d.get("id") is not None]
    if not pids:
        return
    disp_map = disposition_snapshots_for_products(db, int(tenant_id), warehouse_id, pids)
    commercial_map = (
        commercial_snapshots_for_products(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), product_ids=pids)
        if warehouse_id is not None
        else {}
    )
    empty = empty_disposition_stock_dict()
    empty_commercial = empty_commercial_snapshot()
    for d in product_dicts:
        pid = d.get("id")
        if pid is None:
            continue
        d["disposition_stock"] = disp_map.get(int(pid), empty)
        comm = commercial_map.get(int(pid), empty_commercial)
        d["commercially_sellable_qty"] = float(comm.get("commercially_sellable_qty") or 0.0)
        d["sales_blocked_qty"] = float(comm.get("sales_blocked_qty") or 0.0)


def apply_inventory_display_to_dict(
    db: Session,
    out: dict[str, Any],
    product: Product,
    *,
    warehouse_id: Optional[int] = None,
    log_tag: Optional[str] = None,
    locations_data_failed: bool = False,
    include_disposition_stock: bool = True,
) -> None:
    """Mutates *out* with stock_quantity, locations, inventory from shared snapshot."""
    attach_inventory_display_to_product_dicts(
        db,
        products=[product],
        product_dicts=[out],
        warehouse_id=warehouse_id,
        log_tag=log_tag,
        locations_data_failed=locations_data_failed,
        include_disposition_stock=include_disposition_stock,
    )


# Spec alias: display snapshot (stock + locations) for list/detail parity.
get_product_inventory_snapshot = get_product_inventory_display_snapshot
