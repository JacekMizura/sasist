"""VAT / net / gross helpers for sale documents — shared by orders, lists, and detail views."""

from __future__ import annotations

import json
from collections import defaultdict
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from ..models.product import Product
from ..utils.product_vat import product_vat_rate_percent

DEFAULT_VAT_PERCENT = 23.0


def net_vat_from_gross(gross: float, vat_percent: float) -> tuple[float, float]:
    """Split gross into net + VAT (2dp), matching Polish invoice rounding."""
    g = round(max(0.0, float(gross)), 2)
    vp = max(0.0, float(vat_percent))
    if g <= 0:
        return 0.0, 0.0
    if vp <= 0:
        return g, 0.0
    m = 1.0 + vp / 100.0
    net = round(g / m, 2)
    vat = round(g - net, 2)
    return net, vat


def brutto_line_to_net_fields(
    *,
    unit_gross: float,
    qty: int,
    discount: float = 0.0,
    vat_percent: float,
) -> dict[str, float]:
    """Split gross-anchored input into net/VAT — legacy; direct sales use ``netto_line_to_gross_fields``."""
    q = max(0, int(qty))
    ug = max(0.0, float(unit_gross))
    disc = max(0.0, float(discount))
    line_gross = round(max(0.0, ug * q - disc), 2)
    line_net, line_vat = net_vat_from_gross(line_gross, vat_percent)
    unit_net = round(line_net / q, 4) if q > 0 else 0.0
    return {
        "unit_price": unit_net,
        "total_price": line_net,
        "vat_percent": float(vat_percent),
        "line_gross": line_gross,
        "line_vat": line_vat,
    }


def netto_line_to_gross_fields(
    *,
    unit_net: float,
    qty: int,
    discount: float = 0.0,
    vat_percent: float,
) -> dict[str, float]:
    """Convert direct-sales NET catalog price into order line financials (canonical)."""
    q = max(0, int(qty))
    un = max(0.0, float(unit_net))
    disc = max(0.0, float(discount))
    vp = max(0.0, float(vat_percent))
    unit_gross = round(un * (1.0 + vp / 100.0), 2) if q > 0 else 0.0
    line_gross = round(max(0.0, unit_gross * q - disc), 2)
    line_net, line_vat = net_vat_from_gross(line_gross, vp)
    unit_net_out = un if disc <= 1e-9 else (round(line_net / q, 4) if q > 0 else 0.0)
    return {
        "unit_price": unit_net_out,
        "total_price": line_net,
        "vat_percent": vp,
        "line_gross": line_gross,
        "line_vat": line_vat,
        "unit_price_gross": unit_gross,
    }


def compute_direct_sale_line_gross(
    *,
    unit_net: float,
    quantity: float,
    discount_amount: float = 0.0,
    vat_percent: float = DEFAULT_VAT_PERCENT,
) -> float:
    """Per-line brutto total (2dp) from NET unit — matches POS terminal rounding."""
    qty = max(0, int(round(float(quantity or 0))))
    un = max(0.0, float(unit_net or 0))
    disc = max(0.0, float(discount_amount or 0))
    vp = max(0.0, float(vat_percent))
    unit_gross = round(un * (1.0 + vp / 100.0), 2) if qty > 0 else 0.0
    return round(max(0.0, unit_gross * qty - disc), 2)


def compute_direct_sale_session_total(
    lines: list[Any],
    *,
    db: Session | None = None,
    tenant_id: int | None = None,
) -> float:
    """Sum session lines — ``unit_price`` is NET (catalog sale price); returns GROSS total."""
    total = 0.0
    for ln in lines or []:
        unit_net = float(ln.unit_price) if getattr(ln, "unit_price", None) is not None else 0.0
        vp = DEFAULT_VAT_PERCENT
        if db is not None and getattr(ln, "product_id", None) is not None:
            try:
                vp = product_vat_for_direct_sale(db, int(ln.product_id))
            except Exception:
                pass
        total += compute_direct_sale_line_gross(
            unit_net=unit_net,
            quantity=float(getattr(ln, "quantity", 0) or 0),
            discount_amount=float(getattr(ln, "discount_amount", 0) or 0),
            vat_percent=vp,
        )
    return round(total, 2)


def _order_item_meta_dict(item: OrderItem) -> dict[str, Any]:
    raw = getattr(item, "metadata_json", None) or ""
    if not str(raw).strip():
        return {}
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else {}
    except json.JSONDecodeError:
        return {}


def _vat_percent_for_item(item: OrderItem, product: Product | None) -> float:
    vp_col = getattr(item, "vat_percent", None)
    if vp_col is not None:
        try:
            fv = float(vp_col)
            if 0 <= fv <= 100:
                return fv
        except (TypeError, ValueError):
            pass
    meta = _order_item_meta_dict(item)
    for key in ("vat_percent", "vat_percent_catalog"):
        raw_vc = meta.get(key)
        if raw_vc is None:
            continue
        try:
            fv = float(raw_vc)
            if 0 <= fv <= 100:
                return fv
        except (TypeError, ValueError):
            continue
    if product is not None:
        return product_vat_rate_percent(getattr(product, "metadata_json", None))
    return DEFAULT_VAT_PERCENT


def _item_active_for_totals(item: OrderItem) -> bool:
    try:
        qty = int(item.quantity or 0)
    except (TypeError, ValueError):
        return False
    if qty <= 0:
        return False
    if order_item_is_replaced_line(item):
        return False
    if getattr(item, "parent_bundle_order_item_id", None) is not None:
        return False
    return True


def compute_order_line_financials(item: OrderItem, product: Product | None) -> dict[str, Optional[float]]:
    """Same semantics as order API: unit_price/total_price stored as net."""
    try:
        qty = max(0, int(item.quantity or 0))
    except (TypeError, ValueError):
        qty = 0

    unit_net: Optional[float] = None
    up = getattr(item, "unit_price", None)
    if up is not None:
        try:
            unit_net = round(float(up), 4)
        except (TypeError, ValueError):
            pass

    line_net: Optional[float] = None
    tp = getattr(item, "total_price", None)
    if tp is not None:
        try:
            line_net = round(float(tp), 2)
        except (TypeError, ValueError):
            pass
    if line_net is None and unit_net is not None and qty > 0:
        line_net = round(unit_net * qty, 2)

    vat_p = _vat_percent_for_item(item, product)
    meta = _order_item_meta_dict(item)
    line_gross_meta: Optional[float] = None
    raw_gross = meta.get("line_gross_total")
    if raw_gross is not None:
        try:
            line_gross_meta = round(float(raw_gross), 2)
        except (TypeError, ValueError):
            pass

    unit_gross: Optional[float] = None
    line_vat_amt: Optional[float] = None
    line_gross: Optional[float] = None
    if line_gross_meta is not None and line_gross_meta >= 0:
        line_gross = line_gross_meta
        if line_net is not None:
            line_vat_amt = round(line_gross - line_net, 2)
        else:
            ln, lv = net_vat_from_gross(line_gross, vat_p)
            line_net = ln
            line_vat_amt = lv
        if unit_net is not None and qty > 0:
            unit_gross = round(line_gross / qty, 4)
    elif unit_net is not None:
        unit_gross = round(unit_net * (1.0 + float(vat_p) / 100.0), 4)
    if line_gross is None and line_net is not None:
        line_vat_amt = round(line_net * (float(vat_p) / 100.0), 2)
        line_gross = round(line_net + float(line_vat_amt), 2)

    return {
        "vat_percent": vat_p,
        "unit_price_net": unit_net,
        "unit_price_gross": unit_gross,
        "line_net_total": line_net,
        "line_vat_amount": line_vat_amt,
        "line_gross_total": line_gross,
    }


def _purchase_unit_net_for_line(
    item: OrderItem,
    product: Product | None,
    *,
    fifo_purchase_net: float | None = None,
) -> float | None:
    meta = _order_item_meta_dict(item)
    raw_meta = meta.get("purchase_price_net")
    if raw_meta is not None:
        try:
            pu = float(raw_meta)
            if pu >= 0:
                return pu
        except (TypeError, ValueError):
            pass
    if fifo_purchase_net is not None:
        try:
            pu = float(fifo_purchase_net)
            if pu >= 0:
                return pu
        except (TypeError, ValueError):
            pass
    if product is not None and getattr(product, "purchase_price", None) is not None:
        try:
            pu = float(product.purchase_price)
            if pu >= 0:
                return pu
        except (TypeError, ValueError):
            pass
    return None


def compute_order_line_margin_fields(
    item: OrderItem,
    product: Product | None,
    fin: dict[str, Optional[float]],
    *,
    fifo_purchase_net: float | None = None,
) -> dict[str, Optional[float]]:
    """Margin from sales net vs warehouse purchase net — null when purchase unknown."""
    try:
        qty = max(0, int(item.quantity or 0))
    except (TypeError, ValueError):
        qty = 0
    line_net = fin.get("line_net_total")
    pur_unit = _purchase_unit_net_for_line(item, product, fifo_purchase_net=fifo_purchase_net)
    line_pur_tot: Optional[float] = None
    line_margin_amt: Optional[float] = None
    line_margin_pct: Optional[float] = None
    if pur_unit is not None and qty > 0:
        line_pur_tot = round(pur_unit * qty, 2)
    if line_net is not None and pur_unit is not None and qty > 0:
        profit = round(float(line_net) - pur_unit * qty, 2)
        line_margin_amt = profit
        if float(line_net) > 1e-9:
            line_margin_pct = round(profit / float(line_net) * 100.0, 2)
    return {
        "line_purchase_total_net": line_pur_tot,
        "line_margin_amount": line_margin_amt,
        "line_margin_percent": line_margin_pct,
    }


def compute_order_line_financials_with_margin(
    item: OrderItem,
    product: Product | None,
    *,
    fifo_purchase_net: float | None = None,
) -> dict[str, Optional[float]]:
    fin = compute_order_line_financials(item, product)
    margin = compute_order_line_margin_fields(item, product, fin, fifo_purchase_net=fifo_purchase_net)
    return {**fin, **margin}


def compute_sale_totals_from_order(order: Order) -> dict[str, Any]:
    """Aggregate net/gross/VAT and per-rate VAT rows from order lines."""
    lines_out: list[dict[str, Any]] = []
    total_net = 0.0
    total_vat = 0.0
    total_gross = 0.0
    vat_buckets: dict[str, dict[str, float]] = defaultdict(lambda: {"net": 0.0, "vat": 0.0, "gross": 0.0})

    for item in sorted(order.items or [], key=lambda x: int(x.id)):
        if not _item_active_for_totals(item):
            continue
        product = getattr(item, "product", None)
        fin = compute_order_line_financials(item, product)
        ln = fin.get("line_net_total")
        lv = fin.get("line_vat_amount")
        lg = fin.get("line_gross_total")
        if ln is None or lg is None:
            continue
        total_net += float(ln)
        total_vat += float(lv or 0.0)
        total_gross += float(lg)
        vp = float(fin.get("vat_percent") or DEFAULT_VAT_PERCENT)
        key = f"{vp:g}"
        vat_buckets[key]["net"] += float(ln)
        vat_buckets[key]["vat"] += float(lv or 0.0)
        vat_buckets[key]["gross"] += float(lg)
        pname = ""
        sku = ""
        if product is not None:
            pname = str(getattr(product, "name", None) or "").strip()
            sku = str(getattr(product, "sku", None) or getattr(product, "symbol", None) or "").strip()
        lines_out.append(
            {
                "order_item_id": int(item.id),
                "product_id": int(item.product_id),
                "name": pname or f"Produkt #{item.product_id}",
                "sku": sku or None,
                "quantity": int(item.quantity or 0),
                "unit_net": fin.get("unit_price_net"),
                "unit_gross": fin.get("unit_price_gross"),
                "vat_percent": vp,
                "line_net": float(ln),
                "line_vat": float(lv or 0.0),
                "line_gross": float(lg),
            }
        )

    # Legacy direct-sales: single line without line_gross_total — use order.value as brutto anchor.
    order_value = getattr(order, "value", None)
    if (
        len(lines_out) == 1
        and order_value is not None
        and abs(float(lines_out[0]["line_gross"]) - float(order_value)) > 0.02
    ):
        try:
            ov = round(float(order_value), 2)
            vp = float(lines_out[0]["vat_percent"])
            ln, lv = net_vat_from_gross(ov, vp)
            lines_out[0]["line_net"] = ln
            lines_out[0]["line_vat"] = lv
            lines_out[0]["line_gross"] = ov
            if int(lines_out[0]["quantity"]) > 0:
                lines_out[0]["unit_net"] = round(ln / int(lines_out[0]["quantity"]), 4)
                lines_out[0]["unit_gross"] = round(ov / int(lines_out[0]["quantity"]), 4)
            total_net = ln
            total_vat = lv
            total_gross = ov
            vat_buckets = defaultdict(lambda: {"net": 0.0, "vat": 0.0, "gross": 0.0})
            key = f"{vp:g}"
            vat_buckets[key]["net"] = ln
            vat_buckets[key]["vat"] = lv
            vat_buckets[key]["gross"] = ov
        except (TypeError, ValueError):
            pass

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


def product_vat_for_direct_sale(db: Session, product_id: int) -> float:
    product = db.query(Product).filter(Product.id == int(product_id)).first()
    if product is None:
        return DEFAULT_VAT_PERCENT
    return product_vat_rate_percent(getattr(product, "metadata_json", None))
