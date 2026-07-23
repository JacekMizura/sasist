"""Geometry helpers for authored routing graph (intersection / distance)."""

from __future__ import annotations

from typing import Optional

from .constants import GRID_UNIT_CM


def distance_m_between_cm(x1: float, y1: float, x2: float, y2: float) -> float:
    """Euclidean distance in meters from coordinates stored in cm."""
    dx = float(x2) - float(x1)
    dy = float(y2) - float(y1)
    return ((dx * dx + dy * dy) ** 0.5) / 100.0


def cells_to_cm(cell: float) -> float:
    return float(cell) * GRID_UNIT_CM


def _orient(ax: float, ay: float, bx: float, by: float, cx: float, cy: float) -> float:
    return (by - ay) * (cx - bx) - (bx - ax) * (cy - by)


def _on_segment(ax: float, ay: float, bx: float, by: float, cx: float, cy: float, eps: float = 1e-6) -> bool:
    return (
        min(ax, bx) - eps <= cx <= max(ax, bx) + eps
        and min(ay, by) - eps <= cy <= max(ay, by) + eps
    )


def segment_intersection(
    a1: tuple[float, float],
    a2: tuple[float, float],
    b1: tuple[float, float],
    b2: tuple[float, float],
    *,
    eps: float = 1e-6,
) -> Optional[tuple[float, float]]:
    """
    Proper intersection of segments A and B (excluding shared endpoints).
    Returns (x, y) or None.
    """
    ax, ay = a1
    bx, by = a2
    cx, cy = b1
    dx, dy = b2

    o1 = _orient(ax, ay, bx, by, cx, cy)
    o2 = _orient(ax, ay, bx, by, dx, dy)
    o3 = _orient(cx, cy, dx, dy, ax, ay)
    o4 = _orient(cx, cy, dx, dy, bx, by)

    if abs(o1) < eps and _on_segment(ax, ay, bx, by, cx, cy):
        # Collinear touch — treat as no new junction unless mid-segment
        if not _near_endpoint(cx, cy, ax, ay, bx, by, eps):
            return (cx, cy)
        return None
    if abs(o2) < eps and _on_segment(ax, ay, bx, by, dx, dy):
        if not _near_endpoint(dx, dy, ax, ay, bx, by, eps):
            return (dx, dy)
        return None

    if o1 * o2 < 0 and o3 * o4 < 0:
        # Line intersection
        denom = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx)
        if abs(denom) < eps:
            return None
        px = ((ax * by - ay * bx) * (cx - dx) - (ax - bx) * (cx * dy - cy * dx)) / denom
        py = ((ax * by - ay * bx) * (cy - dy) - (ay - by) * (cx * dy - cy * dx)) / denom
        if _near_endpoint(px, py, ax, ay, bx, by, eps) or _near_endpoint(px, py, cx, cy, dx, dy, eps):
            return None
        return (px, py)
    return None


def _near_endpoint(
    x: float, y: float, ax: float, ay: float, bx: float, by: float, eps: float
) -> bool:
    return (abs(x - ax) <= eps and abs(y - ay) <= eps) or (abs(x - bx) <= eps and abs(y - by) <= eps)


def split_edge_at_point(
    from_xy: tuple[float, float],
    to_xy: tuple[float, float],
    point: tuple[float, float],
    *,
    eps: float = 1e-6,
) -> bool:
    """True if point lies strictly between endpoints (not at ends)."""
    if _near_endpoint(point[0], point[1], from_xy[0], from_xy[1], to_xy[0], to_xy[1], eps):
        return False
    return _on_segment(from_xy[0], from_xy[1], to_xy[0], to_xy[1], point[0], point[1], eps)


def segments_overlap_collinear(
    a1: tuple[float, float],
    a2: tuple[float, float],
    b1: tuple[float, float],
    b2: tuple[float, float],
    *,
    eps: float = 1e-3,
) -> bool:
    """
    True when segments are collinear and share a positive-length overlap
    (not merely a shared endpoint). Overlapping edges are ambiguous — reject.
    """
    ax, ay = a1
    bx, by = a2
    cx, cy = b1
    dx, dy = b2
    # Not collinear if either endpoint of B is off line A (beyond eps)
    if abs(_orient(ax, ay, bx, by, cx, cy)) > eps * max(1.0, abs(bx - ax) + abs(by - ay)):
        return False
    if abs(_orient(ax, ay, bx, by, dx, dy)) > eps * max(1.0, abs(bx - ax) + abs(by - ay)):
        return False
    # Project onto dominant axis
    if abs(bx - ax) >= abs(by - ay):
        a_lo, a_hi = sorted((ax, bx))
        b_lo, b_hi = sorted((cx, dx))
    else:
        a_lo, a_hi = sorted((ay, by))
        b_lo, b_hi = sorted((cy, dy))
    overlap = min(a_hi, b_hi) - max(a_lo, b_lo)
    if overlap <= eps:
        return False
    # Shared-only-endpoint: overlap ≈ 0 already filtered; if they share only endpoint,
    # overlap is 0. Positive overlap = ambiguous collinear stack.
    return True
