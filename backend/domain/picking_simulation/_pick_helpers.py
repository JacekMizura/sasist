"""
Shared helpers for picking strategy simulation: resolve locations, compute route distance.
Distance/cost from authored Warehouse Routing Graph only (no WarehouseNode).
"""

from typing import Any, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ...models.order_item import OrderItem
from ...models.inventory import Inventory
from ...services.bundle_order_item_ops import sqlalchemy_operational_picking_order_item_clause
from ...models.location import Location
from ...models.warehouse import Bin
from ...storage_types import NON_PICKABLE_STORAGE_TYPE_ALIASES, get_storage_priority
from ...services.warehouse_routing.access_resolution import (
    access_node_uuids_for_location,
    access_node_uuids_for_locations,
    chain_distance_through_location_ids,
    is_routing_graph_configured,
    packing_node_uuid,
    picking_start_node_uuid,
)
from ...services.warehouse_routing.constants import (
    ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
    PROCESS_PICKING,
    TRANSPORT_FOOT,
)
from ...models.warehouse_routing import WarehouseRoutingNode
from ..simulation.route_engine import compute_visit_order_euclidean

WALKING_SPEED_M_S = 1.4


def resolve_product_to_location(
    db: Session,
    warehouse_id: int,
    tenant_id: int,
    product_ids: list[int],
) -> dict[int, int]:
    """
    Resolve product_id -> location_id using inventory.
    Prefer pickable locations only. Priority: primary first, then store,
    then location pick_sequence for path ordering.
    """
    inventory_rows = (
        db.query(Inventory, Location.pick_sequence, Bin.storage_type)
        .join(Location, Inventory.location_id == Location.id)
        .outerjoin(Bin, Bin.location_uuid == Location.location_uuid)
        .filter(
            Inventory.warehouse_id == warehouse_id,
            Inventory.tenant_id == tenant_id,
            Inventory.product_id.in_(product_ids),
            Inventory.quantity > 0,
            or_(
                Bin.id.is_(None),
                Bin.storage_type.is_(None),
                ~func.lower(Bin.storage_type).in_(tuple(NON_PICKABLE_STORAGE_TYPE_ALIASES)),
            ),
        )
        .all()
    )
    EFFECTIVE_UNSEQUENCED = 999999
    best: dict[int, tuple[int, int, int]] = {}
    for inv, seq, storage_type in inventory_rows:
        priority = get_storage_priority(storage_type) or 999999
        effective = seq if seq is not None else EFFECTIVE_UNSEQUENCED
        candidate = (inv.location_id, priority, effective)
        if inv.product_id not in best or (priority, effective, inv.location_id) < (
            best[inv.product_id][1],
            best[inv.product_id][2],
            best[inv.product_id][0],
        ):
            best[inv.product_id] = candidate
    return {p: loc_id for p, (loc_id, _, _) in best.items()}


def get_order_pick_locations(
    db: Session,
    order_id: int,
    warehouse_id: int,
    tenant_id: int,
) -> list[dict[str, Any]]:
    """
    For one order, return list of pick stops with routing node uuid (best single AP for ordering).
    Uses inventory and pick_sequence. Deduplicates by location.
    """
    items = (
        db.query(OrderItem)
        .filter(
            OrderItem.order_id == order_id,
            sqlalchemy_operational_picking_order_item_clause(OrderItem),
        )
        .all()
    )
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

    loc_nodes = access_node_uuids_for_locations(db, warehouse_id, location_ids)
    node_xy: dict[str, tuple[float, float]] = {}
    all_uuids = [u for nodes in loc_nodes.values() for u in nodes]
    if all_uuids:
        for n in (
            db.query(WarehouseRoutingNode)
            .filter(
                WarehouseRoutingNode.warehouse_id == warehouse_id,
                WarehouseRoutingNode.uuid.in_(all_uuids),
            )
            .all()
        ):
            node_xy[n.uuid] = (float(n.x), float(n.y))

    loc_rows = (
        db.query(Location.id, Location.name, Location.x, Location.y, Location.pick_sequence)
        .filter(Location.id.in_(location_ids))
        .all()
    )
    pick_nodes: list[dict[str, Any]] = []
    seen_loc: set[int] = set()
    for loc_id in location_ids:
        if loc_id in seen_loc:
            continue
        candidates = loc_nodes.get(loc_id) or []
        if not candidates:
            continue
        seen_loc.add(loc_id)
        # Representative node for Euclidean visit-order heuristic (first AP); distance uses best AP later
        node_uuid = candidates[0]
        nx, ny = node_xy.get(node_uuid, (0.0, 0.0))
        products_here = loc_to_qty[loc_id]
        total_qty = sum(q for _, q in products_here)
        pick_nodes.append({
            "node_id": node_uuid,  # uuid string (historical key name)
            "node_uuid": node_uuid,
            "access_node_uuids": candidates,
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
    pick_nodes.sort(
        key=lambda p: (
            p.get("pick_sequence") if p.get("pick_sequence") is not None else EFFECTIVE_UNSEQUENCED,
            p["location_id"],
        )
    )
    return pick_nodes


def compute_route_for_pick_nodes(
    db: Session,
    warehouse_id: int,
    pick_nodes: list[dict[str, Any]],
) -> tuple[float, list[str], Optional[str]]:
    """
    Visit order START → picks (Euclidean NN heuristic) → PACKING;
    physical distance from Routing Engine (best AP per hop).
    Returns (total_distance_m, visit_order_uuids, error_code|None).
    """
    if not is_routing_graph_configured(db, warehouse_id):
        return 0.0, [], ERROR_ROUTING_GRAPH_NOT_CONFIGURED

    start_uuid = picking_start_node_uuid(db, warehouse_id)
    end_uuid = packing_node_uuid(db, warehouse_id)
    if not start_uuid:
        return 0.0, [], ERROR_ROUTING_GRAPH_NOT_CONFIGURED

    node_xy_map: dict[str, tuple[float, float]] = {}
    uuids = [start_uuid]
    if end_uuid:
        uuids.append(end_uuid)
    for p in pick_nodes:
        uuids.append(str(p.get("node_uuid") or p["node_id"]))
        for u in p.get("access_node_uuids") or []:
            uuids.append(u)
    for n in (
        db.query(WarehouseRoutingNode)
        .filter(
            WarehouseRoutingNode.warehouse_id == warehouse_id,
            WarehouseRoutingNode.uuid.in_(list(set(uuids))),
        )
        .all()
    ):
        node_xy_map[n.uuid] = (float(n.x), float(n.y))

    if not pick_nodes:
        dist, err, path = chain_distance_through_location_ids(
            db,
            warehouse_id,
            [],
            start_node_uuid=start_uuid,
            end_node_uuid=end_uuid,
            process_type=PROCESS_PICKING,
            transport_type=TRANSPORT_FOOT,
        )
        return (dist or 0.0), path, err

    visit_order = compute_visit_order_euclidean(
        start_uuid,
        end_uuid,
        [{"node_id": p.get("node_uuid") or p["node_id"], "x": p["x"], "y": p["y"]} for p in pick_nodes],
        node_xy_map,
    )
    # Map visit middle nodes back to locations for best-AP chaining
    uuid_to_loc = {str(p.get("node_uuid") or p["node_id"]): int(p["location_id"]) for p in pick_nodes}
    loc_order: list[int] = []
    for uid in visit_order:
        if uid == start_uuid or uid == end_uuid:
            continue
        lid = uuid_to_loc.get(str(uid))
        if lid is not None and (not loc_order or loc_order[-1] != lid):
            loc_order.append(lid)

    dist, err, path = chain_distance_through_location_ids(
        db,
        warehouse_id,
        loc_order,
        start_node_uuid=start_uuid,
        end_node_uuid=end_uuid,
        process_type=PROCESS_PICKING,
        transport_type=TRANSPORT_FOOT,
    )
    if err:
        return 0.0, path, err
    return (dist or 0.0), path, None
