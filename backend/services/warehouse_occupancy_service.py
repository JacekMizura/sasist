"""
Metryki zajętości magazynu: wolumen tylko z inventory w slotach aktywnego layoutu + aktywne produkty.

Liczniki „lokalizacji” = sloty (distinct ``Bin.location_uuid``) wg ``storage_type`` w layoutcie —
nie wiersze tabeli ``locations`` (uniknięcie 3 zamiast 16).
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.warehouse import WarehouseLayout, Rack, Bin
from .warehouse_service import WarehouseService
from ..storage_types import normalize_storage_type


def _product_volume_dm3(p: Product) -> float:
    if p.volume is not None and float(p.volume) > 0:
        return round(float(p.volume), 2)
    l_, w_, h_ = p.length or 0, p.width or 0, p.height or 0
    if l_ and w_ and h_:
        return round((float(l_) * float(w_) * float(h_)) / 1000.0, 2)
    return 0.0


def _bucket_from_normalized_storage(n: str) -> str:
    if n == "reserve":
        return "reserve"
    if n == "damaged":
        return "damaged"
    return "primary"


def _layout_bin_maps(db: Session, layout_id: int) -> tuple[dict[str, str], dict[str, float], float]:
    """
    Zwraca:
    - uuid (trim) -> bucket primary|reserve|damaged
    - uuid -> pojemność slotu (dm³), ostatni wygrywa przy duplikatach UUID
    - suma pojemności unikalnych UUID w layoucie
    """
    uuid_bucket: dict[str, str] = {}
    uuid_vol: dict[str, float] = {}
    rows = (
        db.query(Bin.location_uuid, Bin.storage_type, Bin.volume_dm3)
        .join(Rack, Rack.id == Bin.rack_id)
        .filter(
            Rack.layout_id == layout_id,
            Bin.is_active.is_(True),
            Bin.location_uuid.isnot(None),
        )
        .all()
    )
    for loc_uuid, storage_type, vol_dm3 in rows:
        u = (loc_uuid or "").strip()
        if not u:
            continue
        n = normalize_storage_type(storage_type)
        uuid_bucket[u] = _bucket_from_normalized_storage(n)
        try:
            v = float(vol_dm3 or 0)
        except (TypeError, ValueError):
            v = 0.0
        uuid_vol[u] = max(0.0, v)
    cap = sum(uuid_vol.values())
    return uuid_bucket, uuid_vol, cap


def _slot_counts_from_buckets(uuid_bucket: dict[str, str]) -> tuple[int, int, int]:
    p = r = d = 0
    for b in uuid_bucket.values():
        if b == "reserve":
            r += 1
        elif b == "damaged":
            d += 1
        else:
            p += 1
    return p, r, d


def get_occupancy_metrics(db: Session, tenant_id: int, warehouse_id: int) -> dict:
    """
    Wolumen: Σ qty × objętość jednostkowa produktu tylko dla wierszy inventory,
    których ``Location.location_uuid`` jest na liście slotów layoutu.

    Liczniki ``*_location_count``: faktyczna liczba **slotów** (UUID binów) w layoucie wg typu.
    """
    ws = WarehouseService(db)
    if not ws.can_tenant_access_warehouse(tenant_id, warehouse_id):
        raise HTTPException(status_code=404, detail="Magazyn nie istnieje")

    layout = db.query(WarehouseLayout).filter(WarehouseLayout.warehouse_id == warehouse_id).first()
    uuid_bucket: dict[str, str] = {}
    uuid_capacity: dict[str, float] = {}
    layout_capacity_vol = 0.0
    if layout:
        uuid_bucket, uuid_capacity, layout_capacity_vol = _layout_bin_maps(db, layout.id)

    allowed_uuids = frozenset(uuid_bucket.keys()) if uuid_bucket else frozenset()
    primary_slots, reserve_slots, damaged_slots = _slot_counts_from_buckets(uuid_bucket)

    q = (
        db.query(Inventory, Location, Product)
        .join(Location, Location.id == Inventory.location_id)
        .join(Product, Product.id == Inventory.product_id)
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.warehouse_id == warehouse_id,
            Inventory.quantity > 0,
            Product.deleted_at.is_(None),
            Location.is_active.is_(True),
        )
    )

    primary_vol = reserve_vol = damaged_vol = 0.0
    primary_used_slots: set[str] = set()
    reserve_used_slots: set[str] = set()
    damaged_used_slots: set[str] = set()

    for inv, loc, prod in q.all():
        qty = float(inv.quantity or 0)
        if qty <= 0:
            continue
        vol = _product_volume_dm3(prod) * qty
        if vol <= 0:
            continue

        u = (loc.location_uuid or "").strip()
        if allowed_uuids:
            if u not in allowed_uuids:
                continue
            bucket = uuid_bucket[u]
        else:
            lt = (loc.type or "").strip().lower()
            bucket = "reserve" if lt == "reserve" else ("damaged" if lt == "damaged" else "primary")

        if bucket == "reserve":
            reserve_vol += vol
            if u:
                reserve_used_slots.add(u)
        elif bucket == "damaged":
            damaged_vol += vol
            if u:
                damaged_used_slots.add(u)
        else:
            primary_vol += vol
            if u:
                primary_used_slots.add(u)

    total = primary_vol + reserve_vol + damaged_vol
    return {
        "total_volume_dm3": round(total, 2),
        "primary_volume_dm3": round(primary_vol, 2),
        "reserve_volume_dm3": round(reserve_vol, 2),
        "damaged_volume_dm3": round(damaged_vol, 2),
        "layout_capacity_volume_dm3": round(layout_capacity_vol, 2),
        "primary_location_count": int(primary_slots),
        "reserve_location_count": int(reserve_slots),
        "damaged_location_count": int(damaged_slots),
        "primary_slots_with_stock": len(primary_used_slots),
        "reserve_slots_with_stock": len(reserve_used_slots),
        "damaged_slots_with_stock": len(damaged_used_slots),
    }
