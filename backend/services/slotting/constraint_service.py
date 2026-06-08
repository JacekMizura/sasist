"""Orientation and stacking constraint checks — no 3D physics."""

from __future__ import annotations

from .slotting_models import (
    ORIENTATION_ANY,
    ORIENTATION_NO_ROTATION,
    ORIENTATION_UPRIGHT_ONLY,
    STACKING_CARTON_ON_CARTON,
    STACKING_NONE,
    STACKING_PALLET_ONLY,
    STACKING_UNIT_ON_UNIT,
    ProductFootprint,
)


def normalize_orientation(raw: str | None) -> str:
    v = str(raw or "").strip().lower().replace("-", "_")
    if v in ("upright", "upright_only", "vertical"):
        return ORIENTATION_UPRIGHT_ONLY
    if v in ("no_rotation", "no_stack", "fixed"):
        return ORIENTATION_NO_ROTATION
    return ORIENTATION_ANY


def normalize_stacking(raw: str | None, *, packaging_carton: bool = False) -> str:
    v = str(raw or "").strip().lower().replace("-", "_")
    if v in ("no_stack", "none", "not_stackable"):
        return STACKING_NONE
    if v in ("pallet", "pallet_only"):
        return STACKING_PALLET_ONLY
    if packaging_carton or v in ("carton", "carton_on_carton", "master_carton"):
        return STACKING_CARTON_ON_CARTON
    if v in ("stackable", "unit", "unit_on_unit", ""):
        return STACKING_UNIT_ON_UNIT
    return STACKING_UNIT_ON_UNIT


def check_orientation_compatible(footprint: ProductFootprint, location_type: str) -> tuple[bool, str | None]:
    """V1: upright-only products need pick/reserve bins with height; no rotation = single orientation volume."""
    orient = normalize_orientation(footprint.orientation)
    if orient == ORIENTATION_ANY:
        return True, None
    if orient == ORIENTATION_UPRIGHT_ONLY and float(footprint.height_cm or 0) <= 0:
        return False, "Orientation incompatible: missing product height"
    if orient == ORIENTATION_NO_ROTATION and float(footprint.length_cm or 0) <= 0:
        return False, "Orientation incompatible: fixed orientation requires dimensions"
    _ = location_type
    return True, None


def check_stacking_compatible(
    footprint: ProductFootprint,
    *,
    packaging_carton: bool,
    requested_qty: float,
) -> tuple[bool, str | None, int]:
    """
    Returns (ok, failure_reason, stack_layers_allowed).
    stack_layers_allowed is a conservative multiplier for max units in bin height.
    """
    mode = normalize_stacking(footprint.stacking_mode, packaging_carton=packaging_carton)
    if mode == STACKING_NONE and requested_qty > 1:
        return False, "Stacking prohibited for this product", 1
    if mode == STACKING_PALLET_ONLY and not packaging_carton:
        return False, "Pallet-only stacking — use carton packaging mode", 1
    if mode == STACKING_NONE:
        return True, None, 1
    if mode == STACKING_CARTON_ON_CARTON:
        return True, None, 4
    if footprint.compressible:
        return True, None, 5
    return True, None, 3
