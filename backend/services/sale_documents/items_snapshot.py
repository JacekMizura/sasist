"""Snapshot / ensure sale_document_items for primary documents."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session, joinedload

from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.sale_document import SaleDocument
from ...models.sale_document_item import SaleDocumentItem
from ..sale_document_financials import compute_sale_totals_from_order


def list_sale_document_items(db: Session, sale_document_id: str) -> list[SaleDocumentItem]:
    return (
        db.query(SaleDocumentItem)
        .filter(SaleDocumentItem.sale_document_id == str(sale_document_id))
        .order_by(SaleDocumentItem.position.asc(), SaleDocumentItem.id.asc())
        .all()
    )


def replace_sale_document_items(
    db: Session,
    *,
    sale_document_id: str,
    lines: list[dict[str, Any]],
) -> list[SaleDocumentItem]:
    db.query(SaleDocumentItem).filter(SaleDocumentItem.sale_document_id == str(sale_document_id)).delete(
        synchronize_session=False
    )
    rows: list[SaleDocumentItem] = []
    for i, ln in enumerate(lines):
        row = SaleDocumentItem(
            sale_document_id=str(sale_document_id),
            order_item_id=int(ln["order_item_id"]) if ln.get("order_item_id") is not None else None,
            product_id=int(ln["product_id"]) if ln.get("product_id") is not None else None,
            position=int(ln.get("position") if ln.get("position") is not None else i),
            name=str(ln.get("name") or "")[:512],
            sku=(str(ln["sku"]).strip()[:128] if ln.get("sku") else None),
            quantity=float(ln.get("quantity") or 0.0),
            unit_net=float(ln["unit_net"]) if ln.get("unit_net") is not None else None,
            unit_gross=float(ln["unit_gross"]) if ln.get("unit_gross") is not None else None,
            vat_percent=float(ln.get("vat_percent") if ln.get("vat_percent") is not None else 23.0),
            line_net=float(ln.get("line_net") or 0.0),
            line_vat=float(ln.get("line_vat") or 0.0),
            line_gross=float(ln.get("line_gross") or 0.0),
        )
        db.add(row)
        rows.append(row)
    db.flush()
    return rows


def snapshot_primary_items_from_order(db: Session, *, doc: SaleDocument, order: Order) -> list[SaleDocumentItem]:
    """Persist positive line snapshot from order financials onto a PRIMARY document."""
    order_full = order
    if not getattr(order, "items", None):
        loaded = (
            db.query(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .filter(Order.id == int(order.id))
            .first()
        )
        if loaded is not None:
            order_full = loaded
    totals = compute_sale_totals_from_order(order_full)
    lines = []
    for i, ln in enumerate(totals.get("lines") or []):
        lines.append({**ln, "position": i})
    rows = replace_sale_document_items(db, sale_document_id=str(doc.id), lines=lines)
    doc.total_net = float(totals["total_net"])
    doc.total_vat = float(totals["total_vat"])
    doc.total_gross = float(totals["total_gross"])
    db.flush()
    return rows


def ensure_primary_items_snapshot(db: Session, *, doc: SaleDocument, order: Order | None = None) -> list[SaleDocumentItem]:
    """
    Guarantee PRIMARY document has line snapshots.

    Legacy documents without items are backfilled once from the current order
    (best-effort). Prefer calling this at create time for new primaries.
    """
    existing = list_sale_document_items(db, str(doc.id))
    if existing:
        return existing
    kind = str(getattr(doc, "document_kind", None) or "PRIMARY").strip().upper()
    if kind == "CORRECTION":
        return []
    if order is None:
        order = (
            db.query(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .filter(Order.id == int(doc.order_id))
            .first()
        )
    if order is None:
        return []
    return snapshot_primary_items_from_order(db, doc=doc, order=order)
