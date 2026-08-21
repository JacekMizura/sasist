"""Map RETURN/RMZ final commercial quantities → correction line deltas."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.sale_document import SaleDocument
from ...models.sale_document_item import LINE_KIND_PRODUCT, LINE_KIND_SHIPPING, SaleDocumentItem
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


def _product_scope_entries(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for ln in lines:
        kind = str(ln.get("line_kind") or LINE_KIND_PRODUCT).strip().upper()
        if kind != LINE_KIND_PRODUCT:
            continue
        oid = ln.get("order_item_id")
        if oid is None:
            continue
        entries.append(
            {
                "order_item_id": int(oid),
                "quantity": float(ln.get("quantity") or 0.0),
                "line_gross": float(ln.get("line_gross") or 0.0),
                "vat_percent": float(ln.get("vat_percent") or 0.0),
            }
        )
    return sorted(entries, key=lambda x: int(x["order_item_id"]))


def _shipping_scope_entry(lines: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    for ln in lines:
        kind = str(ln.get("line_kind") or "").strip().upper()
        if kind != LINE_KIND_SHIPPING:
            continue
        return {
            "line_kind": LINE_KIND_SHIPPING,
            "include_shipping_cost": True,
            "quantity": float(ln.get("quantity") or 0.0),
            "line_gross": float(ln.get("line_gross") or 0.0),
            "line_net": float(ln.get("line_net") or 0.0),
            "line_vat": float(ln.get("line_vat") or 0.0),
            "vat_percent": float(ln.get("vat_percent") or 0.0),
            "name": str(ln.get("name") or ""),
        }
    return None


def build_correction_scope_hash(lines: list[dict[str, Any]]) -> str:
    """
    Distinguish products-only vs products+shipping.

    Products are keyed by order_item_id; shipping by immutable source snapshot values.
    """
    payload = {
        "products": _product_scope_entries(lines),
        "shipping": _shipping_scope_entry(lines),
        "include_shipping_cost": _shipping_scope_entry(lines) is not None,
    }
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=True, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _source_shipping_item(source_items: list[SaleDocumentItem]) -> Optional[SaleDocumentItem]:
    ships = [
        it
        for it in source_items
        if str(getattr(it, "line_kind", None) or "").strip().upper() == LINE_KIND_SHIPPING
    ]
    if not ships:
        return None
    if len(ships) > 1:
        raise SaleCorrectionError(
            "SOURCE_SHIPPING_AMBIGUOUS",
            "Dokument źródłowy ma więcej niż jedną pozycję SHIPPING.",
        )
    return ships[0]


def source_shipping_already_corrected(db: Session, *, source_sale_document_id: str) -> bool:
    """True if any CORRECTION of this source already contains a SHIPPING delta line."""
    corr_ids = [
        str(r.id)
        for r in db.query(SaleDocument)
        .filter(
            SaleDocument.source_sale_document_id == str(source_sale_document_id),
            SaleDocument.document_kind == "CORRECTION",
        )
        .all()
    ]
    if not corr_ids:
        return False
    row = (
        db.query(SaleDocumentItem.id)
        .filter(
            SaleDocumentItem.sale_document_id.in_(corr_ids),
            SaleDocumentItem.line_kind == LINE_KIND_SHIPPING,
        )
        .first()
    )
    return row is not None


def _shipping_correction_line_from_source(ship: SaleDocumentItem, *, position: int) -> dict[str, Any]:
    """Signed negative delta copying historical source SHIPPING amounts (no VAT recompute)."""
    line_net = -abs(float(ship.line_net or 0.0))
    line_vat = -abs(float(ship.line_vat or 0.0))
    line_gross = -abs(float(ship.line_gross or 0.0))
    unit_net = abs(float(ship.unit_net)) if ship.unit_net is not None else abs(line_net)
    unit_gross = abs(float(ship.unit_gross)) if ship.unit_gross is not None else abs(line_gross)
    return {
        "line_kind": LINE_KIND_SHIPPING,
        "order_item_id": None,
        "product_id": None,
        "name": str(ship.name or "Koszt wysyłki")[:512],
        "sku": None,
        "position": position,
        "quantity": -1.0,
        "unit_net": round(unit_net, 4),
        "unit_gross": round(unit_gross, 4),
        "vat_percent": float(ship.vat_percent if ship.vat_percent is not None else 0.0),
        "line_net": round(line_net, 2),
        "line_vat": round(line_vat, 2),
        "line_gross": round(line_gross, 2),
    }


def build_return_correction_lines(
    db: Session,
    *,
    source: SaleDocument,
    return_row: WmsOrderReturn,
    include_shipping_cost: bool = False,
) -> tuple[list[dict[str, Any]], str]:
    """
    Deterministic RMZ → correction deltas using source document item snapshots.

    Mapping SSOT: order_item_id on RMZLine ↔ PRODUCT SaleDocumentItem.
    Shipping SSOT: source SaleDocumentItem line_kind=SHIPPING (never live Order).
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
        kind = str(getattr(it, "line_kind", None) or LINE_KIND_PRODUCT).strip().upper()
        if kind != LINE_KIND_PRODUCT:
            continue
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
                "line_kind": LINE_KIND_PRODUCT,
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

    if include_shipping_cost:
        ship = _source_shipping_item(source_items)
        if ship is None:
            raise SaleCorrectionError(
                "SOURCE_SHIPPING_NOT_AVAILABLE",
                "Dokument źródłowy nie ma zsnapshotowanego kosztu dostawy (SHIPPING) — "
                "nie można uwzględnić dostawy w korekcie.",
            )
        out.append(_shipping_correction_line_from_source(ship, position=len(out)))

    return out, build_correction_scope_hash(out)
