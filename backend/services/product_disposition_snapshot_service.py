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
from .pick_eligible_inventory_service import (
    is_pick_eligible_location,
    resolve_requires_putaway_for_warehouse,
)
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
        "dock_qty": 0.0,
    }


def _disposition_stock_from_buckets(
    buckets: Dict[str, float],
    *,
    pick_eligible_buckets: Dict[str, float] | None = None,
    dock_saleable: float = 0.0,
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
    out["dock_qty"] = _nz(max(0.0, float(dock_saleable or 0)))
    pe = pick_eligible_buckets if pick_eligible_buckets is not None else buckets
    pick_saleable = _nz(float(pe.get(STOCK_DISPOSITION_SALEABLE, 0.0)))
    if STOCK_DISPOSITION_SALEABLE not in pe and DEFAULT_STOCK_DISPOSITION in pe:
        pick_saleable = _nz(float(pe.get(DEFAULT_STOCK_DISPOSITION, 0.0)))
    out["saleable_available_qty"] = _nz(max(0.0, pick_saleable - float(reserved or 0)))
    return out


def _on_hand_by_disposition_visible(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_ids: Optional[Sequence[int]],
) -> tuple[Dict[int, Dict[str, float]], Dict[int, Dict[str, float]], Dict[int, float]]:
    """
    Returns (all_buckets, pick_eligible_buckets, dock_saleable_by_product) per product_id.
    """
    requires_putaway = resolve_requires_putaway_for_warehouse(db, warehouse_id)

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

    all_acc: Dict[int, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    pick_acc: Dict[int, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    dock_acc: Dict[int, float] = defaultdict(float)

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
        qty = float(r.quantity or 0)
        all_acc[pid][code] += qty

        lt = (r.location_type or "").strip().upper()
        is_dock = lt == "DOCK"
        if is_dock and code == STOCK_DISPOSITION_SALEABLE:
            dock_acc[pid] += qty

        if is_pick_eligible_location(
            requires_putaway=requires_putaway,
            location_type=r.location_type,
            location_name=r.name,
        ):
            pick_acc[pid][code] += qty

    all_out = {pid: {k: _nz(v) for k, v in buckets.items()} for pid, buckets in all_acc.items()}
    pick_out = {pid: {k: _nz(v) for k, v in buckets.items()} for pid, buckets in pick_acc.items()}
    dock_out = {pid: _nz(v) for pid, v in dock_acc.items()}
    return all_out, pick_out, dock_out


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
    pick_eligible_map: Dict[int, Dict[str, float]] = {}
    dock_map: Dict[int, float] = {}
    for off in range(0, len(pids), _CHUNK):
        chunk = pids[off : off + _CHUNK]
        part_all, part_pick, part_dock = _on_hand_by_disposition_visible(db, tenant_id, warehouse_id, chunk)
        disposition_map.update(part_all)
        pick_eligible_map.update(part_pick)
        dock_map.update(part_dock)
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
        pick_buckets = pick_eligible_map.get(int(pid), {})
        reserved = float(reserved_map.get(int(pid), 0.0))
        dock_qty = float(dock_map.get(int(pid), 0.0))
        out[int(pid)] = _disposition_stock_from_buckets(
            buckets,
            pick_eligible_buckets=pick_buckets,
            dock_saleable=dock_qty,
            reserved=reserved,
        )
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
