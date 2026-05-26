"""
Purchasing dashboard aggregates: inventory, sales velocity, inbound deliveries.

Uses purchasing_replenish_core for all suggestion / cover / critical math (single source of truth).

Known crash root cause (fixed): ``product_inventory_snapshot_service`` iterated
``DeliveryItem.product_id`` with ``int(pid)`` while carton/WM delivery lines use
``product_id IS NULL`` → TypeError during inbound pipeline aggregation. Mitigation:
filter ``product_id.isnot(None)``, skip nulls in loops, chunk large ``IN`` lists.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inbound_delivery import InboundDelivery
from ..models.product import Product
from ..models.stock_document import StockDocument
from ..models.supplier import Supplier
from . import purchasing_replenish_core as core
from .product_inventory_snapshot_service import inventory_snapshots_for_products


def build_purchasing_dashboard(db: Session, tenant_id: int, warehouse_id: Optional[int]) -> dict:
    sales_map = core.sales_qty_by_product(db, tenant_id, warehouse_id)
    supplier_prices = core.supplier_price_map(db, tenant_id)
    supplier_names = core.supplier_names(db, tenant_id)
    catalog_first = core.catalog_supplier_first(db, tenant_id)

    active_suppliers = (
        db.query(func.count(Supplier.id))
        .filter(Supplier.tenant_id == tenant_id, Supplier.active.is_(True))
        .scalar()
        or 0
    )
    deliveries_pipeline = (
        db.query(func.count(InboundDelivery.id))
        .filter(InboundDelivery.tenant_id == tenant_id, InboundDelivery.status.in_(core.OPEN_DELIVERY_STATUSES))
        .scalar()
        or 0
    )

    candidate_ids = core.gather_dashboard_candidate_ids(db, tenant_id, warehouse_id)
    if not candidate_ids:
        products = []
    else:
        ids_sorted = sorted(int(x) for x in candidate_ids)
        _CHUNK = 400
        products = []
        for i in range(0, len(ids_sorted), _CHUNK):
            part = ids_sorted[i : i + _CHUNK]
            products.extend(
                db.query(Product)
                .filter(Product.tenant_id == tenant_id, Product.deleted_at.is_(None), Product.id.in_(part))
                .all()
            )

    pid_list = [int(p.id) for p in products]
    snaps = inventory_snapshots_for_products(db, tenant_id, warehouse_id, pid_list) if pid_list else {}
    available_map = {pid: float(s["available"]) for pid, s in snaps.items()}
    inbound_map = {pid: float(s["inbound_total"]) for pid, s in snaps.items()}

    metrics: List[core.ProductReplenishMetrics] = [
        core.metrics_from_product(p, available_map, sales_map, inbound_map, catalog_first) for p in products
    ]

    critical_count = 0
    out_7_count = 0
    suggested_lines: List[Tuple[core.ProductReplenishMetrics, float, Optional[float], float]] = []
    suggested_total_value = 0.0

    for m in metrics:
        crit = core.is_critical(m.stock, m.min_total_stock)
        if crit:
            critical_count += 1
        dc = core.days_cover(m.stock, m.avg_daily)
        if dc is not None and 0 < dc <= 7:
            out_7_count += 1

        sq = core.suggested_qty(m)
        bp = core.buy_price(m, supplier_prices)
        est = sq * float(bp or 0.0)
        if sq >= 1.0:
            suggested_lines.append((m, sq, bp, est))
            suggested_total_value += est

    suggested_orders_count = len(suggested_lines)

    crit_sorted = sorted([m for m in metrics if core.is_critical(m.stock, m.min_total_stock)], key=lambda x: x.stock)
    critical_rows = []
    for m in crit_sorted[:10]:
        sup = supplier_names.get(int(m.resolved_supplier_id), None) if m.resolved_supplier_id else None
        critical_rows.append(
            {
                "product_id": m.product_id,
                "product_name": m.name,
                "sku": m.sku,
                "stock": round(m.stock, 3),
                "avg_daily_sales": round(m.avg_daily, 4),
                "days_cover": core.days_cover(m.stock, m.avg_daily),
                "supplier_name": sup,
            }
        )

    suggested_sorted = sorted(suggested_lines, key=lambda t: t[3], reverse=True)[:10]
    suggested_rows = [
        {
            "product_id": m.product_id,
            "product_name": m.name,
            "suggested_qty": float(sq),
            "supplier_name": supplier_names.get(int(m.resolved_supplier_id), None) if m.resolved_supplier_id else None,
            "buy_price": float(bp) if bp is not None else None,
            "estimated_cost": round(float(est), 2),
        }
        for m, sq, bp, est in suggested_sorted
    ]

    recent = (
        db.query(StockDocument, Supplier.name)
        .join(Supplier, Supplier.id == StockDocument.supplier_id)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.document_type == "PZ",
        )
        .order_by(StockDocument.created_at.desc())
        .limit(10)
        .all()
    )
    recent_rows = []
    for d, sup_name in recent:
        doc = f"PZ-{d.id}"
        recent_rows.append(
            {
                "id": int(d.id),
                "document_no": doc,
                "supplier_name": ((sup_name or "").strip()) or "—",
                "status": str(d.status or ""),
                "created_at": d.created_at,
            }
        )

    return {
        "kpis": {
            "critical_products": int(critical_count),
            "out_of_stock_in_7_days": int(out_7_count),
            "suggested_orders_count": int(suggested_orders_count),
            "suggested_purchase_value": round(float(suggested_total_value), 2),
            "active_suppliers": int(active_suppliers),
            "deliveries_in_pipeline": int(deliveries_pipeline),
        },
        "critical_products": critical_rows,
        "suggested_orders": suggested_rows,
        "recent_orders": recent_rows,
    }
