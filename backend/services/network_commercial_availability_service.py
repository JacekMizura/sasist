"""
Network commercial ATP — read-only projection for multi-warehouse online stock.

``network_commercially_sellable_qty`` = sum of ``commercially_sellable_qty`` across warehouses
where ``TenantWarehouse.participates_in_network_stock`` is true for the tenant.

Does not mutate inventory, reservations, waves, or orders.
"""

from __future__ import annotations

from typing import Dict, Sequence

from sqlalchemy.orm import Session

from ..models.tenant_warehouse import TenantWarehouse
from .commercial_availability_service import commercial_snapshots_for_products, commercially_sellable_qty


def list_network_stock_warehouse_ids(db: Session, tenant_id: int) -> list[int]:
    """Warehouse IDs linked to tenant that participate in the online network stock pool."""
    rows = (
        db.query(TenantWarehouse.warehouse_id)
        .filter(
            TenantWarehouse.tenant_id == int(tenant_id),
            TenantWarehouse.participates_in_network_stock.is_(True),
        )
        .order_by(TenantWarehouse.fulfillment_priority.asc(), TenantWarehouse.warehouse_id.asc())
        .all()
    )
    return [int(r[0]) for r in rows]


def list_fulfillment_eligible_warehouse_ids(db: Session, tenant_id: int) -> list[int]:
    """Warehouse IDs that may be chosen by future order sourcing (not used by sourcing yet)."""
    rows = (
        db.query(TenantWarehouse.warehouse_id)
        .filter(
            TenantWarehouse.tenant_id == int(tenant_id),
            TenantWarehouse.fulfillment_eligible.is_(True),
        )
        .order_by(TenantWarehouse.fulfillment_priority.asc(), TenantWarehouse.warehouse_id.asc())
        .all()
    )
    return [int(r[0]) for r in rows]


def network_commercially_sellable_qty(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
) -> float:
    wh_ids = list_network_stock_warehouse_ids(db, int(tenant_id))
    if not wh_ids:
        return 0.0
    total = 0.0
    for wh_id in wh_ids:
        total += commercially_sellable_qty(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(wh_id),
            product_id=int(product_id),
        )
    return max(0.0, total)


def network_commercial_snapshots_for_products(
    db: Session,
    *,
    tenant_id: int,
    product_ids: Sequence[int],
) -> Dict[int, float]:
    pids = [int(x) for x in product_ids if int(x) > 0]
    if not pids:
        return {}
    wh_ids = list_network_stock_warehouse_ids(db, int(tenant_id))
    if not wh_ids:
        return {pid: 0.0 for pid in pids}

    totals: Dict[int, float] = {pid: 0.0 for pid in pids}
    for wh_id in wh_ids:
        snap = commercial_snapshots_for_products(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(wh_id),
            product_ids=pids,
        )
        for pid in pids:
            row = snap.get(pid, {})
            totals[pid] += float(row.get("commercially_sellable_qty") or 0.0)
    return {pid: max(0.0, qty) for pid, qty in totals.items()}


__all__ = [
    "list_fulfillment_eligible_warehouse_ids",
    "list_network_stock_warehouse_ids",
    "network_commercial_snapshots_for_products",
    "network_commercially_sellable_qty",
]
