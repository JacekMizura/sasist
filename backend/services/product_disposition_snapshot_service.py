"""
Read-only aggregation of ``inventory`` quantities by ``stock_disposition``.

Etap 2: ``saleable_available_qty`` = ``saleable_qty`` minus reserved qty where
``stock_reservations.stock_disposition = SALEABLE`` (same visibility as on-hand).
``OrderItem.required_stock_disposition`` selects pool for reservation/pick — not this aggregation shape.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, Optional, Sequence, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.stock_reservation import StockReservation
from .legacy_import_inventory_display_filter import should_hide_legacy_csv_import_inventory_location
from .product_inventory_snapshot_service import _nz
from .stock_disposition import (
    DEFAULT_STOCK_DISPOSITION,
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_QUARANTINE,
    STOCK_DISPOSITION_REJECTED_STOCK,
    STOCK_DISPOSITION_SALEABLE,
    STOCK_DISPOSITION_SCRAP,
    STOCK_DISPOSITION_SERVICE_C,
    normalize_stock_disposition,
)

# Pools exposed in API/UI (Etap 2 order lines will reference these codes).
CANONICAL_PRODUCT_STOCK_DISPOSITIONS: Tuple[str, ...] = (
    STOCK_DISPOSITION_SALEABLE,
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_SERVICE_C,
    STOCK_DISPOSITION_QUARANTINE,
    STOCK_DISPOSITION_SCRAP,
    STOCK_DISPOSITION_REJECTED_STOCK,
)

_DISPOSITION_TO_QTY_KEY: Dict[str, str] = {
    STOCK_DISPOSITION_SALEABLE: "saleable_qty",
    STOCK_DISPOSITION_OUTLET_B: "outlet_qty",
    STOCK_DISPOSITION_SERVICE_C: "service_qty",
    STOCK_DISPOSITION_QUARANTINE: "quarantine_qty",
    STOCK_DISPOSITION_SCRAP: "scrap_qty",
    STOCK_DISPOSITION_REJECTED_STOCK: "rejected_qty",
}


def empty_disposition_stock_dict() -> Dict[str, float]:
    return {
        "saleable_qty": 0.0,
        "outlet_qty": 0.0,
        "service_qty": 0.0,
        "quarantine_qty": 0.0,
        "scrap_qty": 0.0,
        "rejected_qty": 0.0,
        "other_qty": 0.0,
        "physical_qty": 0.0,
        "saleable_available_qty": 0.0,
    }


def _disposition_stock_from_buckets(
    buckets: Dict[str, float],
    *,
    reserved: float = 0.0,
) -> Dict[str, float]:
    out = empty_disposition_stock_dict()
    physical = 0.0
    for code, qty in buckets.items():
        q = _nz(float(qty or 0))
        if q <= 0:
            continue
        physical += q
        key = _DISPOSITION_TO_QTY_KEY.get(code)
        if key:
            out[key] = _nz(out[key] + q)
        elif code == DEFAULT_STOCK_DISPOSITION:
            out["saleable_qty"] = _nz(out["saleable_qty"] + q)
        else:
            out["other_qty"] = _nz(out["other_qty"] + q)
    out["physical_qty"] = _nz(physical)
    saleable = float(out["saleable_qty"])
    out["saleable_available_qty"] = _nz(max(0.0, saleable - float(reserved or 0)))
    return out


def _on_hand_by_disposition_visible(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_ids: Optional[Sequence[int]],
) -> Dict[int, Dict[str, float]]:
    """``product_id`` -> normalized disposition code -> quantity (visible locations only)."""
    q = (
        db.query(
            Inventory.product_id,
            Inventory.quantity,
            Inventory.stock_disposition,
            Location.name,
            Location.type,
            Location.location_type,
            Location.location_uuid,
        )
        .join(Location, Location.id == Inventory.location_id)
        .filter(Inventory.tenant_id == int(tenant_id))
    )
    if warehouse_id is not None:
        q = q.filter(Inventory.warehouse_id == int(warehouse_id))
    if product_ids is not None and len(product_ids) > 0:
        q = q.filter(Inventory.product_id.in_(tuple(int(x) for x in product_ids)))

    acc: Dict[int, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for r in q.all():
        if should_hide_legacy_csv_import_inventory_location(
            loc_name=r.name or "",
            loc_type=r.type,
            location_type=r.location_type,
            location_uuid=r.location_uuid,
        ):
            continue
        pid = int(r.product_id)
        code = normalize_stock_disposition(getattr(r, "stock_disposition", None))
        acc[pid][code] += float(r.quantity or 0)
    return {pid: {k: _nz(v) for k, v in buckets.items()} for pid, buckets in acc.items()}


def _reserved_by_product_and_disposition(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_ids: Sequence[int],
    stock_disposition: str,
) -> Dict[int, float]:
    """Sum active reservations for ``product_id`` filtered by ``stock_disposition``."""
    sd = normalize_stock_disposition(stock_disposition)
    q = (
        db.query(
            StockReservation.product_id,
            func.coalesce(func.sum(StockReservation.quantity), 0.0),
        )
        .join(Location, Location.id == StockReservation.location_id)
        .filter(
            StockReservation.tenant_id == int(tenant_id),
            StockReservation.status == "reserved",
            StockReservation.stock_disposition == sd,
        )
    )
    if warehouse_id is not None:
        q = q.filter(Location.warehouse_id == int(warehouse_id))
    if product_ids:
        q = q.filter(StockReservation.product_id.in_(tuple(int(x) for x in product_ids)))
    rows = q.group_by(StockReservation.product_id).all()
    return {int(pid): _nz(float(qty or 0)) for pid, qty in rows}


def disposition_snapshots_for_products(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_ids: Sequence[int],
) -> Dict[int, Dict[str, float]]:
    """
    Per ``product_id`` disposition breakdown (same visibility rules as ``stock_quantity``).

    Keys match ``ProductDispositionStockOut``.
    """
    pids = tuple(int(x) for x in product_ids)
    if not pids:
        return {}

    _CHUNK = 400
    reserved_map: Dict[int, float] = {}
    disposition_map: Dict[int, Dict[str, float]] = {}
    for off in range(0, len(pids), _CHUNK):
        chunk = pids[off : off + _CHUNK]
        part_disp = _on_hand_by_disposition_visible(db, tenant_id, warehouse_id, chunk)
        disposition_map.update(part_disp)
        part_res = _reserved_by_product_and_disposition(
            db,
            tenant_id,
            warehouse_id,
            chunk,
            STOCK_DISPOSITION_SALEABLE,
        )
        reserved_map.update(part_res)

    out: Dict[int, Dict[str, float]] = {}
    for pid in pids:
        buckets = disposition_map.get(int(pid), {})
        reserved = float(reserved_map.get(int(pid), 0.0))
        out[int(pid)] = _disposition_stock_from_buckets(buckets, reserved=reserved)
    return out


def get_product_disposition_stock(
    db: Session,
    *,
    product_id: int,
    tenant_id: int,
    warehouse_id: Optional[int] = None,
) -> Dict[str, float]:
    m = disposition_snapshots_for_products(db, tenant_id, warehouse_id, [int(product_id)])
    return m.get(int(product_id), empty_disposition_stock_dict())


def disposition_stock_to_api_dict(stock: Dict[str, Any]) -> Dict[str, float]:
    """Round floats for JSON — keeps parity with legacy int ``stock_quantity`` on physical_qty."""
    base = empty_disposition_stock_dict()
    for k in base:
        if k in stock:
            base[k] = _nz(float(stock[k] or 0))
    return base
