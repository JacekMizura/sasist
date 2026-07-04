"""Production collection — location options with lot traceability (WMS-standard badges)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.inventory_serial import SERIAL_STATUS_ON_HAND, InventorySerial
from ...models.location import Location
from ...models.product import Product
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL
from ..location_badge import batch_location_storage_types, wms_location_badge_kind
from ..location_stock_service import build_location_stock


def _fmt_date(d: date | None) -> str | None:
    if d is None or d >= date(9999, 1, 1):
        return None
    return d.isoformat()


def _lot_label(batch_number: str | None) -> str | None:
    bn = (batch_number or "").strip()
    return bn or None


def build_collection_location_options(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    preferred_location_ids: set[int] | None = None,
) -> tuple[list[dict[str, Any]], float]:
    """Return (location_options, warehouse_total_available)."""
    pref = preferred_location_ids or set()
    snap = build_location_stock(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        available_only=True,
        pick_eligible_only=True,
    )
    warehouse_total = float((snap.get("summary") or {}).get("available") or 0)

    loc_meta: dict[int, dict[str, Any]] = {}
    loc_ids: list[int] = []
    for row in snap.get("locations") or []:
        lid = int(row.get("location_id") or 0)
        if lid < 1:
            continue
        loc_ids.append(lid)
        loc_meta[lid] = row

    if not loc_ids:
        return [], warehouse_total

    loc_rows = db.query(Location).filter(Location.id.in_(loc_ids)).all()
    loc_by_id = {int(l.id): l for l in loc_rows}
    storage_by_lid = batch_location_storage_types(db, int(warehouse_id), loc_rows)

    inv_rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.stock_disposition == "SALEABLE",
            Inventory.quantity > 1e-9,
            Inventory.location_id.in_(loc_ids),
        )
        .all()
    )

    lots_by_loc: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for inv in inv_rows:
        lid = int(inv.location_id)
        bn = _lot_label(getattr(inv, "batch_number", None))
        ed = getattr(inv, "expiry_date", None)
        lots_by_loc[lid].append(
            {
                "batch_number": bn,
                "lot": bn,
                "expiry_date": _fmt_date(ed if ed and ed < NO_EXPIRY_SENTINEL else None),
                "production_date": None,
                "serial_number": None,
                "available_qty": round(float(inv.quantity or 0), 4),
            }
        )

    serial_rows = (
        db.query(InventorySerial)
        .filter(
            InventorySerial.tenant_id == int(tenant_id),
            InventorySerial.warehouse_id == int(warehouse_id),
            InventorySerial.product_id == int(product_id),
            InventorySerial.status == SERIAL_STATUS_ON_HAND,
            InventorySerial.stock_disposition == "SALEABLE",
            InventorySerial.location_id.in_(loc_ids),
        )
        .order_by(InventorySerial.serial_number.asc())
        .all()
    )
    serials_by_loc: dict[int, list[str]] = defaultdict(list)
    for ser in serial_rows:
        lid = int(ser.location_id or 0)
        sn = (ser.serial_number or "").strip()
        if lid > 0 and sn:
            serials_by_loc[lid].append(sn)

    options: list[dict[str, Any]] = []
    for lid in loc_ids:
        meta = loc_meta.get(lid) or {}
        loc = loc_by_id.get(lid)
        code = str(meta.get("code") or (loc.name if loc else f"#{lid}"))
        zone = (meta.get("operational_zone_type") or getattr(loc, "operational_zone_type", None) or "").strip() or None
        badge_kind = wms_location_badge_kind(loc) if loc else "PICK"
        lots = lots_by_loc.get(lid) or []
        if not lots and float(meta.get("available") or 0) > 0:
            lots = [{"batch_number": None, "lot": None, "expiry_date": None, "production_date": None, "serial_number": None, "available_qty": round(float(meta.get("available") or 0), 4)}]
        serial_list = serials_by_loc.get(lid) or []
        if serial_list and lots:
            lots[0]["serial_number"] = serial_list[0]
            if len(serial_list) > 1:
                lots[0]["serial_number"] = f"{serial_list[0]} (+{len(serial_list) - 1})"
        options.append(
            {
                "location_id": lid,
                "location_code": code,
                "operational_zone_type": zone,
                "storage_type": storage_by_lid.get(lid),
                "badge_kind": badge_kind,
                "available_qty": round(float(meta.get("available") or 0), 4),
                "is_preferred": lid in pref,
                "lots": lots,
            }
        )

    options.sort(
        key=lambda o: (
            0 if o.get("is_preferred") else 1,
            -float(o.get("available_qty") or 0),
            str(o.get("location_code") or ""),
        )
    )
    return options, warehouse_total


def preferred_location_ids_from_plan_rows(rows: list[Any]) -> set[int]:
    out: set[int] = set()
    for row in rows or []:
        for alloc in list(getattr(row, "auto_allocation", None) or []):
            lid = int(getattr(alloc, "location_id", 0) or 0)
            if lid > 0:
                out.add(lid)
        for s in list(getattr(row, "suggested_locations", None) or []):
            if getattr(s, "is_suggested", False):
                lid = int(getattr(s, "location_id", 0) or 0)
                if lid > 0:
                    out.add(lid)
    return out
