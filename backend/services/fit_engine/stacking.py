"""Stack height and per-stack unit limits — shared by location + packaging."""

from __future__ import annotations

import math
from typing import Optional

from .models import FitItem, StackingMode


def normalize_stacking_mode(raw: str | None) -> StackingMode:
    v = str(raw or "").strip().lower().replace("-", "_")
    if v in ("no_stack", "none", "not_stackable"):
        return StackingMode.NO_STACK
    return StackingMode.STACKABLE


def stack_height_cm(item: FitItem, units_in_stack: int) -> float:
    """
    Height of a vertical stack of ``units_in_stack`` identical units.

    Semantics of compressed_height_cm (existing Product field):
    - First unit uses full height_cm.
    - Each additional unit adds compressed_height_cm when compressible,
      else adds full height_cm.
    """
    n = max(0, int(units_in_stack))
    if n <= 0:
        return 0.0
    base = float(item.height_cm or 0)
    if n == 1:
        return base
    if item.compressible and item.compressed_height_cm is not None and float(item.compressed_height_cm) > 0:
        comp = float(item.compressed_height_cm)
        return base + (n - 1) * comp
    return n * base


def max_units_in_single_stack(
    item: FitItem,
    *,
    available_height_cm: float,
) -> int:
    """
    Max units in ONE stack given container/column height.

    max_stack_count = hard cap on units per stack (not whole container).
    max_stack_weight_kg = cap by weight of the stack.
    fragile / NO_STACK → 1.
    """
    if item.stacking == StackingMode.NO_STACK or item.fragile:
        return 1 if float(item.height_cm or 0) <= available_height_cm + 1e-9 else 0

    h_avail = float(available_height_cm or 0)
    if h_avail <= 0 or float(item.height_cm or 0) <= 0:
        return 0

    # Binary search / incremental: find max n where stack_height(n) <= h_avail
    lo, hi = 1, max(1, int(math.floor(h_avail / min(float(item.height_cm), float(item.compressed_height_cm or item.height_cm)) + 2)))
    if item.max_stack_count is not None and int(item.max_stack_count) > 0:
        hi = min(hi, int(item.max_stack_count))
    best = 0
    for n in range(1, hi + 1):
        if stack_height_cm(item, n) <= h_avail + 1e-9:
            best = n
        else:
            break

    if item.max_stack_weight_kg is not None and float(item.max_stack_weight_kg) > 0 and float(item.weight_kg or 0) > 0:
        by_w = int(math.floor(float(item.max_stack_weight_kg) / float(item.weight_kg)))
        best = min(best, max(0, by_w))

    if item.max_stack_count is not None and int(item.max_stack_count) > 0:
        best = min(best, int(item.max_stack_count))

    return max(0, best)
