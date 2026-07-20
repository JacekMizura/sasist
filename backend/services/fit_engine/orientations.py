"""Orientation rules — maps existing product.orientation_type values."""

from __future__ import annotations

from .models import FitItem, OrientationMode


def normalize_orientation_mode(raw: str | None) -> OrientationMode:
    v = str(raw or "").strip().lower().replace("-", "_")
    if v in ("upright", "upright_only", "vertical"):
        return OrientationMode.UPRIGHT_ONLY
    if v in ("no_rotation", "no_stack", "fixed"):  # legacy "no_stack" on orientation field
        return OrientationMode.NO_ROTATION
    return OrientationMode.ANY


def allowed_dimension_permutations(item: FitItem) -> list[tuple[float, float, float, int]]:
    """
    Returns list of (L, W, H, orientation_index) for allowed placements.
    Index matches FE calculatePackingLayout rotation indices 0..5:
      0: (pw, pd, ph)  mapped as (length, width, height) of item as (L,W,H)
      1: (pw, ph, pd)
      2: (pd, pw, ph)
      3: (pd, ph, pw)
      4: (ph, pw, pd)
      5: (ph, pd, pw)
    Product length→L, width→W, height→H.
    """
    L = float(item.length_cm or 0)
    W = float(item.width_cm or 0)
    H = float(item.height_cm or 0)
    if L <= 0 or W <= 0 or H <= 0:
        return []

    all_perms: list[tuple[float, float, float, int]] = [
        (L, W, H, 0),
        (L, H, W, 1),
        (W, L, H, 2),
        (W, H, L, 3),
        (H, L, W, 4),
        (H, W, L, 5),
    ]

    mode = item.orientation
    if mode == OrientationMode.ANY:
        return all_perms
    if mode == OrientationMode.NO_ROTATION:
        return [(L, W, H, 0)]
    # upright_only: height axis of product stays vertical → H is the vertical dimension
    # Allowed: product height maps to container Z (third component)
    upright = [(a, b, c, i) for (a, b, c, i) in all_perms if abs(c - H) < 1e-9]
    return upright if upright else [(L, W, H, 0)]
