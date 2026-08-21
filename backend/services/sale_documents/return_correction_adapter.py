"""Map RETURN/RMZ final commercial quantities → correction line deltas."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy.orm import Session

from ...models.sale_document import SaleDocument
from ...models.sale_document_item import SaleDocumentItem
from ...models.wms_order_return import WmsOrderReturn
from ...models.wms_rmz_line import RMZLine
from .correction_financials import signed_delta_amounts
from .errors import SaleCorrectionError
from .items_snapshot import ensure_primary_items_snapshot, list_sale_document_items
from .readiness import assert_return_ready_for_sale_correction


def commercial_correction_qty_from_rmz_line(line: RMZLine) -> int:
    """
    Qty that reduces the commercial sale.

    Includes accepted + damaged (kept by warehouse). Excludes rejected
    (returned to customer — sale stands).
    """
    accepted = max(0, int(getattr(line, "accepted_qty", None) or 0))
    dmg_b = max(0, int(getattr(line, "damaged_b_qty", None) or 0))
    dmg_c = max(0, int(getattr(line, "damaged_c_qty", None) or 0))
    return accepted + dmg_b + dmg_c


def build_correction_scope_hash(lines: list[dict[str, Any]]) -> str:
    payload = [
        {
            "order_item_id": int(ln["order_item_id"]),
            "quantity": float(ln["quantity"]),
            "line_gross": float(ln["line_gross"]),
            "vat_percent": float(ln["vat_percent"]),
        }
        for ln in sorted(lines, key=lambda x: int(x["order_item_id"]))
    ]
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def build_return_correction_lines(
    db: Session,
    *,
    source: SaleDocument,
    return_row: WmsOrderReturn,
) -> tuple[list[dict[str, Any]], str]:
    """
    Deterministic RMZ → correction deltas using source document item snapshots.

    Mapping SSOT: order_item_id on RMZLine ↔ order_item_id on SaleDocumentItem.
    """
    assert_return_ready_for_sale_correction(db, return_row=return_row)

    if int(return_row.tenant_id) != int(source.tenant_id):
        raise SaleCorrectionError("TENANT_MISMATCH", "Zwrot i dokument źródłowy należą do innego tenanta.")
    if int(return_row.order_id) != int(source.order_id):
        raise SaleCorrectionError("ORDER_MISMATCH", "Zwrot nie należy do zamówienia dokumentu źródłowego.")

    ensure_primary_items_snapshot(db, doc=source)
    source_items = list_sale_document_items(db, str(source.id))
    if not source_items:
        raise SaleCorrectionError(
            "SOURCE_ITEMS_MISSING",
            "Dokument źródłowy nie ma zsnapshotowanych pozycji — nie można wystawić korekty.",
        )

    by_order_item: dict[int, SaleDocumentItem] = {}
    for it in source_items:
        if it.order_item_id is None:
            continue
        oid = int(it.order_item_id)
        if oid in by_order_item:
            raise SaleCorrectionError(
                "SOURCE_ITEMS_AMBIGUOUS",
                f"Dokument źródłowy ma zduplikowaną pozycję order_item_id={oid}.",
            )
        by_order_item[oid] = it

    rmz_lines = (
        db.query(RMZLine)
        .filter(RMZLine.rmz_id == int(return_row.id))
        .order_by(RMZLine.id.asc())
        .all()
    )

    out: list[dict[str, Any]] = []
    for rl in rmz_lines:
        qty = commercial_correction_qty_from_rmz_line(rl)
        if qty <= 0:
            continue
        oid = int(rl.order_item_id)
        src = by_order_item.get(oid)
        if src is None:
            raise SaleCorrectionError(
                "LINE_MAPPING_FAILED",
                f"Brak pozycji dokumentu źródłowego dla order_item_id={oid}.",
            )
        src_qty = float(src.quantity or 0.0)
        if qty > src_qty + 1e-9:
            raise SaleCorrectionError(
                "CORRECTION_QTY_EXCEEDS_SOURCE",
                f"Ilość korekty {qty} przekracza ilość na FV ({src_qty}) dla order_item_id={oid}.",
            )
        amts = signed_delta_amounts(
            unit_gross=float(src.unit_gross or 0.0),
            unit_net=float(src.unit_net) if src.unit_net is not None else None,
            qty_delta=-float(qty),
            vat_percent=float(src.vat_percent if src.vat_percent is not None else 23.0),
        )
        out.append(
            {
                "order_item_id": oid,
                "product_id": int(src.product_id) if src.product_id is not None else int(rl.product_id),
                "name": str(src.name or ""),
                "sku": src.sku,
                "position": len(out),
                **amts,
            }
        )

    if not out:
        raise SaleCorrectionError(
            "NO_CORRECTABLE_QTY",
            "Brak zaakceptowanych/uszkodzonych ilości do korekty (odrzucone nie wchodzą).",
        )

    return out, build_correction_scope_hash(out)
