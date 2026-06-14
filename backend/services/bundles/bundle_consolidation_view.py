"""P4.17 — Consolidation rack view: ON_DEMAND components vs STOCK finished bundle."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from ...models.order import Order
from ..bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from .bundle_barcode_resolver import bundle_internal_code
from .bundle_line_resolver import bundle_line_resolver


@dataclass(frozen=True)
class ConsolidationRackBundleRow:
    order_id: int
    order_number: str
    bundle_id: int
    bundle_name: str
    fulfillment_mode: str
    display_mode: str
    ean: Optional[str]
    sku: Optional[str]
    quantity: float
    product_id: Optional[int]
    product_name: Optional[str]
    shelf_label: Optional[str]


def consolidation_rack_bundle_rows(
    db: Session,
    *,
    order_id: int,
    shelf_label: str | None = None,
) -> list[ConsolidationRackBundleRow]:
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if order is None:
        return []
    order_number = str(order.number or f"#{order.id}")
    rows: list[ConsolidationRackBundleRow] = []
    for ctx in bundle_line_resolver.resolve_for_order(db, int(order_id)):
        b = getattr(ctx.parent_order_item, "source_bundle", None)
        ean = (getattr(b, "ean", None) or "").strip() or None if b else None
        sku = (getattr(b, "sku", None) or "").strip() or None if b else None
        if b and not ean:
            ic = bundle_internal_code(b)
            sku = sku or ic
        mode = str(ctx.fulfillment_mode)
        if mode == STOCK_PRODUCTION:
            linked = ctx.linked_product_id or (int(ctx.parent_order_item.product_id) if ctx.parent_order_item else None)
            pname = None
            if linked and ctx.components:
                pname = ctx.components[0].component_name
            rows.append(
                ConsolidationRackBundleRow(
                    order_id=int(order_id),
                    order_number=order_number,
                    bundle_id=int(ctx.bundle_id),
                    bundle_name=str(ctx.bundle_name),
                    fulfillment_mode=STOCK_PRODUCTION,
                    display_mode="stock_finished_bundle",
                    ean=ean,
                    sku=sku,
                    quantity=float(ctx.bundle_qty),
                    product_id=int(linked) if linked else None,
                    product_name=pname or str(ctx.bundle_name),
                    shelf_label=shelf_label,
                )
            )
        else:
            for comp in ctx.components:
                rows.append(
                    ConsolidationRackBundleRow(
                        order_id=int(order_id),
                        order_number=order_number,
                        bundle_id=int(ctx.bundle_id),
                        bundle_name=str(ctx.bundle_name),
                        fulfillment_mode=ON_DEMAND_ASSEMBLY,
                        display_mode="on_demand_component",
                        ean=comp.ean,
                        sku=comp.sku,
                        quantity=float(comp.required_qty_total),
                        product_id=int(comp.component_product_id),
                        product_name=str(comp.component_name),
                        shelf_label=shelf_label,
                    )
                )
    return rows
