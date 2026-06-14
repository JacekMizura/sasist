"""P4.15 — Read-only bundle return / complaint / refund reports."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from ...models.order_item import OrderItem
from ...models.return_line_bundle_component import ReturnLineBundleComponent
from ...models.wms_order_return import WmsOrderReturn
from ...models.wms_rmz_line import RMZLine
from .bundle_line_resolver import bundle_line_resolver
from .bundle_return_service import compute_rmz_line_refund_from_snapshot


@dataclass
class BundleReturnReportRow:
    rmz_id: int
    rmz_number: Optional[str]
    order_id: int
    bundle_order_line_id: int
    bundle_name: str
    fulfillment_mode: str
    scenario: Optional[str]
    status: Optional[str]
    refund_total: float
    component_count: int


@dataclass
class BundleComponentReturnReportRow:
    rmz_id: int
    return_line_id: int
    snapshot_id: Optional[int]
    product_id: Optional[int]
    returned_qty: int
    accepted_qty: int
    refund_amount: float
    decision: Optional[str]


@dataclass
class BundleMarginAfterReturnsRow:
    order_id: int
    bundle_order_line_id: int
    revenue_net: float
    returned_refund_net: float
    margin_after_returns: Optional[float]


def bundle_returns_report(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: Optional[int] = None,
) -> list[BundleReturnReportRow]:
    q = (
        db.query(WmsOrderReturn, RMZLine, OrderItem)
        .join(RMZLine, RMZLine.rmz_id == WmsOrderReturn.id)
        .join(OrderItem, OrderItem.id == RMZLine.order_item_id)
        .filter(
            WmsOrderReturn.tenant_id == int(tenant_id),
            WmsOrderReturn.warehouse_id == int(warehouse_id),
            OrderItem.is_bundle_parent.is_(True),
        )
    )
    if order_id is not None:
        q = q.filter(WmsOrderReturn.order_id == int(order_id))
    rows: list[BundleReturnReportRow] = []
    seen: set[int] = set()
    for rmz, ln, oi in q.all():
        if int(ln.id) in seen:
            continue
        seen.add(int(ln.id))
        ctx = bundle_line_resolver.resolve_parent_line(db, int(oi.id))
        comp_count = (
            db.query(ReturnLineBundleComponent)
            .filter(ReturnLineBundleComponent.return_line_id == int(ln.id))
            .count()
        )
        rows.append(
            BundleReturnReportRow(
                rmz_id=int(rmz.id),
                rmz_number=getattr(rmz, "rmz_number", None),
                order_id=int(rmz.order_id),
                bundle_order_line_id=int(oi.id),
                bundle_name=str(ctx.bundle_name) if ctx else "",
                fulfillment_mode=str(ctx.fulfillment_mode) if ctx else "",
                scenario=getattr(ln, "bundle_return_scenario", None),
                status=getattr(ln, "bundle_return_status", None),
                refund_total=compute_rmz_line_refund_from_snapshot(db, ln),
                component_count=int(comp_count),
            )
        )
    return rows


def bundle_component_returns_report(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> list[BundleComponentReturnReportRow]:
    q = (
        db.query(ReturnLineBundleComponent, RMZLine, WmsOrderReturn)
        .join(RMZLine, RMZLine.id == ReturnLineBundleComponent.return_line_id)
        .join(WmsOrderReturn, WmsOrderReturn.id == RMZLine.rmz_id)
        .filter(
            WmsOrderReturn.tenant_id == int(tenant_id),
            WmsOrderReturn.warehouse_id == int(warehouse_id),
        )
        .order_by(ReturnLineBundleComponent.id.asc())
    )
    return [
        BundleComponentReturnReportRow(
            rmz_id=int(rmz.id),
            return_line_id=int(ln.id),
            snapshot_id=int(cr.order_line_bundle_component_id) if cr.order_line_bundle_component_id else None,
            product_id=int(cr.component_product_id) if cr.component_product_id else None,
            returned_qty=int(cr.returned_qty or 0),
            accepted_qty=int(cr.accepted_qty or 0),
            refund_amount=float(cr.refund_amount or 0),
            decision=cr.decision,
        )
        for cr, ln, rmz in q.all()
    ]


def margin_after_bundle_returns(db: Session, order_id: int) -> list[BundleMarginAfterReturnsRow]:
    out: list[BundleMarginAfterReturnsRow] = []
    for ctx in bundle_line_resolver.resolve_for_order(db, order_id):
        from .bundle_line_projections import margin_from_context

        margin = margin_from_context(ctx)
        refund = 0.0
        parent_lines = (
            db.query(RMZLine)
            .join(WmsOrderReturn, WmsOrderReturn.id == RMZLine.rmz_id)
            .filter(
                WmsOrderReturn.order_id == int(order_id),
                RMZLine.order_item_id == int(ctx.order_line_id),
            )
            .all()
        )
        for ln in parent_lines:
            refund += compute_rmz_line_refund_from_snapshot(db, ln)
        revenue = float(margin.revenue_net)
        margin_after = round(revenue - refund - (float(margin.cost_net or 0)), 2) if margin.cost_net is not None else None
        out.append(
            BundleMarginAfterReturnsRow(
                order_id=int(order_id),
                bundle_order_line_id=int(ctx.order_line_id),
                revenue_net=revenue,
                returned_refund_net=round(refund, 2),
                margin_after_returns=margin_after,
            )
        )
    return out
