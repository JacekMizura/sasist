"""Canonical direct-sale session totals — discounts, VAT, gross (single source of truth)."""

from __future__ import annotations

from typing import Any, Literal

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ..sale_document_financials import net_vat_from_gross, product_vat_for_direct_sale

DiscountType = Literal["percent", "amount"]


def _discount_type(raw: object) -> DiscountType | None:
    s = str(raw or "").strip().lower()
    if s in ("percent", "amount"):
        return s  # type: ignore[return-value]
    return None


def _line_discount_gross(
    line_gross_before: float,
    *,
    discount_type: DiscountType | None,
    discount_value: float,
) -> tuple[float, float]:
    """Return (line_gross_after, discount_gross_applied)."""
    before = round(max(0.0, float(line_gross_before)), 2)
    val = max(0.0, float(discount_value or 0))
    if before <= 1e-9 or val <= 1e-9 or discount_type is None:
        return before, 0.0
    if discount_type == "percent":
        applied = round(before * min(val, 100.0) / 100.0, 2)
    else:
        applied = round(min(val, before), 2)
    after = round(max(0.0, before - applied), 2)
    return after, applied


def _line_gross_before_discount(
    db: Session,
    ln: DirectSaleSessionLine,
) -> tuple[float, float]:
    unit_net = float(ln.unit_price or 0)
    qty = max(0.0, float(ln.quantity or 0))
    vat_p = product_vat_for_direct_sale(db, int(ln.product_id))
    unit_gross = round(unit_net * (1.0 + float(vat_p) / 100.0), 2) if qty > 0 else 0.0
    return round(unit_gross * qty, 2), float(vat_p)


def compute_line_financials(
    db: Session,
    ln: DirectSaleSessionLine,
) -> dict[str, Any]:
    gross_before, vat_p = _line_gross_before_discount(db, ln)
    disc_type = _discount_type(getattr(ln, "line_discount_type", None))
    disc_val = float(getattr(ln, "line_discount_value", None) or 0)
    # Legacy: discount_amount only (amount off gross)
    legacy_amt = float(getattr(ln, "discount_amount", None) or 0)
    if disc_type is None and legacy_amt > 1e-9:
        disc_type = "amount"
        disc_val = legacy_amt

    gross_after, line_disc = _line_discount_gross(
        gross_before,
        discount_type=disc_type,
        discount_value=disc_val if disc_type == "percent" else (disc_val or legacy_amt),
    )
    line_net, line_vat = net_vat_from_gross(gross_after, vat_p)
    qty = max(0, int(round(float(ln.quantity or 0))))
    return {
        "line_id": int(ln.id),
        "product_id": int(ln.product_id),
        "quantity": qty,
        "vat_percent": vat_p,
        "gross_before_discount": gross_before,
        "line_discount_gross": line_disc,
        "line_gross": gross_after,
        "line_net": line_net,
        "line_vat": line_vat,
        "line_discount_type": disc_type,
        "line_discount_value": disc_val if disc_type else None,
    }


def compute_session_totals(db: Session, sess: DirectSaleSession) -> dict[str, Any]:
    """Aggregate session financials after line + order discounts."""
    lines_out: list[dict[str, Any]] = []
    subtotal_gross = 0.0
    line_discounts_gross = 0.0

    for ln in sorted(sess.lines or [], key=lambda x: int(x.sort_order or 0)):
        if float(ln.quantity or 0) <= 1e-9:
            continue
        fin = compute_line_financials(db, ln)
        lines_out.append(fin)
        subtotal_gross += float(fin["gross_before_discount"])
        line_discounts_gross += float(fin["line_discount_gross"])

    lines_gross = round(sum(float(x["line_gross"]) for x in lines_out), 2)

    order_disc_type = _discount_type(getattr(sess, "order_discount_type", None))
    order_disc_val = float(getattr(sess, "order_discount_value", None) or 0)
    order_discount_gross = 0.0
    total_gross = lines_gross
    if order_disc_type and order_disc_val > 1e-9 and lines_gross > 1e-9:
        total_gross, order_discount_gross = _line_discount_gross(
            lines_gross,
            discount_type=order_disc_type,
            discount_value=order_disc_val,
        )

    # Pro-rate order discount across VAT buckets for net/vat split
    ratio = (total_gross / lines_gross) if lines_gross > 1e-9 else 1.0
    total_net = 0.0
    total_vat = 0.0
    for fin in lines_out:
        lg = round(float(fin["line_gross"]) * ratio, 2)
        ln, lv = net_vat_from_gross(lg, float(fin["vat_percent"]))
        total_net += ln
        total_vat += lv

    total_net = round(total_net, 2)
    total_vat = round(total_vat, 2)
    total_gross = round(total_gross, 2)

    return {
        "subtotal_gross": round(subtotal_gross, 2),
        "line_discounts_gross": round(line_discounts_gross, 2),
        "lines_gross": lines_gross,
        "order_discount_type": order_disc_type,
        "order_discount_value": order_disc_val if order_disc_type else None,
        "order_discount_gross": round(order_discount_gross, 2),
        "total_discount_gross": round(line_discounts_gross + order_discount_gross, 2),
        "total_net": total_net,
        "total_vat": total_vat,
        "total_gross": total_gross,
        "lines": lines_out,
    }
