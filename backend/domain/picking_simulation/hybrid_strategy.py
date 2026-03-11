"""
Hybrid picking strategy — assign strategy by order size.

- Small orders (1–2 items) → CART
- Medium orders (3–6 items) → BASKET
- Large orders (7+ items) → ZONE

Simulates the mixed strategy and aggregates metrics.
"""

from sqlalchemy.orm import Session
from sqlalchemy import func

from ...models.order_item import OrderItem

from .metrics import StrategySimulationResult
from .cart_strategy import simulate_cart_strategy
from .basket_strategy import simulate_basket_strategy
from .zone_strategy import simulate_zone_strategy

# Order size thresholds (item count)
SMALL_ORDER_MAX_ITEMS = 2   # 1-2 → CART
MEDIUM_ORDER_MAX_ITEMS = 6  # 3-6 → BASKET
# 7+ → ZONE


def _order_item_counts(db: Session, order_ids: list[int]) -> dict[int, int]:
    """Return order_id -> total item count (sum of quantity)."""
    rows = (
        db.query(OrderItem.order_id, func.sum(OrderItem.quantity).label("total"))
        .filter(OrderItem.order_id.in_(order_ids))
        .group_by(OrderItem.order_id)
        .all()
    )
    return {r.order_id: int(r.total) for r in rows}


def _classify_order(item_count: int) -> str:
    """Return 'CART', 'BASKET', or 'ZONE'."""
    if item_count <= SMALL_ORDER_MAX_ITEMS:
        return "CART"
    if item_count <= MEDIUM_ORDER_MAX_ITEMS:
        return "BASKET"
    return "ZONE"


def simulate_hybrid_strategy(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    order_ids: list[int],
) -> StrategySimulationResult:
    """
    Simulate HYBRID strategy: classify each order by size, run the assigned strategy
    for that subset, then aggregate metrics (sum distances and times, sum pickers).
    """
    if not order_ids:
        return StrategySimulationResult(
            strategy_name="HYBRID",
            total_walking_distance=0.0,
            estimated_picking_time=0.0,
            estimated_packing_time=0.0,
            required_picker_count=0,
            orders_per_hour=0.0,
        )

    counts = _order_item_counts(db, order_ids)
    cart_ids = [oid for oid in order_ids if _classify_order(counts.get(oid, 0)) == "CART"]
    basket_ids = [oid for oid in order_ids if _classify_order(counts.get(oid, 0)) == "BASKET"]
    zone_ids = [oid for oid in order_ids if _classify_order(counts.get(oid, 0)) == "ZONE"]

    total_walking_m = 0.0
    total_picking_s = 0.0
    total_packing_s = 0.0
    total_pickers = 0
    orders_count = len(order_ids)

    if cart_ids:
        r = simulate_cart_strategy(db, tenant_id, warehouse_id, cart_ids)
        total_walking_m += r.total_walking_distance
        total_picking_s += r.estimated_picking_time
        total_packing_s += r.estimated_packing_time
        total_pickers += r.required_picker_count
    if basket_ids:
        r = simulate_basket_strategy(db, tenant_id, warehouse_id, basket_ids)
        total_walking_m += r.total_walking_distance
        total_picking_s += r.estimated_picking_time
        total_packing_s += r.estimated_packing_time
        total_pickers += r.required_picker_count
    if zone_ids:
        r = simulate_zone_strategy(db, tenant_id, warehouse_id, zone_ids)
        total_walking_m += r.total_walking_distance
        total_picking_s += r.estimated_picking_time
        total_packing_s += r.estimated_packing_time
        total_pickers += r.required_picker_count

    total_time_s = total_picking_s + total_packing_s + (total_walking_m / 1.4)
    orders_per_hour = (orders_count * 3600.0 / total_time_s) if total_time_s > 0 else 0.0

    return StrategySimulationResult(
        strategy_name="HYBRID",
        total_walking_distance=total_walking_m,
        estimated_picking_time=total_picking_s,
        estimated_packing_time=total_packing_s,
        required_picker_count=total_pickers,
        orders_per_hour=orders_per_hour,
    )
