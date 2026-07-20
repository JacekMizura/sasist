"""ORM → FitContainer / FitItem adapters (no queries inside geometry loops)."""

from __future__ import annotations

from typing import Any, Optional

from .models import FitContainer, FitItem, OrientationMode, StackingMode
from .orientations import normalize_orientation_mode
from .stacking import normalize_stacking_mode


def fit_item_from_product(product: Any, *, packaging_mode: str = "UNIT") -> FitItem:
    use_carton = str(packaging_mode or "UNIT").upper() == "CARTON"
    if use_carton and float(getattr(product, "units_per_carton", 0) or 0) > 0:
        length = float(getattr(product, "carton_length_cm", None) or getattr(product, "length", 0) or 0)
        width = float(getattr(product, "carton_width_cm", None) or getattr(product, "width", 0) or 0)
        height = float(getattr(product, "carton_height_cm", None) or getattr(product, "height", 0) or 0)
        weight = float(getattr(product, "carton_weight_kg", None) or getattr(product, "weight", 0) or 0)
        vol = float(getattr(product, "carton_volume_dm3", None) or 0)
        orient = normalize_orientation_mode(
            getattr(product, "carton_orientation_type", None) or getattr(product, "orientation_type", None)
        )
        stack = normalize_stacking_mode(
            getattr(product, "carton_stack_behavior", None) or getattr(product, "stack_behavior", None)
        )
        compressible = bool(
            getattr(product, "carton_stack_compressible", None) or getattr(product, "stack_compressible", False)
        )
        comp_h = getattr(product, "carton_compressed_height_cm", None) or getattr(product, "compressed_height_cm", None)
        max_sw = getattr(product, "carton_max_stack_weight", None) or getattr(product, "max_stack_weight", None)
        max_sc = getattr(product, "carton_max_stack_count", None) or getattr(product, "max_stack_count", None)
        shape = str(getattr(product, "carton_shape_type", None) or getattr(product, "shape_type", None) or "box")
    else:
        length = float(getattr(product, "length", 0) or 0)
        width = float(getattr(product, "width", 0) or 0)
        height = float(getattr(product, "height", 0) or 0)
        weight = float(getattr(product, "weight", 0) or 0)
        vol = float(getattr(product, "volume", 0) or 0)
        orient = normalize_orientation_mode(getattr(product, "orientation_type", None))
        stack = normalize_stacking_mode(getattr(product, "stack_behavior", None))
        compressible = bool(getattr(product, "stack_compressible", False))
        comp_h = getattr(product, "compressed_height_cm", None)
        max_sw = getattr(product, "max_stack_weight", None)
        max_sc = getattr(product, "max_stack_count", None)
        shape = str(getattr(product, "shape_type", None) or "box")

    if vol <= 0 and length > 0 and width > 0 and height > 0:
        vol = (length * width * height) / 1000.0

    # Fragile is independent of NO_STACK (stacking mode already enforces no load on top).
    fragile = bool(getattr(product, "fragile", False) or getattr(product, "is_fragile", False))

    # NO_STACK: max_stack_count > 1 ignored by stacking physics (units_per_stack=1)
    eff_max_sc = int(max_sc) if max_sc is not None else None
    if stack == StackingMode.NO_STACK:
        eff_max_sc = 1 if eff_max_sc is None else min(1, eff_max_sc)

    return FitItem(
        product_id=int(getattr(product, "id", 0) or 0),
        length_cm=length,
        width_cm=width,
        height_cm=height,
        weight_kg=weight,
        volume_dm3=vol,
        orientation=orient,
        stacking=stack,
        compressible=compressible,
        compressed_height_cm=float(comp_h) if comp_h is not None else None,
        max_stack_count=eff_max_sc,
        max_stack_weight_kg=float(max_sw) if max_sw is not None else None,
        shape_type=shape.lower().strip() or "box",
        fragile=fragile,
        label=str(getattr(product, "name", None) or getattr(product, "sku", None) or ""),
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
