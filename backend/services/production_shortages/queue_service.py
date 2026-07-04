"""Aggregated production shortages queue — blocked batches and MOs."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_composition import ProductionBatch
from ...models.production import ProductionOrder
from ..production_batch_service import _aggregate_batch_components, _batch_has_shortages
from ..production_order_service import validate_stock_shortages
from .analysis_service import analyze_component_requirements


def _priority_rank(label: str) -> int:
    return {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get(str(label or "").upper(), 9)


def build_production_shortages_queue(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> list[dict[str, Any]]:
    agg: dict[int, dict[str, Any]] = {}

    batches = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines))
        .filter(
            ProductionBatch.tenant_id == int(tenant_id),
            ProductionBatch.warehouse_id == int(warehouse_id),
            ProductionBatch.status.in_(("draft", "planned", "collecting")),
        )
        .all()
    )
    for batch in batches:
        if not _batch_has_shortages(db, batch):
            continue
        totals = _aggregate_batch_components(batch)
        for pid, qty in totals.items():
            slot = agg.setdefault(
                int(pid),
                {
                    "component_product_id": int(pid),
                    "shortage_qty": 0.0,
                    "blocked_batch_ids": set(),
                    "blocked_order_ids": set(),
                    "priority": "MEDIUM",
                },
            )
            slot["blocked_batch_ids"].add(int(batch.id))
            slot["shortage_qty"] = max(float(slot["shortage_qty"]), 0.0)

    orders = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(
            ProductionOrder.tenant_id == int(tenant_id),
            ProductionOrder.warehouse_id == int(warehouse_id),
            ProductionOrder.status.in_(("draft", "planned", "collecting")),
        )
        .all()
    )
    for order in orders:
        shortages = validate_stock_shortages(db, order)
        if not shortages:
            continue
        for sh in shortages:
            pid = int(sh.component_product_id)
            slot = agg.setdefault(
                pid,
                {
                    "component_product_id": pid,
                    "shortage_qty": 0.0,
                    "blocked_batch_ids": set(),
                    "blocked_order_ids": set(),
                    "priority": "MEDIUM",
                },
            )
            slot["blocked_order_ids"].add(int(order.id))
            slot["shortage_qty"] = max(float(slot["shortage_qty"]), float(sh.missing))

    if not agg:
        return []

    pids = list(agg.keys())
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()}
    component_totals = {pid: float(v["shortage_qty"]) or 1.0 for pid, v in agg.items()}
    details = analyze_component_requirements(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, component_totals=component_totals
    )
    detail_by_pid = {int(d["component_product_id"]): d for d in details}

    out: list[dict[str, Any]] = []
    for pid, slot in agg.items():
        p = products.get(pid)
        det = detail_by_pid.get(pid, {})
        missing = float(det.get("missing_qty") or slot["shortage_qty"])
        batch_count = len(slot["blocked_batch_ids"])
        order_count = len(slot["blocked_order_ids"])
        priority = "CRITICAL" if batch_count + order_count >= 3 else "HIGH" if missing > 0 else "MEDIUM"
        out.append(
            {
                "component_product_id": pid,
                "product_name": str(det.get("product_name") or (p.name if p else f"Produkt #{pid}")),
                "product_sku": det.get("product_sku") or (p.sku if p else None),
                "missing_qty": round(missing, 4),
                "required_qty": det.get("required_qty"),
                "available_qty": det.get("available_qty"),
                "blocked_batches_count": batch_count,
                "blocked_orders_count": order_count,
                "blocked_batch_ids": sorted(slot["blocked_batch_ids"]),
                "blocked_order_ids": sorted(slot["blocked_order_ids"]),
                "priority": priority,
                "locations": det.get("locations") or [],
                "expected_availability_date": det.get("expected_availability_date"),
                "substitute_proposals": det.get("substitute_proposals") or [],
            }
        )
    out.sort(key=lambda r: (_priority_rank(str(r["priority"])), -float(r["missing_qty"])))
    return out
