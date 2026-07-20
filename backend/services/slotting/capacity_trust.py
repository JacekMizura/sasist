"""Trusted vs computational capacity provenance for putaway/packing UX.

Runtime fallback 1×1×1 / 0 kg still runs in fit_engine (computational).
Numeric capacity shown to operators / used as hard plan limits must be trusted.
"""

from __future__ import annotations

from typing import Any, Optional, Sequence


_DIM_FIELDS = frozenset({"length", "width", "height"})


def geometry_dims_defaulted(defaulted_fields: Sequence[str] | None) -> bool:
    """True when any XYZ axis used technical runtime fallback (not real master data)."""
    fields = {str(x).strip().lower() for x in (defaulted_fields or [])}
    return bool(fields & _DIM_FIELDS)


def weight_defaulted(defaulted_fields: Sequence[str] | None) -> bool:
    fields = {str(x).strip().lower() for x in (defaulted_fields or [])}
    return "weight" in fields


def geometry_source_from_defaults(defaulted_fields: Sequence[str] | None) -> str:
    return "FALLBACK" if geometry_dims_defaulted(defaulted_fields) else "REAL_DATA"


def resolve_trusted_capacity(
    *,
    geometric_additional: float,
    geometric_total: float,
    current_qty: float,
    defaulted_fields: Sequence[str] | None,
    unit_weight_kg: float,
    weight_remaining_kg: Optional[float],
    mixed_sku: bool = False,
) -> dict[str, Any]:
    """
    Split computational geometry capacity from operator-trusted numbers.

    - REAL geometry → numeric trusted (may still be ESTIMATED for occupancy/mixed).
    - FALLBACK geometry + trusted weight remaining → weight-only trusted bound.
    - FALLBACK geometry + no weight bound → UNKNOWN, no fake huge numbers.
    """
    dims_fb = geometry_dims_defaulted(defaulted_fields)
    wt_fb = weight_defaulted(defaulted_fields)
    geo_src = "FALLBACK" if dims_fb else "REAL_DATA"
    uw = float(unit_weight_kg or 0)
    geo_add = max(0.0, float(geometric_additional))
    geo_total = max(0.0, float(geometric_total))
    current = max(0.0, float(current_qty))

    weight_add: Optional[float] = None
    if not wt_fb and uw > 1e-9 and weight_remaining_kg is not None:
        weight_add = float(max(0.0, int(float(weight_remaining_kg) / uw + 1e-9)))

    computational_additional = geo_add
    computational_total = geo_total

    if not dims_fb:
        trusted = True
        conf = "ESTIMATED" if mixed_sku else "EXACT"
        add = geo_add
        lim_hint = None
        if weight_add is not None and weight_add + 1e-9 < add:
            add = weight_add
            conf = "ESTIMATED"
            lim_hint = "weight"
        total = current + add
        if not (weight_add is not None and weight_add + 1e-9 < geo_add):
            total = max(geo_total, current)
            if add + 1e-9 < (geo_total - current):
                total = current + add
        return {
            "geometry_source": geo_src,
            "capacity_numeric_trusted": trusted,
            "capacity_confidence": conf,
            "additional_capacity": add,
            "total_capacity": total,
            "computational_additional_capacity": computational_additional,
            "computational_total_capacity": computational_total,
            "weight_additional_capacity": weight_add,
            "planning_additional_capacity": add,
            "limiting_factor_hint": lim_hint,
        }

    # Geometry FALLBACK — never trust geometric 63000-style numbers.
    if weight_add is not None:
        return {
            "geometry_source": geo_src,
            "capacity_numeric_trusted": True,
            "capacity_confidence": "ESTIMATED",
            "additional_capacity": weight_add,
            "total_capacity": current + weight_add,
            "computational_additional_capacity": computational_additional,
            "computational_total_capacity": computational_total,
            "weight_additional_capacity": weight_add,
            "planning_additional_capacity": weight_add,
            "limiting_factor_hint": "weight",
        }

    return {
        "geometry_source": geo_src,
        "capacity_numeric_trusted": False,
        "capacity_confidence": "UNKNOWN",
        "additional_capacity": None,
        "total_capacity": None,
        "computational_additional_capacity": computational_additional,
        "computational_total_capacity": computational_total,
        "weight_additional_capacity": None,
        # Probe only: never fill large qty from synthetic geometry.
        "planning_additional_capacity": 1.0,
        "limiting_factor_hint": None,
    }
