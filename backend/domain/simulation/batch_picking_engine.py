"""
Batch picking engine — simulate picking for multiple orders.

- Run single-order simulation per order (or use merged pick locations)
- Aggregate distances and times
- Optional: merge pick locations across orders and compute one route for distance reduction estimate
"""

from typing import Any

from sqlalchemy.orm import Session

from ...models.order import Order

from .picking_simulation_engine import simulate_single_order


def simulate_batch_orders(
    db: Session,
    order_ids: list[int],
    warehouse_id: int,
    record_picks: bool = False,
) -> dict[str, Any]:
    """
    Simulate picking for multiple orders. Each order is simulated independently;
    results are aggregated. If record_picks=True, creates Pick records (no inventory change) per order.
    Returns:
    - routes: list of {order_id, distance, estimated_time, route_points}
    - total_distance
    - total_estimated_time
    - orders_count
    """
    if not order_ids:
        return {
            "orders_count": 0,
            "total_distance": 0.0,
            "total_estimated_time": 0.0,
            "routes": [],
        }

    routes_out: list[dict[str, Any]] = []
    total_distance = 0.0
    total_time = 0.0

    for oid in order_ids:
        order = db.query(Order).filter(Order.id == oid).first()
        if not order:
            continue
        if order.warehouse_id != warehouse_id:
            continue
        res = simulate_single_order(db, order, record_picks=record_picks)
        if res.get("error"):
            continue
        dist = res.get("total_distance_m") or 0.0
        est_time = res.get("estimated_time_s") or 0.0
        route_points = res.get("route_points") or []
        routes_out.append({
            "order_id": oid,
            "distance": round(dist, 2),
            "estimated_time": round(est_time, 1),
            "route": [{"x": p["x"], "y": p["y"]} for p in route_points],
        })
        total_distance += dist
        total_time += est_time

    return {
        "orders_count": len(routes_out),
        "total_distance": round(total_distance, 2),
        "total_estimated_time": round(total_time, 1),
        "routes": routes_out,
    }
