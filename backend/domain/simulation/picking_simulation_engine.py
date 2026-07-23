"""
Picking simulation engine — simulate picking for a single order.

Uses authored Warehouse Routing Graph via access_resolution (no WarehouseNode).
Visit order: Euclidean NN heuristic; distance: Routing Engine + best Access Points.
"""

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.pick import Pick
from ...services.bundle_order_item_ops import sqlalchemy_operational_picking_order_item_clause
from ...models.location import Location
from ...models.warehouse_routing import WarehouseRoutingNode
from ...services.warehouse_routing.access_resolution import (
    access_node_uuids_for_locations,
    is_routing_graph_configured,
    packing_node_uuid,
    picking_start_node_uuid,
)
from ...services.warehouse_routing.constants import ERROR_ROUTING_GRAPH_NOT_CONFIGURED
from ..picking_simulation._pick_helpers import (
    WALKING_SPEED_M_S,
    compute_route_for_pick_nodes,
    resolve_product_to_location,
)


def _create_simulated_picks(
    db: Session,
    order: Order,
    items: list[OrderItem],
    product_to_location: dict[int, int],
) -> None:
    """Create Pick records for simulated picking. Does NOT modify inventory."""
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
    Simulate picking for one order. Distance from authored Routing Graph.
    """
    warehouse_id = order.warehouse_id

    if not is_routing_graph_configured(db, warehouse_id):
        return {
            "warehouse_id": warehouse_id,
            "start_xy": None,
            "end_xy": None,
            "error": "routing_graph_not_configured",
            "routing_status": ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
            "total_distance_m": None,
            "estimated_time_s": None,
            "visit_order": [],
            "pick_nodes": [],
            "location_ids": [],
            "route_points": [],
            "distance_available": False,
        }

    start_uuid = picking_start_node_uuid(db, warehouse_id)
    end_uuid = packing_node_uuid(db, warehouse_id)
    if not start_uuid:
        return {
            "warehouse_id": warehouse_id,
            "start_xy": None,
            "end_xy": None,
            "error": "no_pick_start",
            "total_distance_m": 0.0,
            "estimated_time_s": 0.0,
            "visit_order": [],
            "pick_nodes": [],
            "location_ids": [],
            "route_points": [],
        }
    if not end_uuid:
        return {
            "warehouse_id": warehouse_id,
            "start_xy": None,
            "end_xy": None,
            "error": "no_packing",
            "total_distance_m": 0.0,
            "estimated_time_s": 0.0,
            "visit_order": [],
            "pick_nodes": [],
            "location_ids": [],
            "route_points": [],
        }

    start_node = (
        db.query(WarehouseRoutingNode)
        .filter(WarehouseRoutingNode.warehouse_id == warehouse_id, WarehouseRoutingNode.uuid == start_uuid)
        .first()
    )
    end_node = (
        db.query(WarehouseRoutingNode)
        .filter(WarehouseRoutingNode.warehouse_id == warehouse_id, WarehouseRoutingNode.uuid == end_uuid)
        .first()
    )
    start_xy = (float(start_node.x), float(start_node.y)) if start_node else (0.0, 0.0)
    end_xy = (float(end_node.x), float(end_node.y)) if end_node else (0.0, 0.0)

    items = (
        db.query(OrderItem)
        .filter(
            OrderItem.order_id == order.id,
            sqlalchemy_operational_picking_order_item_clause(OrderItem),
        )
        .all()
    )
    product_ids = [i.product_id for i in items]
    empty = {
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
        "distance_available": True,
    }
    if not product_ids:
        return empty

    product_to_location = resolve_product_to_location(
        db,
        warehouse_id=warehouse_id,
        tenant_id=order.tenant_id,
        product_ids=product_ids,
    )
    location_ids = list(set(product_to_location.values()))
    if not location_ids:
        return {**empty, "product_to_location": product_to_location}

    loc_rows = (
        db.query(Location.id, Location.name, Location.x, Location.y)
        .filter(Location.id.in_(location_ids))
        .all()
    )
    loc_names: dict[int, str] = {loc.id: (loc.name or "") for loc in loc_rows}
    loc_info: dict[int, tuple[float, float]] = {
        loc.id: (float(loc.x or 0), float(loc.y or 0)) for loc in loc_rows
    }

    loc_nodes = access_node_uuids_for_locations(db, warehouse_id, location_ids)
    all_uuids = [start_uuid, end_uuid] + [u for nodes in loc_nodes.values() for u in nodes]
    node_xy_map: dict[str, tuple[float, float]] = {}
    for n in (
        db.query(WarehouseRoutingNode)
        .filter(
            WarehouseRoutingNode.warehouse_id == warehouse_id,
            WarehouseRoutingNode.uuid.in_(list(set(all_uuids))),
        )
        .all()
    ):
        node_xy_map[n.uuid] = (float(n.x), float(n.y))

    pick_nodes: list[dict[str, Any]] = []
    seen_loc: set[int] = set()
    for loc_id in location_ids:
        candidates = loc_nodes.get(loc_id) or []
        if not candidates or loc_id in seen_loc:
            continue
        seen_loc.add(loc_id)
        node_uuid = candidates[0]
        nx, ny = node_xy_map.get(node_uuid, (0.0, 0.0))
        pick_nodes.append({
            "node_id": node_uuid,
            "node_uuid": node_uuid,
            "access_node_uuids": candidates,
            "x": nx,
            "y": ny,
            "location_id": loc_id,
        })

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
            "distance_available": True,
            "routing_status": "NO_ACCESS_POINTS",
        }

    total_distance_m, visit_order, err = compute_route_for_pick_nodes(db, warehouse_id, pick_nodes)
    estimated_time_s = (
        round(total_distance_m / WALKING_SPEED_M_S, 1)
        if total_distance_m and err is None
        else None
    )

    route_points = [
        {
            "node_id": nid,
            "node_uuid": nid,
            "x": node_xy_map.get(str(nid), (0, 0))[0],
            "y": node_xy_map.get(str(nid), (0, 0))[1],
        }
        for nid in visit_order
    ]
    # Fill xy from DB if missing from map (best-AP path may use other UUIDs)
    missing = [p["node_uuid"] for p in route_points if p["node_uuid"] not in node_xy_map]
    if missing:
        for n in (
            db.query(WarehouseRoutingNode)
            .filter(
                WarehouseRoutingNode.warehouse_id == warehouse_id,
                WarehouseRoutingNode.uuid.in_(missing),
            )
            .all()
        ):
            node_xy_map[n.uuid] = (float(n.x), float(n.y))
        for p in route_points:
            if p["node_uuid"] in node_xy_map:
                p["x"], p["y"] = node_xy_map[p["node_uuid"]]

    node_to_location: dict[str, int] = {
        str(p.get("node_uuid") or p["node_id"]): int(p["location_id"]) for p in pick_nodes
    }

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
        "total_distance_m": total_distance_m if err is None else None,
        "estimated_time_s": estimated_time_s,
        "node_xy_map": node_xy_map,
        "loc_names": loc_names,
        "loc_info": loc_info,
        "route_points": route_points,
        "node_to_location": node_to_location,
        "distance_available": err is None,
        "routing_status": err,
    }
