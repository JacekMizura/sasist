"""Pure projections from BundleLineContext — no DB, no live recipe (P4.14)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ...models.order_item import OrderItem, order_item_is_replaced_line
from ..bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from .bundle_line_context import BundleComponentSnapshotView, BundleLineContext


@dataclass(frozen=True)
class CommercialLineProjection:
    order_line_id: int
    product_id: int
    quantity: int
    unit_price_net: float
    line_total_net: float
    bundle_id: int
    bundle_name: str
    is_bundle_parent: bool = True


@dataclass(frozen=True)
class OperationalLineProjection:
    order_line_id: int
    order_id: int
    product_id: int
    quantity: int
    required_stock_disposition: str
    source: str  # component | stock_sku
    bundle_id: Optional[int] = None
    bundle_name: Optional[str] = None
    bundle_mode: Optional[str] = None
    bundle_component_index: Optional[int] = None
    bundle_component_count: Optional[int] = None
    is_bundle_component: bool = False
    parent_bundle_order_line_id: Optional[int] = None


@dataclass(frozen=True)
class WarehouseIssueLineProjection:
    product_id: int
    quantity: int
    order_line_id: int
    issue_type: str  # component | finished_sku


@dataclass(frozen=True)
class MarginLineProjection:
    revenue_net: float
    cost_net: Optional[float]
    margin_amount: Optional[float]
    margin_percent: Optional[float]
    cost_source: str  # snapshot | none


@dataclass(frozen=True)
class ReturnLineProjection:
    order_line_id: int
    product_id: int
    quantity: int
    unit_price_net: float
    line_role: str  # bundle_header | component | stock_sku
    parent_order_line_id: Optional[int]
    component_snapshot_id: Optional[int]


@dataclass(frozen=True)
class ComplaintLineProjection:
    order_line_id: int
    product_id: int
    quantity: int
    eligible_qty: int
    line_role: str


def commercial_lines(ctx: BundleLineContext) -> list[CommercialLineProjection]:
    """Handel: jedna pozycja = zestaw (nagłówek)."""
    parent = ctx.parent_order_item
    return [
        CommercialLineProjection(
            order_line_id=int(ctx.order_line_id),
            product_id=int(parent.product_id),
            quantity=int(ctx.bundle_qty),
            unit_price_net=float(ctx.pricing.commercial_unit_price_net),
            line_total_net=float(ctx.pricing.commercial_line_total_net),
            bundle_id=int(ctx.bundle_id),
            bundle_name=str(ctx.bundle_name),
        )
    ]


def _component_item_by_product(ctx: BundleLineContext) -> dict[int, OrderItem]:
    return {int(it.product_id): it for it in ctx.component_order_items}


def picking_lines(ctx: BundleLineContext) -> list[OperationalLineProjection]:
    """WMS pick: składniki (ON_DEMAND) lub linked SKU (STOCK)."""
    if ctx.fulfillment_mode == STOCK_PRODUCTION:
        parent = ctx.parent_order_item
        pid = int(ctx.linked_product_id or parent.product_id)
        disp = str(getattr(parent, "required_stock_disposition", None) or "SALEABLE")
        return [
            OperationalLineProjection(
                order_line_id=int(ctx.order_line_id),
                order_id=int(ctx.order_id),
                product_id=pid,
                quantity=int(ctx.bundle_qty),
                required_stock_disposition=disp,
                source="stock_sku",
                bundle_id=int(ctx.bundle_id),
                bundle_name=str(ctx.bundle_name),
                bundle_mode=str(ctx.fulfillment_mode),
                bundle_component_index=1,
                bundle_component_count=1,
                is_bundle_component=False,
                parent_bundle_order_line_id=int(ctx.order_line_id),
            )
        ]

    by_pid = _component_item_by_product(ctx)
    out: list[OperationalLineProjection] = []
    for comp in ctx.components:
        oi = by_pid.get(int(comp.component_product_id))
        if oi is None or order_item_is_replaced_line(oi):
            continue
        out.append(
            OperationalLineProjection(
                order_line_id=int(oi.id),
                order_id=int(ctx.order_id),
                product_id=int(comp.component_product_id),
                quantity=int(comp.required_qty_total),
                required_stock_disposition=str(getattr(oi, "required_stock_disposition", None) or "SALEABLE"),
                source="component",
            )
        )
    total = len(out)
    indexed: list[OperationalLineProjection] = []
    for idx, line in enumerate(out, start=1):
        indexed.append(
            OperationalLineProjection(
                order_line_id=line.order_line_id,
                order_id=line.order_id,
                product_id=line.product_id,
                quantity=line.quantity,
                required_stock_disposition=line.required_stock_disposition,
                source=line.source,
                bundle_id=int(ctx.bundle_id),
                bundle_name=str(ctx.bundle_name),
                bundle_mode=str(ctx.fulfillment_mode),
                bundle_component_index=idx,
                bundle_component_count=total,
                is_bundle_component=True,
                parent_bundle_order_line_id=int(ctx.order_line_id),
            )
        )
    return indexed


def reservation_lines(ctx: BundleLineContext) -> list[OperationalLineProjection]:
    """Rezerwacje — ten sam kontrakt co picking."""
    return picking_lines(ctx)


def warehouse_issue_lines(ctx: BundleLineContext) -> list[WarehouseIssueLineProjection]:
    """RW / wydanie magazynowe."""
    if ctx.fulfillment_mode == STOCK_PRODUCTION:
        parent = ctx.parent_order_item
        return [
            WarehouseIssueLineProjection(
                product_id=int(ctx.linked_product_id or parent.product_id),
                quantity=int(ctx.bundle_qty),
                order_line_id=int(ctx.order_line_id),
                issue_type="finished_sku",
            )
        ]
    by_pid = _component_item_by_product(ctx)
    lines: list[WarehouseIssueLineProjection] = []
    for comp in ctx.components:
        oi = by_pid.get(int(comp.component_product_id))
        if oi is None:
            continue
        lines.append(
            WarehouseIssueLineProjection(
                product_id=int(comp.component_product_id),
                quantity=int(comp.required_qty_total),
                order_line_id=int(oi.id),
                issue_type="component",
            )
        )
    return lines


def _snapshot_cost_total(ctx: BundleLineContext) -> Optional[float]:
    total = 0.0
    found = False
    for comp in ctx.components:
        if comp.unit_cost_snapshot is None:
            continue
        found = True
        total += float(comp.unit_cost_snapshot) * int(comp.required_qty_total)
    return round(total, 2) if found else None


def margin_lines(ctx: BundleLineContext) -> list[MarginLineProjection]:
    """Marża: przychód z nagłówka, koszt ze snapshotu składników."""
    revenue = float(ctx.pricing.commercial_line_total_net)
    cost = _snapshot_cost_total(ctx)
    if cost is None:
        return [
            MarginLineProjection(
                revenue_net=revenue,
                cost_net=None,
                margin_amount=None,
                margin_percent=None,
                cost_source="none",
            )
        ]
    margin_amt = round(revenue - cost, 2)
    margin_pct = round(margin_amt / revenue * 100.0, 2) if revenue > 1e-9 else None
    return [
        MarginLineProjection(
            revenue_net=revenue,
            cost_net=cost,
            margin_amount=margin_amt,
            margin_percent=margin_pct,
            cost_source="snapshot",
        )
    ]


def margin_from_context(ctx: BundleLineContext) -> MarginLineProjection:
    rows = margin_lines(ctx)
    return rows[0]


def return_lines(ctx: BundleLineContext) -> list[ReturnLineProjection]:
    """
    Drzewo zwrotu (projekcja — bez RMZ).

    Nagłówek + składniki z cenami ze snapshotu (partial return ready).
    """
    header = ReturnLineProjection(
        order_line_id=int(ctx.order_line_id),
        product_id=int(ctx.parent_order_item.product_id),
        quantity=int(ctx.bundle_qty),
        unit_price_net=float(ctx.pricing.commercial_unit_price_net),
        line_role="bundle_header",
        parent_order_line_id=None,
        component_snapshot_id=None,
    )
    if ctx.fulfillment_mode == STOCK_PRODUCTION:
        return [
            header,
            ReturnLineProjection(
                order_line_id=int(ctx.order_line_id),
                product_id=int(ctx.linked_product_id or ctx.parent_order_item.product_id),
                quantity=int(ctx.bundle_qty),
                unit_price_net=float(ctx.pricing.commercial_unit_price_net),
                line_role="stock_sku",
                parent_order_line_id=int(ctx.order_line_id),
                component_snapshot_id=None,
            ),
        ]

    by_pid = _component_item_by_product(ctx)
    children: list[ReturnLineProjection] = []
    for comp in ctx.components:
        oi = by_pid.get(int(comp.component_product_id))
        unit_px = comp.unit_price_snapshot if comp.unit_price_snapshot is not None else 0.0
        children.append(
            ReturnLineProjection(
                order_line_id=int(oi.id) if oi is not None else int(ctx.order_line_id),
                product_id=int(comp.component_product_id),
                quantity=int(comp.required_qty_total),
                unit_price_net=float(unit_px),
                line_role="component",
                parent_order_line_id=int(ctx.order_line_id),
                component_snapshot_id=int(comp.snapshot_id),
            )
        )
    return [header] + children


def complaint_lines(ctx: BundleLineContext) -> list[ComplaintLineProjection]:
    """Reklamacje — jednostki operacyjne do weryfikacji."""
    if ctx.fulfillment_mode == STOCK_PRODUCTION:
        return [
            ComplaintLineProjection(
                order_line_id=int(ctx.order_line_id),
                product_id=int(ctx.linked_product_id or ctx.parent_order_item.product_id),
                quantity=int(ctx.bundle_qty),
                eligible_qty=int(ctx.bundle_qty),
                line_role="stock_sku",
            )
        ]
    by_pid = _component_item_by_product(ctx)
    out: list[ComplaintLineProjection] = []
    for comp in ctx.components:
        oi = by_pid.get(int(comp.component_product_id))
        if oi is None:
            continue
        out.append(
            ComplaintLineProjection(
                order_line_id=int(oi.id),
                product_id=int(comp.component_product_id),
                quantity=int(comp.required_qty_total),
                eligible_qty=int(comp.required_qty_total),
                line_role="component",
            )
        )
    return out


def order_item_in_picking_projection(item: OrderItem, ctx: Optional[BundleLineContext]) -> bool:
    """
    Czy ``OrderItem`` wchodzi w pick/rezerwację — używane przez cienki facade P0.

    Dla linii spoza zestawu: standardowa reguła (nie parent bundle ON_DEMAND).
    """
    if ctx is not None:
        pick_ids = {p.order_line_id for p in picking_lines(ctx)}
        return int(item.id) in pick_ids

    if order_item_is_replaced_line(item):
        return False
    if int(item.quantity or 0) <= 0:
        return False
    if getattr(item, "parent_bundle_order_item_id", None) is not None:
        return True
    if bool(getattr(item, "is_bundle_parent", False)):
        from ..bundle_operational_mode import STOCK_PRODUCTION, normalize_bundle_operational_mode

        meta = {}
        raw = getattr(item, "metadata_json", None)
        if raw and str(raw).strip():
            try:
                import json as _json

                parsed = _json.loads(raw)
                if isinstance(parsed, dict):
                    meta = parsed
            except _json.JSONDecodeError:
                pass
        mode = normalize_bundle_operational_mode(meta.get("bundle_fulfillment_mode"))
        return mode == STOCK_PRODUCTION
    return True
