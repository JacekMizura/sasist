"""
Single source of truth for product stock + location payloads (list + detail).

Uses ``visible_on_hand_by_product`` for totals and ``_inventory_payload_for_product_ids``
for location rows — same helpers, same filters.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session

from ..models.product import Product
from .product_inventory_snapshot_service import visible_on_hand_by_product

logger = logging.getLogger(__name__)

StockKey = Tuple[int, int]  # (product_id, tenant_id)


def _log_stock_event(
    tag: str,
    *,
    product_id: int,
    tenant_id: int,
    warehouse_id: Optional[int],
    total_stock: int,
    locations: Sequence[dict],
) -> None:
    codes = [
        str(loc.get("code") or loc.get("name") or "").strip()
        for loc in locations
        if isinstance(loc, dict)
    ]
    codes = [c for c in codes if c]
    logger.info(
        "[%s] %s",
        tag,
        json.dumps(
            {
                "product_id": int(product_id),
                "tenant_id": int(tenant_id),
                "warehouse_id": int(warehouse_id) if warehouse_id is not None else None,
                "total_stock": int(total_stock),
                "locations_count": len(locations),
                "location_codes": codes,
            },
            ensure_ascii=False,
        ),
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
) -> Dict[str, Any]:
    """
    Single-product inventory display snapshot for list + detail parity.

    Keys: stock_quantity, locations, inventory, locations_load_incomplete (when stock>0 but no rows).
    """
    product = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        return {
            "stock_quantity": 0,
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
    incomplete = stock > 0 and len(locations) == 0 and len(inventory) == 0
    return {
        "stock_quantity": stock,
        "locations": locations,
        "inventory": inventory,
        "locations_load_incomplete": incomplete,
    }


def apply_inventory_display_to_dict(
    db: Session,
    out: dict[str, Any],
    product: Product,
    *,
    warehouse_id: Optional[int] = None,
    log_tag: Optional[str] = None,
) -> None:
    """Mutates *out* with stock_quantity, locations, inventory from shared snapshot."""
    snap = get_product_inventory_display_snapshot(
        db,
        product_id=int(product.id),
        tenant_id=int(product.tenant_id),
        warehouse_id=warehouse_id,
    )
    out["stock_quantity"] = snap["stock_quantity"]
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
        )


# Spec alias: display snapshot (stock + locations) for list/detail parity.
get_product_inventory_snapshot = get_product_inventory_display_snapshot
