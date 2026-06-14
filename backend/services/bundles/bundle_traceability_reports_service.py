"""P4.16 — Bundle traceability reports."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from ...models.order import Order
from ...models.order_line_bundle_component_lot import OrderLineBundleComponentLot
from .bundle_traceability_service import (
    _customer_from_order,
    bundle_lot_tree_for_order,
    lot_to_bundles,
)


@dataclass(frozen=True)
class LotTraceReportRow:
    lot_number: str
    bundle_id: int
    bundle_name: str
    order_id: int
    order_number: str
    customer_name: str
    product_id: int
    product_name: str
    picked_qty: float
    expiry_date: Optional[str]


def lot_trace_report(
    db: Session,
    lot_number: str,
    *,
    tenant_id: int | None = None,
) -> list[LotTraceReportRow]:
    """Raport: Partia → Bundle → Zamówienie → Klient."""
    rows: list[LotTraceReportRow] = []
    for hit in lot_to_bundles(db, lot_number, tenant_id=tenant_id):
        order = (
            db.query(Order)
            .options(joinedload(Order.customer))
            .filter(Order.id == int(hit.order_id))
            .first()
        )
        cname = _customer_from_order(order)[0] if order else f"#{hit.order_id}"
        rows.append(
            LotTraceReportRow(
                lot_number=str(hit.lot_number),
                bundle_id=int(hit.bundle_id),
                bundle_name=str(hit.bundle_name),
                order_id=int(hit.order_id),
                order_number=str(hit.order_number),
                customer_name=cname,
                product_id=int(hit.product_id),
                product_name=str(hit.product_name),
                picked_qty=float(hit.picked_qty),
                expiry_date=hit.expiry_date,
            )
        )
    return rows


def bundle_lots_report(db: Session, order_id: int) -> list[dict]:
    """Raport: Bundle → Składniki → Partie."""
    trees = bundle_lot_tree_for_order(db, int(order_id))
    return [
        {
            "bundle_id": n.bundle_id,
            "bundle_name": n.bundle_name,
            "parent_order_line_id": n.parent_order_line_id,
            "fulfillment_mode": n.fulfillment_mode,
            "components": [
                {
                    "snapshot_id": c.snapshot_id,
                    "product_id": c.product_id,
                    "product_name": c.product_name,
                    "lots": list(c.lots),
                }
                for c in n.components
            ],
        }
        for n in trees
    ]
