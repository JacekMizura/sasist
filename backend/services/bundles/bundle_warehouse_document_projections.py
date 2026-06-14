"""Warehouse document line projections — commercial vs warehouse views (P4.14A)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from ..bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from .bundle_line_context import BundleLineContext
from .bundle_line_projections import _component_item_by_product, picking_lines

DocumentViewMode = Literal["COMMERCIAL", "WAREHOUSE", "ACCOUNTING"]
DocumentTypeHint = Literal["WZ", "RW", "PW", "PZ", "MM", "RW_WMS"]


@dataclass(frozen=True)
class WarehouseDocumentLineProjection:
    """Unified warehouse document line — SSOT for all stock document types."""

    document_type: str
    document_view: str
    document_sku: str
    product_id: int
    product_name: str
    quantity: float
    unit_cost_snapshot: Optional[float]
    unit_price_snapshot: Optional[float]
    source_bundle_id: Optional[int]
    source_bundle_name: Optional[str]
    line_role: str  # bundle_header | component | stock_sku | finished_sku
    order_line_id: int
    order_id: int
    fulfillment_mode: str
    component_snapshot_id: Optional[int] = None
    stock_disposition: str = "SALEABLE"


def _commercial_line(ctx: BundleLineContext, *, document_type: str) -> WarehouseDocumentLineProjection:
    parent = ctx.parent_order_item
    sku = str(ctx.bundle_name or "")[:128] or f"bundle-{ctx.bundle_id}"
    return WarehouseDocumentLineProjection(
        document_type=document_type,
        document_view="COMMERCIAL",
        document_sku=sku,
        product_id=int(parent.product_id),
        product_name=str(ctx.bundle_name),
        quantity=float(ctx.bundle_qty),
        unit_cost_snapshot=None,
        unit_price_snapshot=float(ctx.pricing.commercial_unit_price_net),
        source_bundle_id=int(ctx.bundle_id),
        source_bundle_name=str(ctx.bundle_name),
        line_role="bundle_header",
        order_line_id=int(ctx.order_line_id),
        order_id=int(ctx.order_id),
        fulfillment_mode=str(ctx.fulfillment_mode),
        stock_disposition=str(getattr(parent, "required_stock_disposition", None) or "SALEABLE"),
    )


def _warehouse_component_lines(ctx: BundleLineContext, *, document_type: str) -> list[WarehouseDocumentLineProjection]:
    by_pid = _component_item_by_product(ctx)
    out: list[WarehouseDocumentLineProjection] = []
    for comp in ctx.components:
        oi = by_pid.get(int(comp.component_product_id))
        sku = str(comp.sku or comp.ean or f"P{comp.component_product_id}")[:128]
        disp = str(getattr(oi, "required_stock_disposition", None) or "SALEABLE") if oi else "SALEABLE"
        out.append(
            WarehouseDocumentLineProjection(
                document_type=document_type,
                document_view="WAREHOUSE",
                document_sku=sku,
                product_id=int(comp.component_product_id),
                product_name=str(comp.component_name),
                quantity=float(comp.required_qty_total),
                unit_cost_snapshot=comp.unit_cost_snapshot,
                unit_price_snapshot=comp.unit_price_snapshot,
                source_bundle_id=int(ctx.bundle_id),
                source_bundle_name=str(ctx.bundle_name),
                line_role="component",
                order_line_id=int(oi.id) if oi is not None else int(ctx.order_line_id),
                order_id=int(ctx.order_id),
                fulfillment_mode=str(ctx.fulfillment_mode),
                component_snapshot_id=int(comp.snapshot_id),
                stock_disposition=disp,
            )
        )
    return out


def _warehouse_stock_sku_line(ctx: BundleLineContext, *, document_type: str) -> WarehouseDocumentLineProjection:
    parent = ctx.parent_order_item
    pid = int(ctx.linked_product_id or parent.product_id)
    sku = str(getattr(parent.product, "sku", None) or getattr(parent.product, "symbol", None) or f"P{pid}")[:128]
    if parent.product is not None and getattr(parent.product, "name", None):
        pname = str(parent.product.name)
    else:
        pname = str(ctx.bundle_name)
    return WarehouseDocumentLineProjection(
        document_type=document_type,
        document_view="WAREHOUSE",
        document_sku=sku,
        product_id=pid,
        product_name=pname,
        quantity=float(ctx.bundle_qty),
        unit_cost_snapshot=_aggregate_cost_per_finished_unit(ctx),
        unit_price_snapshot=float(ctx.pricing.commercial_unit_price_net),
        source_bundle_id=int(ctx.bundle_id),
        source_bundle_name=str(ctx.bundle_name),
        line_role="stock_sku",
        order_line_id=int(ctx.order_line_id),
        order_id=int(ctx.order_id),
        fulfillment_mode=str(ctx.fulfillment_mode),
        stock_disposition=str(getattr(parent, "required_stock_disposition", None) or "SALEABLE"),
    )


def _aggregate_cost_per_finished_unit(ctx: BundleLineContext) -> Optional[float]:
    total = 0.0
    found = False
    for comp in ctx.components:
        if comp.unit_cost_snapshot is None:
            continue
        found = True
        total += float(comp.unit_cost_snapshot) * int(comp.required_qty_per_bundle)
    if not found or ctx.bundle_qty <= 0:
        return None
    return round(total / float(ctx.bundle_qty), 4)


def _production_rw_lines(ctx: BundleLineContext) -> list[WarehouseDocumentLineProjection]:
    """STOCK bundle — RW produkcji zużywa składniki ze snapshotu."""
    return _warehouse_component_lines(ctx, document_type="RW")


def _production_pw_line(ctx: BundleLineContext) -> WarehouseDocumentLineProjection:
    """STOCK bundle — PW produkcji przyjmuje gotowy SKU."""
    line = _warehouse_stock_sku_line(ctx, document_type="PW")
    return WarehouseDocumentLineProjection(
        document_type=line.document_type,
        document_view=line.document_view,
        document_sku=line.document_sku,
        product_id=line.product_id,
        product_name=line.product_name,
        quantity=line.quantity,
        unit_cost_snapshot=line.unit_cost_snapshot,
        unit_price_snapshot=line.unit_price_snapshot,
        source_bundle_id=line.source_bundle_id,
        source_bundle_name=line.source_bundle_name,
        line_role="finished_sku",
        order_line_id=line.order_line_id,
        order_id=line.order_id,
        fulfillment_mode=line.fulfillment_mode,
        stock_disposition=line.stock_disposition,
    )


def warehouse_document_lines(
    ctx: BundleLineContext,
    *,
    document_type: DocumentTypeHint = "WZ",
    document_view: DocumentViewMode = "WAREHOUSE",
) -> list[WarehouseDocumentLineProjection]:
    """
    Projekcja linii dokumentu magazynowego z BundleLineContext.

    WZ handlowy (COMMERCIAL): nagłówek zestawu.
    WZ magazynowy (WAREHOUSE): składniki (ON_DEMAND) lub gotowy SKU (STOCK).
    RW/PW produkcji (STOCK): RW=składniki, PW=gotowy SKU — ze snapshotu, nie receptury live.
    MM / RW_WMS: jak WAREHOUSE issue (picking).
    """
    dt = str(document_type).upper()
    view = str(document_view).upper()

    if view == "COMMERCIAL":
        return [_commercial_line(ctx, document_type=dt)]

    if view == "ACCOUNTING":
        commercial = _commercial_line(ctx, document_type=dt)
        warehouse = warehouse_document_lines(ctx, document_type=document_type, document_view="WAREHOUSE")
        return [commercial, *warehouse]

    if dt == "PW" and ctx.fulfillment_mode == STOCK_PRODUCTION:
        return [_production_pw_line(ctx)]

    if dt == "RW" and ctx.fulfillment_mode == STOCK_PRODUCTION:
        return _production_rw_lines(ctx)

    if ctx.fulfillment_mode == STOCK_PRODUCTION:
        return [_warehouse_stock_sku_line(ctx, document_type=dt)]

    if dt in ("MM", "RW_WMS", "RW", "WZ"):
        picks = picking_lines(ctx)
        if picks:
            by_pid = _component_item_by_product(ctx)
            comp_by_pid = {c.component_product_id: c for c in ctx.components}
            out: list[WarehouseDocumentLineProjection] = []
            for p in picks:
                comp = comp_by_pid.get(int(p.product_id))
                oi = by_pid.get(int(p.product_id))
                if comp is not None:
                    sku = str(comp.sku or f"P{p.product_id}")[:128]
                    name = str(comp.component_name)
                    cost = comp.unit_cost_snapshot
                    price = comp.unit_price_snapshot
                    snap_id = int(comp.snapshot_id)
                    role = "component"
                else:
                    sku = f"P{p.product_id}"
                    name = sku
                    cost = None
                    price = None
                    snap_id = None
                    role = "stock_sku"
                out.append(
                    WarehouseDocumentLineProjection(
                        document_type=dt,
                        document_view="WAREHOUSE",
                        document_sku=sku,
                        product_id=int(p.product_id),
                        product_name=name,
                        quantity=float(p.quantity),
                        unit_cost_snapshot=cost,
                        unit_price_snapshot=price,
                        source_bundle_id=int(ctx.bundle_id),
                        source_bundle_name=str(ctx.bundle_name),
                        line_role=role,
                        order_line_id=int(p.order_line_id),
                        order_id=int(p.order_id),
                        fulfillment_mode=str(ctx.fulfillment_mode),
                        component_snapshot_id=snap_id,
                        stock_disposition=str(p.required_stock_disposition),
                    )
                )
            return out
        return _warehouse_component_lines(ctx, document_type=dt)

    return _warehouse_component_lines(ctx, document_type=dt)


def warehouse_receipt_lines(
    ctx: BundleLineContext,
    *,
    document_type: DocumentTypeHint = "PZ",
) -> list[WarehouseDocumentLineProjection]:
    """
    PZ zwrotu (projekcja P4.15) — wyłącznie SKU operacyjne, nigdy nagłówek handlowy ON_DEMAND.
    """
    lines = warehouse_document_lines(ctx, document_type=document_type, document_view="WAREHOUSE")
    return [ln for ln in lines if ln.line_role in ("component", "stock_sku", "finished_sku")]
