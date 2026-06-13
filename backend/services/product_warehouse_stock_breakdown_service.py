"""P4 — per-warehouse product stock breakdown (read-only UI projection)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..models.product import Product
from ..models.tenant_warehouse import TenantWarehouse
from ..models.warehouse import Warehouse
from .commercial_availability_service import commercial_snapshots_for_products
from .network_commercial_availability_service import (
    list_network_stock_warehouse_ids,
    network_commercially_sellable_qty,
)
from .product_inventory_display_service import (
    get_product_inventory_display_snapshot,
    inventory_display_maps_for_products,
)
from .product_inventory_snapshot_service import inventory_snapshots_for_products


def _tenant_warehouse_rows(db: Session, tenant_id: int) -> list[tuple[int, str]]:
    rows = (
        db.query(TenantWarehouse.warehouse_id, Warehouse.name)
        .join(Warehouse, Warehouse.id == TenantWarehouse.warehouse_id)
        .filter(TenantWarehouse.tenant_id == int(tenant_id))
        .order_by(TenantWarehouse.fulfillment_priority.asc(), TenantWarehouse.warehouse_id.asc())
        .all()
    )
    return [(int(wid), (name or "").strip() or f"Magazyn #{wid}") for wid, name in rows]


def build_product_warehouse_stock_breakdown(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
) -> dict[str, Any]:
    warehouses_out: list[dict[str, Any]] = []
    total_physical = 0
    total_available = 0
    total_reserved = 0
    total_commercial = 0.0

    for wh_id, wh_name in _tenant_warehouse_rows(db, tenant_id):
        snap = get_product_inventory_display_snapshot(
            db,
            product_id=int(product_id),
            tenant_id=int(tenant_id),
            warehouse_id=int(wh_id),
        )
        physical = int(snap.get("stock_quantity") or 0)
        available = int(snap.get("available_quantity") or 0)
        reserved = int(snap.get("reserved_quantity") or 0)
        commercial = float(snap.get("commercially_sellable_qty") or 0.0)
        warehouses_out.append(
            {
                "warehouse_id": wh_id,
                "warehouse_name": wh_name,
                "physical_quantity": physical,
                "available_quantity": available,
                "reserved_quantity": reserved,
                "commercially_sellable_qty": commercial,
            }
        )
        total_physical += physical
        total_available += available
        total_reserved += reserved
        total_commercial += commercial

    network_commercial = network_commercially_sellable_qty(
        db, tenant_id=int(tenant_id), product_id=int(product_id)
    )
    network_wh_ids = set(list_network_stock_warehouse_ids(db, int(tenant_id)))

    return {
        "product_id": int(product_id),
        "tenant_id": int(tenant_id),
        "warehouses": warehouses_out,
        "network_totals": {
            "physical_quantity": total_physical,
            "available_quantity": total_available,
            "reserved_quantity": total_reserved,
            "commercially_sellable_qty": float(network_commercial),
            "network_warehouse_ids": sorted(network_wh_ids),
        },
    }


def attach_multi_warehouse_stock_to_product_dicts(
    db: Session,
    *,
    tenant_id: int,
    products: list[Product],
    product_dicts: list[dict[str, Any]],
    include_network_stock: bool = False,
    include_warehouse_stocks: bool = False,
) -> None:
    if not product_dicts or not products or len(products) != len(product_dicts):
        return
    pids = [int(p.id) for p in products]

    if include_network_stock:
        from .network_commercial_availability_service import network_commercial_snapshots_for_products

        net_map = network_commercial_snapshots_for_products(
            db, tenant_id=int(tenant_id), product_ids=pids
        )
        for d in product_dicts:
            pid = int(d.get("id") or 0)
            d["network_commercially_sellable_qty"] = float(net_map.get(pid, 0.0))

    if include_warehouse_stocks:
        wh_rows = _tenant_warehouse_rows(db, tenant_id)
        wh_stock: dict[int, dict[int, dict[str, float | int]]] = {pid: {} for pid in pids}
        for wh_id, _ in wh_rows:
            stock_map, _, _ = inventory_display_maps_for_products(
                db, products, warehouse_id=int(wh_id)
            )
            ops = inventory_snapshots_for_products(db, int(tenant_id), int(wh_id), pids)
            snap = commercial_snapshots_for_products(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(wh_id),
                product_ids=pids,
            )
            for p in products:
                pid = int(p.id)
                tid = int(p.tenant_id)
                physical = int(stock_map.get((pid, tid), 0))
                reserved = int(round(float((ops.get(pid) or {}).get("reserved") or 0)))
                available = int(round(float((ops.get(pid) or {}).get("available") or max(0, physical - reserved))))
                commercial = float((snap.get(pid) or {}).get("commercially_sellable_qty") or 0.0)
                wh_stock[pid][wh_id] = {
                    "physical_quantity": physical,
                    "available_quantity": available,
                    "reserved_quantity": reserved,
                    "commercially_sellable_qty": commercial,
                }
        for d in product_dicts:
            pid = int(d.get("id") or 0)
            d["warehouse_stocks"] = wh_stock.get(pid, {})
