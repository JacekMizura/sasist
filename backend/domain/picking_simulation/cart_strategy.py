"""
Cart picking strategy — single cart, multiple orders mixed.

- Products placed freely in cart
- Fast picking (no sorting during pick)
- Slower packing (items must be sorted by order during packing)
"""

from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import func

from ...models.order_item import OrderItem

from .metrics import StrategySimulationResult
from ._pick_helpers import (
    get_order_pick_locations,
    compute_route_for_pick_nodes,
    WALKING_SPEED_M_S,
)

# Time constants (seconds)
PICK_TIME_PER_ITEM_CART = 3.0   # fast: no basket separation
PACK_TIME_PER_ORDER_CART = 60.0  # slow: sorting by order at pack station
CART_BATCH_SIZE = 10  # orders per cart batch


def simulate_cart_strategy(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    order_ids: list[int],
) -> StrategySimulationResult:
    """
    Simulate CART strategy: batch orders into carts, mix items, one route per batch.
    Walking distance = sum of batch route distances. Picking fast, packing slow.
    """
    if not order_ids:
        return StrategySimulationResult(
            strategy_name="CART",
            total_walking_distance=0.0,
            estimated_picking_time=0.0,
            estimated_packing_time=0.0,
            required_picker_count=0,
            orders_per_hour=0.0,
        )

    total_walking_m = 0.0
    orders_count = len(order_ids)
    total_pick_items = (
        db.query(func.coalesce(func.sum(OrderItem.quantity), 0))
        .filter(OrderItem.order_id.in_(order_ids))
        .scalar()
    ) or 0
    total_pick_items = int(total_pick_items)

    batches: list[list[int]] = []
    for i in range(0, orders_count, CART_BATCH_SIZE):
        batches.append(order_ids[i : i + CART_BATCH_SIZE])

    for batch in batches:
        all_pick_nodes: list[dict[str, Any]] = []
        seen_node: set[int] = set()
        for oid in batch:
            nodes = get_order_pick_locations(db, oid, warehouse_id, tenant_id)
            for n in nodes:
                nid = n["node_id"]
                if nid not in seen_node:
                    seen_node.add(nid)
                    all_pick_nodes.append(dict(n))
                else:
                    for existing in all_pick_nodes:
                        if existing["node_id"] == nid:
                            existing["quantity"] = existing.get("quantity", 0) + n.get("quantity", 0)
                            break
        dist_m, _, _err = compute_route_for_pick_nodes(db, warehouse_id, all_pick_nodes)
        total_walking_m += dist_m

    walking_time_s = total_walking_m / WALKING_SPEED_M_S if total_walking_m else 0.0
    picking_time_s = total_pick_items * PICK_TIME_PER_ITEM_CART
    packing_time_s = orders_count * PACK_TIME_PER_ORDER_CART
    total_time_s = walking_time_s + picking_time_s + packing_time_s
    orders_per_hour = (orders_count * 3600.0 / total_time_s) if total_time_s > 0 else 0.0

    return StrategySimulationResult(
        strategy_name="CART",
        total_walking_distance=total_walking_m,
        estimated_picking_time=picking_time_s,
        estimated_packing_time=packing_time_s,
        required_picker_count=len(batches),
        orders_per_hour=orders_per_hour,
    )
