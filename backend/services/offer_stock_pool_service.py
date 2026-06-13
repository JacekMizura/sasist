"""CRUD and resolution for offer stock pools."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.offer_stock_pool import OfferStockPool, OfferStockPoolWarehouse
from ..models.tenant_warehouse import TenantWarehouse
from ..models.warehouse import Warehouse
from .network_commercial_availability_service import list_network_stock_warehouse_ids

DEFAULT_POOL_NAME = "Pool domyślny"


class OfferStockPoolError(ValueError):
    pass


def _network_warehouse_id_set(db: Session, tenant_id: int) -> set[int]:
    return set(list_network_stock_warehouse_ids(db, int(tenant_id)))


def ensure_default_pool_for_tenant(db: Session, *, tenant_id: int) -> OfferStockPool:
    existing = (
        db.query(OfferStockPool)
        .filter(OfferStockPool.tenant_id == int(tenant_id), OfferStockPool.is_default.is_(True))
        .first()
    )
    if existing is not None:
        return existing
    pool = OfferStockPool(
        tenant_id=int(tenant_id),
        name=DEFAULT_POOL_NAME,
        is_default=True,
    )
    db.add(pool)
    db.flush()
    for wh_id in list_network_stock_warehouse_ids(db, int(tenant_id)):
        db.add(OfferStockPoolWarehouse(pool_id=int(pool.id), warehouse_id=int(wh_id)))
    db.flush()
    return pool


def get_default_pool(db: Session, *, tenant_id: int) -> OfferStockPool | None:
    row = (
        db.query(OfferStockPool)
        .filter(OfferStockPool.tenant_id == int(tenant_id), OfferStockPool.is_default.is_(True))
        .first()
    )
    if row is not None:
        return row
    return ensure_default_pool_for_tenant(db, tenant_id=int(tenant_id))


def resolve_pool_for_offer(
    db: Session,
    *,
    tenant_id: int,
    stock_pool_id: int | None,
) -> OfferStockPool | None:
    if stock_pool_id is not None:
        row = (
            db.query(OfferStockPool)
            .filter(
                OfferStockPool.id == int(stock_pool_id),
                OfferStockPool.tenant_id == int(tenant_id),
            )
            .first()
        )
        if row is not None:
            return row
    return get_default_pool(db, tenant_id=int(tenant_id))


def list_pool_warehouse_ids(db: Session, *, pool: OfferStockPool, tenant_id: int) -> list[int]:
    """Warehouse IDs in pool, intersected with participates_in_network_stock."""
    allowed = _network_warehouse_id_set(db, int(tenant_id))
    rows = (
        db.query(OfferStockPoolWarehouse.warehouse_id)
        .filter(OfferStockPoolWarehouse.pool_id == int(pool.id))
        .order_by(OfferStockPoolWarehouse.warehouse_id.asc())
        .all()
    )
    out: list[int] = []
    for (wh_id,) in rows:
        wid = int(wh_id)
        if wid in allowed:
            out.append(wid)
    return out


def pool_to_dict(db: Session, *, pool: OfferStockPool, tenant_id: int) -> dict[str, Any]:
    wh_ids = list_pool_warehouse_ids(db, pool=pool, tenant_id=int(tenant_id))
    wh_names: dict[int, str] = {}
    if wh_ids:
        for wh in db.query(Warehouse).filter(Warehouse.id.in_(wh_ids)).all():
            wh_names[int(wh.id)] = str(wh.name or f"Magazyn #{wh.id}")
    network_ids = sorted(_network_warehouse_id_set(db, int(tenant_id)))
    eligible_names: dict[int, str] = {}
    if network_ids:
        for wh in db.query(Warehouse).filter(Warehouse.id.in_(network_ids)).all():
            eligible_names[int(wh.id)] = str(wh.name or f"Magazyn #{wh.id}")
    return {
        "id": int(pool.id),
        "tenant_id": int(pool.tenant_id),
        "name": str(pool.name),
        "is_default": bool(pool.is_default),
        "warehouse_ids": wh_ids,
        "warehouses": [{"id": wid, "name": wh_names.get(wid, f"#{wid}")} for wid in wh_ids],
        "eligible_warehouse_ids": network_ids,
        "eligible_warehouses": [
            {"id": wid, "name": eligible_names.get(wid, f"#{wid}")} for wid in network_ids
        ],
    }


def list_pools(db: Session, *, tenant_id: int) -> list[dict[str, Any]]:
    ensure_default_pool_for_tenant(db, tenant_id=int(tenant_id))
    db.flush()
    rows = (
        db.query(OfferStockPool)
        .filter(OfferStockPool.tenant_id == int(tenant_id))
        .order_by(OfferStockPool.is_default.desc(), OfferStockPool.name.asc())
        .all()
    )
    return [pool_to_dict(db, pool=p, tenant_id=int(tenant_id)) for p in rows]


def create_pool(
    db: Session,
    *,
    tenant_id: int,
    name: str,
    warehouse_ids: list[int] | None = None,
    is_default: bool = False,
) -> OfferStockPool:
    n = str(name or "").strip()
    if not n:
        raise OfferStockPoolError("Nazwa puli jest wymagana.")
    if (
        db.query(OfferStockPool.id)
        .filter(OfferStockPool.tenant_id == int(tenant_id), OfferStockPool.name == n)
        .first()
    ):
        raise OfferStockPoolError("Pula o tej nazwie już istnieje.")

    if is_default:
        db.query(OfferStockPool).filter(OfferStockPool.tenant_id == int(tenant_id)).update(
            {OfferStockPool.is_default: False}
        )

    pool = OfferStockPool(tenant_id=int(tenant_id), name=n[:256], is_default=bool(is_default))
    db.add(pool)
    db.flush()

    allowed = _network_warehouse_id_set(db, int(tenant_id))
    ids = [int(x) for x in (warehouse_ids or []) if int(x) in allowed]
    if not ids and is_default:
        ids = sorted(allowed)
    for wid in ids:
        db.add(OfferStockPoolWarehouse(pool_id=int(pool.id), warehouse_id=wid))
    db.flush()
    return pool


def update_pool(
    db: Session,
    *,
    pool: OfferStockPool,
    name: str | None = None,
    warehouse_ids: list[int] | None = None,
    is_default: bool | None = None,
) -> OfferStockPool:
    if name is not None:
        n = str(name).strip()
        if not n:
            raise OfferStockPoolError("Nazwa puli jest wymagana.")
        dup = (
            db.query(OfferStockPool.id)
            .filter(
                OfferStockPool.tenant_id == int(pool.tenant_id),
                OfferStockPool.name == n,
                OfferStockPool.id != int(pool.id),
            )
            .first()
        )
        if dup:
            raise OfferStockPoolError("Pula o tej nazwie już istnieje.")
        pool.name = n[:256]

    if is_default is True:
        db.query(OfferStockPool).filter(
            OfferStockPool.tenant_id == int(pool.tenant_id),
            OfferStockPool.id != int(pool.id),
        ).update({OfferStockPool.is_default: False})
        pool.is_default = True
    elif is_default is False and pool.is_default:
        raise OfferStockPoolError("Tenant musi mieć dokładnie jedną pulę domyślną.")

    if warehouse_ids is not None:
        allowed = _network_warehouse_id_set(db, int(pool.tenant_id))
        ids = sorted({int(x) for x in warehouse_ids if int(x) in allowed})
        db.query(OfferStockPoolWarehouse).filter(
            OfferStockPoolWarehouse.pool_id == int(pool.id)
        ).delete(synchronize_session=False)
        for wid in ids:
            db.add(OfferStockPoolWarehouse(pool_id=int(pool.id), warehouse_id=wid))

    pool.updated_at = datetime.utcnow()
    db.flush()
    return pool


def get_pool_or_404(db: Session, *, tenant_id: int, pool_id: int) -> OfferStockPool:
    row = (
        db.query(OfferStockPool)
        .filter(OfferStockPool.id == int(pool_id), OfferStockPool.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Stock pool not found")
    return row
