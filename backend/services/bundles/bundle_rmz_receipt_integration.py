"""P4.15 — PZ zwrotu bundle: rozszerzenie linii RMZ o składniki ze snapshotu."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from ...models.wms_rmz_line import RMZLine
from .bundle_line_resolver import bundle_line_resolver
from .bundle_return_service import bundle_component_returns_for_line, is_bundle_parent_rmz_line
from .bundle_warehouse_document_projections import WarehouseDocumentLineProjection, warehouse_receipt_lines


@dataclass(frozen=True)
class RmzReceiptStockRow:
    """Jedna linia magazynowa Z-PZ po rozwinięciu bundle."""

    product_id: int
    quantity: float
    order_item_id: int
    unit_price_snapshot: Optional[float]
    component_snapshot_id: Optional[int]
    line_role: str


def _scale_receipt_line(
    ln: WarehouseDocumentLineProjection,
    *,
    qty: float,
) -> RmzReceiptStockRow:
    return RmzReceiptStockRow(
        product_id=int(ln.product_id),
        quantity=float(qty),
        order_item_id=int(ln.order_line_id),
        unit_price_snapshot=ln.unit_price_snapshot,
        component_snapshot_id=ln.component_snapshot_id,
        line_role=str(ln.line_role),
    )


def effective_receipt_rows_for_rmz_line(db: Session, rmz_line: RMZLine) -> list[RmzReceiptStockRow]:
    """
    ON_DEMAND: PZ per składnik (accepted_qty z return_line_bundle_components).
    STOCK: PZ gotowego SKU (accepted_qty na linii RMZ).
    """
    if not is_bundle_parent_rmz_line(db, rmz_line):
        aq = float(rmz_line.accepted_qty or 0)
        if aq <= 0:
            return []
        return [
            RmzReceiptStockRow(
                product_id=int(rmz_line.product_id),
                quantity=aq,
                order_item_id=int(rmz_line.order_item_id),
                unit_price_snapshot=None,
                component_snapshot_id=None,
                line_role="standard",
            )
        ]

    ctx = bundle_line_resolver.resolve_parent_line(db, int(rmz_line.order_item_id))
    if ctx is None:
        aq = float(rmz_line.accepted_qty or 0)
        if aq <= 0:
            return []
        return [
            RmzReceiptStockRow(
                product_id=int(rmz_line.product_id),
                quantity=aq,
                order_item_id=int(rmz_line.order_item_id),
                unit_price_snapshot=None,
                component_snapshot_id=None,
                line_role="standard",
            )
        ]

    receipt_template = warehouse_receipt_lines(ctx)
    comp_returns = bundle_component_returns_for_line(db, int(rmz_line.id))

    if comp_returns:
        by_snap = {int(r.order_line_bundle_component_id or 0): r for r in comp_returns}
        out: list[RmzReceiptStockRow] = []
        for tpl in receipt_template:
            snap_id = int(tpl.component_snapshot_id or 0)
            cr = by_snap.get(snap_id)
            if cr is None:
                continue
            aq = float(cr.accepted_qty or 0)
            if aq <= 0:
                continue
            out.append(_scale_receipt_line(tpl, qty=aq))
        return out

    aq = float(rmz_line.accepted_qty or 0)
    if aq <= 0:
        return []
    if len(receipt_template) == 1:
        return [_scale_receipt_line(receipt_template[0], qty=aq)]
    ratio = aq / float(ctx.bundle_qty) if ctx.bundle_qty > 0 else 0.0
    return [_scale_receipt_line(tpl, qty=float(tpl.quantity) * ratio) for tpl in receipt_template]


def aggregate_receipt_rows(rows: Sequence[RmzReceiptStockRow]) -> list[RmzReceiptStockRow]:
    """Scal identyczne product_id + order_item_id (wielokrotne uszkodzenia)."""
    merged: dict[tuple[int, int], RmzReceiptStockRow] = {}
    for r in rows:
        key = (int(r.product_id), int(r.order_item_id))
        prev = merged.get(key)
        if prev is None:
            merged[key] = r
        else:
            merged[key] = RmzReceiptStockRow(
                product_id=prev.product_id,
                quantity=prev.quantity + r.quantity,
                order_item_id=prev.order_item_id,
                unit_price_snapshot=prev.unit_price_snapshot or r.unit_price_snapshot,
                component_snapshot_id=prev.component_snapshot_id or r.component_snapshot_id,
                line_role=prev.line_role,
            )
    return list(merged.values())
