"""Order line net/VAT/gross helpers for customer analytics."""

from __future__ import annotations

import json
from typing import Any, Tuple

from ...models.order import Order
from ...models.order_item import OrderItem, order_item_is_replaced_line


def order_import_meta_dict(order: Order) -> dict[str, Any]:
    raw = getattr(order, "import_metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def panel_payment_bucket(meta: dict[str, Any]) -> str:
    ps = (meta.get("panel_payment_status") or "").strip().lower()
    if not ps:
        return "unknown"
    paid_kw = ("paid", "opłac", "oplac", "zapłac", "zaplac", "completed", "done", "yes", "tak", "1")
    unpaid_kw = ("unpaid", "nieopłac", "nieoplac", "pending", "wait", "no", "nie", "0", "false")
    if any(k in ps for k in paid_kw):
        return "paid"
    if any(k in ps for k in unpaid_kw):
        return "unpaid"
    return "unknown"


def order_is_paid(order: Order) -> bool:
    return panel_payment_bucket(order_import_meta_dict(order)) == "paid"


def _line_meta_dict(item: OrderItem) -> dict[str, Any]:
    raw = getattr(item, "metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def line_financials(item: OrderItem) -> Tuple[float, float, float]:
    """Return (net, vat, gross) for one order line."""
    if order_item_is_replaced_line(item):
        return 0.0, 0.0, 0.0

    qty = max(0, int(item.quantity or 0))
    meta = _line_meta_dict(item)
    gross_raw = meta.get("line_gross_total")
    if gross_raw is not None:
        try:
            gross = float(gross_raw)
            vat_pct = float(item.vat_percent if item.vat_percent is not None else 23.0)
            net = gross / (1.0 + max(-100.0, vat_pct) / 100.0) if gross else 0.0
            vat = gross - net
            return round(net, 2), round(vat, 2), round(gross, 2)
        except (TypeError, ValueError):
            pass

    tp = getattr(item, "total_price", None)
    if tp is not None:
        net = float(tp)
    else:
        net = round(float(item.unit_price or 0) * qty, 2)

    try:
        vat_pct = float(item.vat_percent if item.vat_percent is not None else 23.0)
    except (TypeError, ValueError):
        vat_pct = 23.0
    vat = round(net * max(-100.0, vat_pct) / 100.0, 2)
    gross = round(net + vat, 2)
    return net, vat, gross


def order_financials(order: Order) -> Tuple[float, float, float]:
    """Sum line net/VAT/gross; falls back to order.value as net if no lines."""
    net = vat = gross = 0.0
    active_lines = [it for it in (order.items or []) if not order_item_is_replaced_line(it)]
    if active_lines:
        for it in active_lines:
            ln, lv, lg = line_financials(it)
            net += ln
            vat += lv
            gross += lg
        return round(net, 2), round(vat, 2), round(gross, 2)

    val = float(order.value or 0)
    return round(val, 2), 0.0, round(val, 2)


def order_line_quantity(item: OrderItem) -> int:
    if order_item_is_replaced_line(item):
        return 0
    return max(0, int(item.quantity or 0))
