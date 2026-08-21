"""Map RETURN/RMZ final commercial quantities → correction line deltas (economic ledger)."""

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

BUSINESS_SOURCE_RETURN = "RETURN"
_EPS = 1e-9


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
        sid = ln.get("source_sale_document_item_id")
        entries.append(
            {
                "source_sale_document_item_id": int(sid) if sid is not None else None,
                "order_item_id": int(ln["order_item_id"]) if ln.get("order_item_id") is not None else None,
                "quantity": float(ln.get("quantity") or 0.0),
                "line_gross": float(ln.get("line_gross") or 0.0),
                "vat_percent": float(ln.get("vat_percent") or 0.0),
            }
        )
    return sorted(
        entries,
        key=lambda x: (
            int(x["source_sale_document_item_id"] or 0),
            int(x["order_item_id"] or 0),
        ),
    )


def _shipping_scope_entry(lines: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    for ln in lines:
        kind = str(ln.get("line_kind") or "").strip().upper()
        if kind != LINE_KIND_SHIPPING:
            continue
        return {
            "line_kind": LINE_KIND_SHIPPING,
            "source_sale_document_item_id": int(ln["source_sale_document_item_id"])
            if ln.get("source_sale_document_item_id") is not None
            else None,
            "include_shipping_cost": True,
            "quantity": float(ln.get("quantity") or 0.0),
            "line_gross": float(ln.get("line_gross") or 0.0),
            "line_net": float(ln.get("line_net") or 0.0),
            "line_vat": float(ln.get("line_vat") or 0.0),
            "vat_percent": float(ln.get("vat_percent") or 0.0),
            "name": str(ln.get("name") or ""),
        }
    return None


def build_correction_scope_hash(
    lines: list[dict[str, Any]],
    *,
    prior_ledger: dict[int, float] | None = None,
) -> str:
    """
    Exact-request identity for the *new delta* lines being issued.

    ``prior_ledger`` (source_item_id → already-corrected qty for this RETURN) is included
    so two sequential identical unit deltas (e.g. -1 then another -1 after qty growth)
    do not collide on the same hash.
    """
    ship = _shipping_scope_entry(lines)
    prior = {
        str(int(k)): float(v)
        for k, v in sorted((prior_ledger or {}).items(), key=lambda kv: int(kv[0]))
    }
    payload = {
        "products": _product_scope_entries(lines),
        "shipping": ship,
        "include_shipping_cost": ship is not None,
        "prior_ledger": prior,
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


def _list_corrections_for_return(
    db: Session,
    *,
    source_sale_document_id: str,
    return_id: int,
) -> list[SaleDocument]:
    return (
        db.query(SaleDocument)
        .filter(
            SaleDocument.source_sale_document_id == str(source_sale_document_id),
            SaleDocument.document_kind == "CORRECTION",
            SaleDocument.business_source_type == BUSINESS_SOURCE_RETURN,
            SaleDocument.business_source_id == str(int(return_id)),
        )
        .order_by(SaleDocument.created_at.asc(), SaleDocument.id.asc())
        .all()
    )


def _list_all_source_corrections(db: Session, *, source_sale_document_id: str) -> list[SaleDocument]:
    return (
        db.query(SaleDocument)
        .filter(
            SaleDocument.source_sale_document_id == str(source_sale_document_id),
            SaleDocument.document_kind == "CORRECTION",
        )
        .order_by(SaleDocument.created_at.asc(), SaleDocument.id.asc())
        .all()
    )


def _assert_correction_items_have_source_fk(items: list[SaleDocumentItem]) -> None:
    for it in items:
        if getattr(it, "source_sale_document_item_id", None) is None:
            raise SaleCorrectionError(
                "LEGACY_CORRECTION_SCOPE_AMBIGUOUS",
                "Istniejąca korekta nie ma powiązania source_sale_document_item_id — "
                "nie można bezpiecznie wystawić kolejnej delty.",
            )


def _sum_qty_by_source_item(
    db: Session,
    corrections: list[SaleDocument],
    *,
    require_fk: bool,
) -> dict[int, float]:
    totals: dict[int, float] = {}
    for corr in corrections:
        items = list_sale_document_items(db, str(corr.id))
        if require_fk:
            _assert_correction_items_have_source_fk(items)
        for it in items:
            sid = getattr(it, "source_sale_document_item_id", None)
            if sid is None:
                continue
            totals[int(sid)] = totals.get(int(sid), 0.0) + float(it.quantity or 0.0)
    return totals


def _shipping_correction_line_from_source(
    ship: SaleDocumentItem,
    *,
    qty_delta: float,
    position: int,
) -> dict[str, Any]:
    """Signed shipping delta proportional to qty_delta (typically -1), copying unit snapshot."""
    unit_net = abs(float(ship.unit_net)) if ship.unit_net is not None else abs(float(ship.line_net or 0.0))
    unit_gross = abs(float(ship.unit_gross)) if ship.unit_gross is not None else abs(float(ship.line_gross or 0.0))
    # Full source line amounts for qty=-1; scale if partial (v1 only uses ±1).
    scale = abs(float(qty_delta))
    sign = -1.0 if qty_delta < 0 else (1.0 if qty_delta > 0 else 0.0)
    src_net = abs(float(ship.line_net or 0.0))
    src_vat = abs(float(ship.line_vat or 0.0))
    src_gross = abs(float(ship.line_gross or 0.0))
    return {
        "line_kind": LINE_KIND_SHIPPING,
        "source_sale_document_item_id": int(ship.id),
        "order_item_id": None,
        "product_id": None,
        "name": str(ship.name or "Koszt wysyłki")[:512],
        "sku": None,
        "position": position,
        "quantity": float(qty_delta),
        "unit_net": round(unit_net, 4),
        "unit_gross": round(unit_gross, 4),
        "vat_percent": float(ship.vat_percent if ship.vat_percent is not None else 0.0),
        "line_net": round(sign * src_net * scale, 2),
        "line_vat": round(sign * src_vat * scale, 2),
        "line_gross": round(sign * src_gross * scale, 2),
    }


def _build_target_lines(
    db: Session,
    *,
    source: SaleDocument,
    return_row: WmsOrderReturn,
    include_shipping_cost: bool,
) -> list[dict[str, Any]]:
    """Full target economic scope for this RETURN (not yet reduced by already-corrected)."""
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
        if qty > src_qty + _EPS:
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
                "source_sale_document_item_id": int(src.id),
                "order_item_id": oid,
                "product_id": int(src.product_id) if src.product_id is not None else int(rl.product_id),
                "name": str(src.name or ""),
                "sku": src.sku,
                "position": len(out),
                **amts,
            }
        )

    if include_shipping_cost:
        ship = _source_shipping_item(source_items)
        if ship is None:
            raise SaleCorrectionError(
                "SOURCE_SHIPPING_NOT_AVAILABLE",
                "Dokument źródłowy nie ma zsnapshotowanego kosztu dostawy (SHIPPING) — "
                "nie można uwzględnić dostawy w korekcie.",
            )
        out.append(_shipping_correction_line_from_source(ship, qty_delta=-1.0, position=len(out)))

    if not out:
        raise SaleCorrectionError(
            "NO_CORRECTABLE_QTY",
            "Brak zaakceptowanych/uszkodzonych ilości do korekty (odrzucone nie wchodzą).",
        )
    return out


def _reduce_to_new_delta(
    db: Session,
    *,
    source: SaleDocument,
    return_row: WmsOrderReturn,
    target_lines: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    new_delta = target_delta - already_delta (per source_sale_document_item_id).

    Scope reduction (already more negative than target) → blocked.
    Global over-correction vs source item quantity → integrity error.
    """
    return_corrections = _list_corrections_for_return(
        db, source_sale_document_id=str(source.id), return_id=int(return_row.id)
    )
    # Any correction of this source without FK blocks further economic ledger ops.
    for corr in _list_all_source_corrections(db, source_sale_document_id=str(source.id)):
        _assert_correction_items_have_source_fk(list_sale_document_items(db, str(corr.id)))

    already_return = _sum_qty_by_source_item(db, return_corrections, require_fk=False)
    already_global = _sum_qty_by_source_item(
        db,
        _list_all_source_corrections(db, source_sale_document_id=str(source.id)),
        require_fk=False,
    )

    source_by_id = {int(it.id): it for it in list_sale_document_items(db, str(source.id))}
    new_lines: list[dict[str, Any]] = []

    for ln in target_lines:
        sid = int(ln["source_sale_document_item_id"])
        target_qty = float(ln["quantity"])
        already_qty = float(already_return.get(sid, 0.0))
        # Both target and already are typically negative for credits.
        # new = target - already  e.g. target=-2, already=-1 → new=-1
        new_qty = target_qty - already_qty

        if abs(already_qty) > abs(target_qty) + _EPS:
            raise SaleCorrectionError(
                "CORRECTION_SCOPE_REDUCED_AFTER_ISSUE",
                "Zakres zwrotu zmniejszył się względem już wystawionych korekt — "
                "automatyczna korekta odwrotna nie jest wspierana.",
            )

        if abs(new_qty) <= _EPS:
            continue

        # Same sign as target (further credit) — never auto-reverse.
        if new_qty * target_qty < 0:
            raise SaleCorrectionError(
                "CORRECTION_SCOPE_REDUCED_AFTER_ISSUE",
                "Zakres zwrotu zmniejszył się względem już wystawionych korekt — "
                "automatyczna korekta odwrotna nie jest wspierana.",
            )

        src = source_by_id.get(sid)
        if src is None:
            raise SaleCorrectionError(
                "SOURCE_ITEMS_MISSING",
                f"Brak pozycji źródłowej id={sid} dla delty korekty.",
            )
        src_qty = abs(float(src.quantity or 0.0))
        projected_global = already_global.get(sid, 0.0) + new_qty
        if abs(projected_global) > src_qty + _EPS:
            raise SaleCorrectionError(
                "CORRECTION_OVER_SOURCE",
                f"Suma korekt dla pozycji źródłowej id={sid} przekroczyłaby ilość na FV ({src_qty}).",
            )

        kind = str(ln.get("line_kind") or LINE_KIND_PRODUCT).strip().upper()
        if kind == LINE_KIND_SHIPPING:
            new_lines.append(
                _shipping_correction_line_from_source(src, qty_delta=new_qty, position=len(new_lines))
            )
        else:
            amts = signed_delta_amounts(
                unit_gross=float(src.unit_gross or 0.0),
                unit_net=float(src.unit_net) if src.unit_net is not None else None,
                qty_delta=new_qty,
                vat_percent=float(src.vat_percent if src.vat_percent is not None else 23.0),
            )
            new_lines.append(
                {
                    "line_kind": LINE_KIND_PRODUCT,
                    "source_sale_document_item_id": sid,
                    "order_item_id": int(ln["order_item_id"]) if ln.get("order_item_id") is not None else None,
                    "product_id": int(ln["product_id"]) if ln.get("product_id") is not None else None,
                    "name": str(ln.get("name") or ""),
                    "sku": ln.get("sku"),
                    "position": len(new_lines),
                    **amts,
                }
            )

    return new_lines


def build_return_correction_lines(
    db: Session,
    *,
    source: SaleDocument,
    return_row: WmsOrderReturn,
    include_shipping_cost: bool = False,
) -> tuple[list[dict[str, Any]], str]:
    """
    Build *new* signed deltas for this RETURN (target − already corrected).

    Empty list + empty hash means no new economic delta (caller should no-op / reuse).
    """
    assert_return_ready_for_sale_correction(db, return_row=return_row)

    if int(return_row.tenant_id) != int(source.tenant_id):
        raise SaleCorrectionError("TENANT_MISMATCH", "Zwrot i dokument źródłowy należą do innego tenanta.")
    if int(return_row.order_id) != int(source.order_id):
        raise SaleCorrectionError("ORDER_MISMATCH", "Zwrot nie należy do zamówienia dokumentu źródłowego.")

    target = _build_target_lines(
        db,
        source=source,
        return_row=return_row,
        include_shipping_cost=bool(include_shipping_cost),
    )
    return_corrections = _list_corrections_for_return(
        db, source_sale_document_id=str(source.id), return_id=int(return_row.id)
    )
    # Snapshot prior ledger before reducing (for exact-request hash identity).
    for corr in _list_all_source_corrections(db, source_sale_document_id=str(source.id)):
        _assert_correction_items_have_source_fk(list_sale_document_items(db, str(corr.id)))
    prior_ledger = _sum_qty_by_source_item(db, return_corrections, require_fk=False)

    new_lines = _reduce_to_new_delta(
        db,
        source=source,
        return_row=return_row,
        target_lines=target,
    )
    if not new_lines:
        return [], ""
    return new_lines, build_correction_scope_hash(new_lines, prior_ledger=prior_ledger)
