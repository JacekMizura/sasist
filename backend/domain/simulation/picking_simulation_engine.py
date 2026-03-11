"""
Picking simulation engine — simulate picking for a single order.

- Resolve product locations from inventory (no assigned_locations)
- Map locations to graph nodes
- Compute route START → pick nodes → PACKING
- Optionally record Pick events (no inventory change) for analytics (Hot locations, Walking cost, Slotting)
"""

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.pick import Pick
from ...models.inventory import Inventory
from ...models.location import Location
from ...models.warehouse_graph import WarehouseNode

from .warehouse_graph_service import (
    get_location_to_node_map,
    get_special_locations_xy,
    get_node_nearest_to_point,
    distance_euclidean_m,
)
from .route_engine import (
    compute_visit_order_euclidean,
    compute_route_distance_euclidean,
)

WALKING_SPEED_M_S = 1.4


def _create_simulated_picks(
    db: Session,
    order: Order,
    items: list[OrderItem],
    product_to_location: dict[int, int],
) -> None:
    """
    Create Pick records for simulated picking. Does NOT modify inventory.
    One Pick per order item that has a resolved location (for analytics: Hot locations, Walking cost, Slotting).
    """
    now = datetime.utcnow()
    for item in items:
        location_id = product_to_location.get(item.product_id)
        if location_id is None:
            continue
        db.add(
            Pick(
                tenant_id=order.tenant_id,
                warehouse_id=order.warehouse_id,
                order_id=order.id,
                order_item_id=item.id,
                product_id=item.product_id,
                location_id=location_id,
                quantity=float(item.quantity),
                picked_at=now,
                picker_id=None,
                status="done",
            )
        )


def simulate_single_order(
    db: Session,
    order: Order,
    record_picks: bool = False,
) -> dict[str, Any]:
    """
    Simulate picking for one order. Uses inventory only (no assigned_locations).
    If record_picks=True, creates Pick records (no inventory change) for analytics.
    Returns dict with: warehouse_id, start_xy, end_xy, product_to_location, location_ids,
    pick_nodes, visit_order, total_distance_m, estimated_time_s, node_xy_map,
    loc_names, loc_info, route_points (list of {node_id, x, y}),
    node_to_location (node_id -> location_id for pick nodes).
    If order not found or no start/packing, returns minimal dict with error or zero distance.
    """
    warehouse_id = order.warehouse_id
    start_xy, end_xy = get_special_locations_xy(db, warehouse_id)
    if start_xy is None:
        return {
            "warehouse_id": warehouse_id,
            "start_xy": None,
            "end_xy": end_xy,
            "error": "no_pick_start",
            "total_distance_m": 0.0,
            "estimated_time_s": 0.0,
            "visit_order": [],
            "pick_nodes": [],
            "location_ids": [],
            "route_points": [],
        }
    if end_xy is None:
        return {
            "warehouse_id": warehouse_id,
            "start_xy": start_xy,
            "end_xy": None,
            "error": "no_packing",
            "total_distance_m": 0.0,
            "estimated_time_s": 0.0,
            "visit_order": [],
            "pick_nodes": [],
            "location_ids": [],
            "route_points": [],
        }

    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    product_ids = [i.product_id for i in items]
    if not product_ids:
        return {
            "warehouse_id": warehouse_id,
            "start_xy": start_xy,
            "end_xy": end_xy,
            "product_to_location": {},
            "location_ids": [],
            "pick_nodes": [],
            "visit_order": [],
            "total_distance_m": 0.0,
            "estimated_time_s": 0.0,
            "node_xy_map": {},
            "loc_names": {},
            "loc_info": {},
            "route_points": [],
            "node_to_location": {},
        }

    inventory_rows = (
        db.query(Inventory)
        .filter(
            Inventory.warehouse_id == warehouse_id,
            Inventory.tenant_id == order.tenant_id,
            Inventory.product_id.in_(product_ids),
            Inventory.quantity > 0,
        )
        .all()
    )
    product_to_location: dict[int, int] = {}
    for inv in inventory_rows:
        if inv.product_id not in product_to_location:
            product_to_location[inv.product_id] = inv.location_id
    location_ids = list(set(product_to_location.values()))
    if not location_ids:
        return {
            "warehouse_id": warehouse_id,
            "start_xy": start_xy,
            "end_xy": end_xy,
            "product_to_location": product_to_location,
            "location_ids": [],
            "pick_nodes": [],
            "visit_order": [],
            "total_distance_m": 0.0,
            "estimated_time_s": 0.0,
            "node_xy_map": {},
            "loc_names": {},
            "loc_info": {},
            "route_points": [],
            "node_to_location": {},
        }

    loc_to_node_xy = get_location_to_node_map(db, warehouse_id)
    loc_rows = (
        db.query(Location.id, Location.name, Location.x, Location.y)
        .filter(Location.id.in_(location_ids))
        .all()
    )
    loc_names: dict[int, str] = {loc.id: (loc.name or "") for loc in loc_rows}
    loc_info: dict[int, tuple[float, float]] = {
        loc.id: (float(loc.x or 0), float(loc.y or 0)) for loc in loc_rows
    }

    pick_nodes: list[dict[str, Any]] = []
    seen_node_ids: set[int] = set()
    for loc_id in location_ids:
        if loc_id not in loc_to_node_xy:
            continue
        node_id, nx, ny = loc_to_node_xy[loc_id]
        if node_id in seen_node_ids:
            continue
        seen_node_ids.add(node_id)
        pick_nodes.append({"node_id": node_id, "x": nx, "y": ny, "location_id": loc_id})

    start_node_id = get_node_nearest_to_point(db, warehouse_id, start_xy[0], start_xy[1])
    end_node_id = get_node_nearest_to_point(db, warehouse_id, end_xy[0], end_xy[1])

    all_node_ids = list(seen_node_ids)
    if start_node_id is not None:
        all_node_ids.append(start_node_id)
    if end_node_id is not None:
        all_node_ids.append(end_node_id)
    node_rows = (
        db.query(WarehouseNode.id, WarehouseNode.x, WarehouseNode.y)
        .filter(WarehouseNode.id.in_(all_node_ids))
        .all()
    )
    node_xy_map = {n.id: (float(n.x), float(n.y)) for n in node_rows}

    if not pick_nodes:
        return {
            "warehouse_id": warehouse_id,
            "start_xy": start_xy,
            "end_xy": end_xy,
            "product_to_location": product_to_location,
            "location_ids": location_ids,
            "pick_nodes": [],
            "visit_order": [],
            "total_distance_m": 0.0,
            "estimated_time_s": 0.0,
            "node_xy_map": node_xy_map,
            "loc_names": loc_names,
            "loc_info": loc_info,
            "route_points": [],
            "node_to_location": {},
        }

    visit_order = compute_visit_order_euclidean(
        start_node_id,
        end_node_id,
        pick_nodes,
        node_xy_map,
    )
    total_distance_m = compute_route_distance_euclidean(visit_order, node_xy_map)
    estimated_time_s = round(total_distance_m / WALKING_SPEED_M_S, 1) if total_distance_m else 0.0

    route_points = [
        {"node_id": nid, "x": node_xy_map.get(nid, (0, 0))[0], "y": node_xy_map.get(nid, (0, 0))[1]}
        for nid in visit_order
    ]
    node_to_location: dict[int, int] = {p["node_id"]: p["location_id"] for p in pick_nodes}

    if record_picks and product_to_location and items:
        _create_simulated_picks(db, order, items, product_to_location)
        db.commit()

    return {
        "warehouse_id": warehouse_id,
        "start_xy": start_xy,
        "end_xy": end_xy,
        "product_to_location": product_to_location,
        "location_ids": location_ids,
        "pick_nodes": pick_nodes,
        "visit_order": visit_order,
        "total_distance_m": total_distance_m,
        "estimated_time_s": estimated_time_s,
        "node_xy_map": node_xy_map,
        "loc_names": loc_names,
        "loc_info": loc_info,
        "route_points": route_points,
        "node_to_location": node_to_location,
    }
