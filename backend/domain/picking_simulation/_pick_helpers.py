"""
Shared helpers for picking strategy simulation: resolve locations, compute route distance.
Distance/cost from Runtime Graph Reader only (authored Warehouse Routing Graph).
"""

from typing import Any, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ...models.order_item import OrderItem
from ...models.inventory import Inventory
from ...services.bundle_order_item_ops import sqlalchemy_operational_picking_order_item_clause
from ...models.location import Location
from ...models.warehouse import Bin
from ...models.warehouse_routing import WarehouseRoutingNode
from ...storage_types import NON_PICKABLE_STORAGE_TYPE_ALIASES, get_storage_priority
from ...services.warehouse_routing.access_resolution import (
    access_node_uuids_for_locations,
)
from ...services.warehouse_routing.constants import (
    ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
)
from ...services.warehouse_routing.runtime_graph_reader import (
    chain_distance_m,
    graph_ready,
    order_location_ids_by_graph,
    visit_index_map,
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
    Prefer pickable locations only.
    Priority: storage type (business), then Runtime Graph visit index.
    """
    if not product_ids:
        return {}
    inventory_rows = (
        db.query(Inventory, Bin.storage_type)
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
    by_product: dict[int, list[tuple[int, int]]] = {}
    for inv, storage_type in inventory_rows:
        priority = get_storage_priority(storage_type) or 999999
        by_product.setdefault(int(inv.product_id), []).append((int(inv.location_id), priority))

    all_lids = list({lid for rows in by_product.values() for lid, _ in rows})
    vmap = visit_index_map(db, warehouse_id, all_lids) if all_lids else {}
    out: dict[int, int] = {}
    for pid, rows in by_product.items():
        best_pri = min(p for _, p in rows)
        same = [lid for lid, p in rows if p == best_pri]
        same.sort(key=lambda lid: (vmap.get(lid, 10**9), lid))
        out[pid] = same[0]
    return out


def get_order_pick_locations(
    db: Session,
    order_id: int,
    warehouse_id: int,
    tenant_id: int,
) -> list[dict[str, Any]]:
    """
    For one order, return list of pick stops (access nodes for distance).
    Visit order is applied later by compute_route_for_pick_nodes (Graph Reader).
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

    pick_nodes: list[dict[str, Any]] = []
    seen_loc: set[int] = set()
    for loc_id in location_ids:
        if loc_id in seen_loc:
            continue
        candidates = loc_nodes.get(loc_id) or []
        if not candidates:
            continue
        seen_loc.add(loc_id)
        node_uuid = candidates[0]
        nx, ny = node_xy.get(node_uuid, (0.0, 0.0))
        products_here = loc_to_qty[loc_id]
        total_qty = sum(q for _, q in products_here)
        pick_nodes.append({
            "node_id": node_uuid,
            "node_uuid": node_uuid,
            "access_node_uuids": candidates,
            "x": nx,
            "y": ny,
            "location_id": loc_id,
            "product_id": products_here[0][0],
            "quantity": total_qty,
        })
    # Stable only; Graph Reader sets visit order in compute_route_for_pick_nodes.
    pick_nodes.sort(key=lambda p: int(p["location_id"]))
    return pick_nodes


def compute_route_for_pick_nodes(
    db: Session,
    warehouse_id: int,
    pick_nodes: list[dict[str, Any]],
) -> tuple[float, list[str], Optional[str]]:
    """
    Visit order START → picks (Runtime Graph Reader NN) → PACKING;
    physical distance from authored Routing Graph.
    Returns (total_distance_m, visit_order_uuids, error_code|None).
    """
    if not graph_ready(db, warehouse_id):
        return 0.0, [], ERROR_ROUTING_GRAPH_NOT_CONFIGURED

    if not pick_nodes:
        dist, err, path = chain_distance_m(
            db,
            warehouse_id,
            [],
            include_start=True,
            include_packing=True,
        )
        return (dist or 0.0), path, err

    loc_ids = [int(p["location_id"]) for p in pick_nodes]
    loc_order, order_err = order_location_ids_by_graph(db, warehouse_id, loc_ids)
    dist, err, path = chain_distance_m(
        db,
        warehouse_id,
        loc_order,
        include_start=True,
        include_packing=True,
    )
    if err:
        return 0.0, path, err
    return (dist or 0.0), path, order_err if dist is None else None
