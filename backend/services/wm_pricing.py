"""VAT + package price helpers for warehouse materials (cartons + packaging)."""

from __future__ import annotations

import math
from typing import Any, Optional, Sequence, Tuple


def vat_multiplier(vat_rate_pct: float) -> float:
    v = float(vat_rate_pct or 0)
    if not math.isfinite(v) or v < 0:
        v = 0.0
    return 1.0 + v / 100.0


def complete_package_totals(
    package_net_total: Optional[float],
    package_gross_total: Optional[float],
    *,
    vat_rate_pct: float,
) -> Tuple[Optional[float], Optional[float]]:
    """Fill missing net or gross from the other using VAT."""
    m = vat_multiplier(vat_rate_pct)
    pn = float(package_net_total) if package_net_total is not None and math.isfinite(float(package_net_total)) else None
    pg = float(package_gross_total) if package_gross_total is not None and math.isfinite(float(package_gross_total)) else None
    if pn is not None and pg is None:
        return pn, round(pn * m, 6)
    if pg is not None and pn is None:
        return round(pg / m, 6), pg
    return pn, pg


def unit_prices_from_package(
    package_qty: Optional[float],
    package_net_total: Optional[float],
    package_gross_total: Optional[float],
) -> Tuple[Optional[float], Optional[float]]:
    pq = float(package_qty) if package_qty is not None and math.isfinite(float(package_qty)) else None
    if pq is None or pq <= 0:
        return None, None
    un = float(package_net_total) / pq if package_net_total is not None and math.isfinite(float(package_net_total)) else None
    ug = (
        float(package_gross_total) / pq
        if package_gross_total is not None and math.isfinite(float(package_gross_total))
        else None
    )
    if un is not None:
        un = round(un, 6)
    if ug is not None:
        ug = round(ug, 6)
    return un, ug


def discount_pct_vs_reference(unit_net: Optional[float], reference_unit_net: Optional[float]) -> Optional[float]:
    if unit_net is None or reference_unit_net is None:
        return None
    ref = float(reference_unit_net)
    u = float(unit_net)
    if ref <= 0 or not math.isfinite(ref) or not math.isfinite(u):
        return None
    return round(max(0.0, min(100.0, (1.0 - u / ref) * 100.0)), 2)


def enrich_tier_dict(
    row: dict[str, Any],
    *,
    vat_rate_pct: float,
    reference_unit_net: Optional[float],
) -> dict[str, Any]:
    pn, pg = complete_package_totals(
        row.get("package_net_total"),
        row.get("package_gross_total"),
        vat_rate_pct=vat_rate_pct,
    )
    pq = row.get("package_qty")
    un, ug = unit_prices_from_package(pq, pn, pg)
    out = {**row, "package_net_total": pn, "package_gross_total": pg, "unit_net": un, "unit_gross": ug}
    out["discount_pct"] = discount_pct_vs_reference(un, reference_unit_net)
    return out


def serialize_wm_tiers(tiers: Sequence[Any], *, vat_rate_pct: float) -> list[dict[str, Any]]:
    """Sort tiers and attach computed unit prices + discount % vs lowest-qty step."""
    rows = sorted(
        list(tiers),
        key=lambda t: (int(getattr(t, "sort_index", 0) or 0), float(getattr(t, "qty_from", 1) or 1)),
    )
    ref_un: Optional[float] = None
    out: list[dict[str, Any]] = []
    for t in rows:
        base = {
            "id": str(getattr(t, "id", "") or ""),
            "sort_index": int(getattr(t, "sort_index", 0) or 0),
            "qty_from": float(getattr(t, "qty_from", 1) or 1),
            "package_qty": getattr(t, "package_qty", None),
            "package_net_total": getattr(t, "package_net_total", None),
            "package_gross_total": getattr(t, "package_gross_total", None),
        }
        d = enrich_tier_dict(base, vat_rate_pct=float(vat_rate_pct or 0), reference_unit_net=ref_un)
        if ref_un is None and d.get("unit_net") is not None:
            ref_un = float(d["unit_net"])
        out.append(d)
    return out
