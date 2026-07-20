"""Operator-facing labels for location capacity (no physics — presentation only)."""

from __future__ import annotations

from typing import Any, Optional

from backend.services.slotting.capacity_trust import geometry_dims_defaulted


def limiting_factor_label(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    key = str(raw).strip().lower()
    mapping = {
        "space": "PRZESTRZEŃ",
        "volume": "PRZESTRZEŃ",
        "height": "WYSOKOŚĆ",
        "stack": "STOS",
        "stacking": "STOS",
        "weight": "WAGA",
        "shelf_weight": "WAGA PÓŁKI",
        "rack_weight": "WAGA REGAŁU",
        "location_weight": "WAGA LOKALIZACJI",
        "orientation": "ORIENTACJA",
        "max_stack_count": "STOS",
        "max_stack_weight": "WAGA",
        "container_weight": "WAGA",
    }
    for k, v in mapping.items():
        if k in key:
            return v
    return "INNE"


def additional_capacity_copy(
    *,
    additional: Optional[float],
    confidence: str,
    capacity_numeric_trusted: bool = True,
) -> str:
    conf = str(confidence or "").strip().upper()
    if not capacity_numeric_trusted or conf == "UNKNOWN" or additional is None:
        return "POJEMNOŚĆ: NIEOKREŚLONA"
    n = int(additional) if additional == int(additional) else round(additional, 2)
    if additional <= 1e-9:
        return "Lokalizacja pełna dla tego produktu."
    if conf == "ESTIMATED":
        return f"Szacunkowo można dołożyć do {n} szt."
    return f"Można dołożyć {n} szt."


def capacity_ratio_label(
    *,
    current: float,
    total: Optional[float],
    confidence: str,
    capacity_numeric_trusted: bool = True,
) -> str:
    conf = str(confidence or "").strip().upper()
    c = int(current) if current == int(current) else round(current, 2)
    if not capacity_numeric_trusted or conf == "UNKNOWN" or total is None:
        if current <= 1e-9:
            return "PUSTA · pojemność nieokreślona"
        return f"{c} szt. · pojemność nieokreślona"
    t = int(total) if total == int(total) else round(total, 2)
    if conf == "ESTIMATED":
        return f"{c} / ~{t}"
    return f"{c} / {t}"


def product_location_capacity_dict(solved: Any, *, fit_item: Any = None) -> dict[str, Any]:
    """Normalize LocationCapacityResult (or dict) to public SSOT card."""
    if hasattr(solved, "to_dict"):
        d = solved.to_dict()
    else:
        d = dict(solved or {})
    conf = str(d.get("confidence") or d.get("capacity_confidence") or "UNKNOWN").upper()
    method = str(d.get("method") or "UNKNOWN")
    current = float(d.get("current_quantity") or 0)
    total = d.get("total_capacity")
    additional = d.get("additional_capacity")
    if total is not None:
        total = float(total)
    if additional is not None:
        additional = float(additional)
    limiting = d.get("limiting_factor")
    warnings = list(d.get("warnings") or [])
    used_defaults = bool(d.get("used_defaults"))
    defaulted_fields = list(d.get("defaulted_fields") or [])
    if fit_item is not None:
        used_defaults = used_defaults or bool(getattr(fit_item, "used_defaults", False))
        if getattr(fit_item, "defaulted_fields", None):
            defaulted_fields = list(getattr(fit_item, "defaulted_fields") or [])

    geometry_source = str(d.get("geometry_source") or "").upper()
    if geometry_dims_defaulted(defaulted_fields):
        geometry_source = "FALLBACK"
    elif not geometry_source:
        geometry_source = "REAL_DATA"

    # Dataclass defaults capacity_numeric_trusted=True — unsafe with FALLBACK geometry.
    # Trust FALLBACK only when solver already reduced capacity via a known weight bound.
    if geometry_source == "FALLBACK":
        comp = d.get("computational_additional_capacity")
        weight_bound = (
            "weight" in str(limiting or "").lower()
            or (
                additional is not None
                and comp is not None
                and float(additional) + 1e-9 < float(comp)
            )
        )
        if bool(d.get("capacity_numeric_trusted")) and additional is not None and weight_bound:
            numeric_trusted = True
            if conf == "UNKNOWN":
                conf = "ESTIMATED"
        else:
            numeric_trusted = False
            conf = "UNKNOWN"
            additional = None
            total = None
    else:
        numeric_trusted = d.get("capacity_numeric_trusted")
        if numeric_trusted is None:
            numeric_trusted = conf != "UNKNOWN"
        numeric_trusted = bool(numeric_trusted)
        if not numeric_trusted or conf == "UNKNOWN":
            numeric_trusted = False
            conf = "UNKNOWN"
            additional = None
            total = None

    return {
        "product_id": int(d.get("product_id") or 0),
        "location_id": int(d.get("location_id") or 0),
        "location_code": str(d.get("location_code") or ""),
        "current_quantity": current,
        "total_capacity": total,
        "additional_capacity": additional,
        "utilization_percent": float(d.get("utilization_percent") or 0) if numeric_trusted else 0.0,
        "method": method,
        "confidence": conf,
        "capacity_confidence": conf,
        "limiting_factor": limiting,
        "limiting_factor_label": limiting_factor_label(str(limiting) if limiting else None),
        "selected_orientation": int(d.get("selected_orientation") or 0),
        "stacks": int(d.get("stacks") or d.get("stacks_count") or 0),
        "units_per_stack": int(d.get("units_per_stack") or 0),
        "warnings": warnings,
        "explanation": str(d.get("explanation") or ""),
        "additional_capacity_label": additional_capacity_copy(
            additional=additional,
            confidence=conf,
            capacity_numeric_trusted=numeric_trusted,
        ),
        "capacity_ratio_label": capacity_ratio_label(
            current=current,
            total=total,
            confidence=conf,
            capacity_numeric_trusted=numeric_trusted,
        ),
        "used_defaults": used_defaults,
        "defaulted_fields": defaulted_fields,
        "geometry_source": geometry_source,
        "capacity_numeric_trusted": numeric_trusted,
        "computational_additional_capacity": d.get("computational_additional_capacity"),
        "computational_total_capacity": d.get("computational_total_capacity"),
        "planning_additional_capacity": d.get("planning_additional_capacity"),
    }
