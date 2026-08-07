"""Resolve normal warehouse locations for packaging stock (e.g. PACK-01)."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from ...models.location import Location


def resolve_packaging_default_location_id(
    db: Session,
    *,
    warehouse_id: int,
    preferred_label: Optional[str] = None,
) -> Optional[int]:
    """
    Pick a normal storage location for packaging putaway / issue fallback.

    Prefers an active location whose name matches ``preferred_label`` (e.g. PACK-01),
    else first active location named like PACK%, else first active NORMAL/pick location.
    Does not create special location_type roles.
    """
    wid = int(warehouse_id)
    label = (preferred_label or "").strip()
    if label:
        row = (
            db.query(Location)
            .filter(
                Location.warehouse_id == wid,
                Location.is_active.is_(True),
                Location.name == label,
            )
            .order_by(Location.id.asc())
            .first()
        )
        if row is not None:
            return int(row.id)

    pack_like = (
        db.query(Location)
        .filter(
            Location.warehouse_id == wid,
            Location.is_active.is_(True),
            Location.name.ilike("PACK%"),
        )
        .order_by(Location.name.asc(), Location.id.asc())
        .first()
    )
    if pack_like is not None:
        return int(pack_like.id)

    any_loc = (
        db.query(Location)
        .filter(Location.warehouse_id == wid, Location.is_active.is_(True))
        .order_by(Location.id.asc())
        .first()
    )
    return int(any_loc.id) if any_loc is not None else None
