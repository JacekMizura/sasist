"""
Physical collision SSOT for Routing Graph + Location Access.

Obstacle = Rack footprint AABB MINUS enabled RackPassage openings.
Backend is the authority; FE may preview the same rules.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Optional, Sequence

from ...models.warehouse import GRID_UNIT_CM, Rack

# Explicit tolerance: boundary graze is PASS; interior entry is BLOCK.
COLLISION_EPS_CM = 2.0

CLEARANCE_KNOWN = "KNOWN"
CLEARANCE_DERIVED = "DERIVED"
CLEARANCE_UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class Aabb:
    min_x: float
    min_y: float
    max_x: float
    max_y: float

    def width(self) -> float:
        return max(0.0, self.max_x - self.min_x)

    def height(self) -> float:
        return max(0.0, self.max_y - self.min_y)

    def inflate(self, eps: float) -> "Aabb":
        return Aabb(self.min_x - eps, self.min_y - eps, self.max_x + eps, self.max_y + eps)

    def shrink(self, eps: float) -> "Aabb":
        return Aabb(self.min_x + eps, self.min_y + eps, self.max_x - eps, self.max_y - eps)

    def contains_strict(self, x: float, y: float, *, eps: float = COLLISION_EPS_CM) -> bool:
        """True if point is in the open interior (not on boundary band)."""
        return (
            self.min_x + eps < x < self.max_x - eps
            and self.min_y + eps < y < self.max_y - eps
        )

    def contains_inclusive(self, x: float, y: float, *, eps: float = 0.0) -> bool:
        return (
            self.min_x - eps <= x <= self.max_x + eps
            and self.min_y - eps <= y <= self.max_y + eps
        )

    def overlaps(self, other: "Aabb") -> bool:
        return not (
            self.max_x <= other.min_x
            or other.max_x <= self.min_x
            or self.max_y <= other.min_y
            or other.max_y <= self.min_y
        )


@dataclass(frozen=True)
class PassageOpening:
    """World-space hole punched through a rack footprint (full depth)."""

    uuid: str
    rack_id: int
    rect: Aabb
    enabled: bool
    clearance_height_cm: Optional[float]
    clearance_status: str  # KNOWN | DERIVED | UNKNOWN


@dataclass(frozen=True)
class RackObstacle:
    rack_id: int
    rack_uuid: Optional[str]
    footprint: Aabb
    openings: tuple[PassageOpening, ...]

    def solid_contains_point(self, x: float, y: float, *, eps: float = COLLISION_EPS_CM) -> bool:
        if not self.footprint.contains_strict(x, y, eps=eps):
            return False
        for op in self.openings:
            if not op.enabled:
                continue
            # Passage hole: inclusive with small shrink so edge of hole still free
            if op.rect.contains_inclusive(x, y, eps=eps * 0.25):
                return False
        return True


@dataclass(frozen=True)
class CollisionHit:
    rack_id: int
    rack_uuid: Optional[str]
    reason: str  # THROUGH_RACK | PARTIAL_PASSAGE


@dataclass(frozen=True)
class SegmentCollisionResult:
    blocked: bool
    hits: tuple[CollisionHit, ...]


def rack_footprint_aabb(rack: Rack) -> Aabb:
    base_x = float(rack.x) * GRID_UNIT_CM
    base_y = float(rack.y) * GRID_UNIT_CM
    grid_w = float(getattr(rack, "width", None) or 0) * GRID_UNIT_CM
    grid_h = float(getattr(rack, "height", None) or 0) * GRID_UNIT_CM
    if grid_w > 0 and grid_h > 0:
        return Aabb(base_x, base_y, base_x + grid_w, base_y + grid_h)
    orient = (getattr(rack, "orientation", None) or "vertical").lower()
    along = float(getattr(rack, "width_cm", None) or 80.0)
    depth = float(getattr(rack, "length_cm", None) or 100.0)
    if orient == "horizontal":
        return Aabb(base_x, base_y, base_x + along, base_y + depth)
    return Aabb(base_x, base_y, base_x + depth, base_y + along)


def _along_is_x(rack: Rack) -> bool:
    return (getattr(rack, "orientation", None) or "vertical").lower() == "horizontal"


def passage_world_rect(
    rack: Rack,
    *,
    offset_along_cm: float,
    width_cm: float,
) -> Aabb:
    """
    Passage spans full depth of the rack; offset/width are along the segment axis.
    Local to rack: move/rotate of rack moves the opening automatically via footprint.
    """
    fp = rack_footprint_aabb(rack)
    off = max(0.0, float(offset_along_cm))
    w = max(1.0, float(width_cm))
    if _along_is_x(rack):
        along_max = fp.width()
        a0 = fp.min_x + min(off, along_max)
        a1 = fp.min_x + min(off + w, along_max)
        if a1 <= a0:
            a1 = min(fp.max_x, a0 + 1.0)
        return Aabb(a0, fp.min_y, a1, fp.max_y)
    along_max = fp.height()
    a0 = fp.min_y + min(off, along_max)
    a1 = fp.min_y + min(off + w, along_max)
    if a1 <= a0:
        a1 = min(fp.max_y, a0 + 1.0)
    return Aabb(fp.min_x, a0, fp.max_x, a1)


def derive_clearance_height_cm(rack: Rack) -> tuple[Optional[float], str]:
    """
    Try to derive clearance from internal_structure level heights.
    Credible = at least one level height present; clearance = height of first level bay
    (floor to first shelf underside ≈ levels[0].height_cm when levels start from floor).
    """
    raw = getattr(rack, "internal_structure", None)
    data = None
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            data = None
    elif isinstance(raw, dict):
        data = raw
    levels = (data or {}).get("levels") if isinstance(data, dict) else None
    if not isinstance(levels, list) or not levels:
        return None, CLEARANCE_UNKNOWN
    h0 = levels[0].get("height_cm") if isinstance(levels[0], dict) else None
    try:
        h = float(h0)
    except (TypeError, ValueError):
        return None, CLEARANCE_UNKNOWN
    if h <= 0:
        return None, CLEARANCE_UNKNOWN
    return h, CLEARANCE_DERIVED


def resolve_clearance(
    rack: Rack, clearance_height_cm: Optional[float]
) -> tuple[Optional[float], str]:
    if clearance_height_cm is not None:
        try:
            v = float(clearance_height_cm)
        except (TypeError, ValueError):
            return None, CLEARANCE_UNKNOWN
        if v > 0:
            return v, CLEARANCE_KNOWN
        return None, CLEARANCE_UNKNOWN
    return derive_clearance_height_cm(rack)


def build_rack_obstacle(
    rack: Rack,
    passages: Sequence[object],
) -> RackObstacle:
    """
    passages: ORM rows or dicts with uuid, offset_along_cm, width_cm,
    clearance_height_cm, enabled, and optional id.
    """
    openings: list[PassageOpening] = []
    for p in passages:
        enabled = bool(getattr(p, "enabled", True) if not isinstance(p, dict) else p.get("enabled", True))
        uuid = str(
            getattr(p, "uuid", None) if not isinstance(p, dict) else p.get("uuid") or ""
        )
        off = float(
            getattr(p, "offset_along_cm", 0) if not isinstance(p, dict) else p.get("offset_along_cm") or 0
        )
        width = float(
            getattr(p, "width_cm", 0) if not isinstance(p, dict) else p.get("width_cm") or 0
        )
        clr_raw = (
            getattr(p, "clearance_height_cm", None)
            if not isinstance(p, dict)
            else p.get("clearance_height_cm")
        )
        clr, status = resolve_clearance(rack, clr_raw)
        rect = passage_world_rect(rack, offset_along_cm=off, width_cm=width)
        openings.append(
            PassageOpening(
                uuid=uuid,
                rack_id=int(rack.id),
                rect=rect,
                enabled=enabled,
                clearance_height_cm=clr,
                clearance_status=status,
            )
        )
    return RackObstacle(
        rack_id=int(rack.id),
        rack_uuid=getattr(rack, "uuid", None),
        footprint=rack_footprint_aabb(rack),
        openings=tuple(openings),
    )


def _sample_params(n: int = 48) -> list[float]:
    # Dense enough for corner clips; include endpoints and mid
    if n < 3:
        n = 3
    return [i / (n - 1) for i in range(n)]


def segment_collides_obstacles(
    ax: float,
    ay: float,
    bx: float,
    by: float,
    obstacles: Sequence[RackObstacle],
    *,
    eps: float = COLLISION_EPS_CM,
    exclude_rack_ids: Optional[set[int]] = None,
) -> SegmentCollisionResult:
    """
    True if open segment enters solid rack interior (footprint minus enabled passages).
    Boundary graze (within eps of footprint edge) is PASS.
    """
    hits: list[CollisionHit] = []
    exclude = exclude_rack_ids or set()
    params = _sample_params(64)
    for obs in obstacles:
        if obs.rack_id in exclude:
            continue
        solid_hit = False
        for t in params:
            x = ax + (bx - ax) * t
            y = ay + (by - ay) * t
            if obs.solid_contains_point(x, y, eps=eps):
                solid_hit = True
                break
        if not solid_hit:
            # Also: segment may clip corner with few samples — check mid of clipped interior
            if _segment_clips_solid_corner(ax, ay, bx, by, obs, eps=eps):
                solid_hit = True
        if solid_hit:
            # Distinguish partial passage: any sample in an enabled opening
            through_opening = False
            for t in params:
                x = ax + (bx - ax) * t
                y = ay + (by - ay) * t
                if not obs.footprint.contains_strict(x, y, eps=eps):
                    continue
                for op in obs.openings:
                    if op.enabled and op.rect.contains_inclusive(x, y, eps=eps * 0.25):
                        through_opening = True
                        break
                if through_opening:
                    break
            reason = "PARTIAL_PASSAGE" if through_opening else "THROUGH_RACK"
            hits.append(
                CollisionHit(rack_id=obs.rack_id, rack_uuid=obs.rack_uuid, reason=reason)
            )
    return SegmentCollisionResult(blocked=len(hits) > 0, hits=tuple(hits))


def _segment_clips_solid_corner(
    ax: float, ay: float, bx: float, by: float, obs: RackObstacle, *, eps: float
) -> bool:
    """Extra check near footprint corners (diagonal clip)."""
    fp = obs.footprint
    corners = (
        (fp.min_x + eps * 2, fp.min_y + eps * 2),
        (fp.max_x - eps * 2, fp.min_y + eps * 2),
        (fp.max_x - eps * 2, fp.max_y - eps * 2),
        (fp.min_x + eps * 2, fp.max_y - eps * 2),
    )
    # Distance from corner to segment; if very close and corner is solid → block
    for cx, cy in corners:
        if not obs.solid_contains_point(cx, cy, eps=eps * 0.5):
            continue
        dist = _point_segment_distance(cx, cy, ax, ay, bx, by)
        if dist < eps:
            return True
    return False


def _point_segment_distance(
    px: float, py: float, ax: float, ay: float, bx: float, by: float
) -> float:
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    if len2 <= 1e-12:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
    qx, qy = ax + t * dx, ay + t * dy
    return math.hypot(px - qx, py - qy)


def segment_is_physically_clear(
    ax: float,
    ay: float,
    bx: float,
    by: float,
    obstacles: Sequence[RackObstacle],
    *,
    eps: float = COLLISION_EPS_CM,
    exclude_rack_ids: Optional[set[int]] = None,
) -> bool:
    return not segment_collides_obstacles(
        ax, ay, bx, by, obstacles, eps=eps, exclude_rack_ids=exclude_rack_ids
    ).blocked


def load_warehouse_rack_obstacles(db, warehouse_id: int) -> list[RackObstacle]:
    """
    Build collision obstacles for all active racks in the warehouse layout(s).
    Passages are local to each rack (move/rotate follows footprint).
    """
    from ...models.warehouse import WarehouseLayout, WarehouseRackPassage

    layout_ids = [
        row.id
        for row in db.query(WarehouseLayout.id)
        .filter(WarehouseLayout.warehouse_id == int(warehouse_id))
        .all()
    ]
    if not layout_ids:
        return []

    racks = (
        db.query(Rack)
        .filter(Rack.layout_id.in_(layout_ids), Rack.is_active.is_(True))
        .all()
    )
    passages_by_rack: dict[int, list] = {}
    try:
        rows = (
            db.query(WarehouseRackPassage)
            .filter(WarehouseRackPassage.warehouse_id == int(warehouse_id))
            .all()
        )
        for p in rows:
            passages_by_rack.setdefault(int(p.rack_id), []).append(p)
    except Exception:
        # Table not migrated yet — treat as no passages.
        passages_by_rack = {}

    out: list[RackObstacle] = []
    for rack in racks:
        passages = passages_by_rack.get(int(rack.id), [])
        out.append(build_rack_obstacle(rack, passages))
    return out


def edge_uuids_blocked_by_obstacles(
    edges: Sequence[object],
    nodes_by_uuid: dict[str, object],
    obstacles: Sequence[RackObstacle],
    *,
    eps: float = COLLISION_EPS_CM,
) -> list[str]:
    """Return enabled edge UUIDs whose geometry enters solid rack interior."""
    blocked: list[str] = []
    for e in edges:
        if not bool(getattr(e, "enabled", True)):
            continue
        a = nodes_by_uuid.get(getattr(e, "from_node_uuid", None))
        b = nodes_by_uuid.get(getattr(e, "to_node_uuid", None))
        if a is None or b is None:
            continue
        ax, ay = float(a.x), float(a.y)
        bx, by = float(b.x), float(b.y)
        if segment_collides_obstacles(ax, ay, bx, by, obstacles, eps=eps).blocked:
            blocked.append(str(e.uuid))
    return blocked
