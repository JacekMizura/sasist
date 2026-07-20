"""Identical-SKU geometric capacity and single-item fit gates."""

from __future__ import annotations

import math
from typing import Optional

from .models import (
    FitConfidence,
    FitContainer,
    FitItem,
    FitMethod,
    IdenticalUnitLayout,
)
from .orientations import allowed_dimension_permutations
from .stacking import max_units_in_single_stack


def item_fits_in_container_any_orientation(container: FitContainer, item: FitItem) -> tuple[bool, Optional[str]]:
    """True if at least one allowed orientation fits as a single unit."""
    perms = allowed_dimension_permutations(item)
    if not perms:
        return False, "ITEM_MISSING_DIMENSIONS"
    cl, cw, ch = float(container.length_cm), float(container.width_cm), float(container.height_cm)
    if cl <= 0 or cw <= 0 or ch <= 0:
        return False, "CONTAINER_MISSING_DIMENSIONS"
    for L, W, H, _i in perms:
        if L <= cl + 1e-9 and W <= cw + 1e-9 and H <= ch + 1e-9:
            return True, None
    return False, "ITEM_DIMENSION_EXCEEDS_CONTAINER"


def best_identical_unit_layout(
    container: FitContainer,
    item: FitItem,
    *,
    apply_container_weight: bool = True,
) -> IdenticalUnitLayout:
    """
    Max identical units of one SKU in an empty (or remaining) rectangular space.

    Uses geometric XYZ for footprint × stack height physics.
    Weight may further reduce capacity.
    """
    perms = allowed_dimension_permutations(item)
    cl = float(container.length_cm)
    cw = float(container.width_cm)
    ch = float(container.height_cm)

    if not perms or cl <= 0 or cw <= 0 or ch <= 0:
        # Volume fallback
        uv = item.unit_volume_dm3
        rem_v = container.remaining_volume_dm3 if container.occupied_volume_dm3 > 0 else container.volume_dm3
        if uv <= 0 or rem_v <= 0:
            return IdenticalUnitLayout(
                capacity=0,
                orientation_index=0,
                box_l_cm=0,
                box_w_cm=0,
                box_h_cm=0,
                count_x=0,
                count_y=0,
                count_z=0,
                stacks_count=0,
                units_per_stack=0,
                limiting_factor="missing_dimensions",
                method=FitMethod.UNKNOWN,
                confidence=FitConfidence.UNKNOWN,
                explanation="Brak wymiarów produktu lub przestrzeni.",
            )
        cap = int(math.floor(rem_v / uv))
        if apply_container_weight and container.max_weight_kg and item.weight_kg > 0:
            rem_w = container.remaining_weight_kg
            if rem_w != float("inf"):
                cap = min(cap, int(math.floor(rem_w / item.weight_kg)))
        return IdenticalUnitLayout(
            capacity=max(0, cap),
            orientation_index=0,
            box_l_cm=item.length_cm,
            box_w_cm=item.width_cm,
            box_h_cm=item.height_cm,
            count_x=0,
            count_y=0,
            count_z=0,
            stacks_count=0,
            units_per_stack=0,
            limiting_factor="volume",
            method=FitMethod.VOLUME_ESTIMATE,
            confidence=FitConfidence.ESTIMATED,
            explanation=f"Szacunek objętościowy: ~{cap} szt.",
        )

    # For remaining space after occupancy without placement map: shrink usable volume
    # but keep full dimensions for geometric (single-SKU empty / known remaining dims).
    # Occupancy-aware: if occupied, we still use full dims for geometric base then
    # callers use ESTIMATED_MIXED — here assume empty dims = container dims.

    best: IdenticalUnitLayout | None = None
    for L, W, H, idx in perms:
        # Compression is defined for the product's natural height axis.
        # After rotation, only apply compressible stack math when vertical axis == product height.
        use_compression = bool(item.compressible) and abs(float(H) - float(item.height_cm or 0)) < 1e-6
        oriented = FitItem(
            product_id=item.product_id,
            length_cm=L,
            width_cm=W,
            height_cm=H,
            weight_kg=item.weight_kg,
            volume_dm3=item.volume_dm3,
            orientation=item.orientation,
            stacking=item.stacking,
            compressible=use_compression,
            compressed_height_cm=item.compressed_height_cm if use_compression else None,
            max_stack_count=item.max_stack_count,
            max_stack_weight_kg=item.max_stack_weight_kg,
            shape_type=item.shape_type,
            fragile=item.fragile,
        )
        cx = int(math.floor(cl / L)) if L > 0 else 0
        cy = int(math.floor(cw / W)) if W > 0 else 0
        if cx <= 0 or cy <= 0:
            continue
        ups = max_units_in_single_stack(oriented, available_height_cm=ch)
        if ups <= 0:
            continue
        stacks = cx * cy
        cap = stacks * ups
        limiting = None
        if item.max_stack_count is not None and ups == int(item.max_stack_count):
            limiting = "max_stack_count"
        cand = IdenticalUnitLayout(
            capacity=cap,
            orientation_index=idx,
            box_l_cm=L,
            box_w_cm=W,
            box_h_cm=H,
            count_x=cx,
            count_y=cy,
            count_z=ups,
            stacks_count=stacks,
            units_per_stack=ups,
            limiting_factor=limiting,
            method=FitMethod.GEOMETRIC,
            confidence=FitConfidence.EXACT,
            explanation=(
                f"Maksymalnie {cap} szt. — {stacks} stosów × {ups} szt./stos "
                f"(siatka {cx}×{cy}, orientacja #{idx})."
            ),
        )
        if best is None or cand.capacity > best.capacity:
            best = cand

    if best is None:
        return IdenticalUnitLayout(
            capacity=0,
            orientation_index=0,
            box_l_cm=item.length_cm,
            box_w_cm=item.width_cm,
            box_h_cm=item.height_cm,
            count_x=0,
            count_y=0,
            count_z=0,
            stacks_count=0,
            units_per_stack=0,
            limiting_factor="geometry",
            method=FitMethod.GEOMETRIC,
            confidence=FitConfidence.EXACT,
            explanation="Produkt nie mieści się geometrycznie w żadnej dozwolonej orientacji.",
        )

    # Container weight cap
    if apply_container_weight and item.weight_kg > 0:
        rem_w = container.remaining_weight_kg if container.occupied_weight_kg > 0 else (
            float(container.max_weight_kg) if container.max_weight_kg else float("inf")
        )
        if rem_w != float("inf") and rem_w >= 0:
            by_w = int(math.floor(rem_w / item.weight_kg))
            if by_w < best.capacity:
                best = IdenticalUnitLayout(
                    capacity=max(0, by_w),
                    orientation_index=best.orientation_index,
                    box_l_cm=best.box_l_cm,
                    box_w_cm=best.box_w_cm,
                    box_h_cm=best.box_h_cm,
                    count_x=best.count_x,
                    count_y=best.count_y,
                    count_z=best.count_z,
                    stacks_count=best.stacks_count,
                    units_per_stack=best.units_per_stack,
                    limiting_factor="weight",
                    method=best.method,
                    confidence=best.confidence,
                    explanation=(
                        f"Geometria: {best.capacity} szt., limit wagi przestrzeni: {by_w} szt. "
                        f"— wynik {by_w}."
                    ),
                )

    return best


def cylinder_identical_capacity(container: FitContainer, item: FitItem) -> int:
    """Diameter = width_cm, height = height_cm (existing FE semantics)."""
    d = float(item.width_cm or 0)
    h = float(item.height_cm or 0)
    if d <= 0 or h <= 0:
        return 0
    per_w = int(math.floor(container.length_cm / d))
    per_d = int(math.floor(container.width_cm / d))
    per_h = max_units_in_single_stack(
        FitItem(
            product_id=item.product_id,
            length_cm=d,
            width_cm=d,
            height_cm=h,
            weight_kg=item.weight_kg,
            stacking=item.stacking,
            compressible=item.compressible,
            compressed_height_cm=item.compressed_height_cm,
            max_stack_count=item.max_stack_count,
            max_stack_weight_kg=item.max_stack_weight_kg,
            fragile=item.fragile,
            shape_type="cylinder",
        ),
        available_height_cm=container.height_cm,
    )
    return max(0, per_w * per_d * per_h)
