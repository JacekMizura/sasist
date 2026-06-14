"""P4.15 — Bundle complaints: snapshot tree + settlement decisions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from sqlalchemy.orm import Session

from ...models.complaint_line import ComplaintLine
from ...models.order_item import OrderItem
from .bundle_line_projections import ComplaintLineProjection, complaint_lines
from .bundle_line_resolver import bundle_line_resolver
from .bundle_lot_snapshot_service import lots_for_snapshot
from .bundle_return_service import component_refund_amount

ComplaintDecision = Literal[
    "EXCHANGE_COMPONENT",
    "EXCHANGE_BUNDLE",
    "REFUND_COMPONENT",
    "REFUND_BUNDLE",
    "REPAIR",
]


@dataclass(frozen=True)
class BundleComplaintComponentNode:
    order_line_id: int
    product_id: int
    product_name: str
    eligible_qty: int
    unit_price_snapshot: float
    snapshot_id: Optional[int]
    line_role: str
    lots: tuple[dict, ...] = ()


@dataclass(frozen=True)
class BundleComplaintTreeNode:
    order_line_id: int
    bundle_id: int
    bundle_name: str
    fulfillment_mode: str
    bundle_qty: int
    unit_price_net: float
    components: tuple[BundleComplaintComponentNode, ...]


def build_bundle_complaint_tree(db: Session, order_id: int) -> list[BundleComplaintTreeNode]:
    nodes: list[BundleComplaintTreeNode] = []
    for ctx in bundle_line_resolver.resolve_for_order(db, order_id):
        projections = complaint_lines(ctx)
        price_by_pid = {int(c.component_product_id): float(c.unit_price_snapshot or 0) for c in ctx.components}
        comp_nodes: list[BundleComplaintComponentNode] = []
        for proj in projections:
            snap_id = None
            for comp in ctx.components:
                if int(comp.component_product_id) == int(proj.product_id):
                    snap_id = int(comp.snapshot_id)
                    break
            lot_rows = lots_for_snapshot(db, int(snap_id)) if snap_id else []
            lots = tuple(
                {
                    "lot_number": str(r.lot_number or ""),
                    "lot_id": r.lot_id,
                    "expiry_date": r.expiry_date.isoformat() if r.expiry_date else None,
                    "picked_qty": float(r.picked_qty or 0),
                }
                for r in lot_rows
                if (r.lot_number or "").strip()
            )
            comp_nodes.append(
                BundleComplaintComponentNode(
                    order_line_id=int(proj.order_line_id),
                    product_id=int(proj.product_id),
                    product_name=f"P{proj.product_id}",
                    eligible_qty=int(proj.eligible_qty),
                    unit_price_snapshot=price_by_pid.get(int(proj.product_id), 0.0),
                    snapshot_id=snap_id,
                    line_role=str(proj.line_role),
                    lots=lots,
                )
            )
        nodes.append(
            BundleComplaintTreeNode(
                order_line_id=int(ctx.order_line_id),
                bundle_id=int(ctx.bundle_id),
                bundle_name=str(ctx.bundle_name),
                fulfillment_mode=str(ctx.fulfillment_mode),
                bundle_qty=int(ctx.bundle_qty),
                unit_price_net=float(ctx.pricing.commercial_unit_price_net),
                components=tuple(comp_nodes),
            )
        )
    return nodes


def settlement_amount_for_decision(
    *,
    decision: ComplaintDecision,
    tree_node: BundleComplaintTreeNode,
    component: Optional[BundleComplaintComponentNode],
    qty: int,
) -> float:
    """Kwota rozliczenia wyłącznie ze snapshotu."""
    q = max(0, int(qty))
    if q <= 0:
        return 0.0
    if decision in ("EXCHANGE_COMPONENT", "EXCHANGE_BUNDLE", "REPAIR"):
        return 0.0
    if decision == "REFUND_BUNDLE":
        return component_refund_amount(unit_price_snapshot=tree_node.unit_price_net, accepted_qty=q)
    if component is None:
        return 0.0
    return component_refund_amount(unit_price_snapshot=component.unit_price_snapshot, accepted_qty=q)


def apply_complaint_settlement(
    db: Session,
    *,
    complaint_line: ComplaintLine,
    decision: ComplaintDecision,
    qty: int,
) -> float:
    oi = db.query(OrderItem).filter(OrderItem.id == int(complaint_line.order_item_id)).first()
    if oi is None:
        return 0.0
    order_id = int(oi.order_id)
    parent_id = int(oi.parent_bundle_order_item_id or oi.id)
    tree = build_bundle_complaint_tree(db, order_id)
    node = next((n for n in tree if n.order_line_id == parent_id or n.order_line_id == int(oi.id)), None)
    if node is None:
        return 0.0
    component = next(
        (c for c in node.components if c.order_line_id == int(complaint_line.order_item_id)),
        None,
    )
    amount = settlement_amount_for_decision(
        decision=decision,
        tree_node=node,
        component=component,
        qty=qty,
    )
    complaint_line.line_decision = {
        "EXCHANGE_COMPONENT": "exchange",
        "EXCHANGE_BUNDLE": "exchange",
        "REFUND_COMPONENT": "reject",
        "REFUND_BUNDLE": "reject",
        "REPAIR": "repair",
    }.get(decision, "repair")
    complaint_line.settlement_type = decision
    complaint_line.settlement_amount = amount
    db.flush()
    return amount
