"""Location priority for auto-suggest — sales vs picking vs replenishment."""

from __future__ import annotations

from ..schemas.commerce_enums import OperationalZoneType

# Lower number = higher priority when sorting locations for issue/suggest.
SALES_ZONE_PRIORITY: dict[str, int] = {
    "SALES": 10,
    "SHOWROOM": 20,
    "SERVICE": 30,
    "PICKUP": 40,
    "PACKING": 50,
    "RETURNS": 90,
}

PICKING_ZONE_PRIORITY: dict[str, int] = {
    "SALES": 30,
    "PICKUP": 40,
    "PACKING": 10,
    "SHOWROOM": 50,
    "SERVICE": 60,
    "RETURNS": 90,
}


def _zone_key(raw: object | None) -> str:
    return (str(raw or "").strip().upper()) or "SALES"


def sales_sort_key(
    *,
    operational_zone_type: object | None,
    sales_priority: object | None,
    location_id: int,
) -> tuple[int, int, int]:
    zone = _zone_key(operational_zone_type)
    zone_pri = SALES_ZONE_PRIORITY.get(zone, 60)
    loc_pri = int(sales_priority) if sales_priority is not None else 100
    return (zone_pri, loc_pri, int(location_id))


def picking_sort_key(
    *,
    operational_zone_type: object | None,
    picking_priority: object | None,
    location_id: int,
) -> tuple[int, int, int]:
    zone = _zone_key(operational_zone_type)
    zone_pri = PICKING_ZONE_PRIORITY.get(zone, 60)
    loc_pri = int(picking_priority) if picking_priority is not None else 100
    return (zone_pri, loc_pri, int(location_id))


def suggest_sales_locations(
    rows: list[dict],
    *,
    quantity: float,
    prefer_store_locations: bool = True,
) -> list[dict]:
    """Sort location rows for direct sales issue (prefer SALES → SHOWROOM when store-first)."""
    need = float(quantity)
    if need <= 0:
        return []
    if prefer_store_locations:
        sort_key = lambda r: sales_sort_key(
            operational_zone_type=r.get("operational_zone_type"),
            sales_priority=r.get("sales_priority"),
            location_id=int(r.get("location_id") or 0),
        )
    else:
        sort_key = lambda r: (
            int(r.get("location_id") or 0),
            str(r.get("code") or r.get("location_code") or ""),
        )
    sorted_rows = sorted(rows, key=sort_key)
    out: list[dict] = []
    rem = need
    for r in sorted_rows:
        avail = float(r.get("available") or 0)
        if avail <= 1e-9:
            continue
        take = min(rem, avail)
        out.append({**r, "suggested_qty": round(take, 6)})
        rem -= take
        if rem <= 1e-9:
            break
    return out
