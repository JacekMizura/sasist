"""
Passage → storage void rules (variant A).

Mirrors frontend `passageStorage.ts` — backend must enforce independently of any client.
Void height = clearance of the single enabled passage (hard: >1 enabled → reject).
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Sequence

from .single_passage import assert_at_most_one_enabled_passage


def level_heights_for_rack(rack_height_cm: float, level_count: int) -> list[float]:
    """Equal-split heights; last level absorbs remainder (same as FE)."""
    L = int(level_count)
    H = float(rack_height_cm or 0)
    if L <= 0 or H <= 0:
        return []
    base = int(H // L)
    heights = [float(base)] * L
    heights[L - 1] = H - base * (L - 1)
    return heights


def get_structural_passage(
    passages: Sequence[Mapping[str, Any]] | None,
) -> Mapping[str, Any] | None:
    """The single enabled passage; raises if more than one is enabled."""
    assert_at_most_one_enabled_passage(passages)
    for p in passages or []:
        if p is None:
            continue
        if p.get("enabled") is False:
            continue
        return p
    return None


def get_passage_void_height_cm(passages: Sequence[Mapping[str, Any]] | None) -> float:
    p = get_structural_passage(passages)
    if not p:
        return 0.0
    try:
        c = float(p.get("clearance_height_cm") or 0)
    except (TypeError, ValueError):
        return 0.0
    return c if c > 0 else 0.0


def count_passage_void_levels(
    rack_height_cm: float,
    structural_level_count: int,
    void_height_cm: float,
) -> int:
    """How many bottom structural levels intersect void band [0, void_height)."""
    L = max(0, int(structural_level_count))
    vh = float(void_height_cm or 0)
    H = float(rack_height_cm or 0)
    if L <= 0 or vh <= 0 or H <= 0:
        return 0
    heights = level_heights_for_rack(H, L)
    bottom = 0.0
    skip = 0
    for h in heights:
        if bottom < vh:
            skip += 1
        else:
            break
        bottom += h
    return min(skip, L)


def is_bin_in_void(level_index: int, void_level_count: int) -> bool:
    """Construction level_index in void zone (0 .. void_level_count-1)."""
    return int(level_index) < max(0, int(void_level_count))


def structural_level_count_from_payload(
    rack_payload: Mapping[str, Any] | None,
    *,
    fallback_levels: int | None = None,
) -> int:
    """Prefer level_config / internal_structure length (construction), else rack.levels."""
    data = rack_payload or {}
    lc = data.get("level_config")
    if lc is None:
        lc = data.get("levelConfig")
    if isinstance(lc, list) and len(lc) > 0:
        return len(lc)
    istr = data.get("internal_structure")
    if isinstance(istr, str):
        import json

        try:
            istr = json.loads(istr)
        except (TypeError, ValueError):
            istr = None
    if isinstance(istr, dict):
        levels = istr.get("levels")
        if isinstance(levels, list) and len(levels) > 0:
            return len(levels)
    try:
        n = int(data.get("levels") or fallback_levels or 1)
    except (TypeError, ValueError):
        n = int(fallback_levels or 1)
    return max(1, n)


def passages_from_payload(passages_payload: Any) -> list[dict]:
    if not isinstance(passages_payload, list):
        return []
    out: list[dict] = []
    for raw in passages_payload:
        if not isinstance(raw, dict):
            continue
        out.append(
            {
                "enabled": raw.get("enabled", True) is not False,
                "clearance_height_cm": raw.get("clearance_height_cm"),
            }
        )
    return out


def find_bins_in_void(
    bins: Iterable[Mapping[str, Any]],
    *,
    void_level_count: int,
) -> list[dict]:
    """Return payload bins whose construction level_index sits in the void."""
    bad: list[dict] = []
    if void_level_count <= 0:
        return bad
    for b in bins:
        if not isinstance(b, Mapping):
            continue
        if b.get("is_active") is False:
            continue
        try:
            lev = int(b.get("level_index", 0))
        except (TypeError, ValueError):
            lev = 0
        if is_bin_in_void(lev, void_level_count):
            bad.append(
                {
                    "label": str(b.get("label") or b.get("location_uuid") or f"L{lev}").strip(),
                    "level_index": lev,
                    "segment_index": int(b.get("segment_index") or 0),
                    "location_uuid": b.get("location_uuid") or b.get("locationUUID"),
                }
            )
    return bad


def construction_z_cm(
    *,
    rack_height_cm: float,
    structural_level_count: int,
    level_index: int,
    level_heights_cm: Sequence[float] | None = None,
) -> float:
    """
    Floor Z of a construction level using full rack structure (including void levels).
    Does not depend on trimmed storage-only internal_structure.
    """
    L = max(0, int(structural_level_count))
    lev = max(0, int(level_index))
    if L <= 0:
        return 0.0
    heights = list(level_heights_cm) if level_heights_cm else level_heights_for_rack(rack_height_cm, L)
    if len(heights) != L:
        heights = level_heights_for_rack(rack_height_cm, L)
    return float(sum(heights[: min(lev, L)]))
