"""P4 — tenant warehouse network stock summary (owner dashboard)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.stock_reservation import StockReservation
from .commercial_availability_service import commercial_snapshots_for_products
from .product_warehouse_stock_breakdown_service import _tenant_warehouse_rows


def build_tenant_warehouse_network_summary(db: Session, *, tenant_id: int) -> dict[str, Any]:
    wh_rows = _tenant_warehouse_rows(db, int(tenant_id))
    product_ids = [
        int(r[0])
        for r in db.query(Product.id)
        .filter(Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
        .all()
    ]

    warehouses_out: list[dict[str, Any]] = []
    sum_physical = 0
    sum_commercial = 0.0
    sum_reserved = 0

    for wh_id, wh_name in wh_rows:
        physical = (
            db.query(func.coalesce(func.sum(Inventory.quantity), 0))
            .join(Location, Location.id == Inventory.location_id)
            .join(Product, Product.id == Inventory.product_id)
            .filter(
                Product.tenant_id == int(tenant_id),
                Product.deleted_at.is_(None),
                Location.warehouse_id == int(wh_id),
            )
            .scalar()
        )
        physical_i = int(round(float(physical or 0)))

        reserved = (
            db.query(func.coalesce(func.sum(StockReservation.quantity), 0))
            .join(Location, Location.id == StockReservation.location_id)
            .filter(
                StockReservation.tenant_id == int(tenant_id),
                StockReservation.status == "reserved",
                Location.warehouse_id == int(wh_id),
            )
            .scalar()
        )
        reserved_i = int(round(float(reserved or 0)))

        commercial_total = 0.0
        if product_ids:
            _CHUNK = 400
            for off in range(0, len(product_ids), _CHUNK):
                chunk = product_ids[off : off + _CHUNK]
                snap = commercial_snapshots_for_products(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(wh_id),
                    product_ids=chunk,
                )
                for pid in chunk:
                    commercial_total += float((snap.get(pid) or {}).get("commercially_sellable_qty") or 0.0)

        warehouses_out.append(
            {
                "warehouse_id": wh_id,
                "warehouse_name": wh_name,
                "physical_quantity": physical_i,
                "commercially_sellable_qty": round(commercial_total, 4),
                "reserved_quantity": reserved_i,
            }
        )
        sum_physical += physical_i
        sum_commercial += commercial_total
        sum_reserved += reserved_i

    return {
        "tenant_id": int(tenant_id),
        "warehouses": warehouses_out,
        "totals": {
            "physical_quantity": sum_physical,
            "commercially_sellable_qty": round(sum_commercial, 4),
            "reserved_quantity": sum_reserved,
        },
    }
