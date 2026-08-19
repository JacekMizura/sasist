"""Allocate session order-level discount across lines for Order / sale documents."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession
from ..sale_document_financials import net_vat_from_gross
from .session_financials_service import compute_session_totals

_MONEY_QUANT = Decimal("0.01")


def _money(value: object) -> Decimal:
    return Decimal(str(value or 0)).quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)


def compute_final_line_gross_allocations(
    db: Session,
    sess: DirectSaleSession,
) -> list[dict[str, Any]]:
    """
    Deterministic final brutto per session line after line + order discounts.

    Last qualifying line absorbs rounding remainder so sum(final) == session total_gross.
    """
    totals = compute_session_totals(db, sess)
    lines_fin: list[dict[str, Any]] = list(totals.get("lines") or [])
    if not lines_fin:
        return []

    total_gross = _money(totals["total_gross"])
    lines_gross = _money(totals["lines_gross"])
    order_discount_gross = _money(totals.get("order_discount_gross") or 0)

    if lines_gross <= Decimal("0") or order_discount_gross <= Decimal("0"):
        out: list[dict[str, Any]] = []
        for fin in lines_fin:
            final_gross_f = float(_money(fin["line_gross"]))
            vat_p = float(fin["vat_percent"])
            line_net, line_vat = net_vat_from_gross(final_gross_f, vat_p)
            qty = max(0, int(fin.get("quantity") or 0))
            out.append(
                {
                    **fin,
                    "final_line_gross": final_gross_f,
                    "order_discount_allocation_gross": 0.0,
                    "final_line_net": float(line_net),
                    "final_line_vat": float(line_vat),
                    "final_unit_net": round(float(line_net) / qty, 4) if qty > 0 else 0.0,
                }
            )
        return out

    ratio = (total_gross / lines_gross) if lines_gross > Decimal("0") else Decimal("1")
    out: list[dict[str, Any]] = []
    allocated_final = Decimal("0")
    allocated_order = Decimal("0")
    last_idx = len(lines_fin) - 1

    for idx, fin in enumerate(lines_fin):
        line_gross = _money(fin["line_gross"])
        if idx == last_idx:
            final_gross = total_gross - allocated_final
            order_alloc = order_discount_gross - allocated_order
        else:
            final_gross = (line_gross * ratio).quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)
            order_alloc = (line_gross - final_gross).quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)
            allocated_final += final_gross
            allocated_order += order_alloc

        final_gross_f = float(final_gross)
        vat_p = float(fin["vat_percent"])
        line_net, line_vat = net_vat_from_gross(final_gross_f, vat_p)
        qty = max(0, int(fin.get("quantity") or 0))
        out.append(
            {
                **fin,
                "final_line_gross": final_gross_f,
                "order_discount_allocation_gross": float(order_alloc),
                "final_line_net": float(line_net),
                "final_line_vat": float(line_vat),
                "final_unit_net": round(line_net / qty, 4) if qty > 0 else 0.0,
            }
        )

    return out
