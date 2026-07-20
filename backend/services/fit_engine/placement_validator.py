"""Independent placement validation — hard gate after any GEOMETRIC FIT claim."""

from __future__ import annotations

from dataclasses import dataclass

from .models import FitContainer, FitItem, PlacementBox
from .orientations import allowed_dimension_permutations


EPS = 1e-6


@dataclass(frozen=True)
class PlacementValidationResult:
    ok: bool
    reason: str | None = None


def aabb_overlap(a: PlacementBox, b: PlacementBox, *, eps: float = EPS) -> bool:
    """True if axis-aligned boxes intersect in volume (touching faces = no overlap)."""
    return not (
        a.x + a.l <= b.x + eps
        or b.x + b.l <= a.x + eps
        or a.y + a.w <= b.y + eps
        or b.y + b.w <= a.y + eps
        or a.z + a.h <= b.z + eps
        or b.z + b.h <= a.z + eps
    )


def placement_inside_container(p: PlacementBox, container: FitContainer, *, eps: float = EPS) -> bool:
    if p.l <= eps or p.w <= eps or p.h <= eps:
        return False
    if p.x < -eps or p.y < -eps or p.z < -eps:
        return False
    if p.x + p.l > float(container.length_cm) + eps:
        return False
    if p.y + p.w > float(container.width_cm) + eps:
        return False
    if p.z + p.h > float(container.height_cm) + eps:
        return False
    return True


def _orientation_legal(item: FitItem, l: float, w: float, h: float, *, eps: float = EPS) -> bool:
    for L, W, H, _ in allowed_dimension_permutations(item):
        if abs(L - l) <= eps and abs(W - w) <= eps and abs(H - h) <= eps:
            return True
    return False


def no_stack_or_fragile_has_load_above(placements: list[PlacementBox], *, eps: float = EPS) -> bool:
    """
    Conservative rule: if a placement is not stackable_on_top, no other placement
    may sit directly above with overlapping XY footprint and z ≈ top face.
    """
    blocked = [p for p in placements if not p.stackable_on_top]
    for base in blocked:
        top_z = base.z + base.h
        for other in placements:
            if other is base:
                continue
            if abs(other.z - top_z) > eps:
                continue
            # XY overlap (area contact)
            if not (
                other.x + other.l <= base.x + eps
                or base.x + base.l <= other.x + eps
                or other.y + other.w <= base.y + eps
                or base.y + base.w <= other.y + eps
            ):
                return True
    return False


def validate_placements(
    container: FitContainer,
    placements: list[PlacementBox],
    *,
    items_by_product_id: dict[int, FitItem] | None = None,
    expected_qty_by_product: dict[int, int] | None = None,
    total_weight_kg: float | None = None,
) -> PlacementValidationResult:
    for p in placements:
        if not placement_inside_container(p, container):
            return PlacementValidationResult(False, "INTERNAL_PLACEMENT_VALIDATION_FAILED")
        if items_by_product_id and p.product_id in items_by_product_id:
            item = items_by_product_id[p.product_id]
            if not _orientation_legal(item, p.l, p.w, p.h):
                return PlacementValidationResult(False, "INTERNAL_PLACEMENT_VALIDATION_FAILED")

    for i, a in enumerate(placements):
        for b in placements[i + 1 :]:
            if aabb_overlap(a, b):
                return PlacementValidationResult(False, "INTERNAL_PLACEMENT_VALIDATION_FAILED")

    if no_stack_or_fragile_has_load_above(placements):
        return PlacementValidationResult(False, "STACK_RULE_VIOLATION")

    weight = total_weight_kg
    if weight is None:
        weight = sum(float(p.weight_kg or 0) for p in placements)
    if container.max_weight_kg is not None and float(container.max_weight_kg) > 0:
        if float(weight) > float(container.max_weight_kg) + EPS:
            return PlacementValidationResult(False, "WEIGHT_EXCEEDED")

    if expected_qty_by_product is not None:
        got: dict[int, int] = {}
        for p in placements:
            got[p.product_id] = got.get(p.product_id, 0) + 1
        for pid, qty in expected_qty_by_product.items():
            if got.get(pid, 0) != int(qty):
                return PlacementValidationResult(False, "INTERNAL_PLACEMENT_VALIDATION_FAILED")

    return PlacementValidationResult(True, None)
