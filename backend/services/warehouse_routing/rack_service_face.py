"""
Rack service-face SSOT.

Contract:
  service_side ∈ {FRONT, BACK}     — local face relative to unrotated FRONT
  rotation_degrees ∈ {0, 90, 180, 270}  — CCW world rotation of local axes
  orientation ∈ {vertical, horizontal}
  world_normal = rotate(local_front_normal(orientation), rotation) ; then negate if BACK

Do not infer face from Routing Graph edges. Face is a layout property.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Optional

SERVICE_SIDE_FRONT = "FRONT"
SERVICE_SIDE_BACK = "BACK"
SUPPORTED_ROTATIONS = (0, 90, 180, 270)


@dataclass(frozen=True)
class Vec2:
    x: float
    y: float


@dataclass(frozen=True)
class ServiceFace:
    service_side: str
    rotation_degrees: int

    def as_dict(self) -> dict:
        return {
            "service_side": self.service_side,
            "serviceSide": self.service_side,
            "rotation_degrees": self.rotation_degrees,
            "rotationDegrees": self.rotation_degrees,
        }


def normalize_service_side(raw: object) -> str:
    s = str(raw or SERVICE_SIDE_FRONT).strip().upper()
    return SERVICE_SIDE_BACK if s == SERVICE_SIDE_BACK else SERVICE_SIDE_FRONT


def normalize_rotation(raw: object) -> int:
    try:
        r = int(raw if raw is not None else 0) % 360
    except (TypeError, ValueError):
        return 0
    if r < 0:
        r += 360
    # Snap to supported cardinals
    if r in SUPPORTED_ROTATIONS:
        return r
    # Nearest supported
    return min(SUPPORTED_ROTATIONS, key=lambda s: min(abs(s - r), 360 - abs(s - r)))


def local_front_normal(orientation: str) -> Vec2:
    """Unrotated local FRONT normal (vertical → −X, horizontal → +Y)."""
    o = (orientation or "vertical").lower()
    if o == "horizontal":
        return Vec2(0.0, 1.0)
    return Vec2(-1.0, 0.0)


def rotate_vec_ccw(v: Vec2, degrees: int) -> Vec2:
    d = normalize_rotation(degrees)
    if d == 0:
        return v
    if d == 90:
        return Vec2(-v.y, v.x)
    if d == 180:
        return Vec2(-v.x, -v.y)
    if d == 270:
        return Vec2(v.y, -v.x)
    return v


def world_service_normal(
    *,
    orientation: str,
    rotation_degrees: object = 0,
    service_side: object = SERVICE_SIDE_FRONT,
) -> Vec2:
    n = rotate_vec_ccw(local_front_normal(orientation), normalize_rotation(rotation_degrees))
    if normalize_service_side(service_side) == SERVICE_SIDE_BACK:
        n = Vec2(-n.x, -n.y)
    mag = math.hypot(n.x, n.y) or 1.0
    return Vec2(n.x / mag, n.y / mag)


def _approx_eq(a: Vec2, b: Vec2, *, eps: float = 1e-6) -> bool:
    return abs(a.x - b.x) <= eps and abs(a.y - b.y) <= eps


def encode_face_for_world_normal(
    nx: float,
    ny: float,
    *,
    orientation: str = "vertical",
) -> ServiceFace:
    """
    Encode a desired world aisle normal into (service_side, rotation_degrees).
    Prefers FRONT over BACK; lowest rotation among ties.
    """
    mag = math.hypot(nx, ny) or 1.0
    target = Vec2(nx / mag, ny / mag)
    for side in (SERVICE_SIDE_FRONT, SERVICE_SIDE_BACK):
        for rot in SUPPORTED_ROTATIONS:
            got = world_service_normal(
                orientation=orientation,
                rotation_degrees=rot,
                service_side=side,
            )
            if _approx_eq(got, target):
                return ServiceFace(service_side=side, rotation_degrees=rot)
    raise ValueError(f"Cannot encode normal ({nx}, {ny}) for orientation={orientation!r}")


# Cardinal aisle normals (layout Y grows downward on canvas).
NORMAL_NORTH = Vec2(0.0, -1.0)  # toward smaller Y
NORMAL_SOUTH = Vec2(0.0, 1.0)   # toward larger Y
NORMAL_WEST = Vec2(-1.0, 0.0)
NORMAL_EAST = Vec2(1.0, 0.0)


def face_for_cardinal(
    direction: str,
    *,
    orientation: str = "vertical",
) -> ServiceFace:
    d = str(direction or "").strip().upper()
    mapping = {
        "N": NORMAL_NORTH,
        "NORTH": NORMAL_NORTH,
        "S": NORMAL_SOUTH,
        "SOUTH": NORMAL_SOUTH,
        "W": NORMAL_WEST,
        "WEST": NORMAL_WEST,
        "E": NORMAL_EAST,
        "EAST": NORMAL_EAST,
    }
    if d not in mapping:
        raise ValueError(f"Unknown cardinal {direction!r}")
    n = mapping[d]
    return encode_face_for_world_normal(n.x, n.y, orientation=orientation)


def opposite_face(face: ServiceFace, *, orientation: str = "vertical") -> ServiceFace:
    n = world_service_normal(
        orientation=orientation,
        rotation_degrees=face.rotation_degrees,
        service_side=face.service_side,
    )
    return encode_face_for_world_normal(-n.x, -n.y, orientation=orientation)


def normals_are_opposite(a: Vec2, b: Vec2, *, eps: float = 1e-6) -> bool:
    return abs(a.x + b.x) <= eps and abs(a.y + b.y) <= eps


def apply_face_to_rack_obj(rack: object, face: ServiceFace) -> bool:
    """Set ORM/plain rack service fields. Returns True if changed."""
    changed = False
    side = face.service_side
    rot = face.rotation_degrees
    if getattr(rack, "service_side", None) != side:
        setattr(rack, "service_side", side)
        changed = True
    if int(getattr(rack, "rotation_degrees", 0) or 0) != rot:
        setattr(rack, "rotation_degrees", rot)
        changed = True
    return changed


def is_store_rack(rack: object) -> bool:
    rt = str(getattr(rack, "rack_type", None) or "").strip().lower()
    return rt in ("store", "sklep", "shop")
