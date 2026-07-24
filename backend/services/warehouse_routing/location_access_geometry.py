"""Location Access geometry: service face, world normal, edge projection."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence

from ...models.warehouse import GRID_UNIT_CM, Rack
from .geometry import distance_m_between_cm
from .rack_service_face import (
    SERVICE_SIDE_BACK,
    SERVICE_SIDE_FRONT,
    Vec2 as _SsotVec2,
    local_front_normal as _ssot_local_front_normal,
    normalize_rotation as _ssot_normalize_rotation,
    normalize_service_side as _ssot_normalize_service_side,
    rotate_vec_ccw,
    world_service_normal as _ssot_world_service_normal,
)

DEFAULT_MAX_ACCESS_REACH_M = 8.0


@dataclass(frozen=True)
class Vec2:
    x: float
    y: float


@dataclass(frozen=True)
class RackFootprint:
    """Axis-aligned footprint in layout cm (same system as routing nodes)."""

    min_x: float
    min_y: float
    max_x: float
    max_y: float

    def contains_point(self, x: float, y: float, *, eps: float = 1e-6) -> bool:
        return (
            self.min_x - eps <= x <= self.max_x + eps
            and self.min_y - eps <= y <= self.max_y + eps
        )

    def segment_crosses_interior(
        self,
        ax: float,
        ay: float,
        bx: float,
        by: float,
        *,
        eps: float = 1e-3,
    ) -> bool:
        """True if open segment A→B crosses the interior of this AABB (not merely grazing an edge)."""
        # Liang–Barsky style: if both ends outside same half-plane, no cross.
        # Sample midpoint and a few points; also reject if midpoint is inside.
        mx, my = (ax + bx) * 0.5, (ay + by) * 0.5
        if self.contains_point(mx, my, eps=eps):
            # Endpoints on face edge are OK; interior mid means pierce.
            on_boundary_a = self._on_boundary(ax, ay, eps=eps)
            on_boundary_b = self._on_boundary(bx, by, eps=eps)
            if not (on_boundary_a or on_boundary_b) or self.contains_point(mx, my, eps=-eps):
                # Mid strictly inside
                if (
                    self.min_x + eps < mx < self.max_x - eps
                    and self.min_y + eps < my < self.max_y - eps
                ):
                    return True
        # Clip: if segment intersects any of 4 edges at an interior point of both segments
        corners = (
            (self.min_x, self.min_y, self.max_x, self.min_y),
            (self.max_x, self.min_y, self.max_x, self.max_y),
            (self.max_x, self.max_y, self.min_x, self.max_y),
            (self.min_x, self.max_y, self.min_x, self.min_y),
        )
        hits = 0
        for x1, y1, x2, y2 in corners:
            if _segments_proper_intersect(ax, ay, bx, by, x1, y1, x2, y2, eps=eps):
                hits += 1
        return hits >= 2

    def _on_boundary(self, x: float, y: float, *, eps: float) -> bool:
        on_x = abs(x - self.min_x) <= eps or abs(x - self.max_x) <= eps
        on_y = abs(y - self.min_y) <= eps or abs(y - self.max_y) <= eps
        in_x = self.min_x - eps <= x <= self.max_x + eps
        in_y = self.min_y - eps <= y <= self.max_y + eps
        return (on_x and in_y) or (on_y and in_x)


def _segments_proper_intersect(
    ax: float, ay: float, bx: float, by: float,
    cx: float, cy: float, dx: float, dy: float,
    *,
    eps: float,
) -> bool:
    def orient(px, py, qx, qy, rx, ry):
        return (qy - py) * (rx - qx) - (qx - px) * (ry - qy)

    o1 = orient(ax, ay, bx, by, cx, cy)
    o2 = orient(ax, ay, bx, by, dx, dy)
    o3 = orient(cx, cy, dx, dy, ax, ay)
    o4 = orient(cx, cy, dx, dy, bx, by)
    if o1 * o2 < -eps * eps and o3 * o4 < -eps * eps:
        return True
    return False


def rack_footprint_cm(rack: Rack) -> RackFootprint:
    """Footprint AABB from rack grid origin + physical width/length_cm."""
    base_x = float(rack.x) * GRID_UNIT_CM
    base_y = float(rack.y) * GRID_UNIT_CM
    orient = (getattr(rack, "orientation", None) or "vertical").lower()
    along = float(getattr(rack, "width_cm", None) or 80.0)
    depth = float(getattr(rack, "length_cm", None) or 100.0)
    # Prefer grid extent when present (authoritative after FE swap for 90°).
    grid_w = float(getattr(rack, "width", None) or 0) * GRID_UNIT_CM
    grid_h = float(getattr(rack, "height", None) or 0) * GRID_UNIT_CM
    if grid_w > 0 and grid_h > 0:
        return RackFootprint(base_x, base_y, base_x + grid_w, base_y + grid_h)
    if orient == "horizontal":
        return RackFootprint(base_x, base_y, base_x + along, base_y + depth)
    return RackFootprint(base_x, base_y, base_x + depth, base_y + along)


def _normalize_service_side(raw: object) -> str:
    return _ssot_normalize_service_side(raw)


def _normalize_rotation(raw: object) -> int:
    return _ssot_normalize_rotation(raw)


def local_front_normal(orientation: str) -> Vec2:
    """Unrotated local FRONT normal (matches FE getRackPickPointCell)."""
    n = _ssot_local_front_normal(orientation)
    return Vec2(n.x, n.y)


def _rotate_vec(v: Vec2, degrees: int) -> Vec2:
    n = rotate_vec_ccw(_SsotVec2(v.x, v.y), degrees)
    return Vec2(n.x, n.y)


def world_service_normal(rack: Rack) -> Vec2:
    """World-space unit normal pointing into the service aisle."""
    n = _ssot_world_service_normal(
        orientation=str(getattr(rack, "orientation", None) or "vertical"),
        rotation_degrees=getattr(rack, "rotation_degrees", 0),
        service_side=getattr(rack, "service_side", SERVICE_SIDE_FRONT),
    )
    return Vec2(n.x, n.y)


def service_edge_point_cm(rack: Rack, bin_center_x: float, bin_center_y: float) -> Vec2:
    """
    Project bin center onto the service face edge of the rack footprint.
    S lies on the face; not at ½ aisle offset.
    """
    fp = rack_footprint_cm(rack)
    n = world_service_normal(rack)
    # Face is the boundary in the direction of the normal from the footprint center.
    cx = (fp.min_x + fp.max_x) * 0.5
    cy = (fp.min_y + fp.max_y) * 0.5
    # Choose the face whose outward normal aligns with n
    if abs(n.x) >= abs(n.y):
        # Vertical face (constant x)
        face_x = fp.max_x if n.x > 0 else fp.min_x
        # Clamp y to footprint
        sy = min(max(bin_center_y, fp.min_y), fp.max_y)
        return Vec2(face_x, sy)
    face_y = fp.max_y if n.y > 0 else fp.min_y
    sx = min(max(bin_center_x, fp.min_x), fp.max_x)
    return Vec2(sx, face_y)


def point_on_segment(
    ax: float, ay: float, bx: float, by: float, t: float
) -> Vec2:
    t = max(0.0, min(1.0, float(t)))
    return Vec2(ax + (bx - ax) * t, ay + (by - ay) * t)


def project_point_to_segment(
    px: float, py: float, ax: float, ay: float, bx: float, by: float
) -> tuple[float, Vec2, float]:
    """Return (t, point, distance_m) for closest point on segment AB to P."""
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    if len2 <= 1e-12:
        t = 0.0
        pt = Vec2(ax, ay)
    else:
        t = ((px - ax) * dx + (py - ay) * dy) / len2
        t = max(0.0, min(1.0, t))
        pt = point_on_segment(ax, ay, bx, by, t)
    return t, pt, distance_m_between_cm(px, py, pt.x, pt.y)


def half_plane_ok(face_point: Vec2, normal: Vec2, candidate: Vec2, *, eps: float = 1.0) -> bool:
    """Candidate is on the aisle side of the face (dot >= -eps cm)."""
    return (candidate.x - face_point.x) * normal.x + (candidate.y - face_point.y) * normal.y >= -eps


def orthogonality_score(service: Vec2, entry: Vec2, normal: Vec2) -> float:
    """0 = perfectly aligned with normal; higher = worse. Range ~0..2."""
    dx, dy = entry.x - service.x, entry.y - service.y
    mag = math.hypot(dx, dy)
    if mag < 1e-6:
        return 0.0
    ux, uy = dx / mag, dy / mag
    # 1 - cos(theta); cos = ux*nx + uy*ny
    return 1.0 - (ux * normal.x + uy * normal.y)


@dataclass(frozen=True)
class EdgeCandidate:
    edge_uuid: str
    from_xy: tuple[float, float]
    to_xy: tuple[float, float]
    t: float
    entry: Vec2
    approach_m: float
    orthogonality: float


def select_best_edge_for_service_point(
    service: Vec2,
    normal: Vec2,
    footprint: RackFootprint,
    edges: list[tuple[str, tuple[float, float], tuple[float, float]]],
    *,
    max_reach_m: float = DEFAULT_MAX_ACCESS_REACH_M,
    obstacles: Optional[Sequence[object]] = None,
    blocked_edge_uuids: Optional[set[str]] = None,
) -> tuple[Optional[EdgeCandidate], str]:
    """
    Pick best road edge for access.

    Returns (candidate_or_None, reason) where reason is:
    OK | UNREACHABLE | BLOCKED
    - UNREACHABLE: nothing within reach on service half-plane
    - BLOCKED: in-reach candidates exist but all pierce solid obstacles (or only wrong-side beyond)

    When ``obstacles`` is provided, approach S→P uses physical_collision SSOT
    (footprint minus enabled RackPassage). Otherwise falls back to AABB interior pierce.
    Edges in ``blocked_edge_uuids`` are never AUTO candidates (invalid physical roads).
    """
    from .physical_collision import segment_is_physically_clear

    blocked_edges = blocked_edge_uuids or set()
    in_reach_wrong_or_pierce = 0
    candidates: list[EdgeCandidate] = []
    for edge_uuid, a, b in edges:
        if edge_uuid in blocked_edges:
            continue
        t, entry, approach = project_point_to_segment(service.x, service.y, a[0], a[1], b[0], b[1])
        if approach > max_reach_m:
            continue
        if not half_plane_ok(service, normal, entry):
            in_reach_wrong_or_pierce += 1
            continue
        if obstacles is not None:
            clear = segment_is_physically_clear(
                service.x,
                service.y,
                entry.x,
                entry.y,
                obstacles,  # type: ignore[arg-type]
                block_touching_seams=True,
            )
            if not clear:
                in_reach_wrong_or_pierce += 1
                continue
        elif footprint.segment_crosses_interior(service.x, service.y, entry.x, entry.y):
            in_reach_wrong_or_pierce += 1
            continue
        ortho = orthogonality_score(service, entry, normal)
        candidates.append(
            EdgeCandidate(
                edge_uuid=edge_uuid,
                from_xy=a,
                to_xy=b,
                t=t,
                entry=entry,
                approach_m=approach,
                orthogonality=ortho,
            )
        )
    if not candidates:
        if in_reach_wrong_or_pierce > 0:
            return None, "BLOCKED"
        return None, "UNREACHABLE"
    candidates.sort(key=lambda c: (c.orthogonality, c.approach_m))
    return candidates[0], "OK"
