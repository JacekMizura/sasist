"""P4.16 — Bundle recall report (MVP: read-only, no automatic actions)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from .bundle_traceability_service import (
    LotTraceCustomerHit,
    lot_to_bundles,
    lot_to_customers,
    lot_to_orders,
)


@dataclass(frozen=True)
class BundleRecallReport:
    lot_number: str
    bundles: list[dict]
    orders: list[dict]
    customers: list[dict]
    summary: dict


def build_bundle_recall_report(
    db: Session,
    lot_number: str,
    *,
    tenant_id: int | None = None,
) -> BundleRecallReport:
    """
    Recall MVP: partia → zamówienia → klienci (+ bundle context).
    No side effects — report only.
    """
    ln = (lot_number or "").strip()
    bundle_hits = lot_to_bundles(db, ln, tenant_id=tenant_id)
    order_hits = lot_to_orders(db, ln, tenant_id=tenant_id)
    customer_hits = lot_to_customers(db, ln, tenant_id=tenant_id)

    return BundleRecallReport(
        lot_number=ln,
        bundles=[
            {
                "bundle_id": h.bundle_id,
                "bundle_name": h.bundle_name,
                "order_id": h.order_id,
                "order_number": h.order_number,
                "product_id": h.product_id,
                "product_name": h.product_name,
                "picked_qty": h.picked_qty,
            }
            for h in bundle_hits
        ],
        orders=order_hits,
        customers=[
            {
                "order_id": c.order_id,
                "order_number": c.order_number,
                "customer_name": c.customer_name,
                "customer_email": c.customer_email,
                "customer_phone": c.customer_phone,
                "bundle_name": c.bundle_name,
                "product_name": c.product_name,
                "picked_qty": c.picked_qty,
            }
            for c in customer_hits
        ],
        summary={
            "lot_number": ln,
            "bundle_hit_count": len(bundle_hits),
            "order_count": len(order_hits),
            "customer_count": len(customer_hits),
            "total_picked_qty": round(
                sum(float(h.picked_qty) for h in bundle_hits),
                4,
            ),
        },
    )
