"""Validate direct-sale discounts against tenant/warehouse settings."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ..direct_sales_settings_service import resolve_direct_sales_settings
from .errors import DirectSaleError
from .line_delete_service import get_session_line
from .session_financials_service import compute_line_financials, compute_session_totals

_MAX_COMPARE_EPS = Decimal("0.0001")
_MONEY_QUANT = Decimal("0.01")


def _money(value: object) -> Decimal:
    return Decimal(str(value or 0)).quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)


def _percent(value: object) -> Decimal:
    return Decimal(str(value or 0))


def _discount_settings(db: Session, *, tenant_id: int, warehouse_id: int):
    settings = resolve_direct_sales_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    return settings.resolved.discounts


def _effective_percent(applied: Decimal, base: Decimal) -> Decimal:
    if base <= Decimal("0"):
        return Decimal("0")
    return (applied / base * Decimal("100")).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _session_effective_discount_percent(subtotal_gross: Decimal, total_gross: Decimal) -> Decimal:
    if subtotal_gross <= Decimal("0"):
        return Decimal("0")
    return _effective_percent(subtotal_gross - total_gross, subtotal_gross)


def _raise_exceeds_max(max_percent: float) -> None:
    raise DirectSaleError(
        f"Maksymalny łączny rabat to {max_percent:g}%.",
        code="discount_exceeds_max",
        http_status=400,
    )


def _check_percent_cap(*, effective: Decimal, max_p: Decimal, context: str) -> None:
    if effective > max_p + _MAX_COMPARE_EPS:
        _raise_exceeds_max(float(max_p))


def _validate_individual_discount_caps(
    db: Session,
    sess: DirectSaleSession,
    *,
    max_p: Decimal,
) -> None:
    totals = compute_session_totals(db, sess)
    lines_gross = _money(totals["lines_gross"])

    for ln in sorted(sess.lines or [], key=lambda x: int(x.sort_order or 0)):
        if float(ln.quantity or 0) <= 1e-9:
            continue
        fin = compute_line_financials(db, ln)
        gross_before = _money(fin["gross_before_discount"])
        disc_type = str(getattr(ln, "line_discount_type", None) or "").strip().lower()
        if not disc_type or gross_before <= Decimal("0"):
            continue
        if disc_type == "percent":
            disc_val = _money(getattr(ln, "line_discount_value", None) or 0)
            if disc_val <= Decimal("0"):
                continue
            _check_percent_cap(effective=disc_val, max_p=max_p, context="line_percent")
        elif disc_type == "amount":
            applied = _money(fin["line_discount_gross"])
            if applied <= Decimal("0"):
                continue
            _check_percent_cap(
                effective=_effective_percent(applied, gross_before),
                max_p=max_p,
                context="line_amount",
            )

    order_type = str(getattr(sess, "order_discount_type", None) or "").strip().lower()
    order_val = _money(getattr(sess, "order_discount_value", None) or 0)
    if order_type and order_val > Decimal("0") and lines_gross > Decimal("0"):
        if order_type == "percent":
            _check_percent_cap(effective=order_val, max_p=max_p, context="order_percent")
        elif order_type == "amount":
            order_applied = _money(totals.get("order_discount_gross") or 0)
            if order_applied <= Decimal("0"):
                order_applied = order_val
            _check_percent_cap(
                effective=_effective_percent(order_applied, lines_gross),
                max_p=max_p,
                context="order_amount",
            )


def _validate_session_discount_state(
    db: Session,
    sess: DirectSaleSession,
    *,
    context: Literal["patch", "complete"] = "patch",
) -> None:
    cfg = _discount_settings(db, tenant_id=int(sess.tenant_id), warehouse_id=int(sess.warehouse_id))
    max_p = _percent(cfg.max_discount_percent)

    has_line_discount = False
    for ln in sess.lines or []:
        dt = str(getattr(ln, "line_discount_type", None) or "").strip().lower()
        val = float(getattr(ln, "line_discount_value", None) or 0)
        if dt and val > 1e-9:
            has_line_discount = True
            break

    order_dt = str(getattr(sess, "order_discount_type", None) or "").strip().lower()
    order_val = float(getattr(sess, "order_discount_value", None) or 0)
    has_order_discount = bool(order_dt and order_val > 1e-9)

    if has_line_discount and not cfg.allow_line_discounts:
        raise DirectSaleError(
            "Rabaty pozycji są wyłączone — skoryguj sesję przed zakończeniem."
            if context == "complete"
            else "Rabaty pozycji są wyłączone.",
            code="line_discounts_disabled",
            http_status=400,
        )
    if has_order_discount and not cfg.allow_order_discounts:
        raise DirectSaleError(
            "Rabaty zamówienia są wyłączone — skoryguj sesję przed zakończeniem."
            if context == "complete"
            else "Rabaty zamówienia są wyłączone.",
            code="order_discounts_disabled",
            http_status=400,
        )

    totals = compute_session_totals(db, sess)
    subtotal = _money(totals["subtotal_gross"])
    total_gross = _money(totals["total_gross"])
    if subtotal <= Decimal("0"):
        return

    _validate_individual_discount_caps(db, sess, max_p=max_p)

    session_effective = _session_effective_discount_percent(subtotal, total_gross)
    _check_percent_cap(effective=session_effective, max_p=max_p, context="session_effective")


def _simulate_line_discount(
    line: DirectSaleSessionLine,
    *,
    discount_type: str | None,
    discount_value: float,
) -> tuple[object | None, float]:
    old_type = getattr(line, "line_discount_type", None)
    old_val = float(getattr(line, "line_discount_value", None) or 0)
    dt = str(discount_type or "").strip().lower()
    line.line_discount_type = dt or None
    line.line_discount_value = max(0.0, float(discount_value or 0))
    return old_type, old_val


def _simulate_order_discount(
    sess: DirectSaleSession,
    *,
    discount_type: str | None,
    discount_value: float,
) -> tuple[object | None, float]:
    old_type = getattr(sess, "order_discount_type", None)
    old_val = float(getattr(sess, "order_discount_value", None) or 0)
    dt = str(discount_type or "").strip().lower()
    sess.order_discount_type = dt or None
    sess.order_discount_value = max(0.0, float(discount_value or 0))
    return old_type, old_val


def _line_from_session(
    db: Session,
    sess: DirectSaleSession,
    *,
    line_id: int,
) -> DirectSaleSessionLine:
    for ln in sess.lines or []:
        if int(getattr(ln, "id", 0) or 0) == int(line_id):
            return ln
    return get_session_line(db, sess, line_id=line_id)


def validate_line_discount(
    db: Session,
    sess: DirectSaleSession,
    *,
    line_id: int,
    discount_type: str | None,
    discount_value: float,
) -> None:
    dt = str(discount_type or "").strip().lower()
    val = float(discount_value or 0)
    if not dt or val <= 1e-9:
        _validate_session_discount_state(db, sess, context="patch")
        return

    cfg = _discount_settings(db, tenant_id=int(sess.tenant_id), warehouse_id=int(sess.warehouse_id))
    if not cfg.allow_line_discounts:
        raise DirectSaleError("Rabaty pozycji są wyłączone.", code="line_discounts_disabled", http_status=400)

    line = _line_from_session(db, sess, line_id=line_id)
    old_type, old_val = _simulate_line_discount(line, discount_type=dt, discount_value=val)
    try:
        _validate_session_discount_state(db, sess, context="patch")
    finally:
        line.line_discount_type = old_type
        line.line_discount_value = old_val


def validate_order_discount(
    db: Session,
    sess: DirectSaleSession,
    *,
    discount_type: str | None,
    discount_value: float,
) -> None:
    dt = str(discount_type or "").strip().lower()
    val = float(discount_value or 0)
    if not dt or val <= 1e-9:
        _validate_session_discount_state(db, sess, context="patch")
        return

    cfg = _discount_settings(db, tenant_id=int(sess.tenant_id), warehouse_id=int(sess.warehouse_id))
    if not cfg.allow_order_discounts:
        raise DirectSaleError("Rabaty zamówienia są wyłączone.", code="order_discounts_disabled", http_status=400)

    old_type, old_val = _simulate_order_discount(sess, discount_type=dt, discount_value=val)
    try:
        _validate_session_discount_state(db, sess, context="patch")
    finally:
        sess.order_discount_type = old_type
        sess.order_discount_value = old_val


def validate_session_discounts_for_complete(db: Session, sess: DirectSaleSession) -> None:
    """Re-validate stored discounts against live settings before completing sale."""
    _validate_session_discount_state(db, sess, context="complete")
