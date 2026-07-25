"""
Deterministic service-face repair from layout row geometry (not Routing Graph).

Rules:
- Back-to-back row_containers (overlap along row axis, adjacent on depth axis):
  outer faces point away from the shared back plane.
- Unpaired horizontal rows: face the clearer neighboring aisle gap (layout space),
  never nearest routing edge.
- Store racks: same service_side/rotation SSOT as warehouse racks; infer face from
  nearest aisle-like gap to neighboring racks with REAL transverse footprint overlap
  (N/S require X-overlap; E/W require Y-overlap). No lateral_slack.
- Provenance (service_face_origin):
  EXPLICIT → never auto-repaired (neighbor move/delete cannot change face).
  AUTO_REPAIR → may recompute when geometry yields a different deterministic face.
  LEGACY_DEFAULT → FRONT+0 mismatch repair, plus a narrow fingerprint of the
  pre-provenance diagonal-slack EAST bug (never invent EXPLICIT for NULL/legacy).
- Racks that cannot be decided → reported UNRESOLVED (unchanged).

Warehouse row-band mutation gate:
  EXPLICIT never; AUTO_REPAIR on mismatch; LEGACY only FRONT+0 + mismatch.
  FRONT+0 alone is NEVER sufficient (legal WEST uses FRONT+0).
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from typing import Optional

from ...models.warehouse import Rack, WarehouseLayout
from .rack_service_face import (
    ServiceFace,
    ServiceFaceOrigin,
    apply_face_to_rack_obj,
    face_for_cardinal,
    is_store_rack,
    normalize_rotation,
    normalize_service_face_origin,
    normalize_service_side,
    world_service_normal,
)

logger = logging.getLogger(__name__)

# Max gap (grid cells) between row bands to treat as back-to-back (touching / near-touching).
BACK_TO_BACK_MAX_GAP_CELLS = 1.0
# Overlap ratio along shared axis to consider two rows "paired".
PAIR_OVERLAP_RATIO = 0.5
_NORMAL_EPS = 1e-6


@dataclass
class RowBand:
    container_id: str
    orientation: str  # "horizontal" | "vertical" — row draw orientation
    min_x: float
    min_y: float
    max_x: float
    max_y: float
    rack_uuids: list[str] = field(default_factory=list)
    rack_ids: list[int] = field(default_factory=list)

    @property
    def cx(self) -> float:
        return (self.min_x + self.max_x) * 0.5

    @property
    def cy(self) -> float:
        return (self.min_y + self.max_y) * 0.5

    @property
    def is_horizontal_row(self) -> bool:
        # Horizontal row = racks side-by-side along X (row_container.orientation == horizontal)
        return (self.orientation or "horizontal").lower() != "vertical"


@dataclass
class FaceRepairReport:
    repaired: list[dict] = field(default_factory=list)
    unresolved: list[dict] = field(default_factory=list)
    skipped_store: list[dict] = field(default_factory=list)
    skipped_explicit: list[dict] = field(default_factory=list)
    skipped_matching: list[dict] = field(default_factory=list)

    @property
    def deterministic_count(self) -> int:
        return sum(1 for r in self.repaired if r.get("changed"))


def is_default_face_fingerprint(rack: object) -> bool:
    """
    Old generator default encoding: FRONT + rotation 0.

    NOT a standalone legacy marker — WEST-facing vertical racks *legally* use FRONT+0.
    Use only together with a deterministic expected-face mismatch.
    """
    side = normalize_service_side(getattr(rack, "service_side", None))
    rot = normalize_rotation(getattr(rack, "rotation_degrees", 0))
    return side == "FRONT" and rot == 0


# Backward-compatible alias (callers / older tests). Prefer is_default_face_fingerprint.
def is_legacy_default_face(rack: object) -> bool:
    return is_default_face_fingerprint(rack)


def rack_matches_expected_face(rack: object, expected: ServiceFace, *, orientation: str) -> bool:
    """True when current rack world normal equals expected world normal."""
    cur = world_service_normal(
        orientation=orientation,
        rotation_degrees=getattr(rack, "rotation_degrees", 0),
        service_side=getattr(rack, "service_side", None),
    )
    exp = world_service_normal(
        orientation=orientation,
        rotation_degrees=expected.rotation_degrees,
        service_side=expected.service_side,
    )
    return abs(cur.x - exp.x) <= _NORMAL_EPS and abs(cur.y - exp.y) <= _NORMAL_EPS


def rack_service_face_origin(rack: object) -> ServiceFaceOrigin:
    return normalize_service_face_origin(getattr(rack, "service_face_origin", None))


def should_repair_legacy_mismatch(rack: object, expected: ServiceFace, *, orientation: str) -> bool:
    """
    Warehouse row-band mutation gate.

    EXPLICIT → never. AUTO_REPAIR → recompute on mismatch.
    LEGACY_DEFAULT → only FRONT+0 fingerprint + mismatch (legal WEST preserved).
    Store racks use should_repair_store_face instead.
    """
    if is_store_rack(rack):
        return False
    if rack_service_face_origin(rack) == ServiceFaceOrigin.EXPLICIT:
        return False
    if rack_matches_expected_face(rack, expected, orientation=orientation):
        return False
    if rack_service_face_origin(rack) == ServiceFaceOrigin.AUTO_REPAIR:
        return True
    return is_default_face_fingerprint(rack)


def _parse_row_containers(layout: WarehouseLayout) -> list[dict]:
    raw = getattr(layout, "row_containers_json", None)
    if not raw:
        return []
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    return data if isinstance(data, list) else []


def _band_from_container(container: dict, racks_by_uuid: dict[str, Rack], racks_by_id: dict[int, Rack]) -> Optional[RowBand]:
    slots = container.get("slots") or []
    rack_uuids: list[str] = []
    rack_ids: list[int] = []
    xs: list[float] = []
    ys: list[float] = []
    for sl in slots:
        if not isinstance(sl, dict):
            continue
        rid = sl.get("rackId") or sl.get("rack_id")
        rack: Optional[Rack] = None
        if isinstance(rid, str) and rid in racks_by_uuid:
            rack = racks_by_uuid[rid]
            rack_uuids.append(rid)
        elif rid is not None:
            try:
                iid = int(rid)
            except (TypeError, ValueError):
                iid = None
            if iid is not None and iid in racks_by_id:
                rack = racks_by_id[iid]
                rack_ids.append(iid)
                if getattr(rack, "uuid", None):
                    rack_uuids.append(str(rack.uuid))
        x = float(sl.get("x", getattr(rack, "x", 0) or 0))
        y = float(sl.get("y", getattr(rack, "y", 0) or 0))
        w = float(sl.get("w", getattr(rack, "width", 0) or 0))
        h = float(sl.get("h", getattr(rack, "height", 0) or 0))
        if rack is not None:
            x = float(rack.x or x)
            y = float(rack.y or y)
            w = float(rack.width or w)
            h = float(rack.height or h)
        if w <= 0 or h <= 0:
            continue
        xs.extend([x, x + w])
        ys.extend([y, y + h])
    if not xs or not ys:
        return None
    return RowBand(
        container_id=str(container.get("id") or ""),
        orientation=str(container.get("orientation") or "horizontal"),
        min_x=min(xs),
        min_y=min(ys),
        max_x=max(xs),
        max_y=max(ys),
        rack_uuids=list(dict.fromkeys(rack_uuids)),
        rack_ids=list(dict.fromkeys(rack_ids)),
    )


def _overlap_1d(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def _are_back_to_back_y(a: RowBand, b: RowBand) -> bool:
    """Two horizontal rows stacked in Y with backs nearly touching."""
    if not (a.is_horizontal_row and b.is_horizontal_row):
        return False
    span = min(a.max_x - a.min_x, b.max_x - b.min_x)
    if span <= 0:
        return False
    ox = _overlap_1d(a.min_x, a.max_x, b.min_x, b.max_x)
    if ox / span < PAIR_OVERLAP_RATIO:
        return False
    # Gap between bands along Y
    if a.max_y <= b.min_y:
        gap = b.min_y - a.max_y
    elif b.max_y <= a.min_y:
        gap = a.min_y - b.max_y
    else:
        # Overlapping in Y — treat as back-to-back if centers differ
        gap = 0.0
    return gap <= BACK_TO_BACK_MAX_GAP_CELLS


def _are_back_to_back_x(a: RowBand, b: RowBand) -> bool:
    """Two vertical rows side-by-side in X with backs nearly touching."""
    if a.is_horizontal_row or b.is_horizontal_row:
        return False
    span = min(a.max_y - a.min_y, b.max_y - b.min_y)
    if span <= 0:
        return False
    oy = _overlap_1d(a.min_y, a.max_y, b.min_y, b.max_y)
    if oy / span < PAIR_OVERLAP_RATIO:
        return False
    if a.max_x <= b.min_x:
        gap = b.min_x - a.max_x
    elif b.max_x <= a.min_x:
        gap = a.min_x - b.max_x
    else:
        gap = 0.0
    return gap <= BACK_TO_BACK_MAX_GAP_CELLS


def _racks_for_band(band: RowBand, racks_by_uuid: dict[str, Rack], racks_by_id: dict[int, Rack]) -> list[Rack]:
    out: list[Rack] = []
    seen: set[int] = set()
    for u in band.rack_uuids:
        r = racks_by_uuid.get(u)
        if r is not None and id(r) not in seen:
            out.append(r)
            seen.add(id(r))
    for i in band.rack_ids:
        r = racks_by_id.get(i)
        if r is not None and id(r) not in seen:
            out.append(r)
            seen.add(id(r))
    return out


def _apply_face(
    racks: list[Rack],
    face: ServiceFace,
    *,
    reason: str,
    report: FaceRepairReport,
) -> None:
    from .rack_service_face import encode_face_for_world_normal

    for rack in racks:
        if is_store_rack(rack):
            report.skipped_store.append(
                {"rack_uuid": getattr(rack, "uuid", None), "rack_id": getattr(rack, "id", None), "reason": "store"}
            )
            continue
        orient = str(getattr(rack, "orientation", None) or "vertical")
        n = world_service_normal(
            orientation="vertical",
            rotation_degrees=face.rotation_degrees,
            service_side=face.service_side,
        )
        target_face = (
            face
            if orient.lower() == "vertical"
            else encode_face_for_world_normal(n.x, n.y, orientation=orient)
        )
        base_meta = {
            "rack_uuid": getattr(rack, "uuid", None),
            "rack_id": getattr(rack, "id", None),
            "name": getattr(rack, "name", None),
            "service_side": getattr(rack, "service_side", None),
            "rotation_degrees": int(getattr(rack, "rotation_degrees", 0) or 0),
            "service_face_origin": rack_service_face_origin(rack).value,
        }
        # 1) Already matches deterministic expected (includes LEGAL FRONT+0 = WEST).
        if rack_matches_expected_face(rack, target_face, orientation=orient):
            report.skipped_matching.append({**base_meta, "reason": "matches_deterministic_expected"})
            continue
        # 2–3) Provenance gate: EXPLICIT never; AUTO on mismatch; LEGACY only FRONT+0 mismatch.
        if not should_repair_legacy_mismatch(rack, target_face, orientation=orient):
            report.skipped_explicit.append({**base_meta, "reason": "explicit_or_legal_ssot_preserved"})
            continue
        before = (
            getattr(rack, "service_side", None),
            int(getattr(rack, "rotation_degrees", 0) or 0),
            rack_service_face_origin(rack),
        )
        changed = apply_face_to_rack_obj(rack, target_face, origin=ServiceFaceOrigin.AUTO_REPAIR)
        report.repaired.append(
            {
                "rack_uuid": getattr(rack, "uuid", None),
                "rack_id": getattr(rack, "id", None),
                "name": getattr(rack, "name", None),
                "before": {
                    "service_side": before[0],
                    "rotation_degrees": before[1],
                    "service_face_origin": before[2].value,
                },
                "after": {
                    **target_face.as_dict(),
                    "service_face_origin": ServiceFaceOrigin.AUTO_REPAIR.value,
                },
                "reason": f"{reason}:legacy_or_auto_recompute",
                "changed": changed,
            }
        )


def _infer_unpaired_horizontal_face(
    band: RowBand,
    others: list[RowBand],
) -> Optional[ServiceFace]:
    """
    Face toward the aisle gap to the nearest overlapping neighbor row.
    Layout-space only — no routing graph.
    """
    candidates: list[tuple[float, str]] = []  # (gap, cardinal)
    for o in others:
        if o.container_id == band.container_id:
            continue
        if not o.is_horizontal_row:
            continue
        span = min(band.max_x - band.min_x, o.max_x - o.min_x)
        if span <= 0:
            continue
        ox = _overlap_1d(band.min_x, band.max_x, o.min_x, o.max_x)
        if ox / span < 0.25:
            continue
        if o.cy < band.cy:
            # Neighbor north → aisle is on north side of this band → face NORTH
            gap = band.min_y - o.max_y
            if gap < 0:
                gap = 0.0
            candidates.append((gap, "NORTH"))
        elif o.cy > band.cy:
            gap = o.min_y - band.max_y
            if gap < 0:
                gap = 0.0
            candidates.append((gap, "SOUTH"))
    if not candidates:
        return None
    # Prefer the closer aisle (typical service corridor)
    candidates.sort(key=lambda t: t[0])
    return face_for_cardinal(candidates[0][1], orientation="vertical")


# Aisle-like gap between store and neighboring rack (grid cells).
_STORE_AISLE_GAP_MIN = 1.5
_STORE_AISLE_GAP_MAX = 40.0
# Old buggy store inference used lateral_slack≈20 (cells) — fingerprint only.
_LEGACY_DIAGONAL_SLACK_CELLS = 20.0
# No obstacle along the face ray = open/unbounded (never treat as clearance 0).
STORE_OPEN_CLEARANCE_UNBOUNDED = float("inf")
# Numeric / near-touch only — NEVER expand footprints into diagonal "neighbors".
_STORE_OVERLAP_EPS = 1e-6
# Deterministic remis among equal clearances / gaps.
_CARDINAL_TIE_ORDER = {"NORTH": 0, "SOUTH": 1, "EAST": 2, "WEST": 3}


def _rack_aabb_cells(rack: object) -> tuple[float, float, float, float]:
    x = float(getattr(rack, "x", 0) or 0)
    y = float(getattr(rack, "y", 0) or 0)
    w = float(getattr(rack, "width", 1) or 1)
    h = float(getattr(rack, "height", 1) or 1)
    return x, y, x + w, y + h


def _real_projection_overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    """Signed overlap length on one axis (negative ⇒ separated). Not clamped."""
    return min(a1, b1) - max(a0, b0)


def _has_real_axis_overlap(a0: float, a1: float, b0: float, b1: float) -> bool:
    """
    True when projections overlap or touch (raw overlap >= -eps).
    Separated intervals (raw << 0) never qualify — no lateral slack.
    """
    return _real_projection_overlap(a0, a1, b0, b1) >= -_STORE_OVERLAP_EPS


def _store_cardinal_from_face(rack: object, face: ServiceFace) -> str:
    n = world_service_normal(
        orientation=str(getattr(rack, "orientation", None) or "vertical"),
        service_side=face.service_side,
        rotation_degrees=face.rotation_degrees,
    )
    if abs(n.x) >= abs(n.y):
        return "EAST" if n.x > 0 else "WEST"
    return "SOUTH" if n.y > 0 else "NORTH"


def _store_neighbor_gap_candidates(rack: object, others: list) -> list[tuple[float, str]]:
    """
    Directional aisle gaps from neighbors with REAL transverse footprint overlap.

    NORTH/SOUTH ⇒ must overlap on X
    EAST/WEST  ⇒ must overlap on Y
    Diagonal / laterally shifted racks never contribute.
    """
    ax0, ay0, ax1, ay1 = _rack_aabb_cells(rack)
    candidates: list[tuple[float, str]] = []
    for o in others:
        if o is rack:
            continue
        if getattr(o, "id", None) is not None and getattr(rack, "id", None) is not None:
            if int(o.id) == int(rack.id):
                continue
        bx0, by0, bx1, by1 = _rack_aabb_cells(o)
        # NORTH: neighbor entirely (or touching) above, real X overlap
        if _has_real_axis_overlap(ax0, ax1, bx0, bx1) and by1 <= ay0 + _STORE_OVERLAP_EPS:
            gap = ay0 - by1
            if _STORE_AISLE_GAP_MIN <= gap <= _STORE_AISLE_GAP_MAX:
                candidates.append((gap, "NORTH"))
        # SOUTH
        if _has_real_axis_overlap(ax0, ax1, bx0, bx1) and by0 >= ay1 - _STORE_OVERLAP_EPS:
            gap = by0 - ay1
            if _STORE_AISLE_GAP_MIN <= gap <= _STORE_AISLE_GAP_MAX:
                candidates.append((gap, "SOUTH"))
        # WEST
        if _has_real_axis_overlap(ay0, ay1, by0, by1) and bx1 <= ax0 + _STORE_OVERLAP_EPS:
            gap = ax0 - bx1
            if _STORE_AISLE_GAP_MIN <= gap <= _STORE_AISLE_GAP_MAX:
                candidates.append((gap, "WEST"))
        # EAST
        if _has_real_axis_overlap(ay0, ay1, by0, by1) and bx0 >= ax1 - _STORE_OVERLAP_EPS:
            gap = bx0 - ax1
            if _STORE_AISLE_GAP_MIN <= gap <= _STORE_AISLE_GAP_MAX:
                candidates.append((gap, "EAST"))
    return candidates


def _store_open_clearance(rack: object, others: list, direction: str) -> float:
    """
    Distance from rack face midpoint outward until another rack AABB.

    Transverse containment uses the face midpoint only (no footprint expansion).
    No obstacle on the ray → STORE_OPEN_CLEARANCE_UNBOUNDED (never 0).
    """
    ax0, ay0, ax1, ay1 = _rack_aabb_cells(rack)
    cx, cy = (ax0 + ax1) * 0.5, (ay0 + ay1) * 0.5
    if direction == "NORTH":
        ox, oy, dx, dy = cx, ay0, 0.0, -1.0
    elif direction == "SOUTH":
        ox, oy, dx, dy = cx, ay1, 0.0, 1.0
    elif direction == "WEST":
        ox, oy, dx, dy = ax0, cy, -1.0, 0.0
    else:
        ox, oy, dx, dy = ax1, cy, 1.0, 0.0
    best = STORE_OPEN_CLEARANCE_UNBOUNDED
    found = False
    for o in others:
        if o is rack:
            continue
        if getattr(o, "id", None) is not None and getattr(rack, "id", None) is not None:
            if int(o.id) == int(rack.id):
                continue
        bx0, by0, bx1, by1 = _rack_aabb_cells(o)
        hit: Optional[float] = None
        if abs(dx) < 1e-9:
            if not (bx0 - _STORE_OVERLAP_EPS <= ox <= bx1 + _STORE_OVERLAP_EPS):
                continue
            if dy < 0 and by1 <= oy + _STORE_OVERLAP_EPS:
                hit = oy - by1
            elif dy > 0 and by0 >= oy - _STORE_OVERLAP_EPS:
                hit = by0 - oy
        else:
            if not (by0 - _STORE_OVERLAP_EPS <= oy <= by1 + _STORE_OVERLAP_EPS):
                continue
            if dx < 0 and bx1 <= ox + _STORE_OVERLAP_EPS:
                hit = ox - bx1
            elif dx > 0 and bx0 >= ox - _STORE_OVERLAP_EPS:
                hit = bx0 - ox
        if hit is None or hit < 0:
            continue
        found = True
        best = min(best, float(hit))
    if not found:
        return STORE_OPEN_CLEARANCE_UNBOUNDED
    return float(best)


def _clearance_sort_key_min(t: tuple[float, str]) -> tuple[float, int]:
    c, d = t
    return (c if math.isfinite(c) else 1e18, _CARDINAL_TIE_ORDER.get(d, 9))


def _clearance_sort_key_max(t: tuple[float, str]) -> tuple[float, int]:
    """Prefer larger clearance; remis → NORTH, SOUTH, EAST, WEST."""
    c, d = t
    return (c if math.isfinite(c) else 1e18, -_CARDINAL_TIE_ORDER.get(d, 9))


def _infer_store_face_from_open_space(rack: object, others: list) -> Optional[ServiceFace]:
    """
    Fallback when no real-overlap aisle neighbor: face the nearest open clearance
    that still looks like a service corridor (not a sealed wall).
    Unbounded open space ranks as best open (never as clearance 0).
    Deterministic remis; never invents diagonal neighbors.
    """
    scored: list[tuple[float, str]] = []
    for d in ("NORTH", "SOUTH", "EAST", "WEST"):
        c = _store_open_clearance(rack, others, d)
        if math.isinf(c) or _STORE_AISLE_GAP_MIN <= c <= _STORE_AISLE_GAP_MAX * 2.5:
            scored.append((c, d))
    if not scored:
        for d in ("NORTH", "SOUTH", "EAST", "WEST"):
            c = _store_open_clearance(rack, others, d)
            if math.isinf(c) or c >= _STORE_AISLE_GAP_MIN:
                scored.append((c, d))
    if not scored:
        return None
    aisle_like = [s for s in scored if math.isfinite(s[0]) and s[0] <= _STORE_AISLE_GAP_MAX]
    pick = (
        min(aisle_like, key=_clearance_sort_key_min)
        if aisle_like
        else max(scored, key=_clearance_sort_key_max)
    )
    orient = str(getattr(rack, "orientation", None) or "vertical")
    return face_for_cardinal(pick[1], orientation=orient)


def _infer_store_face_from_neighbors(rack: object, others: list) -> Optional[ServiceFace]:
    """
    Store uses the same FRONT/rotation SSOT as warehouse racks.

    Prefer nearest aisle gap to a neighbor with real transverse overlap.
    Fallback: open-space clearance along face midpoints.
    """
    candidates = _store_neighbor_gap_candidates(rack, others)
    if candidates:
        candidates.sort(key=_clearance_sort_key_min)
        orient = str(getattr(rack, "orientation", None) or "vertical")
        return face_for_cardinal(candidates[0][1], orientation=orient)
    return _infer_store_face_from_open_space(rack, others)


def _store_face_justified_by_neighbor_gap(rack: object, others: list, face: ServiceFace) -> bool:
    """True only when a real-overlap aisle neighbor supports `face` (not open-space)."""
    cardinal = _store_cardinal_from_face(rack, face)
    return any(d == cardinal for _gap, d in _store_neighbor_gap_candidates(rack, others))


def _store_face_justified_by_geometry(rack: object, others: list, face: ServiceFace) -> bool:
    """
    True when `face` is supported by real-overlap neighbor gaps or by open-space clearance
    along that cardinal (same rules as inference — no diagonal slack).
    Unbounded open clearance justifies that cardinal for expected-face checks.
    """
    if _store_face_justified_by_neighbor_gap(rack, others, face):
        return True
    cardinal = _store_cardinal_from_face(rack, face)
    c = _store_open_clearance(rack, others, cardinal)
    return math.isinf(c) or c >= _STORE_AISLE_GAP_MIN


def _y_separation_cells(ay0: float, ay1: float, by0: float, by1: float) -> float:
    if _has_real_axis_overlap(ay0, ay1, by0, by1):
        return 0.0
    if by0 >= ay1:
        return by0 - ay1
    return ay0 - by1


def _has_legacy_diagonal_pseudo_east_neighbor(rack: object, others: list) -> bool:
    """
    Fingerprint of the pre-provenance bug: a rack east of the store with an
    aisle-like X gap but NO real Y overlap, within old lateral_slack (~20 cells).
    """
    ax0, ay0, ax1, ay1 = _rack_aabb_cells(rack)
    for o in others:
        if o is rack:
            continue
        if getattr(o, "id", None) is not None and getattr(rack, "id", None) is not None:
            if int(o.id) == int(rack.id):
                continue
        bx0, by0, bx1, by1 = _rack_aabb_cells(o)
        if bx0 < ax1 - _STORE_OVERLAP_EPS:
            continue
        gap = bx0 - ax1
        if not (_STORE_AISLE_GAP_MIN <= gap <= _STORE_AISLE_GAP_MAX):
            continue
        if _has_real_axis_overlap(ay0, ay1, by0, by1):
            continue
        if _y_separation_cells(ay0, ay1, by0, by1) <= _LEGACY_DIAGONAL_SLACK_CELLS + _STORE_OVERLAP_EPS:
            return True
    return False


def matches_legacy_buggy_store_diagonal_east(
    rack: object,
    others: list,
    expected: ServiceFace,
    *,
    orientation: str,
) -> bool:
    """
    Narrow, evidence-based qualification of the old diagonal-slack EAST mis-inference.

    Does NOT treat all FRONT+180 as AUTO_REPAIR. Requires:
    - current world face EAST, expected ≠ EAST (mismatch)
    - expected justified by real-overlap neighbor (primary aisle evidence)
    - current EAST NOT justified by real-overlap neighbor (open space alone ≠ evidence)
    - a diagonal pseudo-EAST neighbor matching old lateral_slack footprint
    """
    if rack_matches_expected_face(rack, expected, orientation=orientation):
        return False
    current = ServiceFace(
        service_side=normalize_service_side(getattr(rack, "service_side", None)),
        rotation_degrees=normalize_rotation(getattr(rack, "rotation_degrees", 0)),
    )
    if _store_cardinal_from_face(rack, current) != "EAST":
        return False
    if _store_cardinal_from_face(rack, expected) == "EAST":
        return False
    if not _store_face_justified_by_neighbor_gap(rack, others, expected):
        return False
    if _store_face_justified_by_neighbor_gap(rack, others, current):
        return False
    return _has_legacy_diagonal_pseudo_east_neighbor(rack, others)


def should_repair_store_face(
    rack: object,
    expected: ServiceFace,
    others: list,
    *,
    orientation: str,
) -> bool:
    """
    Store mutation gate (provenance-based).

    Repair is allowed only for LEGACY_DEFAULT and AUTO_REPAIR.
    EXPLICIT represents intentional service face and must never be modified by automatic geometry inference.
    """
    if rack_matches_expected_face(rack, expected, orientation=orientation):
        return False
    origin = rack_service_face_origin(rack)
    if origin == ServiceFaceOrigin.EXPLICIT:
        return False
    if origin == ServiceFaceOrigin.AUTO_REPAIR:
        return True
    # LEGACY_DEFAULT
    if is_default_face_fingerprint(rack):
        return True
    return matches_legacy_buggy_store_diagonal_east(
        rack, others, expected, orientation=orientation
    )


def _apply_store_face(
    rack: Rack,
    face: ServiceFace,
    *,
    reason: str,
    report: FaceRepairReport,
    others: list[Rack],
) -> None:
    """Apply deterministic store face gated by service_face_origin."""
    orient = str(getattr(rack, "orientation", None) or "vertical")
    base_meta = {
        "rack_uuid": getattr(rack, "uuid", None),
        "rack_id": getattr(rack, "id", None),
        "name": getattr(rack, "name", None),
        "service_side": getattr(rack, "service_side", None),
        "rotation_degrees": int(getattr(rack, "rotation_degrees", 0) or 0),
        "service_face_origin": rack_service_face_origin(rack).value,
        "rack_type": getattr(rack, "rack_type", None),
    }
    if rack_matches_expected_face(rack, face, orientation=orient):
        report.skipped_matching.append({**base_meta, "reason": "store_matches_deterministic_expected"})
        return
    if not should_repair_store_face(rack, face, others, orientation=orient):
        report.skipped_explicit.append({**base_meta, "reason": "store_explicit_or_unqualified_preserved"})
        return
    before_origin = rack_service_face_origin(rack)
    before = (
        getattr(rack, "service_side", None),
        int(getattr(rack, "rotation_degrees", 0) or 0),
        before_origin,
    )
    fingerprint = matches_legacy_buggy_store_diagonal_east(
        rack, others, face, orientation=orient
    )
    changed = apply_face_to_rack_obj(rack, face, origin=ServiceFaceOrigin.AUTO_REPAIR)
    if fingerprint:
        detail = "store_legacy_diagonal_east_fingerprint"
    elif before_origin == ServiceFaceOrigin.AUTO_REPAIR:
        detail = "store_auto_recompute"
    else:
        detail = "store_legacy_mismatch"
    report.repaired.append(
        {
            **base_meta,
            "before": {
                "service_side": before[0],
                "rotation_degrees": before[1],
                "service_face_origin": before[2].value,
            },
            "after": {**face.as_dict(), "service_face_origin": ServiceFaceOrigin.AUTO_REPAIR.value},
            "reason": f"{reason}:{detail}",
            "changed": changed,
        }
    )


def repair_layout_service_faces(
    db,
    warehouse_id: int,
    *,
    layout: Optional[WarehouseLayout] = None,
) -> FaceRepairReport:
    """
    Mutate Rack.service_side / rotation_degrees only for proven legacy mismatches.

    Gate: deterministic expected from row_containers AND world-normal mismatch
    AND current fingerprint FRONT+0. LEGAL FRONT+0 (e.g. WEST) is preserved.
    Explicit non-default faces and racks outside deterministic geometry are untouched.
    Idempotent: second run after successful repair changes nothing.
    Does not commit; caller owns the transaction.
    """
    report = FaceRepairReport()
    if layout is None:
        layout = (
            db.query(WarehouseLayout)
            .filter(WarehouseLayout.warehouse_id == warehouse_id)
            .order_by(WarehouseLayout.id.desc())
            .first()
        )
    if layout is None:
        return report

    racks: list[Rack] = db.query(Rack).filter(Rack.layout_id == layout.id).all()
    if hasattr(Rack, "is_active"):
        racks = [r for r in racks if getattr(r, "is_active", True)]
    racks_by_uuid = {str(r.uuid): r for r in racks if getattr(r, "uuid", None)}
    racks_by_id = {int(r.id): r for r in racks if getattr(r, "id", None) is not None}

    containers = _parse_row_containers(layout)
    bands = []
    for c in containers:
        if not isinstance(c, dict):
            continue
        b = _band_from_container(c, racks_by_uuid, racks_by_id)
        if b is not None:
            bands.append(b)

    assigned: set[str] = set()  # container ids handled as pairs

    # 1) Back-to-back pairs
    for i, a in enumerate(bands):
        if a.container_id in assigned:
            continue
        for b in bands[i + 1 :]:
            if b.container_id in assigned:
                continue
            if _are_back_to_back_y(a, b):
                north, south = (a, b) if a.cy <= b.cy else (b, a)
                _apply_face(
                    _racks_for_band(north, racks_by_uuid, racks_by_id),
                    face_for_cardinal("NORTH", orientation="vertical"),
                    reason=f"back_to_back_north:{north.container_id}",
                    report=report,
                )
                _apply_face(
                    _racks_for_band(south, racks_by_uuid, racks_by_id),
                    face_for_cardinal("SOUTH", orientation="vertical"),
                    reason=f"back_to_back_south:{south.container_id}",
                    report=report,
                )
                assigned.add(north.container_id)
                assigned.add(south.container_id)
                break
            if _are_back_to_back_x(a, b):
                west, east = (a, b) if a.cx <= b.cx else (b, a)
                _apply_face(
                    _racks_for_band(west, racks_by_uuid, racks_by_id),
                    face_for_cardinal("WEST", orientation="vertical"),
                    reason=f"back_to_back_west:{west.container_id}",
                    report=report,
                )
                _apply_face(
                    _racks_for_band(east, racks_by_uuid, racks_by_id),
                    face_for_cardinal("EAST", orientation="vertical"),
                    reason=f"back_to_back_east:{east.container_id}",
                    report=report,
                )
                assigned.add(west.container_id)
                assigned.add(east.container_id)
                break

    # 2) Unpaired bands — aisle toward nearest neighbor row
    for band in bands:
        if band.container_id in assigned:
            continue
        face = _infer_unpaired_horizontal_face(band, bands) if band.is_horizontal_row else None
        if face is None:
            for rack in _racks_for_band(band, racks_by_uuid, racks_by_id):
                if is_store_rack(rack):
                    report.skipped_store.append(
                        {
                            "rack_uuid": getattr(rack, "uuid", None),
                            "rack_id": getattr(rack, "id", None),
                            "reason": "store",
                        }
                    )
                else:
                    report.unresolved.append(
                        {
                            "rack_uuid": getattr(rack, "uuid", None),
                            "rack_id": getattr(rack, "id", None),
                            "name": getattr(rack, "name", None),
                            "reason": "no_deterministic_aisle_from_row_geometry",
                        }
                    )
            continue
        _apply_face(
            _racks_for_band(band, racks_by_uuid, racks_by_id),
            face,
            reason=f"unpaired_neighbor_aisle:{band.container_id}",
            report=report,
        )
        assigned.add(band.container_id)

    # Racks not in any row_container (warehouse) + all store racks
    in_band: set[int] = set()
    for b in bands:
        for r in _racks_for_band(b, racks_by_uuid, racks_by_id):
            if getattr(r, "id", None) is not None:
                in_band.add(int(r.id))

    store_racks = [r for r in racks if is_store_rack(r)]
    for rack in store_racks:
        face = _infer_store_face_from_neighbors(rack, racks)
        if face is None:
            report.unresolved.append(
                {
                    "rack_uuid": getattr(rack, "uuid", None),
                    "rack_id": getattr(rack, "id", None),
                    "name": getattr(rack, "name", None),
                    "reason": "store_no_deterministic_aisle_from_neighbors",
                }
            )
            continue
        _apply_store_face(rack, face, reason="store_neighbor_aisle", report=report, others=racks)

    for rack in racks:
        if is_store_rack(rack):
            continue
        rid = getattr(rack, "id", None)
        if rid is not None and int(rid) in in_band:
            continue
        report.unresolved.append(
            {
                "rack_uuid": getattr(rack, "uuid", None),
                "rack_id": rid,
                "name": getattr(rack, "name", None),
                "reason": "not_in_row_container",
            }
        )

    logger.info(
        "service_face_repair warehouse_id=%s repaired=%s unresolved=%s store_skipped=%s matching=%s explicit=%s",
        warehouse_id,
        report.deterministic_count,
        len(report.unresolved),
        len(report.skipped_store),
        len(report.skipped_matching),
        len(report.skipped_explicit),
    )
    return report
