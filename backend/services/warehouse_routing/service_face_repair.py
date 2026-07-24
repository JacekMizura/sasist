"""
Deterministic service-face repair from layout row geometry (not Routing Graph).

Rules:
- Back-to-back row_containers (overlap along row axis, adjacent on depth axis):
  outer faces point away from the shared back plane.
- Unpaired horizontal rows: face the clearer neighboring aisle gap (layout space),
  never nearest routing edge.
- Store racks are skipped (product follow-up).
- Racks that cannot be decided → reported UNRESOLVED (unchanged).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from ...models.warehouse import Rack, WarehouseLayout
from .rack_service_face import (
    ServiceFace,
    apply_face_to_rack_obj,
    face_for_cardinal,
    is_store_rack,
    world_service_normal,
)

logger = logging.getLogger(__name__)

# Max gap (grid cells) between row bands to treat as back-to-back (touching / near-touching).
BACK_TO_BACK_MAX_GAP_CELLS = 1.0
# Overlap ratio along shared axis to consider two rows "paired".
PAIR_OVERLAP_RATIO = 0.5


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

    @property
    def deterministic_count(self) -> int:
        return sum(1 for r in self.repaired if r.get("changed"))


def is_legacy_default_face(rack: object) -> bool:
    """Legacy generator bug: FRONT + rotation 0. Any other explicit face is preserved."""
    from .rack_service_face import normalize_rotation, normalize_service_side

    side = normalize_service_side(getattr(rack, "service_side", None))
    rot = normalize_rotation(getattr(rack, "rotation_degrees", 0))
    return side == "FRONT" and rot == 0


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
        if not is_legacy_default_face(rack):
            report.skipped_explicit.append(
                {
                    "rack_uuid": getattr(rack, "uuid", None),
                    "rack_id": getattr(rack, "id", None),
                    "name": getattr(rack, "name", None),
                    "service_side": getattr(rack, "service_side", None),
                    "rotation_degrees": int(getattr(rack, "rotation_degrees", 0) or 0),
                    "reason": "explicit_ssot_preserved",
                }
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
        before = (
            getattr(rack, "service_side", None),
            int(getattr(rack, "rotation_degrees", 0) or 0),
        )
        changed = apply_face_to_rack_obj(rack, target_face)
        report.repaired.append(
            {
                "rack_uuid": getattr(rack, "uuid", None),
                "rack_id": getattr(rack, "id", None),
                "name": getattr(rack, "name", None),
                "before": {"service_side": before[0], "rotation_degrees": before[1]},
                "after": target_face.as_dict(),
                "reason": reason,
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


def repair_layout_service_faces(
    db,
    warehouse_id: int,
    *,
    layout: Optional[WarehouseLayout] = None,
) -> FaceRepairReport:
    """
    Mutate Rack.service_side / rotation_degrees ONLY for legacy defaults (FRONT+0).

    New racks must receive correct SSOT at creation (FE generator).
    Explicit non-legacy faces are never overwritten by row geometry heuristics.
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

    # Racks not in any row_container
    in_band: set[int] = set()
    for b in bands:
        for r in _racks_for_band(b, racks_by_uuid, racks_by_id):
            if getattr(r, "id", None) is not None:
                in_band.add(int(r.id))
    for rack in racks:
        rid = getattr(rack, "id", None)
        if rid is not None and int(rid) in in_band:
            continue
        if is_store_rack(rack):
            report.skipped_store.append(
                {"rack_uuid": getattr(rack, "uuid", None), "rack_id": rid, "reason": "store"}
            )
        else:
            report.unresolved.append(
                {
                    "rack_uuid": getattr(rack, "uuid", None),
                    "rack_id": rid,
                    "name": getattr(rack, "name", None),
                    "reason": "not_in_row_container",
                }
            )

    logger.info(
        "service_face_repair warehouse_id=%s repaired=%s unresolved=%s store_skipped=%s",
        warehouse_id,
        report.deterministic_count,
        len(report.unresolved),
        len(report.skipped_store),
    )
    return report
