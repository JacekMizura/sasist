"""
Picking strategy simulation engine — orchestration.

- Runs each strategy (CART, BASKET, ZONE, HYBRID) for given orders
- Returns metrics for comparison (analytics only; no execution changes)
"""

from sqlalchemy.orm import Session

from ...models.order import Order

from .metrics import StrategySimulationResult
from .cart_strategy import simulate_cart_strategy
from .basket_strategy import simulate_basket_strategy
from .zone_strategy import simulate_zone_strategy
from .hybrid_strategy import simulate_hybrid_strategy


def run_strategy_simulation(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    order_ids: list[int],
) -> list[StrategySimulationResult]:
    """
    Run all picking strategies for the given orders and return metrics for each.
    Does not modify any execution state; analytics only.
    """
    if not order_ids:
        return []
    orders = (
        db.query(Order)
        .filter(
            Order.id.in_(order_ids),
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
        )
        .all()
    )
    order_ids = [o.id for o in orders]
    if not order_ids:
        return []

    results: list[StrategySimulationResult] = []
    results.append(simulate_cart_strategy(db, tenant_id, warehouse_id, order_ids))
    results.append(simulate_basket_strategy(db, tenant_id, warehouse_id, order_ids))
    results.append(simulate_zone_strategy(db, tenant_id, warehouse_id, order_ids))
    results.append(simulate_hybrid_strategy(db, tenant_id, warehouse_id, order_ids))
    return results
