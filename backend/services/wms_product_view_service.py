"""Build WMS product view payload from Product + Inventory (per warehouse)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..schemas.wms_product_view import (
    WmsProductDispositionStock,
    WmsProductViewLocation,
    WmsProductViewLogistics,
    WmsProductViewPackage,
    WmsProductViewResponse,
)
from .inventory_damage_trace_service import inventory_damage_trace_out
from .legacy_import_inventory_display_filter import should_hide_legacy_csv_import_inventory_location
from .product_disposition_snapshot_service import get_product_disposition_stock


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

    inv_rows = (
        db.query(Inventory, Location)
        .join(Location, Location.id == Inventory.location_id)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.quantity > 0,
            Location.warehouse_id == int(warehouse_id),
            Location.is_active.is_(True),
        )
        .order_by(Location.pick_sequence.asc(), Location.name.asc(), Inventory.id.asc())
        .all()
    )

    loc_items: list[WmsProductViewLocation] = []
    total = 0.0
    seq_map: dict[int, int | None] = {}
    for inv, loc in inv_rows:
        if should_hide_legacy_csv_import_inventory_location(
            loc_name=str(loc.name or ""),
            loc_type=str(loc.type) if loc.type is not None else None,
            location_type=str(loc.location_type) if loc.location_type is not None else None,
            location_uuid=str(loc.location_uuid) if loc.location_uuid is not None else None,
        ):
            continue
        q = float(inv.quantity or 0)
        total += q
        lid = int(loc.id)
        seq_map[lid] = loc.pick_sequence
        code = (loc.name or "").strip() or f"LOC-{lid}"
        trace = inventory_damage_trace_out(db, inv)
        loc_items.append(
            WmsProductViewLocation(
                location_id=lid,
                code=code,
                quantity=round(q, 4),
                badge=_location_badge(
                    str(loc.type) if loc.type is not None else None,
                    str(loc.location_type) if loc.location_type is not None else None,
                ),
                location_type=str(loc.location_type).strip() if loc.location_type else None,
                stock_disposition=trace.stock_disposition if trace else getattr(inv, "stock_disposition", None),
                disposition_badge=trace.disposition_badge if trace else None,
                damage_class=trace.damage_class if trace else getattr(inv, "damage_class", None),
                damage_trace=trace,
            )
        )

    loc_items.sort(
        key=lambda x: (
            1 if seq_map.get(x.location_id) is None else 0,
            seq_map.get(x.location_id) if seq_map.get(x.location_id) is not None else 10**9,
            x.code.lower(),
            str(x.stock_disposition or ""),
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

    disp_raw = get_product_disposition_stock(
        db,
        product_id=int(product_id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    disposition_stock = WmsProductDispositionStock(**disp_raw)

    return WmsProductViewResponse(
        product_id=int(p.id),
        name=str(p.name or "").strip() or f"Produkt #{p.id}",
        ean=(p.ean or "").strip() or None,
        sku=sku,
        image=(p.image_url or "").strip() or None,
        total_stock=round(total, 4),
        disposition_stock=disposition_stock,
        locations=loc_items,
        logistics=logistics,
        package=package,
    )
