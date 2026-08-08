"""Apply / serialize PPWR stage 3A fields on Carton and PackagingMaterial."""

from __future__ import annotations

from typing import Any

from .ppwr_constants import (
    PPWR_FUNCTIONS_CARTON,
    PPWR_FUNCTIONS_PACKAGING_MATERIAL,
    PPWR_STATUS_NOT_ASSESSED,
    compute_ppwr_readiness,
    normalize_ppwr_function,
    normalize_ppwr_status,
    validate_pct_0_100,
)


def ppwr_fields_from_row(row: Any) -> dict[str, Any]:
    return {
        "ppwr_function": getattr(row, "ppwr_function", None),
        "ppwr_format": (str(getattr(row, "ppwr_format", None) or "").strip() or None),
        "recyclable_pct": (
            float(row.recyclable_pct) if getattr(row, "recyclable_pct", None) is not None else None
        ),
        "recycled_content_pct": (
            float(row.recycled_content_pct)
            if getattr(row, "recycled_content_pct", None) is not None
            else None
        ),
        "is_reusable": (
            bool(row.is_reusable) if getattr(row, "is_reusable", None) is not None else None
        ),
        "ppwr_status": str(getattr(row, "ppwr_status", None) or PPWR_STATUS_NOT_ASSESSED),
    }


def apply_ppwr_fields_to_row(
    row: Any,
    data: dict[str, Any],
    *,
    allowed_functions: frozenset[str],
) -> None:
    """Mutate ORM row from partial/full payload dict. Raises ValueError on bad input."""
    if "ppwr_function" in data:
        row.ppwr_function = normalize_ppwr_function(data.get("ppwr_function"), allowed=allowed_functions)
    if "ppwr_format" in data:
        fmt = data.get("ppwr_format")
        row.ppwr_format = (str(fmt).strip() if fmt is not None else None) or None
    if "recyclable_pct" in data:
        row.recyclable_pct = validate_pct_0_100(data.get("recyclable_pct"), field="recyclable_pct")
    if "recycled_content_pct" in data:
        row.recycled_content_pct = validate_pct_0_100(
            data.get("recycled_content_pct"), field="recycled_content_pct"
        )
    if "is_reusable" in data:
        v = data.get("is_reusable")
        row.is_reusable = None if v is None else bool(v)
    if "ppwr_status" in data and data.get("ppwr_status") is not None:
        row.ppwr_status = normalize_ppwr_status(data.get("ppwr_status"))

    row.ppwr_status = compute_ppwr_readiness(
        ppwr_function=getattr(row, "ppwr_function", None),
        ppwr_format=getattr(row, "ppwr_format", None),
        recyclable_pct=float(row.recyclable_pct) if getattr(row, "recyclable_pct", None) is not None else None,
        recycled_content_pct=(
            float(row.recycled_content_pct)
            if getattr(row, "recycled_content_pct", None) is not None
            else None
        ),
        is_reusable=bool(row.is_reusable) if getattr(row, "is_reusable", None) is not None else None,
        explicit_status=str(getattr(row, "ppwr_status", None) or PPWR_STATUS_NOT_ASSESSED),
    )


def apply_carton_ppwr(row: Any, data: dict[str, Any]) -> None:
    apply_ppwr_fields_to_row(row, data, allowed_functions=PPWR_FUNCTIONS_CARTON)


def apply_packaging_material_ppwr(row: Any, data: dict[str, Any]) -> None:
    apply_ppwr_fields_to_row(row, data, allowed_functions=PPWR_FUNCTIONS_PACKAGING_MATERIAL)
