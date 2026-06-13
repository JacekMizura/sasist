"""
Offer availability from stock pools — sum per-warehouse offer qty across pool warehouses.

Uses ``commercially_sellable_qty`` (via ``offer_available_qty``) for SALEABLE offers.
Does not replace ``network_commercially_sellable_qty`` on product detail.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.product_sales_offer import ProductSalesOffer
from .offer_stock_pool_service import list_pool_warehouse_ids, resolve_pool_for_offer
from .product_sales_offers.stock_service import offer_available_qty


def offer_pool_available_qty(
    db: Session,
    *,
    offer: ProductSalesOffer | int,
    tenant_id: int,
) -> float:
    """
    Sum ``offer_available_qty`` across warehouses in the offer's stock pool
    (default pool when ``stock_pool_id`` is NULL).
    """
    if isinstance(offer, int):
        row = db.query(ProductSalesOffer).filter(ProductSalesOffer.id == int(offer)).first()
        if row is None:
            return 0.0
        offer = row

    if int(offer.tenant_id) != int(tenant_id):
        return 0.0
    if not bool(getattr(offer, "active", True)) or getattr(offer, "deleted_at", None) is not None:
        return 0.0

    pool = resolve_pool_for_offer(
        db,
        tenant_id=int(tenant_id),
        stock_pool_id=getattr(offer, "stock_pool_id", None),
    )
    if pool is None:
        return 0.0

    wh_ids = list_pool_warehouse_ids(db, pool=pool, tenant_id=int(tenant_id))
    if not wh_ids:
        return 0.0

    total = 0.0
    for wh_id in wh_ids:
        total += offer_available_qty(
            db,
            offer=offer,
            tenant_id=int(tenant_id),
            warehouse_id=int(wh_id),
        )
    return max(0.0, total)


def offer_pool_availability_breakdown(
    db: Session,
    *,
    offer: ProductSalesOffer,
    tenant_id: int,
) -> dict:
    pool = resolve_pool_for_offer(
        db,
        tenant_id=int(tenant_id),
        stock_pool_id=getattr(offer, "stock_pool_id", None),
    )
    if pool is None:
        return {"pool_id": None, "pool_name": None, "warehouses": [], "total_available_qty": 0.0}

    from ..models.warehouse import Warehouse

    wh_ids = list_pool_warehouse_ids(db, pool=pool, tenant_id=int(tenant_id))
    wh_names = {}
    if wh_ids:
        for wh in db.query(Warehouse).filter(Warehouse.id.in_(wh_ids)).all():
            wh_names[int(wh.id)] = str(wh.name or f"#{wh.id}")

    rows = []
    total = 0.0
    for wh_id in wh_ids:
        qty = offer_available_qty(
            db,
            offer=offer,
            tenant_id=int(tenant_id),
            warehouse_id=int(wh_id),
        )
        total += qty
        rows.append({"warehouse_id": wh_id, "warehouse_name": wh_names.get(wh_id), "available_qty": round(qty, 4)})

    return {
        "pool_id": int(pool.id),
        "pool_name": str(pool.name),
        "warehouses": rows,
        "total_available_qty": round(max(0.0, total), 4),
    }
