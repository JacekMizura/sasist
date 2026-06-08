"""Warehouse capacity heatmap aggregation — backend-only foundation."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from ...models.location import Location
from .occupancy_service import capacity_state_from_utilization


def build_warehouse_heatmap(
    db: Session,
    *,
    warehouse_id: int,
    tenant_id: int | None = None,
) -> dict[str, Any]:
    _ = tenant_id
    locs = (
        db.query(Location)
        .filter(Location.warehouse_id == int(warehouse_id), Location.is_active.is_(True))
        .order_by(Location.name.asc())
        .all()
    )

    zones: dict[str, list[dict[str, Any]]] = defaultdict(list)
    state_counts: dict[str, int] = defaultdict(int)
    location_rows: list[dict[str, Any]] = []

    for loc in locs:
        util = float(getattr(loc, "capacity_utilization_percent", 0) or 0)
        state = capacity_state_from_utilization(util)
        state_counts[state] += 1
        zone = str(getattr(loc, "operational_zone_type", None) or getattr(loc, "rack_name", None) or "DEFAULT")
        row = {
            "location_id": int(loc.id),
            "location_code": str(loc.name or ""),
            "zone": zone,
            "utilization_percent": round(util, 2),
            "capacity_state": state,
            "occupied_volume_dm3": round(float(getattr(loc, "occupied_volume_dm3", 0) or 0), 4),
            "occupied_weight_kg": round(float(getattr(loc, "occupied_weight_kg", 0) or 0), 4),
        }
        location_rows.append(row)
        zones[zone].append(row)

    zone_summaries = []
    for zone_name, rows in sorted(zones.items()):
        if not rows:
            continue
        avg_util = sum(r["utilization_percent"] for r in rows) / len(rows)
        zone_summaries.append(
            {
                "zone": zone_name,
                "location_count": len(rows),
                "avg_utilization_percent": round(avg_util, 2),
                "capacity_state": capacity_state_from_utilization(avg_util),
            }
        )

    return {
        "warehouse_id": int(warehouse_id),
        "zones": zone_summaries,
        "locations": location_rows,
        "state_counts": dict(state_counts),
    }
