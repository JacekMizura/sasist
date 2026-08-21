"""Resolve immutable shipping line snapshot for PRIMARY sale documents."""

from __future__ import annotations

import json
from collections import Counter
from typing import Any, Optional, Sequence

from ...models.document_series import DocumentSeries
from ...models.order import Order
from ...models.sale_document_item import LINE_KIND_SHIPPING
from ..sale_document_financials import DEFAULT_VAT_PERCENT, net_vat_from_gross

#: Order import_metadata / attribute keys for shipping gross (creation-time only).
_SHIPPING_GROSS_KEYS = (
    "shipping_cost",
    "delivery_price",
    "delivery_cost",
    "Koszt dostawy",
    "Koszt dostawy brutto",
    "Dostawa - koszt",
    "Cena dostawy",
    "Shipping cost",
    "Delivery price",
)

#: Optional VAT percent on order metadata when vat_calc_shipping=FROM_ORDER.
_SHIPPING_VAT_META_KEYS = (
    "shipping_vat_percent",
    "shipping_vat",
    "vat_shipping",
    "delivery_vat_percent",
)


def _order_import_meta(order: Order) -> dict[str, Any]:
    raw = getattr(order, "import_metadata_json", None) or ""
    if not str(raw).strip():
        return {}
    try:
        data = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def resolve_order_shipping_gross(order: Order) -> float:
    """
    Creation-time shipping gross from Order.

    After PRIMARY issuance this value must not be re-read for document financials.
    """
    for attr in ("shipping_cost", "delivery_price"):
        v = getattr(order, attr, None)
        try:
            if v is not None and float(v) >= 0:
                return round(float(v), 2)
        except (TypeError, ValueError):
            pass

    meta = _order_import_meta(order)
    for key in _SHIPPING_GROSS_KEYS:
        if key not in meta or meta[key] is None or str(meta[key]).strip() == "":
            continue
        try:
            return round(max(0.0, float(str(meta[key]).replace(",", "."))), 2)
        except (TypeError, ValueError):
            continue
    return 0.0


def _vat_from_order_meta(order: Order) -> Optional[float]:
    meta = _order_import_meta(order)
    for key in _SHIPPING_VAT_META_KEYS:
        if key not in meta or meta[key] is None or str(meta[key]).strip() == "":
            continue
        try:
            vp = float(str(meta[key]).replace(",", "."))
            if 0 <= vp <= 100:
                return vp
        except (TypeError, ValueError):
            continue
    return None


def _dominant_product_vat(product_lines: Sequence[dict[str, Any]]) -> float:
    rates: list[float] = []
    for ln in product_lines or []:
        try:
            vp = float(ln.get("vat_percent") if ln.get("vat_percent") is not None else DEFAULT_VAT_PERCENT)
        except (TypeError, ValueError):
            vp = DEFAULT_VAT_PERCENT
        qty = abs(float(ln.get("quantity") or 1.0))
        # weight by quantity for majority rate
        n = max(1, int(round(qty)))
        rates.extend([vp] * n)
    if not rates:
        return float(DEFAULT_VAT_PERCENT)
    return float(Counter(rates).most_common(1)[0][0])


def resolve_shipping_vat_percent(
    *,
    series: DocumentSeries,
    order: Order,
    product_lines: Sequence[dict[str, Any]],
) -> float:
    """
    VAT % for shipping line — DocumentSeries.vat_calc_shipping is SSOT policy.

    Modes (schema VatCalcLineMode):
    - DEFAULT → system DEFAULT_VAT_PERCENT (same as product default)
    - FROM_ORDER → order meta shipping VAT if present, else DEFAULT_VAT_PERCENT
    - FROM_LINES → dominant product line VAT on this document
    - EXCLUDE → 0% (outside taxable base; net = gross)
    - MANUAL → series.vat_rate_percent (required)
    """
    mode = str(getattr(series, "vat_calc_shipping", None) or "DEFAULT").strip().upper()
    if mode == "EXCLUDE":
        return 0.0
    if mode == "MANUAL":
        raw = getattr(series, "vat_rate_percent", None)
        if raw is None:
            raise ValueError(
                "vat_calc_shipping=MANUAL requires document_series.vat_rate_percent"
            )
        return float(max(0, min(100, int(raw))))
    if mode == "FROM_LINES":
        return _dominant_product_vat(product_lines)
    if mode == "FROM_ORDER":
        from_meta = _vat_from_order_meta(order)
        if from_meta is not None:
            return float(from_meta)
        return float(DEFAULT_VAT_PERCENT)
    # DEFAULT (and unknown → safe system default already used for products)
    return float(DEFAULT_VAT_PERCENT)


def should_include_shipping_on_document(*, series: DocumentSeries, shipping_gross: float) -> bool:
    """
    Series flag ``count_shipping_cost_always``:

    UI: „Zawsze uwzględniaj koszt wysyłki w wartości dokumentu”.
    False (default) → shipping not on document (historical behaviour).
    True → include when shipping gross > 0.
    """
    if not bool(getattr(series, "count_shipping_cost_always", False)):
        return False
    return float(shipping_gross or 0.0) > 1e-9


def resolve_sale_document_shipping_snapshot(
    *,
    series: DocumentSeries,
    order: Order,
    product_lines: Sequence[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """
    Single resolver: whether to snapshot shipping + full immutable line payload.

    Returns None when shipping must not appear on the PRIMARY document.
    """
    gross = resolve_order_shipping_gross(order)
    if not should_include_shipping_on_document(series=series, shipping_gross=gross):
        return None

    vat_percent = resolve_shipping_vat_percent(
        series=series, order=order, product_lines=product_lines
    )
    line_net, line_vat = net_vat_from_gross(gross, vat_percent)
    name = str(getattr(series, "shipping_cost_name", None) or "").strip() or "Koszt wysyłki"
    return {
        "line_kind": LINE_KIND_SHIPPING,
        "order_item_id": None,
        "product_id": None,
        "name": name[:512],
        "sku": None,
        "quantity": 1.0,
        "unit_net": line_net,
        "unit_gross": gross,
        "vat_percent": float(vat_percent),
        "line_net": line_net,
        "line_vat": line_vat,
        "line_gross": gross,
    }
