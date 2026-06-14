"""P4.18C — Bundle component replenishment forecast (recommendations only)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ....models.bundle import Bundle, BundleItem
from ....models.order import Order
from ....models.order_item import OrderItem
from ....models.product import Product


@dataclass
class BundleComponentDemandRow:
    bundle_id: int
    bundle_name: str
    bundle_qty_forecast: float
    product_id: int
    product_name: str
    sku: Optional[str]
    qty_per_bundle: float
    total_component_qty: float
    recommendation: str


def _recent_bundle_velocity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    bundle_id: int,
    period_days: int,
) -> float:
    since = datetime.utcnow() - timedelta(days=max(1, period_days))
    total = (
        db.query(func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            OrderItem.is_bundle_parent.is_(True),
            OrderItem.source_bundle_id == int(bundle_id),
            func.coalesce(Order.created_at, Order.order_date) >= since,
        )
        .scalar()
    )
    return float(total or 0)


def build_bundle_replenishment_forecast(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    bundle_qty_forecast: Optional[dict[int, float]] = None,
    horizon_weeks: float = 1.0,
    velocity_period_days: int = 30,
) -> list[BundleComponentDemandRow]:
    """
    Forecast component demand from bundle qty.

    Example: 100 bundles × (2 deodorant + 1 shampoo) → 200 + 100 component units.
    Uses explicit ``bundle_qty_forecast`` or recent sales velocity × horizon_weeks.
    """
    bundles = (
        db.query(Bundle)
        .filter(Bundle.tenant_id == int(tenant_id), Bundle.deleted_at.is_(None), Bundle.active.is_(True))
        .all()
    )
    out: list[BundleComponentDemandRow] = []
    forecast_map = bundle_qty_forecast or {}

    for b in bundles:
        bid = int(b.id)
        if bid in forecast_map:
            qty = float(forecast_map[bid])
        else:
            sold = _recent_bundle_velocity(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                bundle_id=bid,
                period_days=velocity_period_days,
            )
            weekly = sold / max(1.0, velocity_period_days / 7.0)
            qty = round(weekly * max(0.1, horizon_weeks), 2)
        if qty <= 1e-9:
            continue
        items = list(b.items or [])
        if not items:
            continue
        pids = {int(it.product_id) for it in items}
        products = {int(p.id): p for p in db.query(Product).filter(Product.id.in_(list(pids))).all()}
        for it in items:
            pid = int(it.product_id)
            p = products.get(pid)
            per = float(it.quantity or 0)
            total = round(qty * per, 2)
            if total <= 0:
                continue
            out.append(
                BundleComponentDemandRow(
                    bundle_id=bid,
                    bundle_name=str(b.name or f"Bundle #{bid}"),
                    bundle_qty_forecast=qty,
                    product_id=pid,
                    product_name=str(getattr(p, "name", None) or f"P{pid}"),
                    sku=(getattr(p, "sku", None) or None),
                    qty_per_bundle=per,
                    total_component_qty=total,
                    recommendation=f"Zapas składnika na {qty:.0f}× bundle — uzupełnij pick-face o {total:.0f} szt.",
                )
            )
    return sorted(out, key=lambda r: (-r.total_component_qty, r.bundle_id, r.product_id))
