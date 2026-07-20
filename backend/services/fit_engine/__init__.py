"""Shared physical fit / capacity primitives — SSOT for location + packaging + future containers."""

from .geometry import (
    best_identical_unit_layout,
    cylinder_identical_capacity,
    item_fits_in_container_any_orientation,
)
from .models import (
    FitConfidence,
    FitContainer,
    FitItem,
    FitMethod,
    IdenticalUnitLayout,
    OrientationMode,
    PlacementBox,
    StackingMode,
)
from .orientations import allowed_dimension_permutations, normalize_orientation_mode
from .placement_validator import aabb_overlap, validate_placements
from .stacking import max_units_in_single_stack, stack_height_cm

__all__ = [
    "FitConfidence",
    "FitContainer",
    "FitItem",
    "FitMethod",
    "IdenticalUnitLayout",
    "OrientationMode",
    "PlacementBox",
    "StackingMode",
    "aabb_overlap",
    "allowed_dimension_permutations",
    "best_identical_unit_layout",
    "cylinder_identical_capacity",
    "item_fits_in_container_any_orientation",
    "max_units_in_single_stack",
    "normalize_orientation_mode",
    "stack_height_cm",
    "validate_placements",
]
