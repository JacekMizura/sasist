"""
Basket picking strategy — cart with baskets, 1 basket = 1 order.

- Multiple baskets per cart
- Medium picking time (place in correct basket)
- Very fast packing (order already separated)
"""

from typing import Any

from sqlalchemy.orm import Session

from .metrics import StrategySimulationResult
from ._pick_helpers import (
    get_order_pick_locations,
    compute_route_for_pick_nodes,
    WALKING_SPEED_M_S,
)

# Time constants (seconds)
PICK_TIME_PER_ITEM_BASKET = 4.0   # medium: place in basket
PACK_TIME_PER_ORDER_BASKET = 20.0  # very fast: already separated
BASKETS_PER_CART = 6  # orders per cart (one order per basket)


def simulate_basket_strategy(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    order_ids: list[int],
) -> StrategySimulationResult:
    """
    Simulate BASKET strategy: each order = one basket, limited baskets per cart.
    One route per cart (multiple orders/baskets). Packing very fast.
    """
    if not order_ids:
        return StrategySimulationResult(
            strategy_name="BASKET",
            total_walking_distance=0.0,
            estimated_picking_time=0.0,
            estimated_packing_time=0.0,
            required_picker_count=0,
            orders_per_hour=0.0,
        )

    from sqlalchemy import func
    from ...models.order_item import OrderItem

    total_walking_m = 0.0
    orders_count = len(order_ids)
    total_pick_items = (
        db.query(func.coalesce(func.sum(OrderItem.quantity), 0))
        .filter(OrderItem.order_id.in_(order_ids))
        .scalar()
    ) or 0
    total_pick_items = int(total_pick_items)

    # Carts: each cart has up to BASKETS_PER_CART orders
    cart_batches: list[list[int]] = []
    for i in range(0, orders_count, BASKETS_PER_CART):
        cart_batches.append(order_ids[i : i + BASKETS_PER_CART])

    for batch in cart_batches:
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
        dist_m, _ = compute_route_for_pick_nodes(db, warehouse_id, all_pick_nodes)
        total_walking_m += dist_m

    walking_time_s = total_walking_m / WALKING_SPEED_M_S if total_walking_m else 0.0
    picking_time_s = total_pick_items * PICK_TIME_PER_ITEM_BASKET
    packing_time_s = orders_count * PACK_TIME_PER_ORDER_BASKET
    total_time_s = walking_time_s + picking_time_s + packing_time_s
    orders_per_hour = (orders_count * 3600.0 / total_time_s) if total_time_s > 0 else 0.0

    return StrategySimulationResult(
        strategy_name="BASKET",
        total_walking_distance=total_walking_m,
        estimated_picking_time=picking_time_s,
        estimated_packing_time=packing_time_s,
        required_picker_count=len(cart_batches),
        orders_per_hour=orders_per_hour,
    )
