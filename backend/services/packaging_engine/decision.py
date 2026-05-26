"""
Jedna rekomendacja podstawowa + alternatywy — scoring operacyjny (nie „lista losowych kartonów”).
"""

from __future__ import annotations

import json
from typing import Optional

from ...models.carton import Carton
from ...models.order import Order
from ...models.product import Product
from .suggestions import PackagingSuggestionDraft


def _carton_vol_cm3(c: Carton) -> float:
    try:
        return float(c.length_cm) * float(c.width_cm) * float(c.height_cm)
    except (TypeError, ValueError):
        return float("inf")


def _carton_max_side_cm(c: Carton) -> float:
    try:
        return max(float(c.length_cm), float(c.width_cm), float(c.height_cm))
    except (TypeError, ValueError):
        return float("inf")


def carton_operational_kind(c: Carton) -> str:
    """envelope | flat_small | box — na podstawie nazwy / packaging_type / wymiarów."""
    blob = " ".join(
        [
            str(c.packaging_type or ""),
            str(c.material_type or ""),
            str(c.name or ""),
        ]
    ).lower()
    keys_env = ("koperta", "envelope", "bubble", "bąbel", "foliopak", "mailer", "torba kurierska")
    if any(k in blob for k in keys_env):
        return "envelope"
    try:
        L, W, H = float(c.length_cm), float(c.width_cm), float(c.height_cm)
        mx, mi = max(L, W, H), min(L, W, H)
        if mx <= 42 and mi <= 32 and H <= 14:
            return "flat_small"
    except (TypeError, ValueError):
        pass
    return "box"


def _profile_from_product(p: Product | None) -> str:
    if p is None:
        return "rigid"
    raw = getattr(p, "metadata_json", None)
    if raw and str(raw).strip():
        try:
            m = json.loads(raw)
            if isinstance(m, dict):
                v = m.get("packaging_profile") or m.get("packagingProfile")
                if isinstance(v, str) and v.strip():
                    s = v.strip().lower()
                    if s in ("rigid", "soft", "compressible", "foldable"):
                        return s
        except json.JSONDecodeError:
            pass
    if getattr(p, "stack_compressible", None) is True:
        return "compressible"
    try:
        L = float(p.length or 0)
        W = float(p.width or 0)
        H = float(p.height or 0)
        if 0 < L <= 12 and 0 < W <= 12 and 0 < H <= 8:
            return "soft"
    except (TypeError, ValueError):
        pass
    return "rigid"


def order_soft_profile_fraction(order: Order) -> float:
    """0–1: jaka część pozycji jest „miękka / zwijalna”."""
    items = list(order.items or [])
    if not items:
        return 0.0
    softish = 0
    for it in items:
        q = int(getattr(it, "quantity", 0) or 0)
        if q <= 0:
            continue
        pr = getattr(it, "product", None)
        prof = _profile_from_product(pr)
        if prof in ("soft", "compressible", "foldable"):
            softish += q
    total_q = sum(int(getattr(it, "quantity", 0) or 0) for it in items)
    if total_q <= 0:
        return 0.0
    return min(1.0, softish / total_q)


def _demand_volume_cm3(order: Order) -> tuple[float, bool]:
    """Suma (objętość jednostki × qty); drugi element = czy jakiekolwiek wymiary."""
    vol = 0.0
    any_ok = False
    for it in order.items or []:
        q = int(getattr(it, "quantity", 0) or 0)
        if q <= 0:
            continue
        p = getattr(it, "product", None)
        if p is None:
            continue
        L = getattr(p, "length", None)
        W = getattr(p, "width", None)
        H = getattr(p, "height", None)
        if L is None or W is None or H is None:
            continue
        try:
            lv, wv, hv = float(L), float(W), float(H)
        except (TypeError, ValueError):
            continue
        if lv <= 0 or wv <= 0 or hv <= 0:
            continue
        any_ok = True
        vol += lv * wv * hv * q
    return vol, any_ok


def _effective_demand_cm3(demand: float, soft_frac: float) -> float:
    """Miękkie towary — mniejsza efektywna objętość do porównań z kopertami."""
    if demand <= 0:
        return demand
    if soft_frac >= 0.55:
        return demand * 0.22
    if soft_frac >= 0.25:
        return demand * 0.45
    return demand


def _operational_cost_lower_is_better(
    c: Carton,
    *,
    demand_cm3: float,
    eff_demand_cm3: float,
    soft_frac: float,
) -> float:
    """
    Niższy = lepszy kandydat na PRIMARY.
    Kara za gigantyczne kartony przy małym „effective demand”.
    """
    cv = _carton_vol_cm3(c)
    if cv <= 0 or cv == float("inf"):
        return 1e18
    mx = _carton_max_side_cm(c)
    kind = carton_operational_kind(c)
    waste = cv / max(demand_cm3, 1e-6)
    eff_ratio = cv / max(eff_demand_cm3, 1e-6)

    if soft_frac >= 0.35:
        if kind == "envelope":
            return cv * 0.05 + mx * 0.15
        if kind == "flat_small":
            return cv * 0.12 + mx * 0.25
        if mx >= 58:
            return 1e15 + cv + mx * 1000.0
        if waste >= 45:
            return 1e12 + waste * 100
        if waste >= 18:
            return cv * 4.0 + mx * 80.0 + waste * 10
        return cv + mx * 3.0 + waste * 2.0

    if demand_cm3 > 1e-9:
        if demand_cm3 <= cv * 0.96:
            return cv
        return cv + 5e5 * max(0.0, demand_cm3 - cv)

    return cv + mx


def finalize_primary_packaging(
    order: Order,
    cartons: list[Carton],
    merged: list[PackagingSuggestionDraft],
) -> tuple[Optional[PackagingSuggestionDraft], list[PackagingSuggestionDraft]]:
    """
    Wybiera **jedną** najlepszą propozycję i kilka alternatyw o zbliżonym koszcie operacyjnym.
    """
    if not merged:
        return None, []

    by_id = {str(c.id): c for c in cartons}
    demand, any_dims = _demand_volume_cm3(order)
    soft_frac = order_soft_profile_fraction(order)
    eff = _effective_demand_cm3(demand, soft_frac)

    scored: list[tuple[float, PackagingSuggestionDraft]] = []
    for d in merged:
        cid = str(d.suggested_package_id)
        c = by_id.get(cid)
        if c is None:
            scored.append((5000.0 + (1.0 - d.confidence_score) * 100.0, d))
            continue
        if any_dims and demand > 1e-9:
            cost = _operational_cost_lower_is_better(
                c,
                demand_cm3=demand,
                eff_demand_cm3=eff,
                soft_frac=soft_frac,
            )
        else:
            cost = _carton_vol_cm3(c) * 0.01 + (1.0 - d.confidence_score)
        scored.append((cost, d))

    scored.sort(key=lambda x: x[0])
    primary = scored[0][1]
    primary_cost = scored[0][0]
    alts: list[PackagingSuggestionDraft] = []
    for cost, draft in scored[1:]:
        if len(alts) >= 4:
            break
        if cost <= primary_cost * 1.35 + 2.0:
            alts.append(draft)

    return primary, alts
