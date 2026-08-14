"""Shared Z-PZ emission for recovered return components (bundle + manufacturing).

Adapters map domain rows → ``ComponentReturnRecoveryLine``.
``append_accepted_component_lines`` emits StockDocumentItems for accepted qty only.
Does not create documents, does not merge ORM models, does not change refunds.
"""

from __future__ import annotations

from datetime import datetime
from typing import Callable, Optional, Sequence

from sqlalchemy.orm import Session

from ...models.rmz_line_component_recovery import RmzLineComponentRecovery
from ...models.stock_document import StockDocumentItem
from ...models.wms_rmz_line import RMZLine
from ..bundles.bundle_rmz_receipt_integration import RmzReceiptStockRow, effective_receipt_rows_for_rmz_line
from ..bundles.bundle_return_service import bundle_component_returns_for_line
from .component_return_recovery_contract import (
    SOURCE_BUNDLE,
    SOURCE_MANUFACTURING,
    ComponentReturnRecoveryLine,
)
from .z_pz_constants import DISPOSITION_SALEABLE

AddComponentLineFn = Callable[..., StockDocumentItem]


def adapt_bundle_receipt_rows_to_recovery_lines(
    db: Session,
    rmz_line: RMZLine,
    receipt_rows: Sequence[RmzReceiptStockRow],
    *,
    vat_rate_by_order_item: Callable[[int], tuple[Optional[float], float]],
) -> list[ComponentReturnRecoveryLine]:
    """Map effective bundle Z-PZ rows (+ optional scrap from returned−accepted).

    Stock behaviour unchanged: only ``accepted`` quantities from receipt rows emit.
    Scrap is informational (returned − accepted when component return rows exist).
    """
    comp_returns = bundle_component_returns_for_line(db, int(rmz_line.id))
    by_snap = {int(r.order_line_bundle_component_id or 0): r for r in comp_returns}
    out: list[ComponentReturnRecoveryLine] = []
    for rr in receipt_rows:
        qty = float(rr.quantity or 0)
        if qty <= 1e-9:
            continue
        snap_id = int(rr.component_snapshot_id or 0) or None
        cr = by_snap.get(int(rr.component_snapshot_id or 0)) if rr.component_snapshot_id else None
        returned = float(getattr(cr, "returned_qty", 0) or 0) if cr is not None else qty
        accepted = float(getattr(cr, "accepted_qty", 0) or qty) if cr is not None else qty
        # Prefer receipt qty (already accepted) for stock; scrap = gap if known
        expected = returned if cr is not None else qty
        scrap = max(0.0, expected - accepted) if cr is not None else 0.0
        unit_price = rr.unit_price_snapshot
        vat = 23.0
        if unit_price is None:
            unit_price, vat = vat_rate_by_order_item(int(rr.order_item_id))
        else:
            _, vat = vat_rate_by_order_item(int(rr.order_item_id))
        out.append(
            ComponentReturnRecoveryLine(
                component_product_id=int(rr.product_id),
                expected_qty=float(expected),
                accepted_qty=float(qty),
                scrap_qty=float(scrap),
                source_type=SOURCE_BUNDLE,
                source_snapshot_id=snap_id,
                source_row_id=int(cr.id) if cr is not None and getattr(cr, "id", None) else None,
                disposition=DISPOSITION_SALEABLE,
                return_decision="ACCEPTED",
                purchase_price_net=unit_price,
                vat_rate=float(vat),
                order_item_id=int(rr.order_item_id),
                rmz_damage_entry_id=None,
                target_location_id=None,
                metadata={"line_role": rr.line_role},
            )
        )
    return out


def adapt_manufacturing_recoveries_to_recovery_lines(
    recoveries: Sequence[RmzLineComponentRecovery],
    *,
    target_location_id: Optional[int] = None,
) -> tuple[list[ComponentReturnRecoveryLine], list[RmzLineComponentRecovery]]:
    """Map ORM recoveries → DTO lines + scrap-only rows (no stock, mark posted later).

    Skips already-posted rows (``posted_at`` / ``stock_document_item_id``).
    """
    emit: list[ComponentReturnRecoveryLine] = []
    scrap_only: list[RmzLineComponentRecovery] = []
    for rec in recoveries:
        if getattr(rec, "posted_at", None) is not None or getattr(rec, "stock_document_item_id", None):
            continue
        accepted = float(getattr(rec, "accepted_qty", 0) or 0)
        expected = float(getattr(rec, "expected_qty", 0) or 0)
        scrap = float(getattr(rec, "scrap_qty", 0) or 0)
        if accepted <= 1e-9:
            scrap_only.append(rec)
            continue
        emit.append(
            ComponentReturnRecoveryLine(
                component_product_id=int(rec.component_product_id),
                expected_qty=expected,
                accepted_qty=accepted,
                scrap_qty=scrap,
                source_type=SOURCE_MANUFACTURING,
                source_snapshot_id=int(rec.composition_line_id),
                source_row_id=int(rec.id),
                disposition=DISPOSITION_SALEABLE,
                return_decision="ACCEPTED",
                purchase_price_net=None,
                vat_rate=23.0,
                order_item_id=None,
                rmz_damage_entry_id=f"mfg-rec-{int(rec.id)}",
                target_location_id=int(target_location_id) if target_location_id else None,
                metadata={
                    "composition_id": int(rec.composition_id),
                    "composition_line_id": int(rec.composition_line_id),
                },
            )
        )
    return emit, scrap_only


def append_accepted_component_lines(
    *,
    lines: Sequence[ComponentReturnRecoveryLine],
    add_line: AddComponentLineFn,
) -> list[tuple[ComponentReturnRecoveryLine, StockDocumentItem]]:
    """Emit Z-PZ items for ``accepted_qty > 0`` via the caller's ``add_line`` (inventory SSOT).

    Does not create a new document. Idempotency of retries is the caller's
    responsibility (``_rmz_lines_already_posted``, manufacturing ``posted_at``).
    """
    created: list[tuple[ComponentReturnRecoveryLine, StockDocumentItem]] = []
    for line in lines:
        if not line.has_stock_qty:
            continue
        sdi = add_line(
            product_id=int(line.component_product_id),
            qty=float(line.accepted_qty),
            disposition=str(line.disposition),
            return_decision=str(line.return_decision),
            rmz_damage_entry_id=line.rmz_damage_entry_id,
            purchase_price_net=line.purchase_price_net,
            vat_rate=float(line.vat_rate),
            direct_location_id=line.target_location_id,
        )
        created.append((line, sdi))
    return created


def mark_manufacturing_recoveries_posted(
    *,
    created: Sequence[tuple[ComponentReturnRecoveryLine, StockDocumentItem]],
    scrap_only: Sequence[RmzLineComponentRecovery],
    recoveries_by_id: dict[int, RmzLineComponentRecovery],
    now: Optional[datetime] = None,
) -> None:
    """Set ``posted_at`` / ``stock_document_item_id`` after emission (mfg only)."""
    ts = now or datetime.utcnow()
    for line, sdi in created:
        if line.source_type != SOURCE_MANUFACTURING or line.source_row_id is None:
            continue
        rec = recoveries_by_id.get(int(line.source_row_id))
        if rec is None:
            continue
        rec.posted_at = ts
        rec.updated_at = ts
        rec.stock_document_item_id = int(sdi.id)
    for rec in scrap_only:
        rec.posted_at = ts
        rec.updated_at = ts


def bundle_component_recovery_lines_for_rmz_line(
    db: Session,
    rmz_line: RMZLine,
    *,
    vat_rate_by_order_item: Callable[[int], tuple[Optional[float], float]],
) -> list[ComponentReturnRecoveryLine]:
    """Adapter entry: bundle component returns → normalized lines (or empty)."""
    if not bundle_component_returns_for_line(db, int(rmz_line.id)):
        return []
    rows = effective_receipt_rows_for_rmz_line(db, rmz_line)
    if not rows:
        return []
    return adapt_bundle_receipt_rows_to_recovery_lines(
        db, rmz_line, rows, vat_rate_by_order_item=vat_rate_by_order_item
    )
