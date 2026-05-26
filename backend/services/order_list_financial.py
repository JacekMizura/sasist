"""Batch gross profit / margin % for order list rows (active lines only)."""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem
from .product_cost_service import get_products_current_costs


def _line_revenue_net(it: OrderItem) -> float:
    tp = getattr(it, "total_price", None)
    if tp is not None:
        try:
            v = float(tp)
            if abs(v) > 1e-12:
                return v
        except (TypeError, ValueError):
            pass
    up = getattr(it, "unit_price", None)
    q = float(it.quantity or 0)
    if up is not None and q > 1e-12:
        try:
            return float(up) * q
        except (TypeError, ValueError):
            pass
    return 0.0


def batch_order_list_profit_metrics(
    db: Session,
    built: List[Tuple[Order, float, bool, int, int, List[OrderItem]]],
) -> Dict[int, Tuple[Optional[float], Optional[float]]]:
    """One landed-cost batch per tenant bucket — maps order id → (gross_profit, margin_percent)."""
    by_tenant_pids: dict[int, set[int]] = defaultdict(set)
    for row in built:
        o = row[0]
        tid = int(o.tenant_id)
        la = row[-1]
        for it in la:
            pid = getattr(it, "product_id", None)
            if pid is not None:
                by_tenant_pids[tid].add(int(pid))

    costs_cache: dict[int, Dict[int, dict]] = {}
    for tid, pids in by_tenant_pids.items():
        costs_cache[tid] = get_products_current_costs(db, tid, pids)

    out: Dict[int, Tuple[Optional[float], Optional[float]]] = {}
    for row in built:
        o = row[0]
        tid = int(o.tenant_id)
        la = row[-1]
        costs_map = costs_cache.get(tid, {})
        revenue = 0.0
        landed_sum = 0.0
        any_landed = False
        for it in la:
            revenue += _line_revenue_net(it)
            pid = getattr(it, "product_id", None)
            if pid is None:
                continue
            q = float(it.quantity or 0)
            if q <= 1e-12:
                continue
            lc = costs_map.get(int(pid), {}).get("landed_cost_net") if costs_map else None
            if lc is None:
                continue
            try:
                landed_sum += float(lc) * q
                any_landed = True
            except (TypeError, ValueError):
                continue
        oid = int(o.id)
        if revenue <= 1e-9:
            out[oid] = (None, None)
            continue
        if not any_landed:
            out[oid] = (None, None)
            continue
        gp = revenue - landed_sum
        mp = (gp / revenue * 100.0) if revenue > 1e-9 else None
        out[oid] = (round(gp, 2), round(mp, 2) if mp is not None else None)
    return out
