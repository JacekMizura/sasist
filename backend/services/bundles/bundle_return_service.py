"""P4.15 — Bundle returns: tree, component persistence, scenario classification, refund."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional, Sequence

from sqlalchemy.orm import Session

from ...models.order_item import OrderItem
from ...models.order_line_bundle_component import OrderLineBundleComponent
from ...models.return_line_bundle_component import ReturnLineBundleComponent
from ...models.wms_rmz_line import RMZLine
from ..bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from .bundle_line_projections import ReturnLineProjection, return_lines
from .bundle_line_resolver import bundle_line_resolver
from .bundle_lot_snapshot_service import lots_for_snapshot

BundleReturnScenario = Literal[
    "FULL_BUNDLE",
    "PARTIAL_BUNDLE",
    "SINGLE_COMPONENT",
    "INCOMPLETE",
    "DAMAGED",
]

BundleReturnStatus = Literal["OK", "PARTIAL_BUNDLE_RETURN", "REJECTED"]


@dataclass(frozen=True)
class BundleReturnComponentNode:
    snapshot_id: int
    order_line_id: int
    component_product_id: int
    component_name: str
    sku: Optional[str]
    sold_qty: int
    unit_price_snapshot: float
    already_returned_qty: int
    max_returnable_qty: int
    line_role: str
    lots: tuple[dict, ...] = ()


@dataclass(frozen=True)
class BundleReturnTreeNode:
    order_line_id: int
    bundle_id: int
    bundle_name: str
    fulfillment_mode: str
    bundle_qty: int
    unit_price_net: float
    components: tuple[BundleReturnComponentNode, ...]
    is_stock_sku: bool


@dataclass
class BundleComponentReturnIn:
    snapshot_id: int
    returned_qty: int
    accepted_qty: int = 0
    decision: Optional[str] = None
    lot_trace_json: Optional[str] = None


def component_refund_amount(*, unit_price_snapshot: float, accepted_qty: int) -> float:
    """Refund wyłącznie ze snapshotu — nigdy z aktualnej ceny katalogowej."""
    if accepted_qty <= 0:
        return 0.0
    return round(float(unit_price_snapshot) * int(accepted_qty), 2)


def _returned_qty_by_snapshot(db: Session, order_id: int, exclude_rmz_line_id: int | None = None) -> dict[int, int]:
    q = (
        db.query(
            ReturnLineBundleComponent.order_line_bundle_component_id,
            ReturnLineBundleComponent.returned_qty,
        )
        .join(RMZLine, RMZLine.id == ReturnLineBundleComponent.return_line_id)
        .join(OrderItem, OrderItem.id == RMZLine.order_item_id)
        .filter(OrderItem.order_id == int(order_id))
    )
    if exclude_rmz_line_id is not None:
        q = q.filter(RMZLine.id != int(exclude_rmz_line_id))
    out: dict[int, int] = {}
    for snap_id, qty in q.all():
        if snap_id is None:
            continue
        out[int(snap_id)] = out.get(int(snap_id), 0) + int(qty or 0)
    return out


def _lots_dicts_for_snapshot(db: Session, snapshot_id: int) -> tuple[dict, ...]:
    rows = lots_for_snapshot(db, int(snapshot_id))
    return tuple(
        {
            "lot_number": str(r.lot_number or ""),
            "lot_id": r.lot_id,
            "expiry_date": r.expiry_date.isoformat() if r.expiry_date else None,
            "picked_qty": float(r.picked_qty or 0),
        }
        for r in rows
        if (r.lot_number or "").strip()
    )


def _projection_to_component_node(
    proj: ReturnLineProjection,
    *,
    already: int,
) -> BundleReturnComponentNode:
    sold = int(proj.quantity)
    max_ret = max(0, sold - int(already))
    return BundleReturnComponentNode(
        snapshot_id=int(proj.component_snapshot_id or 0),
        order_line_id=int(proj.order_line_id),
        component_product_id=int(proj.product_id),
        component_name=f"P{proj.product_id}",
        sku=None,
        sold_qty=sold,
        unit_price_snapshot=float(proj.unit_price_net),
        already_returned_qty=int(already),
        max_returnable_qty=max_ret,
        line_role=str(proj.line_role),
    )


def build_bundle_return_tree(db: Session, order_id: int) -> list[BundleReturnTreeNode]:
    """Drzewo zwrotu bundle dla zamówienia — wyłącznie snapshot (resolver)."""
    already = _returned_qty_by_snapshot(db, order_id)
    nodes: list[BundleReturnTreeNode] = []
    for ctx in bundle_line_resolver.resolve_for_order(db, order_id):
        projections = return_lines(ctx)
        header = projections[0]
        children: list[BundleReturnComponentNode] = []
        for proj in projections[1:]:
            if proj.line_role not in ("component", "stock_sku"):
                continue
            snap_id = int(proj.component_snapshot_id or 0)
            snap_row = None
            if snap_id:
                snap_row = db.query(OrderLineBundleComponent).filter(OrderLineBundleComponent.id == snap_id).first()
            name = str(snap_row.product_name_snapshot) if snap_row else f"P{proj.product_id}"
            sku = str(snap_row.sku_snapshot) if snap_row and snap_row.sku_snapshot else None
            node = _projection_to_component_node(proj, already=already.get(snap_id, 0))
            children.append(
                BundleReturnComponentNode(
                    snapshot_id=node.snapshot_id,
                    order_line_id=node.order_line_id,
                    component_product_id=node.component_product_id,
                    component_name=name,
                    sku=sku,
                    sold_qty=node.sold_qty,
                    unit_price_snapshot=node.unit_price_snapshot,
                    already_returned_qty=node.already_returned_qty,
                    max_returnable_qty=node.max_returnable_qty,
                    line_role=node.line_role,
                    lots=_lots_dicts_for_snapshot(db, snap_id) if snap_id else (),
                )
            )
        nodes.append(
            BundleReturnTreeNode(
                order_line_id=int(ctx.order_line_id),
                bundle_id=int(ctx.bundle_id),
                bundle_name=str(ctx.bundle_name),
                fulfillment_mode=str(ctx.fulfillment_mode),
                bundle_qty=int(ctx.bundle_qty),
                unit_price_net=float(header.unit_price_net),
                components=tuple(children),
                is_stock_sku=ctx.fulfillment_mode == STOCK_PRODUCTION,
            )
        )
    return nodes


def classify_bundle_return_scenario(
    *,
    fulfillment_mode: str,
    components: Sequence[BundleComponentReturnIn],
    expected_components: Sequence[BundleReturnComponentNode],
    has_damage: bool = False,
) -> BundleReturnScenario:
    if has_damage:
        return "DAMAGED"
    if not components:
        return "PARTIAL_BUNDLE"
    expected_by_snap = {c.snapshot_id: c for c in expected_components if c.snapshot_id}
    returned_snaps = {c.snapshot_id for c in components if c.returned_qty > 0}
    any_return = any(int(c.returned_qty) > 0 for c in components)
    missing_components = [
        exp
        for exp in expected_components
        if exp.snapshot_id
        and not any(int(c.snapshot_id) == int(exp.snapshot_id) and int(c.returned_qty) > 0 for c in components)
    ]
    if any_return and missing_components:
        for c in components:
            if int(c.returned_qty) <= 0:
                continue
            exp = expected_by_snap.get(int(c.snapshot_id))
            if exp is not None and int(c.returned_qty) < int(exp.sold_qty):
                return "PARTIAL_BUNDLE"
        return "INCOMPLETE"
    if fulfillment_mode == STOCK_PRODUCTION and len(returned_snaps) <= 1:
        only = components[0] if components else None
        if only and only.returned_qty > 0:
            return "FULL_BUNDLE" if only.returned_qty >= sum(c.sold_qty for c in expected_components) else "PARTIAL_BUNDLE"
    if len(returned_snaps) == 1 and len(expected_by_snap) > 1:
        return "SINGLE_COMPONENT"
    all_full = True
    any_return = False
    for exp in expected_components:
        sel = next((c for c in components if c.snapshot_id == exp.snapshot_id), None)
        ret = int(sel.returned_qty) if sel else 0
        if ret > 0:
            any_return = True
        if ret < exp.sold_qty:
            all_full = False
    if not any_return:
        return "PARTIAL_BUNDLE"
    if all_full:
        return "FULL_BUNDLE"
    return "PARTIAL_BUNDLE"


def resolve_bundle_return_status(
    *,
    scenario: BundleReturnScenario,
    components: Sequence[ReturnLineBundleComponent],
) -> BundleReturnStatus:
    if scenario == "INCOMPLETE":
        return "PARTIAL_BUNDLE_RETURN"
    if not components:
        return "OK"
    if all(int(c.accepted_qty or 0) <= 0 and (c.decision or "").upper() == "REJECTED" for c in components):
        return "REJECTED"
    expected_total = sum(int(c.returned_qty or 0) for c in components)
    accepted_total = sum(int(c.accepted_qty or 0) for c in components)
    if accepted_total < expected_total:
        return "PARTIAL_BUNDLE_RETURN"
    return "OK"


def upsert_bundle_component_returns(
    db: Session,
    *,
    rmz_line: RMZLine,
    selections: Sequence[BundleComponentReturnIn],
    snapshot_by_id: dict[int, OrderLineBundleComponent],
) -> list[ReturnLineBundleComponent]:
    db.query(ReturnLineBundleComponent).filter(
        ReturnLineBundleComponent.return_line_id == int(rmz_line.id)
    ).delete(synchronize_session=False)
    rows: list[ReturnLineBundleComponent] = []
    for sel in selections:
        if int(sel.returned_qty) <= 0:
            continue
        snap = snapshot_by_id.get(int(sel.snapshot_id))
        unit_px = float(snap.unit_price_net_snapshot or 0) if snap else 0.0
        accepted = int(sel.accepted_qty) if sel.accepted_qty is not None else int(sel.returned_qty)
        refund = component_refund_amount(unit_price_snapshot=unit_px, accepted_qty=accepted)
        row = ReturnLineBundleComponent(
            return_line_id=int(rmz_line.id),
            order_line_bundle_component_id=int(sel.snapshot_id),
            component_product_id=int(snap.product_id) if snap and snap.product_id else None,
            returned_qty=int(sel.returned_qty),
            accepted_qty=accepted,
            refund_amount=refund,
            decision=(str(sel.decision).strip()[:24] if sel.decision else None),
            lot_trace_json=sel.lot_trace_json,
        )
        db.add(row)
        rows.append(row)
    db.flush()
    return rows


def apply_bundle_return_metadata(
    db: Session,
    *,
    rmz_line: RMZLine,
    order_id: int,
    selections: Sequence[BundleComponentReturnIn],
    has_damage: bool = False,
) -> tuple[BundleReturnScenario, BundleReturnStatus]:
    ctx = bundle_line_resolver.resolve_parent_line(db, int(rmz_line.order_item_id))
    if ctx is None:
        return "PARTIAL_BUNDLE", "OK"
    tree = build_bundle_return_tree(db, order_id)
    node = next((n for n in tree if n.order_line_id == int(rmz_line.order_item_id)), None)
    expected = list(node.components) if node else []
    scenario = classify_bundle_return_scenario(
        fulfillment_mode=str(ctx.fulfillment_mode),
        components=selections,
        expected_components=expected,
        has_damage=has_damage,
    )
    snap_ids = [int(s.snapshot_id) for s in selections if s.snapshot_id]
    snaps = {
        int(r.id): r
        for r in db.query(OrderLineBundleComponent).filter(OrderLineBundleComponent.id.in_(snap_ids)).all()
    } if snap_ids else {}
    comp_rows = upsert_bundle_component_returns(db, rmz_line=rmz_line, selections=selections, snapshot_by_id=snaps)
    status = resolve_bundle_return_status(scenario=scenario, components=comp_rows)
    rmz_line.bundle_return_scenario = scenario
    rmz_line.bundle_return_status = status
    db.flush()
    return scenario, status


def compute_rmz_line_refund_from_snapshot(db: Session, rmz_line: RMZLine) -> float:
    """Suma refund_amount ze składników bundle; fallback 0 gdy brak wierszy."""
    rows = (
        db.query(ReturnLineBundleComponent)
        .filter(ReturnLineBundleComponent.return_line_id == int(rmz_line.id))
        .all()
    )
    if rows:
        return round(sum(float(r.refund_amount or 0) for r in rows), 2)
    ctx = bundle_line_resolver.resolve_parent_line(db, int(rmz_line.order_item_id))
    if ctx is None or not bool(getattr(
        db.query(OrderItem).filter(OrderItem.id == rmz_line.order_item_id).first(),
        "is_bundle_parent",
        False,
    )):
        return 0.0
    aq = int(rmz_line.accepted_qty or rmz_line.quantity or 0)
    if aq <= 0:
        return 0.0
    if ctx.fulfillment_mode == STOCK_PRODUCTION:
        return component_refund_amount(
            unit_price_snapshot=float(ctx.pricing.commercial_unit_price_net),
            accepted_qty=aq,
        )
    return 0.0


def bundle_component_returns_for_line(db: Session, rmz_line_id: int) -> list[ReturnLineBundleComponent]:
    return (
        db.query(ReturnLineBundleComponent)
        .filter(ReturnLineBundleComponent.return_line_id == int(rmz_line_id))
        .order_by(ReturnLineBundleComponent.id.asc())
        .all()
    )


def is_bundle_parent_rmz_line(db: Session, rmz_line: RMZLine) -> bool:
    oi = db.query(OrderItem).filter(OrderItem.id == int(rmz_line.order_item_id)).first()
    return oi is not None and bool(getattr(oi, "is_bundle_parent", False))
