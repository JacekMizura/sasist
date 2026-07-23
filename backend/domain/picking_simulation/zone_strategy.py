"""
Zone picking strategy — warehouse divided into zones, pickers per zone, consolidation.

- Each picker works in one zone
- Orders split into zone tasks
- Items consolidated later
- Lower walking distance per picker, higher coordination complexity
"""

from typing import Any

from sqlalchemy.orm import Session

from ...models.location import Location

from .metrics import StrategySimulationResult
from ._pick_helpers import (
    get_order_pick_locations,
    compute_route_for_pick_nodes,
    WALKING_SPEED_M_S,
)

# Time constants (seconds)
PICK_TIME_PER_ITEM_ZONE = 4.0
PACK_TIME_PER_ORDER_ZONE = 30.0   # consolidation
CONSOLIDATION_TIME_PER_ORDER = 15.0  # extra time at consolidation
NUM_ZONES_DEFAULT = 3  # divide locations by pick_sequence into this many zones


def _assign_locations_to_zones(
    db: Session,
    warehouse_id: int,
    location_ids: list[int],
) -> dict[int, int]:
    """
    Assign location_id -> zone_index (0..NUM_ZONES-1) by pick_sequence terciles.
    Locations without pick_sequence go to zone 0.
    """
    if not location_ids:
        return {}
    rows = (
        db.query(Location.id, Location.pick_sequence)
        .filter(Location.id.in_(location_ids), Location.warehouse_id == warehouse_id)
        .all()
    )
    seqs = [(r.id, r.pick_sequence if r.pick_sequence is not None else -1) for r in rows]
    seqs.sort(key=lambda x: x[1])
    n = len(seqs)
    zone_size = max(1, (n + NUM_ZONES_DEFAULT - 1) // NUM_ZONES_DEFAULT)
    result: dict[int, int] = {}
    for i, (loc_id, _) in enumerate(seqs):
        result[loc_id] = min(i // zone_size, NUM_ZONES_DEFAULT - 1)
    return result


def simulate_zone_strategy(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    order_ids: list[int],
) -> StrategySimulationResult:
    """
    Simulate ZONE strategy: split picks by zone, one route per zone per "wave",
    pickers work in parallel (max zone time), then consolidation.
    """
    if not order_ids:
        return StrategySimulationResult(
            strategy_name="ZONE",
            total_walking_distance=0.0,
            estimated_picking_time=0.0,
            estimated_packing_time=0.0,
            required_picker_count=0,
            orders_per_hour=0.0,
        )

    from sqlalchemy import func
    from ...models.order_item import OrderItem

    orders_count = len(order_ids)
    total_pick_items = (
        db.query(func.coalesce(func.sum(OrderItem.quantity), 0))
        .filter(OrderItem.order_id.in_(order_ids))
        .scalar()
    ) or 0
    total_pick_items = int(total_pick_items)

    # Collect all pick nodes per order, then assign to zones by location_id
    order_pick_nodes: list[list[dict[str, Any]]] = []
    all_location_ids: list[int] = []
    for oid in order_ids:
        nodes = get_order_pick_locations(db, oid, warehouse_id, tenant_id)
        order_pick_nodes.append(nodes)
        for n in nodes:
            all_location_ids.append(n["location_id"])
    all_location_ids = list(set(all_location_ids))
    loc_to_zone = _assign_locations_to_zones(db, warehouse_id, all_location_ids)

    # Build zone -> list of pick nodes (merge from all orders by node_id per zone)
    zone_nodes: dict[int, list[dict[str, Any]]] = {}
    for nodes in order_pick_nodes:
        for n in nodes:
            loc_id = n["location_id"]
            z = loc_to_zone.get(loc_id, 0)
            lst = zone_nodes.setdefault(z, [])
            existing = next((x for x in lst if x["node_id"] == n["node_id"]), None)
            if existing is not None:
                existing["quantity"] = existing.get("quantity", 0) + n.get("quantity", 0)
            else:
                lst.append(dict(n))

    # Walking distance per zone (parallel: total = sum of zone distances, but time = max)
    zone_distances: list[float] = []
    zone_times_s: list[float] = []
    for z in range(NUM_ZONES_DEFAULT):
        nodes = zone_nodes.get(z, [])
        if not nodes:
            continue
        dist_m, _, _err = compute_route_for_pick_nodes(db, warehouse_id, nodes)
        zone_distances.append(dist_m)
        zone_times_s.append(dist_m / WALKING_SPEED_M_S if dist_m else 0.0)

    total_walking_m = sum(zone_distances)
    # Parallel picking: time = max(zone times) + picking time (spread across zones)
    max_zone_walk_s = max(zone_times_s) if zone_times_s else 0.0
    picking_time_s = total_pick_items * PICK_TIME_PER_ITEM_ZONE
    packing_time_s = orders_count * (PACK_TIME_PER_ORDER_ZONE + CONSOLIDATION_TIME_PER_ORDER)
    total_time_s = max_zone_walk_s + picking_time_s + packing_time_s
    orders_per_hour = (orders_count * 3600.0 / total_time_s) if total_time_s > 0 else 0.0
    required_pickers = len([d for d in zone_distances if d > 0]) or 1

    return StrategySimulationResult(
        strategy_name="ZONE",
        total_walking_distance=total_walking_m,
        estimated_picking_time=picking_time_s,
        estimated_packing_time=packing_time_s,
        required_picker_count=required_pickers,
        orders_per_hour=orders_per_hour,
    )
