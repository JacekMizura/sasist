"""Aggregated production shortages queue — blocked batches and MOs."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_composition import ProductionBatch, ProductionBatchLine
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
        .options(joinedload(ProductionBatch.lines).joinedload(ProductionBatchLine.product))
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
                    "required_qty_sum": 0.0,
                    "blocked_batch_ids": set(),
                    "blocked_order_ids": set(),
                    "finished_products": [],
                    "priority": "MEDIUM",
                },
            )
            slot["blocked_batch_ids"].add(int(batch.id))
            slot["required_qty_sum"] = max(float(slot["required_qty_sum"]), float(qty))
            slot["shortage_qty"] = max(float(slot["shortage_qty"]), float(qty))
            for ln in batch.lines or []:
                if ln.product:
                    fp = {
                        "product_id": int(ln.product_id),
                        "product_name": str(getattr(ln.product, "name", None) or ""),
                        "product_sku": getattr(ln.product, "sku", None),
                        "product_image_url": getattr(ln.product, "image_url", None),
                        "batch_id": int(batch.id),
                        "kind": "batch",
                    }
                    if fp not in slot["finished_products"]:
                        slot["finished_products"].append(fp)

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
        fp = {
            "product_id": int(order.product_id) if order.product_id else None,
            "product_name": str(getattr(order, "product_name_snapshot", None) or order.number or ""),
            "product_sku": None,
            "product_image_url": None,
            "order_id": int(order.id),
            "kind": "order",
        }
        if order.product_id:
            p = db.query(Product).filter(Product.id == int(order.product_id)).first()
            if p:
                fp["product_name"] = str(p.name or fp["product_name"])
                fp["product_sku"] = p.sku or p.symbol
                fp["product_image_url"] = p.image_url
        for sh in shortages:
            pid = int(sh.component_product_id)
            slot = agg.setdefault(
                pid,
                {
                    "component_product_id": pid,
                    "shortage_qty": 0.0,
                    "required_qty_sum": 0.0,
                    "blocked_batch_ids": set(),
                    "blocked_order_ids": set(),
                    "finished_products": [],
                    "priority": "MEDIUM",
                },
            )
            slot["blocked_order_ids"].add(int(order.id))
            slot["shortage_qty"] = max(float(slot["shortage_qty"]), float(sh.missing))
            slot["required_qty_sum"] = max(float(slot["required_qty_sum"]), float(sh.required))
            if fp.get("product_id") and fp not in slot["finished_products"]:
                slot["finished_products"].append(fp)

    if not agg:
        return []

    component_totals = {pid: float(v["required_qty_sum"] or v["shortage_qty"] or 1.0) for pid, v in agg.items()}
    details = analyze_component_requirements(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, component_totals=component_totals
    )
    detail_by_pid = {int(d["component_product_id"]): d for d in details}

    out: list[dict[str, Any]] = []
    for pid, slot in agg.items():
        det = detail_by_pid.get(pid, {})
        missing = float(det.get("missing_qty") or slot["shortage_qty"])
        batch_count = len(slot["blocked_batch_ids"])
        order_count = len(slot["blocked_order_ids"])
        priority = "CRITICAL" if batch_count + order_count >= 3 else "HIGH" if missing > 0 else "MEDIUM"
        out.append(
            {
                "component_product_id": pid,
                "product_name": str(det.get("product_name") or f"Produkt #{pid}"),
                "product_sku": det.get("product_sku"),
                "product_image_url": det.get("product_image_url"),
                "required_qty": det.get("required_qty") or slot["required_qty_sum"],
                "on_hand_qty": det.get("on_hand_qty"),
                "reserved_qty": det.get("reserved_qty"),
                "available_qty": det.get("available_qty"),
                "missing_qty": round(missing, 4),
                "blocked_batches_count": batch_count,
                "blocked_orders_count": order_count,
                "blocked_batch_ids": sorted(slot["blocked_batch_ids"]),
                "blocked_order_ids": sorted(slot["blocked_order_ids"]),
                "finished_products": slot["finished_products"],
                "priority": priority,
                "locations": det.get("locations") or [],
                "expected_availability_date": det.get("expected_availability_date"),
                "substitute_proposals": det.get("substitute_proposals") or [],
            }
        )
    out.sort(key=lambda r: (_priority_rank(str(r["priority"])), -float(r["missing_qty"])))
    return out
