"""Group production RW document lines by product × LOT × expiry."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Any

from ...models.stock_document import StockDocument, StockDocumentItem
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL


@dataclass(frozen=True)
class RwIssueSlice:
    product_id: int
    quantity: float
    location_id: int
    batch_number: str
    expiry_date: date
    serial_number: str | None = None
    unit_cost_net: float | None = None
    cost_source: str | None = None
    source_document_id: int | None = None
    source_document_line_id: int | None = None


def _parse_expiry(raw: Any) -> date:
    if raw is None or raw == "":
        return NO_EXPIRY_SENTINEL
    if isinstance(raw, date):
        return raw if raw < NO_EXPIRY_SENTINEL else NO_EXPIRY_SENTINEL
    try:
        d = date.fromisoformat(str(raw)[:10])
        return d if d < NO_EXPIRY_SENTINEL else NO_EXPIRY_SENTINEL
    except ValueError:
        return NO_EXPIRY_SENTINEL


def lot_key(batch_number: str | None, expiry: date | None) -> tuple[str, date]:
    bn = str(batch_number or "").strip()
    exp = expiry if expiry is not None and expiry < NO_EXPIRY_SENTINEL else NO_EXPIRY_SENTINEL
    return bn, exp


def slices_from_committed_dicts(product_id: int, committed: list[dict[str, Any]]) -> list[RwIssueSlice]:
    out: list[RwIssueSlice] = []
    for s in committed:
        loc_id = int(s.get("location_id") or 0)
        qty = float(s.get("quantity") or 0)
        if loc_id <= 0 or qty <= 1e-12:
            continue
        bn, exp = lot_key(s.get("batch_number"), _parse_expiry(s.get("expiry_date")))
        sn = str(s.get("serial_number") or "").strip() or None
        unit_raw = s.get("unit_cost_net")
        try:
            unit = float(unit_raw) if unit_raw is not None else None
        except (TypeError, ValueError):
            unit = None
        src = str(s.get("cost_source") or "").strip() or None
        src_doc = int(s["source_document_id"]) if s.get("source_document_id") else None
        src_line = int(s["source_document_line_id"]) if s.get("source_document_line_id") else None
        out.append(
            RwIssueSlice(
                product_id=int(product_id),
                quantity=qty,
                location_id=loc_id,
                batch_number=bn,
                expiry_date=exp,
                serial_number=sn,
                unit_cost_net=unit,
                cost_source=src,
                source_document_id=src_doc,
                source_document_line_id=src_line,
            )
        )
    return out


def group_slices_by_lot(slices: list[RwIssueSlice]) -> dict[tuple[int, str, date], list[RwIssueSlice]]:
    grouped: dict[tuple[int, str, date], list[RwIssueSlice]] = defaultdict(list)
    for sl in slices:
        key = (int(sl.product_id), sl.batch_number, sl.expiry_date)
        grouped[key].append(sl)
    return grouped


def _weighted_unit(group: list[RwIssueSlice], fallback: float) -> float:
    qty = 0.0
    cost = 0.0
    for s in group:
        q = float(s.quantity or 0)
        if q <= 1e-12:
            continue
        u = float(s.unit_cost_net) if s.unit_cost_net is not None else float(fallback)
        qty += q
        cost += q * u
    if qty <= 1e-12:
        return float(fallback)
    return round(cost / qty, 6)


def create_rw_lines_for_lot_groups(
    db,
    *,
    rw_doc: StockDocument,
    grouped: dict[tuple[int, str, date], list[RwIssueSlice]],
    unit_net_by_product: dict[int, float],
) -> dict[tuple[int, str, date], StockDocumentItem]:
    """One StockDocumentItem per (product, LOT, expiry). Unit cost = weighted consume cost."""
    lines: dict[tuple[int, str, date], StockDocumentItem] = {}
    for key, group in sorted(grouped.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2].isoformat())):
        pid, bn, exp = key
        qty = sum(float(s.quantity) for s in group)
        if qty <= 1e-12:
            continue
        fallback = float(unit_net_by_product.get(int(pid), 0.0) or 0.0)
        unit = _weighted_unit(group, fallback)
        line = StockDocumentItem(
            document_id=int(rw_doc.id),
            product_id=int(pid),
            ordered_quantity=qty,
            received_quantity=qty,
            quantity=qty,
            batch_number=bn,
            expiry_date=exp,
        )
        db.add(line)
        db.flush()
        line.purchase_price_net = float(unit)
        lines[key] = line
    return lines
