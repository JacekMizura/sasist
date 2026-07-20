"""Deterministic multi-SKU placement heuristic for cartonization (free-rect + hard AABB gate)."""

from __future__ import annotations

from dataclasses import dataclass, field

from .geometry import item_fits_in_container_any_orientation
from .models import FitContainer, FitItem, PlacementBox
from .orientations import allowed_dimension_permutations
from .placement_validator import validate_placements


EPS = 1e-6


@dataclass
class FreeRect:
    x: float
    y: float
    z: float
    l: float
    w: float
    h: float


@dataclass
class PackAttemptResult:
    fits: bool
    placements: list[PlacementBox] = field(default_factory=list)
    reason: str | None = None
    used_volume_cm3: float = 0.0
    total_weight_kg: float = 0.0


def _expand_units(items: list[tuple[FitItem, int]]) -> list[FitItem]:
    units: list[FitItem] = []
    for item, qty in items:
        q = max(0, int(qty))
        for _ in range(q):
            units.append(item)

    def key(it: FitItem):
        perms = allowed_dimension_permutations(it)
        max_dim = max(it.length_cm, it.width_cm, it.height_cm)
        return (-max_dim, -it.unit_volume_dm3, len(perms), -it.weight_kg, it.product_id)

    units.sort(key=key)
    return units


def _prune_free(free: list[FreeRect]) -> list[FreeRect]:
    """Remove contained / near-duplicate free spaces (deterministic)."""
    if len(free) <= 1:
        return free
    # Drop near-zero volume
    cleaned = [r for r in free if r.l > EPS and r.w > EPS and r.h > EPS]
    cleaned.sort(key=lambda r: (r.z, r.y, r.x, -r.l * r.w * r.h))
    kept: list[FreeRect] = []
    for r in cleaned:
        contained = False
        for k in kept:
            if (
                r.x >= k.x - EPS
                and r.y >= k.y - EPS
                and r.z >= k.z - EPS
                and r.x + r.l <= k.x + k.l + EPS
                and r.y + r.w <= k.y + k.w + EPS
                and r.z + r.h <= k.z + k.h + EPS
            ):
                contained = True
                break
        if contained:
            continue
        # Drop keepers fully contained in r
        kept = [
            k
            for k in kept
            if not (
                k.x >= r.x - EPS
                and k.y >= r.y - EPS
                and k.z >= r.z - EPS
                and k.x + k.l <= r.x + r.l + EPS
                and k.y + k.w <= r.y + r.w + EPS
                and k.z + k.h <= r.z + r.h + EPS
            )
        ]
        kept.append(r)
    return kept


def try_pack_items_into_container(
    container: FitContainer,
    items_with_qty: list[tuple[FitItem, int]],
) -> PackAttemptResult:
    cl, cw, ch = float(container.length_cm), float(container.width_cm), float(container.height_cm)
    if cl <= 0 or cw <= 0 or ch <= 0:
        return PackAttemptResult(False, reason="CONTAINER_MISSING_DIMENSIONS")

    items_by_id = {it.product_id: it for it, q in items_with_qty if q > 0}
    expected_qty = {it.product_id: int(q) for it, q in items_with_qty if q > 0}

    for item, qty in items_with_qty:
        if qty <= 0:
            continue
        ok, reason = item_fits_in_container_any_orientation(container, item)
        if not ok:
            return PackAttemptResult(False, reason=reason or "ITEM_DIMENSION_EXCEEDS_CONTAINER")

    units = _expand_units(items_with_qty)
    if not units:
        return PackAttemptResult(True, placements=[], used_volume_cm3=0.0, total_weight_kg=0.0)

    free: list[FreeRect] = [FreeRect(0, 0, 0, cl, cw, ch)]
    placements: list[PlacementBox] = []
    total_w = 0.0
    used_vol = 0.0

    for unit in units:
        perms = allowed_dimension_permutations(unit)
        placed = False
        free = _prune_free(free)
        free.sort(key=lambda r: (r.z, r.y, r.x, -r.l * r.w * r.h))

        for rect in list(free):
            candidates: list[tuple[float, float, float, int]] = []
            for L, W, H, idx in perms:
                if L <= rect.l + EPS and W <= rect.w + EPS and H <= rect.h + EPS:
                    candidates.append((L, W, H, idx))
            if not candidates:
                continue
            candidates.sort(key=lambda t: (t[2], t[0] * t[1], t[3]))
            L, W, H, _idx = candidates[0]

            # Fragile OR no_stack → nothing may be placed on top of this unit later
            stackable_on_top = unit.stacking.value != "no_stack" and not unit.fragile

            if rect.z > EPS:
                supporting = [
                    p
                    for p in placements
                    if abs(p.z + p.h - rect.z) < 1e-6
                    and not (p.x + p.l <= rect.x or rect.x + L <= p.x or p.y + p.w <= rect.y or rect.y + W <= p.y)
                ]
                if any(not p.stackable_on_top for p in supporting):
                    continue

            # Reject candidate if it would AABB-overlap existing placements (belt + suspenders)
            cand = PlacementBox(
                product_id=unit.product_id,
                x=rect.x,
                y=rect.y,
                z=rect.z,
                l=L,
                w=W,
                h=H,
                weight_kg=float(unit.weight_kg or 0),
                stackable_on_top=stackable_on_top,
            )
            from .placement_validator import aabb_overlap

            if any(aabb_overlap(cand, p) for p in placements):
                continue

            placements.append(cand)
            total_w += float(unit.weight_kg or 0)
            used_vol += L * W * H

            free.remove(rect)
            if rect.l - L > EPS:
                free.append(FreeRect(rect.x + L, rect.y, rect.z, rect.l - L, rect.w, rect.h))
            if rect.w - W > EPS:
                free.append(FreeRect(rect.x, rect.y + W, rect.z, L, rect.w - W, rect.h))
            if rect.h - H > EPS and stackable_on_top:
                free.append(FreeRect(rect.x, rect.y, rect.z + H, L, W, rect.h - H))
            free = _prune_free(free)

            placed = True
            break

        if not placed:
            return PackAttemptResult(
                False,
                placements=placements,
                reason="GEOMETRIC_PACKING_FAILED",
                used_volume_cm3=used_vol,
                total_weight_kg=total_w,
            )

    gate = validate_placements(
        container,
        placements,
        items_by_product_id=items_by_id,
        expected_qty_by_product=expected_qty,
        total_weight_kg=total_w,
    )
    if not gate.ok:
        return PackAttemptResult(
            False,
            placements=placements,
            reason=gate.reason or "INTERNAL_PLACEMENT_VALIDATION_FAILED",
            used_volume_cm3=used_vol,
            total_weight_kg=total_w,
        )

    return PackAttemptResult(
        True,
        placements=placements,
        used_volume_cm3=used_vol,
        total_weight_kg=total_w,
    )


def identical_qty_fits_via_capacity(container: FitContainer, item: FitItem, qty: int) -> bool:
    from .geometry import best_identical_unit_layout

    layout = best_identical_unit_layout(container, item)
    return layout.capacity >= int(qty)
