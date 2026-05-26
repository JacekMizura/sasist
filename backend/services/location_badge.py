"""Map DB Location rows to WMS UI badge kinds (aligned with frontend LocationBadge)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.warehouse import Bin, Rack, WarehouseLayout

# PICK | BUFFER | BULK | INBOUND | OUTBOUND — frontend LocationBadge / stock API


def normalize_location_uuid(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.strip()
    if not v or v.lower() == "null":
        return None
    return v


def wms_kind_to_storage_type(kind: str) -> str:
    """
    Map WMS badge kind → canonical storage_type strings used by layout bins
    and frontend normalizeStorageType (primary | pick | buffer | reserve | damaged).
    """
    k = (kind or "").strip().upper()
    return {
        "PICK": "primary",
        "BUFFER": "reserve",
        "BULK": "buffer",
        "INBOUND": "pick",
        "OUTBOUND": "damaged",
    }.get(k, "unknown")


def batch_location_storage_types(
    db: Session,
    warehouse_id: int | None,
    locations: list[Location],
) -> dict[int, str]:
    """
    Per location.id: Bin.storage_type when Location.location_uuid matches an active bin
    in this warehouse's layout; else wms_kind_to_storage_type(wms_location_badge_kind(loc)).
    """
    if not locations:
        return {}
    if warehouse_id is None:
        return {int(l.id): wms_kind_to_storage_type(wms_location_badge_kind(l)) for l in locations}

    uuids: set[str] = set()
    loc_uuid_by_lid: dict[int, str] = {}
    for l in locations:
        u = normalize_location_uuid(getattr(l, "location_uuid", None))
        if u:
            uuids.add(u)
            loc_uuid_by_lid[int(l.id)] = u

    uuid_to_st: dict[str, str] = {}
    if uuids:
        qrows = (
            db.query(Bin.location_uuid, Bin.storage_type)
            .join(Rack, Rack.id == Bin.rack_id)
            .join(WarehouseLayout, WarehouseLayout.id == Rack.layout_id)
            .filter(
                WarehouseLayout.warehouse_id == warehouse_id,
                Bin.is_active == True,  # noqa: E712
                Bin.location_uuid.isnot(None),
                Bin.location_uuid.in_(uuids),
            )
            .all()
        )
        for lu, st in qrows:
            if lu is None:
                continue
            key = str(lu).strip()
            if not key or key in uuid_to_st:
                continue
            raw = (st or "primary").strip().lower() if st else "primary"
            uuid_to_st[key] = raw

    out: dict[int, str] = {}
    for l in locations:
        lid = int(l.id)
        u = loc_uuid_by_lid.get(lid)
        if u and u in uuid_to_st:
            out[lid] = uuid_to_st[u]
        else:
            out[lid] = wms_kind_to_storage_type(wms_location_badge_kind(l))
    return out


def wms_location_badge_kind(loc: Location) -> str:
    """
    Derive badge kind from location_type (dock/packing/…) and type (pick/reserve/floor).
    """
    lt = (getattr(loc, "location_type", None) or "NORMAL").strip().upper()
    t = (getattr(loc, "type", None) or "pick").strip().lower()

    if lt == "DOCK":
        return "INBOUND"
    if lt == "PACKING":
        return "OUTBOUND"
    if lt == "PICK_START":
        return "PICK"
    if t == "floor":
        return "BULK"
    if t == "reserve":
        return "BUFFER"
    if t == "pick":
        return "PICK"
    return "PICK"
