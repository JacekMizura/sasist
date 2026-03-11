"""
Shared helpers for picking strategy simulation: resolve locations, compute route distance.
Used by simulation_engine and all strategy modules to avoid circular imports.
"""

from typing import Any

from sqlalchemy.orm import Session

from ...models.order_item import OrderItem
from ...models.inventory import Inventory
from ...models.location import Location
from ...models.warehouse_graph import WarehouseNode

from ..simulation.warehouse_graph_service import (
    get_location_to_node_map,
    get_special_locations_xy,
    get_node_nearest_to_point,
)
from ..simulation.route_engine import (
    compute_visit_order_euclidean,
    compute_route_distance_euclidean,
)

WALKING_SPEED_M_S = 1.4


def resolve_product_to_location(
    db: Session,
    warehouse_id: int,
    tenant_id: int,
    product_ids: list[int],
) -> dict[int, int]:
    """
    Resolve product_id -> location_id using inventory.
    Prefer location with smallest pick_sequence when multiple exist.
    """
    inventory_rows = (
        db.query(Inventory, Location.pick_sequence)
        .join(Location, Inventory.location_id == Location.id)
        .filter(
            Inventory.warehouse_id == warehouse_id,
            Inventory.tenant_id == tenant_id,
            Inventory.product_id.in_(product_ids),
            Inventory.quantity > 0,
        )
        .all()
    )
    EFFECTIVE_UNSEQUENCED = 999999
    best: dict[int, tuple[int, int]] = {}
    for inv, seq in inventory_rows:
        effective = seq if seq is not None else EFFECTIVE_UNSEQUENCED
        if inv.product_id not in best or effective < best[inv.product_id][1]:
            best[inv.product_id] = (inv.location_id, effective)
    return {p: loc_id for p, (loc_id, _) in best.items()}


def get_order_pick_locations(
    db: Session,
    order_id: int,
    warehouse_id: int,
    tenant_id: int,
) -> list[dict[str, Any]]:
    """
    For one order, return list of pick nodes: [{"node_id", "x", "y", "location_id", "product_id", "quantity"}, ...].
    Uses inventory and pick_sequence. Deduplicates by node.
    """
    items = db.query(OrderItem).filter(OrderItem.order_id == order_id).all()
    if not items:
        return []
    product_ids = list({i.product_id for i in items})
    product_to_loc = resolve_product_to_location(db, warehouse_id, tenant_id, product_ids)
    loc_to_qty: dict[int, list[tuple[int, int]]] = {}
    for it in items:
        loc_id = product_to_loc.get(it.product_id)
        if loc_id is None:
            continue
        loc_to_qty.setdefault(loc_id, []).append((it.product_id, int(it.quantity)))
    location_ids = list(loc_to_qty.keys())
    if not location_ids:
        return []
    loc_to_node_xy = get_location_to_node_map(db, warehouse_id)
    loc_rows = (
        db.query(Location.id, Location.name, Location.x, Location.y, Location.pick_sequence)
        .filter(Location.id.in_(location_ids))
        .all()
    )
    pick_nodes: list[dict[str, Any]] = []
    seen_node: set[int] = set()
    for loc_id in location_ids:
        if loc_id not in loc_to_node_xy:
            continue
        node_id, nx, ny = loc_to_node_xy[loc_id]
        if node_id in seen_node:
            continue
        seen_node.add(node_id)
        products_here = loc_to_qty[loc_id]
        total_qty = sum(q for _, q in products_here)
        pick_nodes.append({
            "node_id": node_id,
            "x": nx,
            "y": ny,
            "location_id": loc_id,
            "product_id": products_here[0][0],
            "quantity": total_qty,
            "pick_sequence": next(
                (loc.pick_sequence for loc in loc_rows if loc.id == loc_id),
                None,
            ),
        })
    EFFECTIVE_UNSEQUENCED = 999999
    pick_nodes.sort(key=lambda p: (p.get("pick_sequence") if p.get("pick_sequence") is not None else EFFECTIVE_UNSEQUENCED, p["location_id"]))
    return pick_nodes


def compute_route_for_pick_nodes(
    db: Session,
    warehouse_id: int,
    pick_nodes: list[dict[str, Any]],
) -> tuple[float, list[int]]:
    """
    Compute visit order START -> picks -> PACKING and total walking distance (m).
    Returns (total_distance_m, visit_order).
    """
    start_xy, end_xy = get_special_locations_xy(db, warehouse_id)
    start_node_id = get_node_nearest_to_point(db, warehouse_id, start_xy[0], start_xy[1]) if start_xy else None
    end_node_id = get_node_nearest_to_point(db, warehouse_id, end_xy[0], end_xy[1]) if end_xy else None
    node_ids = list({p["node_id"] for p in pick_nodes})
    if start_node_id is not None:
        node_ids.append(start_node_id)
    if end_node_id is not None:
        node_ids.append(end_node_id)
    node_rows = db.query(WarehouseNode.id, WarehouseNode.x, WarehouseNode.y).filter(WarehouseNode.id.in_(node_ids)).all()
    node_xy_map = {n.id: (float(n.x), float(n.y)) for n in node_rows}
    if not pick_nodes:
        return 0.0, []
    visit_order = compute_visit_order_euclidean(
        start_node_id,
        end_node_id,
        [{"node_id": p["node_id"], "x": p["x"], "y": p["y"]} for p in pick_nodes],
        node_xy_map,
    )
    total_m = compute_route_distance_euclidean(visit_order, node_xy_map)
    return total_m, visit_order
