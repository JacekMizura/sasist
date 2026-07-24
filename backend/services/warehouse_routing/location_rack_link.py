"""
Location → Rack SSOT.

Stable chain (never ``rack_name``):
  Location.location_uuid → Bin.location_uuid → Bin.rack_id → Rack

``Location.rack_name`` remains a display cache only; rename must not break access.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.warehouse import Bin, Rack


def normalize_location_uuid(value: object) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


@dataclass(frozen=True)
class LocationRackLink:
    location_id: int
    location_uuid: str
    rack_id: int
    rack_uuid: Optional[str]
    bin_id: int


def resolve_rack_for_location(
    db: Session,
    location: Location,
    *,
    require_active_bin: bool = True,
) -> Optional[Rack]:
    """Return the layout Rack owning this Location via Bin.location_uuid."""
    link = resolve_location_rack_link(db, location, require_active_bin=require_active_bin)
    if link is None:
        return None
    return db.query(Rack).filter(Rack.id == link.rack_id).first()


def resolve_location_rack_link(
    db: Session,
    location: Location,
    *,
    require_active_bin: bool = True,
) -> Optional[LocationRackLink]:
    loc_uuid = normalize_location_uuid(getattr(location, "location_uuid", None))
    if not loc_uuid:
        return None
    q = (
        db.query(Bin.id, Bin.rack_id, Rack.uuid)
        .join(Rack, Rack.id == Bin.rack_id)
        .filter(Bin.location_uuid == loc_uuid)
    )
    if require_active_bin:
        q = q.filter(Bin.is_active.is_(True), Rack.is_active.is_(True))
    row = q.order_by(Bin.id.asc()).first()
    if row is None:
        return None
    bin_id, rack_id, rack_uuid = int(row[0]), int(row[1]), row[2]
    return LocationRackLink(
        location_id=int(location.id),
        location_uuid=loc_uuid,
        rack_id=rack_id,
        rack_uuid=normalize_location_uuid(rack_uuid),
        bin_id=bin_id,
    )


def resolve_racks_for_locations(
    db: Session,
    locations: list[Location],
    *,
    require_active_bin: bool = True,
) -> dict[int, LocationRackLink]:
    """Batch resolve location.id → LocationRackLink."""
    uuid_to_loc: dict[str, Location] = {}
    for loc in locations:
        u = normalize_location_uuid(getattr(loc, "location_uuid", None))
        if u:
            uuid_to_loc[u] = loc
    if not uuid_to_loc:
        return {}
    q = (
        db.query(Bin.location_uuid, Bin.id, Bin.rack_id, Rack.uuid)
        .join(Rack, Rack.id == Bin.rack_id)
        .filter(Bin.location_uuid.in_(list(uuid_to_loc.keys())))
    )
    if require_active_bin:
        q = q.filter(Bin.is_active.is_(True), Rack.is_active.is_(True))
    q = q.order_by(Bin.id.asc())
    out: dict[int, LocationRackLink] = {}
    for loc_uuid, bin_id, rack_id, rack_uuid in q.all():
        nu = normalize_location_uuid(loc_uuid)
        if not nu or nu not in uuid_to_loc:
            continue
        loc = uuid_to_loc[nu]
        lid = int(loc.id)
        if lid in out:
            continue
        out[lid] = LocationRackLink(
            location_id=lid,
            location_uuid=nu,
            rack_id=int(rack_id),
            rack_uuid=normalize_location_uuid(rack_uuid),
            bin_id=int(bin_id),
        )
    return out
