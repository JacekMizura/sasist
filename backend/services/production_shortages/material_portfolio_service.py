"""Material portfolio analysis — §9 Analiza materiałowa."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_composition import ProductComposition, ProductCompositionLine
from ..production_planning.sales_history_service import bulk_daily_sales_series
from ..reservations.availability_service import warehouse_net_available, warehouse_on_hand, warehouse_reserved_qty
from .queue_service import build_production_shortages_queue


def _depletion_date(*, on_hand: float, reserved: float, daily_usage: float) -> str | None:
    net = max(0.0, on_hand - reserved)
    if daily_usage <= 1e-9:
        return None
    days = int(net / daily_usage)
    if days <= 0:
        return date.today().isoformat()
    return (date.today() + timedelta(days=days)).isoformat()


def build_material_portfolio(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    sales_lookback_days: int = 30,
) -> list[dict[str, Any]]:
    """All BOM components from active manufacturing compositions."""
    compositions = (
        db.query(ProductComposition)
        .options(joinedload(ProductComposition.lines))
        .filter(
            ProductComposition.tenant_id == int(tenant_id),
            ProductComposition.composition_mode == "manufacturing",
            ProductComposition.is_active.is_(True),
        )
        .all()
    )

    usage_by_component: dict[int, set[int]] = {}
    recipe_count: dict[int, int] = {}
    for comp in compositions:
        cid = int(comp.id)
        for ln in comp.lines or []:
            pid = int(ln.component_product_id)
            usage_by_component.setdefault(pid, set()).add(cid)
            recipe_count[pid] = recipe_count.get(pid, 0) + 1

    if not usage_by_component:
        return []

    queue = build_production_shortages_queue(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    blocked_by_component = {
        int(r["component_product_id"]): int(r["blocked_batches_count"]) + int(r["blocked_orders_count"])
        for r in queue
    }

    pids = list(usage_by_component.keys())
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()}
    history = bulk_daily_sales_series(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_ids=pids,
        lookback_days=sales_lookback_days,
    )

    rows: list[dict[str, Any]] = []
    for pid in sorted(pids):
        p = products.get(pid)
        on_hand = warehouse_on_hand(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=pid)
        reserved = warehouse_reserved_qty(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=pid)
        net = warehouse_net_available(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=pid)
        hist = history.get(pid, [])
        daily = sum(hist) / len(hist) if hist else 0.0
        blocked = blocked_by_component.get(pid, 0)
        rows.append(
            {
                "component_product_id": pid,
                "product_name": str(getattr(p, "name", None) or f"Produkt #{pid}"),
                "product_sku": getattr(p, "sku", None) or getattr(p, "symbol", None),
                "product_image_url": getattr(p, "image_url", None),
                "recipe_usage_count": len(usage_by_component.get(pid, set())),
                "recipe_line_references": recipe_count.get(pid, 0),
                "blocked_productions_count": blocked,
                "on_hand_qty": round(on_hand, 4),
                "reserved_qty": round(reserved, 4),
                "available_qty": round(net, 4),
                "forecast_daily_usage": round(daily, 4),
                "forecast_depletion_date": _depletion_date(on_hand=on_hand, reserved=reserved, daily_usage=daily),
            }
        )

    rows.sort(key=lambda r: (-int(r["blocked_productions_count"]), -float(r["forecast_daily_usage"])))
    return rows
