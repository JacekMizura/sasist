"""Resolve purchase-order line unit net from supplier tiers (products + warehouse materials)."""

from __future__ import annotations

import json
import math
from typing import Any, List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session

from ..models.product import Product
from ..models.supplier_product import SupplierProduct
from ..schemas.warehouse_materials import carton_base_unit_prices
from .wm_pricing import serialize_wm_tiers


def _finite_nonneg(x: Optional[float]) -> Optional[float]:
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(v) or v < 0:
        return None
    return round(v, 6)


def parse_supplier_product_tier_steps(link: Optional[SupplierProduct]) -> List[Tuple[float, float]]:
    """(qty_from, unit_net) sorted ascending. Falls back to single purchase_price at qty 1."""
    if link is None:
        return []
    raw = getattr(link, "purchase_price_tiers_json", None)
    steps: List[Tuple[float, float]] = []
    if raw is not None and str(raw).strip():
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, TypeError):
            data = None
        if isinstance(data, list):
            for entry in data:
                if not isinstance(entry, dict):
                    continue
                qfv = entry.get("qty_from", 1)
                try:
                    qf = float(qfv)
                except (TypeError, ValueError):
                    continue
                if not math.isfinite(qf) or qf < 0:
                    continue
                un_raw = entry.get("unit_net", entry.get("purchase_price", entry.get("net")))
                if un_raw is None:
                    continue
                try:
                    un = float(un_raw)
                except (TypeError, ValueError):
                    continue
                if math.isfinite(un) and un >= 0:
                    steps.append((qf, un))
    if not steps:
        pp = getattr(link, "purchase_price", None)
        if pp is not None:
            try:
                v = float(pp)
            except (TypeError, ValueError):
                v = None
            if v is not None and math.isfinite(v) and v >= 0:
                steps.append((1.0, v))
    steps.sort(key=lambda t: (t[0], t[1]))
    return steps


def wm_tier_steps_from_row(row: Any) -> List[Tuple[float, float]]:
    vat = float(getattr(row, "vat_rate_pct", 23) or 23)
    tiers: Sequence[Any] = getattr(row, "price_tiers", None) or []
    serialized = serialize_wm_tiers(tiers, vat_rate_pct=vat)
    steps: List[Tuple[float, float]] = []
    for d in serialized:
        try:
            qf = float(d.get("qty_from", 1) or 1)
        except (TypeError, ValueError):
            continue
        un = d.get("unit_net")
        if un is None:
            continue
        try:
            uf = float(un)
        except (TypeError, ValueError):
            continue
        if math.isfinite(qf) and qf >= 0 and math.isfinite(uf) and uf >= 0:
            steps.append((qf, uf))
    steps.sort(key=lambda t: (t[0], t[1]))
    return steps


def pick_unit_net_from_steps(steps: List[Tuple[float, float]], qty: float) -> Tuple[Optional[float], Optional[str]]:
    """
    Highest ``qty_from`` threshold such that ``qty_from <= qty`` wins.
    Returns (unit_net, UI hint).
    """
    if not steps:
        return None, None
    q = float(qty)
    if not math.isfinite(q) or q <= 0:
        return None, None
    best_un: Optional[float] = None
    best_qf: Optional[float] = None
    for qf, un in steps:
        if qf <= q + 1e-9:
            best_un = un
            best_qf = qf
    if best_un is None:
        return None, None
    hint: Optional[str]
    if best_qf is not None and best_qf <= 1.0 + 1e-9:
        hint = "Cena bazowa"
    else:
        qf_disp = int(best_qf) if abs(best_qf - round(best_qf)) < 1e-6 else best_qf
        hint = f"Próg cenowy: od {qf_disp} szt."
    return _finite_nonneg(best_un), hint


def fallback_wm_base_unit_net(row: Any) -> Optional[float]:
    vat = float(getattr(row, "vat_rate_pct", 23) or 23)
    pq = getattr(row, "package_qty", None)
    pnt = getattr(row, "package_net_total", None)
    pgt = getattr(row, "package_gross_total", None)
    _, _, un, _ = carton_base_unit_prices(
        vat_rate_pct=vat,
        package_qty=float(pq) if pq is not None else None,
        package_net_total=float(pnt) if pnt is not None else None,
        package_gross_total=float(pgt) if pgt is not None else None,
    )
    if un is not None and math.isfinite(float(un)) and float(un) >= 0:
        return _finite_nonneg(float(un))
    for attr in ("last_purchase_price_net", "purchase_price", "unit_cost"):
        v = getattr(row, attr, None)
        if v is not None:
            try:
                fv = float(v)
            except (TypeError, ValueError):
                continue
            if math.isfinite(fv) and fv >= 0:
                return _finite_nonneg(fv)
    return None


def resolve_wm_unit_net(row: Any, qty: float) -> Tuple[Optional[float], Optional[str]]:
    steps = wm_tier_steps_from_row(row)
    un, hint = pick_unit_net_from_steps(steps, qty)
    if un is not None:
        return un, hint
    fb = fallback_wm_base_unit_net(row)
    if fb is not None:
        return fb, "Cena bazowa"
    return None, None


def resolve_product_unit_net(
    db: Session,
    *,
    tenant_id: int,
    supplier_id: int,
    product_id: int,
    qty: float,
) -> Tuple[Optional[float], Optional[str]]:
    p = db.query(Product).filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id)).first()
    if p is None:
        return None, None
    link = (
        db.query(SupplierProduct)
        .filter(SupplierProduct.product_id == int(product_id), SupplierProduct.supplier_id == int(supplier_id))
        .first()
    )
    steps = parse_supplier_product_tier_steps(link)
    un, hint = pick_unit_net_from_steps(steps, qty)
    if un is not None:
        return un, hint
    if link is not None and link.purchase_price is not None:
        try:
            v = float(link.purchase_price)
        except (TypeError, ValueError):
            v = None
        if v is not None and math.isfinite(v) and v >= 0:
            return _finite_nonneg(v), "Cena bazowa"
    pp = getattr(p, "purchase_price", None)
    if pp is not None:
        try:
            v = float(pp)
        except (TypeError, ValueError):
            v = None
        if v is not None and math.isfinite(v) and v >= 0:
            return _finite_nonneg(v), "Cena bazowa"
    return None, None


def tier_steps_for_catalog_product(link: Optional[SupplierProduct]) -> List[Tuple[float, float]]:
    return parse_supplier_product_tier_steps(link)


def tier_steps_for_catalog_wm(row: Any) -> List[Tuple[float, float]]:
    return wm_tier_steps_from_row(row)
