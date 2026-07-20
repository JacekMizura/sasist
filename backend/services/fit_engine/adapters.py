"""ORM → FitContainer / FitItem adapters (no queries inside geometry loops)."""

from __future__ import annotations

from typing import Any, Optional

from ..product_logistics_normalizer import normalize_product_logistics
from .models import FitContainer, FitItem, StackingMode


def fit_item_from_product(product: Any, *, packaging_mode: str = "UNIT") -> FitItem:
    """Build FitItem via shared logistics normalizer (technical defaults + provenance)."""
    n = normalize_product_logistics(product, packaging_mode=packaging_mode)
    stack = n.stack_behavior
    eff_max_sc = n.max_stack_count
    if stack == StackingMode.NO_STACK:
        eff_max_sc = 1 if eff_max_sc is None else min(1, int(eff_max_sc))

    return FitItem(
        product_id=int(getattr(product, "id", 0) or 0),
        length_cm=n.length_cm,
        width_cm=n.width_cm,
        height_cm=n.height_cm,
        weight_kg=n.weight_kg,
        volume_dm3=n.volume_dm3,
        orientation=n.orientation,
        stacking=stack,
        compressible=n.compressible,
        compressed_height_cm=n.compressed_height_cm,
        max_stack_count=eff_max_sc,
        max_stack_weight_kg=n.max_stack_weight,
        shape_type=n.shape_type,
        fragile=n.fragile,
        label=str(getattr(product, "name", None) or getattr(product, "sku", None) or ""),
        used_defaults=n.used_defaults,
        defaulted_fields=tuple(n.defaulted_fields),
        data_quality=n.data_quality,
    )


def fit_container_from_location(loc: Any) -> FitContainer:
    return FitContainer(
        container_id=str(int(getattr(loc, "id", 0) or 0)),
        length_cm=float(getattr(loc, "depth", None) or getattr(loc, "length", 0) or 0),
        width_cm=float(getattr(loc, "width", 0) or 0),
        height_cm=float(getattr(loc, "height", 0) or 0),
        max_weight_kg=float(mw) if (mw := getattr(loc, "max_weight_kg", None)) is not None else None,
        occupied_volume_dm3=float(getattr(loc, "occupied_volume_dm3", 0) or 0),
        occupied_weight_kg=float(getattr(loc, "occupied_weight_kg", 0) or 0),
        label=str(getattr(loc, "name", None) or ""),
        kind="location",
        dimensions_are_usable=True,
    )


def fit_container_from_carton(carton: Any, *, max_payload_kg: Optional[float] = None) -> FitContainer:
    """
    Fit uses INTERNAL/USABLE dimensions when set; otherwise falls back to external length/width/height.
    """
    il = getattr(carton, "internal_length_cm", None)
    iw = getattr(carton, "internal_width_cm", None)
    ih = getattr(carton, "internal_height_cm", None)
    try:
        il_f = float(il) if il is not None else 0.0
        iw_f = float(iw) if iw is not None else 0.0
        ih_f = float(ih) if ih is not None else 0.0
    except (TypeError, ValueError):
        il_f = iw_f = ih_f = 0.0

    has_usable = il_f > 0 and iw_f > 0 and ih_f > 0
    warnings: tuple[str, ...] = ()
    if has_usable:
        L, W, H = il_f, iw_f, ih_f
    else:
        L = float(getattr(carton, "length_cm", 0) or 0)
        W = float(getattr(carton, "width_cm", 0) or 0)
        H = float(getattr(carton, "height_cm", 0) or 0)
        warnings = ("USABLE_DIMENSIONS_NOT_DEFINED",)

    payload = max_payload_kg
    if payload is None:
        mp = getattr(carton, "max_payload_kg", None)
        if mp is not None:
            try:
                payload = float(mp)
            except (TypeError, ValueError):
                payload = None

    return FitContainer(
        container_id=str(getattr(carton, "id", "") or ""),
        length_cm=L,
        width_cm=W,
        height_cm=H,
        max_weight_kg=float(payload) if payload is not None else None,
        occupied_volume_dm3=0.0,
        occupied_weight_kg=0.0,
        label=str(getattr(carton, "name", None) or ""),
        kind="carton",
        dimensions_are_usable=has_usable,
        warnings=warnings,
    )
