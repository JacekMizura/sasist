"""Financial helpers for persisted sale document lines (primary + signed correction deltas)."""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Sequence

from ...models.sale_document_item import SaleDocumentItem
from ..sale_document_financials import DEFAULT_VAT_PERCENT, net_vat_from_gross


def compute_totals_from_sale_document_items(items: Sequence[SaleDocumentItem | dict[str, Any]]) -> dict[str, Any]:
    """
    Aggregate totals from persisted lines.

    Correction lines use **signed delta** quantities/amounts (typically negative).
    Totals are the algebraic sum of line_* fields (already signed).
    """
    lines_out: list[dict[str, Any]] = []
    total_net = 0.0
    total_vat = 0.0
    total_gross = 0.0
    vat_buckets: dict[str, dict[str, float]] = defaultdict(lambda: {"net": 0.0, "vat": 0.0, "gross": 0.0})

    for idx, raw in enumerate(items or []):
        if isinstance(raw, SaleDocumentItem):
            qty = float(raw.quantity or 0.0)
            vp = float(raw.vat_percent if raw.vat_percent is not None else DEFAULT_VAT_PERCENT)
            ln = float(raw.line_net or 0.0)
            lv = float(raw.line_vat or 0.0)
            lg = float(raw.line_gross or 0.0)
            oid = int(raw.order_item_id) if raw.order_item_id is not None else None
            pid = int(raw.product_id) if raw.product_id is not None else None
            name = str(raw.name or "")
            sku = str(raw.sku or "").strip() or None
            unit_net = float(raw.unit_net) if raw.unit_net is not None else None
            unit_gross = float(raw.unit_gross) if raw.unit_gross is not None else None
            position = int(raw.position or idx)
        else:
            qty = float(raw.get("quantity") or 0.0)
            vp = float(raw.get("vat_percent") if raw.get("vat_percent") is not None else DEFAULT_VAT_PERCENT)
            ln = float(raw.get("line_net") or 0.0)
            lv = float(raw.get("line_vat") or 0.0)
            lg = float(raw.get("line_gross") or 0.0)
            oid = int(raw["order_item_id"]) if raw.get("order_item_id") is not None else None
            pid = int(raw["product_id"]) if raw.get("product_id") is not None else None
            name = str(raw.get("name") or "")
            sku = str(raw.get("sku") or "").strip() or None
            unit_net = float(raw["unit_net"]) if raw.get("unit_net") is not None else None
            unit_gross = float(raw["unit_gross"]) if raw.get("unit_gross") is not None else None
            position = int(raw.get("position") if raw.get("position") is not None else idx)

        total_net += ln
        total_vat += lv
        total_gross += lg
        key = f"{vp:g}"
        vat_buckets[key]["net"] += ln
        vat_buckets[key]["vat"] += lv
        vat_buckets[key]["gross"] += lg
        lines_out.append(
            {
                "order_item_id": oid,
                "product_id": pid,
                "name": name or (f"Produkt #{pid}" if pid else "—"),
                "sku": sku,
                "quantity": qty,
                "unit_net": unit_net,
                "unit_gross": unit_gross,
                "vat_percent": vp,
                "line_net": round(ln, 2),
                "line_vat": round(lv, 2),
                "line_gross": round(lg, 2),
                "position": position,
            }
        )

    vat_rows = []
    for rate_key in sorted(vat_buckets.keys(), key=lambda k: float(k), reverse=True):
        b = vat_buckets[rate_key]
        vat_rows.append(
            {
                "vat_percent": float(rate_key),
                "net": round(b["net"], 2),
                "vat": round(b["vat"], 2),
                "gross": round(b["gross"], 2),
            }
        )

    return {
        "total_net": round(total_net, 2),
        "total_vat": round(total_vat, 2),
        "total_gross": round(total_gross, 2),
        "lines": lines_out,
        "vat_rows": vat_rows,
    }


def signed_delta_amounts(
    *,
    unit_gross: float,
    unit_net: float | None,
    qty_delta: float,
    vat_percent: float,
) -> dict[str, float]:
    """
    Build signed line amounts for a correction delta.

    qty_delta should be negative for a credit (reducing sale).
    Unit prices stay positive; line totals follow the sign of qty_delta.
    """
    q = float(qty_delta)
    vp = max(0.0, float(vat_percent))
    ug = abs(float(unit_gross or 0.0))
    un = abs(float(unit_net)) if unit_net is not None else None
    if un is None:
        un, _ = net_vat_from_gross(ug, vp) if ug > 0 else (0.0, 0.0)
        if ug > 0 and abs(q) > 0:
            # keep unit_net consistent with single-unit split
            pass

    sign = -1.0 if q < 0 else (1.0 if q > 0 else 0.0)
    abs_q = abs(q)
    line_gross_abs = round(ug * abs_q, 2)
    line_net_abs, line_vat_abs = net_vat_from_gross(line_gross_abs, vp)
    return {
        "unit_net": round(float(un or 0.0), 4),
        "unit_gross": round(ug, 4),
        "line_net": round(sign * line_net_abs, 2),
        "line_vat": round(sign * line_vat_abs, 2),
        "line_gross": round(sign * line_gross_abs, 2),
        "quantity": q,
        "vat_percent": vp,
    }
