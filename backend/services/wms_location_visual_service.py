"""Build visual context for warehouse location preview (carriers module)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.warehouse import Bin, Rack, Warehouse, WarehouseLayout
from ..models.warehouse_carrier import WarehouseCarrier, WarehouseCarrierLog
from ..schemas.wms_location_visual import (
    LocationVisualBinOut,
    LocationVisualCarrierOut,
    LocationVisualContextOut,
    LocationVisualOccupancyOut,
    LocationVisualProductOut,
    LocationVisualRackGridCellOut,
    LocationVisualRackOut,
    LocationVisualWarehouseOut,
    LocationVisualZoneOut,
)
from .location_badge import batch_location_storage_types, wms_location_badge_kind
from .location_label_parse import parse_location
from .wms_carrier_service import _carrier_items_from_inventory, _carrier_stats


class LocationVisualContextError(LookupError):
    pass


def _segment_label(index: int) -> str:
    n = max(0, int(index))
    if n < 26:
        return chr(ord("A") + n)
    return str(n + 1)


def _zone_code_from_rack_name(name: str) -> str:
    s = (name or "").strip()
    if not s:
        return ""
    return s.split("-")[0].strip() or s


def _resolve_carrier(
    db: Session,
    *,
    tenant_id: int,
    location_id: int,
    carrier_id: int | None,
) -> WarehouseCarrier | None:
    if carrier_id is not None:
        row = (
            db.query(WarehouseCarrier)
            .filter(
                WarehouseCarrier.id == int(carrier_id),
                WarehouseCarrier.tenant_id == int(tenant_id),
                WarehouseCarrier.deleted_at.is_(None),
            )
            .first()
        )
        return row
    return (
        db.query(WarehouseCarrier)
        .filter(
            WarehouseCarrier.tenant_id == int(tenant_id),
            WarehouseCarrier.current_location_id == int(location_id),
            WarehouseCarrier.deleted_at.is_(None),
        )
        .order_by(WarehouseCarrier.updated_at.desc())
        .first()
    )


def _products_at_location(db: Session, *, tenant_id: int, location_id: int) -> list[LocationVisualProductOut]:
    rows = (
        db.query(Inventory, Product)
        .join(Product, Product.id == Inventory.product_id)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.location_id == int(location_id),
            Inventory.quantity > 0,
        )
        .all()
    )
    grouped: dict[int, dict[str, Any]] = {}
    for inv, prod in rows:
        pid = int(prod.id)
        qty = float(inv.quantity or 0)
        if pid not in grouped:
            grouped[pid] = {
                "product_id": pid,
                "sku": (prod.sku or "").strip() or None,
                "name": (prod.name or "").strip() or None,
                "image_url": (getattr(prod, "image_url", None) or "").strip() or None,
                "quantity": qty,
            }
        else:
            grouped[pid]["quantity"] += qty
    return [
        LocationVisualProductOut(**v)
        for v in sorted(grouped.values(), key=lambda x: (-float(x["quantity"]), int(x["product_id"])))
    ]


def build_location_visual_context(
    db: Session,
    *,
    tenant_id: int,
    location_id: int,
    carrier_id: int | None = None,
) -> LocationVisualContextOut:
    loc = db.query(Location).filter(Location.id == int(location_id)).first()
    if loc is None:
        raise LocationVisualContextError("Location not found")

    wh = db.query(Warehouse).filter(Warehouse.id == int(loc.warehouse_id)).first()
    if wh is None:
        raise LocationVisualContextError("Warehouse not found")

    code = (loc.name or "").strip()
    parsed = parse_location(code) or {}
    zone = LocationVisualZoneOut(
        code=_zone_code_from_rack_name(parsed.get("rack_name") or loc.rack_name or code),
        aisle=str(parsed.get("floor") or ""),
        level=str(parsed.get("row") or ""),
        position=str(parsed.get("row") or ""),
    )

    bin_row: Bin | None = None
    rack_row: Rack | None = None
    loc_uuid = (getattr(loc, "location_uuid", None) or "").strip()
    if loc_uuid:
        bin_row = (
            db.query(Bin)
            .filter(Bin.location_uuid == loc_uuid, Bin.is_active.is_(True))
            .first()
        )
        if bin_row is not None:
            rack_row = db.query(Rack).filter(Rack.id == int(bin_row.rack_id)).first()
            zone = LocationVisualZoneOut(
                code=_zone_code_from_rack_name((rack_row.name if rack_row else None) or zone.code),
                aisle=(rack_row.aisle_letter if rack_row else parsed.get("floor") or zone.aisle) or "",
                level=str(int(bin_row.level_index) + 1),
                position=str(int(bin_row.segment_index) + 1),
            )

    rack_out: LocationVisualRackOut | None = None
    rack_grid: list[LocationVisualRackGridCellOut] = []
    rack_bins: list[LocationVisualBinOut] = []

    if rack_row is not None:
        rack_out = LocationVisualRackOut(
            id=int(rack_row.id),
            name=(rack_row.name or "").strip() or f"R{rack_row.rack_index}",
            aisle_letter=(rack_row.aisle_letter or "").strip(),
            rack_index=int(rack_row.rack_index or 0),
            levels=int(rack_row.levels or 0),
            bins_per_level=int(rack_row.bins_per_level or 0),
            color=(rack_row.color or "").strip() or None,
        )
        layout = db.query(WarehouseLayout).filter(WarehouseLayout.id == int(rack_row.layout_id)).first()
        if layout is not None:
            racks = (
                db.query(Rack)
                .filter(Rack.layout_id == int(layout.id), Rack.is_active.is_(True))
                .order_by(Rack.y.asc(), Rack.x.asc(), Rack.id.asc())
                .all()
            )
            for r in racks:
                rid = int(r.id)
                rack_grid.append(
                    LocationVisualRackGridCellOut(
                        id=rid,
                        name=(r.name or "").strip() or f"R{r.rack_index}",
                        x=float(r.x or 0) / max(1, int(layout.grid_cols or 24)),
                        y=float(r.y or 0) / max(1, int(layout.grid_rows or 16)),
                        width=max(0.05, float(r.width or 1) / max(1, int(layout.grid_cols or 24))),
                        height=max(0.05, float(r.height or 1) / max(1, int(layout.grid_rows or 16))),
                        color=(r.color or "").strip() or None,
                        zone_code=_zone_code_from_rack_name(r.name or ""),
                        is_active=rid == int(rack_row.id),
                    )
                )

        bins = (
            db.query(Bin)
            .filter(Bin.rack_id == int(rack_row.id), Bin.is_active.is_(True))
            .order_by(Bin.level_index.desc(), Bin.segment_index.asc())
            .all()
        )
        uuids = [((b.location_uuid or "").strip()) for b in bins if (b.location_uuid or "").strip()]
        loc_by_uuid: dict[str, Location] = {}
        if uuids:
            for lrow in db.query(Location).filter(Location.location_uuid.in_(uuids)).all():
                u = (lrow.location_uuid or "").strip()
                if u:
                    loc_by_uuid[u] = lrow
        for b in bins:
            buuid = (b.location_uuid or "").strip()
            lmatch = loc_by_uuid.get(buuid)
            lcode = (lmatch.name if lmatch else (b.label or "")).strip()
            lid = int(lmatch.id) if lmatch else None
            rack_bins.append(
                LocationVisualBinOut(
                    code=lcode,
                    location_id=lid,
                    level_index=int(b.level_index),
                    level_number=int(b.level_index) + 1,
                    segment_index=int(b.segment_index),
                    segment_label=_segment_label(int(b.segment_index)),
                    is_active=lid == int(loc.id) if lid else buuid == loc_uuid,
                )
            )

    carrier = _resolve_carrier(db, tenant_id=tenant_id, location_id=int(loc.id), carrier_id=carrier_id)
    carrier_out: LocationVisualCarrierOut | None = None
    products: list[LocationVisualProductOut] = []
    last_movement_at: datetime | None = getattr(loc, "updated_at", None)

    if carrier is not None:
        sku_count, total_qty = _carrier_stats(db, int(tenant_id), int(carrier.id))
        carrier_out = LocationVisualCarrierOut(
            id=int(carrier.id),
            code=(carrier.code or "").strip(),
            barcode=(carrier.barcode or "").strip(),
            name=(carrier.name or "").strip() or None,
            status=(carrier.status or "ACTIVE").strip(),
            sku_count=int(sku_count),
            total_qty=float(total_qty),
        )
        items = _carrier_items_from_inventory(db, int(tenant_id), int(carrier.id))
        products = [
            LocationVisualProductOut(
                product_id=int(it.product_id),
                sku=it.product_sku,
                name=it.product_name,
                image_url=it.product_image_url,
                quantity=float(it.quantity or 0),
            )
            for it in items
        ]
        log_row = (
            db.query(WarehouseCarrierLog)
            .filter(
                WarehouseCarrierLog.tenant_id == int(tenant_id),
                WarehouseCarrierLog.carrier_id == int(carrier.id),
            )
            .order_by(WarehouseCarrierLog.created_at.desc())
            .first()
        )
        if log_row and log_row.created_at:
            last_movement_at = log_row.created_at
    else:
        products = _products_at_location(db, tenant_id=tenant_id, location_id=int(loc.id))

    sku_count = len(products)
    total_qty = sum(float(p.quantity or 0) for p in products)
    storage_map = batch_location_storage_types(db, warehouse_id=int(loc.warehouse_id), locations=[loc])
    storage_type = storage_map.get(int(loc.id))
    occupancy = LocationVisualOccupancyOut(
        sku_count=sku_count,
        total_qty=round(total_qty, 2),
        occupied_volume_dm3=float(getattr(loc, "occupied_volume_dm3", 0) or 0),
        capacity_utilization_percent=float(getattr(loc, "capacity_utilization_percent", 0) or 0),
        storage_type=storage_type,
        location_type=wms_location_badge_kind(loc),
    )

    return LocationVisualContextOut(
        warehouse=LocationVisualWarehouseOut(id=int(wh.id), name=(wh.name or "").strip() or f"Magazyn #{wh.id}"),
        location={
            "id": int(loc.id),
            "code": code,
            "name": code,
            "location_uuid": loc_uuid or None,
            "rack_name": (loc.rack_name or "").strip() or None,
        },
        zone=zone,
        rack=rack_out,
        rack_grid=rack_grid,
        rack_bins=rack_bins,
        carrier=carrier_out,
        products=products,
        occupancy=occupancy,
        last_movement_at=last_movement_at,
    )
