"""Order-level warehouse document lines — SSOT entry for stock documents (P4.14A)."""

from __future__ import annotations

from typing import Literal, Optional

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_item import OrderItem, order_item_is_replaced_line
from ..bundle_order_item_ops import order_item_is_operational_picking_line, order_item_skip_bundle_commercial_header_for_ops
from .bundle_line_resolver import BundleLineResolver, bundle_line_resolver
from .bundle_warehouse_document_projections import (
    DocumentTypeHint,
    DocumentViewMode,
    WarehouseDocumentLineProjection,
    warehouse_document_lines,
    warehouse_receipt_lines,
)

DEFAULT_RESOLVER = bundle_line_resolver


def _non_bundle_document_line(
    item: OrderItem,
    *,
    document_type: str,
    document_view: str,
    product_name: str = "",
    product_sku: str = "",
) -> WarehouseDocumentLineProjection:
    sku = (product_sku or f"P{item.product_id}")[:128]
    name = product_name or sku
    unit_px = float(item.unit_price or 0)
    return WarehouseDocumentLineProjection(
        document_type=document_type,
        document_view=document_view,
        document_sku=sku,
        product_id=int(item.product_id),
        product_name=name,
        quantity=float(item.quantity or 0),
        unit_cost_snapshot=None,
        unit_price_snapshot=unit_px if document_view == "COMMERCIAL" else None,
        source_bundle_id=None,
        source_bundle_name=None,
        line_role="standard_product",
        order_line_id=int(item.id),
        order_id=int(item.order_id),
        fulfillment_mode="STANDARD",
        stock_disposition=str(getattr(item, "required_stock_disposition", None) or "SALEABLE"),
    )


def bundle_contexts_for_order(db: Session, order_id: int, *, resolver: BundleLineResolver | None = None) -> dict[int, object]:
    r = resolver or DEFAULT_RESOLVER
    return r.context_by_parent_line_id(db, int(order_id))


def document_lines_for_bundle_context(
    ctx,
    *,
    document_type: DocumentTypeHint = "WZ",
    document_view: DocumentViewMode = "WAREHOUSE",
) -> list[WarehouseDocumentLineProjection]:
    return warehouse_document_lines(ctx, document_type=document_type, document_view=document_view)


def document_lines_for_order(
    db: Session,
    order: Order,
    *,
    document_type: DocumentTypeHint = "WZ",
    document_view: DocumentViewMode = "WAREHOUSE",
    resolver: BundleLineResolver | None = None,
) -> list[WarehouseDocumentLineProjection]:
    """
    Pełna lista linii dokumentu dla zamówienia (bundle przez resolver + zwykłe SKU).

    COMMERCIAL: pomija składniki ON_DEMAND; pokazuje nagłówki bundle + zwykłe produkty.
    WAREHOUSE: pomija nagłówki ON_DEMAND; pokazuje składniki / STOCK SKU + zwykłe produkty.
    """
    r = resolver or DEFAULT_RESOLVER
    ctx_by_parent = r.context_by_parent_line_id(db, int(order.id))
    dt = str(document_type).upper()
    view = str(document_view).upper()
    out: list[WarehouseDocumentLineProjection] = []

    for item in sorted(order.items or [], key=lambda x: int(x.id)):
        if order_item_is_replaced_line(item):
            continue
        if int(item.quantity or 0) <= 0:
            continue

        if bool(getattr(item, "is_bundle_parent", False)):
            ctx = ctx_by_parent.get(int(item.id))
            if ctx is not None:
                out.extend(document_lines_for_bundle_context(ctx, document_type=document_type, document_view=document_view))
            continue

        if order_item_skip_bundle_commercial_header_for_ops(item):
            continue

        if view == "WAREHOUSE" and not order_item_is_operational_picking_line(item):
            continue

        if view == "COMMERCIAL" and getattr(item, "parent_bundle_order_item_id", None) is not None:
            continue

        prod = getattr(item, "product", None)
        pname = str(getattr(prod, "name", None) or "")
        psku = str(getattr(prod, "sku", None) or getattr(prod, "symbol", None) or "")
        out.append(
            _non_bundle_document_line(
                item,
                document_type=dt,
                document_view=view,
                product_name=pname,
                product_sku=psku,
            )
        )

    return out


def receipt_lines_for_order(
    db: Session,
    order: Order,
    *,
    resolver: BundleLineResolver | None = None,
) -> list[WarehouseDocumentLineProjection]:
    """PZ zwrotu — projekcja bez wdrożenia RMZ (P4.15)."""
    r = resolver or DEFAULT_RESOLVER
    out: list[WarehouseDocumentLineProjection] = []
    for ctx in r.resolve_for_order(db, int(order.id)):
        out.extend(warehouse_receipt_lines(ctx))
    for item in order.items or []:
        if order_item_is_replaced_line(item):
            continue
        if getattr(item, "parent_bundle_order_item_id", None) is not None:
            continue
        if bool(getattr(item, "is_bundle_parent", False)):
            continue
        if int(item.quantity or 0) <= 0:
            continue
        prod = getattr(item, "product", None)
        out.append(
            _non_bundle_document_line(
                item,
                document_type="PZ",
                document_view="WAREHOUSE",
                product_name=str(getattr(prod, "name", None) or ""),
                product_sku=str(getattr(prod, "sku", None) or getattr(prod, "symbol", None) or ""),
            )
        )
    return out


def expected_warehouse_product_quantities(
    db: Session,
    order: Order,
    *,
    document_type: DocumentTypeHint = "WZ",
) -> dict[int, float]:
    """Mapa product_id → qty do walidacji WZ / RW-WMS / MM."""
    lines = document_lines_for_order(db, order, document_type=document_type, document_view="WAREHOUSE")
    merged: dict[int, float] = {}
    for ln in lines:
        merged[int(ln.product_id)] = merged.get(int(ln.product_id), 0.0) + float(ln.quantity)
    return merged


def stock_document_item_kwargs_from_projection(line: WarehouseDocumentLineProjection) -> dict:
    """Draft kwargs for StockDocumentItem — bez persist."""
    cost = line.unit_cost_snapshot
    if cost is None and line.unit_price_snapshot is not None and line.document_view == "COMMERCIAL":
        cost = line.unit_price_snapshot
    return {
        "product_id": int(line.product_id),
        "ordered_quantity": float(line.quantity),
        "received_quantity": float(line.quantity),
        "quantity": float(line.quantity),
        "purchase_price_net": float(cost) if cost is not None else None,
    }


def audit_document_views_for_order(
    db: Session,
    order: Order,
    *,
    resolver: BundleLineResolver | None = None,
) -> dict[str, dict[str, list[WarehouseDocumentLineProjection]]]:
    """Audyt widoków per typ dokumentu (WZ/RW/PW/PZ/MM/RW_WMS)."""
    doc_types: list[DocumentTypeHint] = ["WZ", "RW", "PW", "PZ", "MM", "RW_WMS"]
    result: dict[str, dict[str, list[WarehouseDocumentLineProjection]]] = {}
    for dt in doc_types:
        result[dt] = {
            "commercial": document_lines_for_order(db, order, document_type=dt, document_view="COMMERCIAL", resolver=resolver),
            "warehouse": document_lines_for_order(db, order, document_type=dt, document_view="WAREHOUSE", resolver=resolver),
            "accounting": document_lines_for_order(db, order, document_type=dt, document_view="ACCOUNTING", resolver=resolver),
        }
    return result
