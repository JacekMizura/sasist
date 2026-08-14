"""
SSOT pickable ATP for WMS picking — on-hand minus active reservations.

Own ``order_id`` SALES_ORDER (and any) reservations do not block that order.
Foreign reservations (any kind, status=reserved) reduce ATP seen by others.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Optional

from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.stock_reservation import StockReservation
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from .pg_advisory_lock import stable_advisory_lock_key
from .pick_eligible_inventory_service import (
    is_pick_eligible_location_row,
    load_warehouse_requires_putaway_map,
)
from .reservations.constants import RESERVATION_KIND_SALES_ORDER, RESERVATION_STATUS_RESERVED
from .stock_disposition import DEFAULT_STOCK_DISPOSITION, normalize_stock_disposition

logger = logging.getLogger(__name__)


def advisory_lock_sales_order_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> None:
    key = stable_advisory_lock_key(
        "sales_order_fg_reserve", int(tenant_id), int(warehouse_id), int(product_id)
    )
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": key})
    except Exception:
        # SQLite / non-PG — tests rely on FOR UPDATE instead.
        logger.debug("advisory lock skipped key=%s", key, exc_info=True)


def reserved_qty_at_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
    exclude_order_id: int | None = None,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> float:
    """Sum of active reservations at location; optionally ignore one sales order's holds."""
    sd = normalize_stock_disposition(stock_disposition)
    q = db.query(func.coalesce(func.sum(StockReservation.quantity), 0.0)).filter(
        StockReservation.tenant_id == int(tenant_id),
        StockReservation.product_id == int(product_id),
        StockReservation.location_id == int(location_id),
        StockReservation.status == RESERVATION_STATUS_RESERVED,
        or_(
            StockReservation.warehouse_id == int(warehouse_id),
            StockReservation.warehouse_id.is_(None),
        ),
        or_(
            StockReservation.stock_disposition == sd,
            StockReservation.stock_disposition.is_(None),
        ),
    )
    if exclude_order_id is not None:
        q = q.filter(
            or_(
                StockReservation.order_id.is_(None),
                StockReservation.order_id != int(exclude_order_id),
            )
        )
    return float(q.scalar() or 0.0)


def reserved_qty_at_lot_excluding_sales_order(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    location_id: int,
    batch_number: str,
    expiry_date,
    stock_disposition: str,
    exclude_order_id: int | None = None,
) -> float:
    """Lot-level reserved qty; own sales order reservations excluded when ``exclude_order_id`` set."""
    sd = normalize_stock_disposition(stock_disposition)
    bn = normalize_batch_number(batch_number)
    ed = expiry_date or NO_EXPIRY_SENTINEL
    q = db.query(func.coalesce(func.sum(StockReservation.quantity), 0.0)).filter(
        StockReservation.tenant_id == int(tenant_id),
        StockReservation.product_id == int(product_id),
        StockReservation.location_id == int(location_id),
        StockReservation.batch_number == bn,
        StockReservation.expiry_date == ed,
        StockReservation.stock_disposition == sd,
        StockReservation.status == RESERVATION_STATUS_RESERVED,
    )
    if exclude_order_id is not None:
        q = q.filter(
            or_(
                StockReservation.order_id.is_(None),
                StockReservation.order_id != int(exclude_order_id),
            )
        )
    return float(q.scalar() or 0.0)


def own_sales_order_reserved_by_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_id: int,
) -> dict[int, float]:
    rows = (
        db.query(
            StockReservation.location_id,
            func.coalesce(func.sum(StockReservation.quantity), 0.0),
        )
        .filter(
            StockReservation.tenant_id == int(tenant_id),
            StockReservation.order_id == int(order_id),
            StockReservation.product_id == int(product_id),
            StockReservation.status == RESERVATION_STATUS_RESERVED,
            StockReservation.reservation_kind == RESERVATION_KIND_SALES_ORDER,
            or_(
                StockReservation.warehouse_id == int(warehouse_id),
                StockReservation.warehouse_id.is_(None),
            ),
        )
        .group_by(StockReservation.location_id)
        .all()
    )
    return {int(lid): float(qty or 0) for lid, qty in rows if lid is not None}


def pickable_on_hand_rows(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> list[tuple[int, float, str]]:
    """Physical pickable on-hand per location (no reservation subtract)."""
    sd = normalize_stock_disposition(stock_disposition)
    requires_putaway = load_warehouse_requires_putaway_map(db, {int(warehouse_id)}).get(
        int(warehouse_id), True
    )
    subq = (
        db.query(
            Inventory.location_id.label("loc_id"),
            func.sum(Inventory.quantity).label("qty_sum"),
        )
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.stock_disposition == sd,
            Inventory.quantity > 0,
        )
        .group_by(Inventory.location_id)
        .having(func.sum(Inventory.quantity) > 0)
        .subquery()
    )
    rows = (
        db.query(subq.c.loc_id, subq.c.qty_sum, Location.name, Location.location_type, Location.type)
        .join(Location, Location.id == subq.c.loc_id)
        .filter(Location.is_active.is_(True))
        .all()
    )
    out: list[tuple[int, float, str]] = []
    for loc_id, qty_sum, loc_name, location_type, _loc_type in rows:
        loc = db.query(Location).filter(Location.id == int(loc_id)).first()
        if not is_pick_eligible_location_row(loc, requires_putaway=requires_putaway):
            continue
        out.append((int(loc_id), float(qty_sum or 0), str(loc_name or "")))
    out.sort(key=lambda t: t[0])
    return out


def pickable_available_by_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    exclude_order_id: int | None = None,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> list[tuple[int, float, str]]:
    """
    Pickable ATP per location for ``exclude_order_id`` (own reservations credited).

    ``available = pickable_on_hand − foreign_reserved``.
    """
    physical = pickable_on_hand_rows(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        stock_disposition=stock_disposition,
    )
    out: list[tuple[int, float, str]] = []
    for lid, on_hand, name in physical:
        foreign = reserved_qty_at_location(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=product_id,
            location_id=lid,
            exclude_order_id=exclude_order_id,
            stock_disposition=stock_disposition,
        )
        avail = max(0.0, float(on_hand) - float(foreign))
        if avail > 1e-9:
            out.append((lid, round(avail, 6), name))
    return out


def pickable_available_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    exclude_order_id: int | None = None,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> float:
    rows = pickable_available_by_location(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        exclude_order_id=exclude_order_id,
        stock_disposition=stock_disposition,
    )
    return round(sum(q for _, q, _ in rows), 6)


def build_pickable_cache_for_pairs(
    db: Session,
    *,
    tenant_id: int,
    pairs: set[tuple[int, int]],
    exclude_order_id: int | None = None,
) -> dict[tuple[int, int], list[tuple[int, float, str]]]:
    """Map (warehouse_id, product_id) → [(location_id, atp_qty, name)] for routing."""
    out: dict[tuple[int, int], list[tuple[int, float, str]]] = {}
    for wid, pid in pairs:
        out[(int(wid), int(pid))] = pickable_available_by_location(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(wid),
            product_id=int(pid),
            exclude_order_id=exclude_order_id,
        )
    for pair in pairs:
        out.setdefault((int(pair[0]), int(pair[1])), [])
    return out


def credit_own_sales_order_reservations_into_cache(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_ids: set[int],
    cache: dict[tuple[int, int], list[tuple[int, float, str]]],
) -> None:
    """
    After loading ATP with all reservations subtracted, credit this order's
    SALES_ORDER holds back so it can consume its own reserved stock.
    """
    for pid in product_ids:
        own = own_sales_order_reserved_by_location(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            order_id=order_id,
            product_id=int(pid),
        )
        if not own:
            continue
        key = (int(warehouse_id), int(pid))
        lst = list(cache.get(key) or [])
        by_loc = {lid: (qty, name) for lid, qty, name in lst}
        for lid, add_qty in own.items():
            if add_qty <= 1e-9:
                continue
            prev_qty, name = by_loc.get(int(lid), (0.0, ""))
            if not name:
                loc = db.query(Location).filter(Location.id == int(lid)).first()
                name = str(loc.name) if loc is not None else f"#{lid}"
            by_loc[int(lid)] = (float(prev_qty) + float(add_qty), name)
        cache[key] = [(lid, round(q, 6), n) for lid, (q, n) in sorted(by_loc.items()) if q > 1e-9]
