"""
Auto-labeling: name every bin based on its position in the aisle.

Convention: AisleLetter-RackIndex-Level-Segment, e.g. A-01-04-02.
"""

from typing import List


def generate_bin_labels(
    aisle_letter: str,
    rack_index: int,
    levels: int,
    segments_per_level: List[int],
) -> List[dict]:
    """
    Returns list of {"label": "A-01-01-01", "level_index": 0, "segment_index": 0}, ...
    """
    out = []
    for lev in range(levels):
        segs = segments_per_level[lev] if lev < len(segments_per_level) else 1
        for seg in range(segs):
            label = (
                f"{aisle_letter}-"
                f"{rack_index:02d}-"
                f"{lev + 1:02d}-"
                f"{seg + 1:02d}"
            )
            out.append({
                "label": label,
                "level_index": lev,
                "segment_index": seg,
            })
    return out
