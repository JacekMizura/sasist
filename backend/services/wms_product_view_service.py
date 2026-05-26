"""Build WMS product view payload from Product + Inventory (per warehouse)."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..schemas.wms_product_view import (
    WmsProductViewLocation,
    WmsProductViewLogistics,
    WmsProductViewPackage,
    WmsProductViewResponse,
)
from .legacy_import_inventory_display_filter import should_hide_legacy_csv_import_inventory_location


def _location_badge(loc_type: str | None, location_type: str | None) -> str:
    lt = (location_type or "").strip().upper()
    if lt == "PICK_START":
        return "START"
    if lt == "Pakowanie":
        return "PACK"
    if lt == "DOCK":
        return "Przyjęcie"
    t = (loc_type or "pick").strip().lower()
    if t == "pick":
        return "Podstawowa"
    if t == "reserve":
        return "Zapasowa"
    if t == "floor":
        return "FLOOR"
    return "STORAGE"


def _unit_volume_dm3(p: Product) -> float | None:
    if p.volume is not None and float(p.volume or 0) > 0:
        return round(float(p.volume), 4)
    l_, w_, h_ = float(p.length or 0), float(p.width or 0), float(p.height or 0)
    if l_ > 0 and w_ > 0 and h_ > 0:
        return round((l_ * w_ * h_) / 1000.0, 4)
    return None


def _carton_volume_dm3(p: Product) -> float | None:
    if p.carton_volume_dm3 is not None and float(p.carton_volume_dm3 or 0) > 0:
        return round(float(p.carton_volume_dm3), 4)
    l_ = float(p.carton_length_cm or 0)
    w_ = float(p.carton_width_cm or 0)
    h_ = float(p.carton_height_cm or 0)
    if l_ > 0 and w_ > 0 and h_ > 0:
        return round((l_ * w_ * h_) / 1000.0, 4)
    return None


def build_wms_product_view(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> WmsProductViewResponse | None:
    p = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id))
        .first()
    )
    if not p:
        return None

    qty_sum = func.coalesce(func.sum(Inventory.quantity), 0.0).label("qty")

    rows = (
        db.query(
            Location.id,
            Location.name,
            Location.type,
            Location.location_type,
            Location.pick_sequence,
            Location.location_uuid,
            qty_sum,
        )
        .join(Inventory, Inventory.location_id == Location.id)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Location.warehouse_id == int(warehouse_id),
            Location.is_active.is_(True),
        )
        .group_by(
            Location.id,
            Location.name,
            Location.type,
            Location.location_type,
            Location.pick_sequence,
            Location.location_uuid,
        )
        .all()
    )

    seq_map = {int(r[0]): r[4] for r in rows}
    loc_items: list[WmsProductViewLocation] = []
    total = 0.0
    for lid, name, loc_type, loc_loc_type, _pick_seq, loc_uuid, qty in rows:
        if should_hide_legacy_csv_import_inventory_location(
            loc_name=str(name or ""),
            loc_type=str(loc_type) if loc_type is not None else None,
            location_type=str(loc_loc_type) if loc_loc_type is not None else None,
            location_uuid=str(loc_uuid) if loc_uuid is not None else None,
        ):
            continue
        q = float(qty or 0)
        total += q
        code = (name or "").strip() or f"LOC-{lid}"
        loc_items.append(
            WmsProductViewLocation(
                location_id=int(lid),
                code=code,
                quantity=round(q, 4),
                badge=_location_badge(
                    str(loc_type) if loc_type is not None else None,
                    str(loc_loc_type) if loc_loc_type is not None else None,
                ),
                location_type=str(loc_loc_type).strip() if loc_loc_type else None,
            )
        )

    loc_items.sort(
        key=lambda x: (
            1 if seq_map.get(x.location_id) is None else 0,
            seq_map.get(x.location_id) if seq_map.get(x.location_id) is not None else 10**9,
            x.code.lower(),
        )
    )

    sku = (p.sku or p.symbol or "").strip() or None
    vol = _unit_volume_dm3(p)

    logistics = WmsProductViewLogistics(
        weight_kg=round(float(p.weight), 4) if p.weight is not None else None,
        volume_dm3=vol,
        length_cm=round(float(p.length), 2) if p.length is not None else None,
        width_cm=round(float(p.width), 2) if p.width is not None else None,
        height_cm=round(float(p.height), 2) if p.height is not None else None,
        unit=(p.unit or "").strip() or None,
    )

    upc = p.units_per_carton
    package = WmsProductViewPackage(
        carton_ean=(p.bulk_ean or "").strip() or None,
        units_per_carton=float(upc) if upc is not None else None,
        carton_weight_kg=round(float(p.carton_weight_kg), 4) if p.carton_weight_kg is not None else None,
        carton_volume_dm3=_carton_volume_dm3(p),
        carton_length_cm=round(float(p.carton_length_cm), 2) if p.carton_length_cm is not None else None,
        carton_width_cm=round(float(p.carton_width_cm), 2) if p.carton_width_cm is not None else None,
        carton_height_cm=round(float(p.carton_height_cm), 2) if p.carton_height_cm is not None else None,
    )

    return WmsProductViewResponse(
        product_id=int(p.id),
        name=str(p.name or "").strip() or f"Produkt #{p.id}",
        ean=(p.ean or "").strip() or None,
        sku=sku,
        image=(p.image_url or "").strip() or None,
        total_stock=round(total, 4),
        locations=loc_items,
        logistics=logistics,
        package=package,
    )
