"""P5.8C — soft capacity scoring for consolidation shelf allocation."""

from __future__ import annotations

from ...models.consolidation_rack import RackSegment
from .segment_capacity_service import resolve_segment_capacity_dm3


def capacity_allocation_sort_key(
    order_volume_dm3: float | None,
    segment: RackSegment,
    *,
    scoring_active: bool,
) -> tuple[int, float, float]:
    """
    Sort key prefix (lower = preferred).

    Tier 0: fits — prefer highest utilization (best fit).
    Tier 1: neutral — no scoring (unknown segment capacity or scoring off).
    Tier 2: overflow — prefer smallest overflow ratio, then largest segment.
    """
    neutral = (1, 0.0, 0.0)
    if not scoring_active or not order_volume_dm3 or order_volume_dm3 <= 0:
        return neutral

    cap = resolve_segment_capacity_dm3(segment)
    if cap <= 0:
        return neutral

    ratio = order_volume_dm3 / cap
    if order_volume_dm3 <= cap:
        return (0, -ratio * 100.0, -cap)
    return (2, ratio, -cap)


def any_candidate_has_capacity(candidates: list[tuple[RackSegment, object, object]]) -> bool:
    return any(resolve_segment_capacity_dm3(seg) > 0 for seg, _, _ in candidates)
