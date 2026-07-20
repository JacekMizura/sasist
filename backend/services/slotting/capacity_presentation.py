"""Operator-facing labels for location capacity (no physics — presentation only)."""

from __future__ import annotations

from typing import Any, Optional


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


def additional_capacity_copy(*, additional: float, confidence: str) -> str:
    conf = str(confidence or "").strip().upper()
    n = int(additional) if additional == int(additional) else round(additional, 2)
    if conf == "UNKNOWN":
        return "Brak danych do obliczenia pojemności."
    if additional <= 1e-9:
        return "Lokalizacja pełna dla tego produktu." if conf != "UNKNOWN" else "Brak danych do obliczenia pojemności."
    if conf == "ESTIMATED":
        return f"Szacunkowo można dołożyć do {n} szt."
    return f"Można dołożyć {n} szt."


def capacity_ratio_label(*, current: float, total: float, confidence: str) -> str:
    conf = str(confidence or "").strip().upper()
    c = int(current) if current == int(current) else round(current, 2)
    t = int(total) if total == int(total) else round(total, 2)
    if conf == "UNKNOWN" or total <= 0:
        return f"{c} / ?"
    if conf == "ESTIMATED":
        return f"{c} / ~{t}"
    return f"{c} / {t}"


def product_location_capacity_dict(solved: Any, *, fit_item: Any = None) -> dict[str, Any]:
    """Normalize LocationCapacityResult (or dict) to public SSOT card."""
    if hasattr(solved, "to_dict"):
        d = solved.to_dict()
    else:
        d = dict(solved or {})
    conf = str(d.get("confidence") or "UNKNOWN").upper()
    method = str(d.get("method") or "UNKNOWN")
    current = float(d.get("current_quantity") or 0)
    total = float(d.get("total_capacity") or 0)
    additional = float(d.get("additional_capacity") or 0)
    limiting = d.get("limiting_factor")
    warnings = list(d.get("warnings") or [])
    used_defaults = bool(d.get("used_defaults"))
    defaulted_fields = list(d.get("defaulted_fields") or [])
    if fit_item is not None:
        used_defaults = used_defaults or bool(getattr(fit_item, "used_defaults", False))
        if getattr(fit_item, "defaulted_fields", None):
            defaulted_fields = list(getattr(fit_item, "defaulted_fields") or [])
        if used_defaults and conf == "EXACT":
            conf = "ESTIMATED"
        if used_defaults and "TECHNICAL_LOGISTICS_DEFAULTS" not in warnings:
            warnings.append("TECHNICAL_LOGISTICS_DEFAULTS")
            warnings.append(
                "Szacunkowa pojemność — produkt ma niepełne dane logistyczne (runtime defaults)."
            )
    return {
        "product_id": int(d.get("product_id") or 0),
        "location_id": int(d.get("location_id") or 0),
        "location_code": str(d.get("location_code") or ""),
        "current_quantity": current,
        "total_capacity": total,
        "additional_capacity": additional,
        "utilization_percent": float(d.get("utilization_percent") or 0),
        "method": method,
        "confidence": conf,
        "limiting_factor": limiting,
        "limiting_factor_label": limiting_factor_label(str(limiting) if limiting else None),
        "selected_orientation": int(d.get("selected_orientation") or 0),
        "stacks": int(d.get("stacks") or d.get("stacks_count") or 0),
        "units_per_stack": int(d.get("units_per_stack") or 0),
        "warnings": warnings,
        "explanation": str(d.get("explanation") or ""),
        "additional_capacity_label": additional_capacity_copy(additional=additional, confidence=conf),
        "capacity_ratio_label": capacity_ratio_label(current=current, total=total, confidence=conf),
        "used_defaults": used_defaults,
        "defaulted_fields": defaulted_fields,
    }
