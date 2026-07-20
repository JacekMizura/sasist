"""Shared shelf / rack weight budgets for location capacity (fit_engine companion).

Uses Location soft structure: warehouse_id + rack_name + level.
Optional limits from ``warehouse_structural_weight_limits`` and/or layout Rack.max_weight_kg
+ Rack.internal_structure JSON levels[].max_weight_kg.

NULL limit = unbounded (does not block).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.warehouse import Rack, WarehouseLayout
from ...models.warehouse_structural_weight_limit import WarehouseStructuralWeightLimit


@dataclass(frozen=True)
class StructuralWeightBudget:
    location_remaining_kg: Optional[float]
    shelf_remaining_kg: Optional[float]
    rack_remaining_kg: Optional[float]
    effective_remaining_kg: Optional[float]
    location_occupied_kg: float = 0.0
    shelf_occupied_kg: float = 0.0
    rack_occupied_kg: float = 0.0
    shelf_max_kg: Optional[float] = None
    rack_max_kg: Optional[float] = None
    limiting_layer: Optional[str] = None  # location | shelf | rack | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "location_remaining_kg": self.location_remaining_kg,
            "shelf_remaining_kg": self.shelf_remaining_kg,
            "rack_remaining_kg": self.rack_remaining_kg,
            "effective_remaining_kg": self.effective_remaining_kg,
            "location_occupied_kg": self.location_occupied_kg,
            "shelf_occupied_kg": self.shelf_occupied_kg,
            "rack_occupied_kg": self.rack_occupied_kg,
            "shelf_max_kg": self.shelf_max_kg,
            "rack_max_kg": self.rack_max_kg,
            "limiting_layer": self.limiting_layer,
        }


def _remaining(max_kg: Optional[float], occupied: float) -> Optional[float]:
    if max_kg is None or float(max_kg) <= 0:
        return None
    return max(0.0, float(max_kg) - float(occupied or 0))


def _min_remaining(
    loc_rem: Optional[float],
    shelf_rem: Optional[float],
    rack_rem: Optional[float],
) -> tuple[Optional[float], Optional[str]]:
    present = [(n, v) for n, v in (("location", loc_rem), ("shelf", shelf_rem), ("rack", rack_rem)) if v is not None]
    if not present:
        return None, None
    best_n, best_v = min(present, key=lambda t: t[1])
    return best_v, best_n


def _parse_rack_structure_limits(rack: Rack) -> tuple[Optional[float], dict[int, float]]:
    rack_max = float(mw) if (mw := getattr(rack, "max_weight_kg", None)) is not None and float(mw) > 0 else None
    level_map: dict[int, float] = {}
    raw = getattr(rack, "internal_structure", None)
    if not raw:
        return rack_max, level_map
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError, json.JSONDecodeError):
        return rack_max, level_map
    if not isinstance(data, dict):
        return rack_max, level_map
    if rack_max is None:
        rm = data.get("max_weight_kg")
        if rm is not None:
            try:
                rf = float(rm)
                if rf > 0:
                    rack_max = rf
            except (TypeError, ValueError):
                pass
    levels = data.get("levels")
    if isinstance(levels, list):
        for i, lev in enumerate(levels):
            if not isinstance(lev, dict):
                continue
            idx = lev.get("level_index", lev.get("level", i + 1))
            try:
                li = int(idx)
            except (TypeError, ValueError):
                continue
            mw = lev.get("max_weight_kg")
            if mw is None:
                continue
            try:
                wf = float(mw)
            except (TypeError, ValueError):
                continue
            if wf > 0:
                level_map[li] = wf
    return rack_max, level_map


def _limit_from_table(
    db: Session,
    *,
    warehouse_id: int,
    rack_name: str,
    level: Optional[int],
) -> tuple[Optional[float], Optional[float]]:
    rows = (
        db.query(WarehouseStructuralWeightLimit)
        .filter(
            WarehouseStructuralWeightLimit.warehouse_id == int(warehouse_id),
            WarehouseStructuralWeightLimit.rack_name == str(rack_name),
        )
        .all()
    )
    shelf_max = None
    rack_max = None
    for r in rows:
        if r.level is None:
            if r.max_weight_kg is not None and float(r.max_weight_kg) > 0:
                rack_max = float(r.max_weight_kg)
        elif level is not None and int(r.level) == int(level):
            if r.max_weight_kg is not None and float(r.max_weight_kg) > 0:
                shelf_max = float(r.max_weight_kg)
    return shelf_max, rack_max


def _limit_from_layout_rack(
    db: Session,
    *,
    warehouse_id: int,
    rack_name: str,
    level: Optional[int],
) -> tuple[Optional[float], Optional[float]]:
    layout_ids = [
        int(x[0])
        for x in db.query(WarehouseLayout.id).filter(WarehouseLayout.warehouse_id == int(warehouse_id)).all()
    ]
    if not layout_ids:
        return None, None
    racks = db.query(Rack).filter(Rack.layout_id.in_(layout_ids), Rack.name == str(rack_name)).all()
    if not racks:
        return None, None
    shelf_max = None
    rack_max = None
    for rack in racks:
        rm, level_map = _parse_rack_structure_limits(rack)
        if rm is not None:
            rack_max = rm if rack_max is None else min(rack_max, rm)
        if level is not None and int(level) in level_map:
            sm = level_map[int(level)]
            shelf_max = sm if shelf_max is None else min(shelf_max, sm)
    return shelf_max, rack_max


def resolve_structural_weight_budget(db: Session, location: Location) -> StructuralWeightBudget:
    loc_occ = float(getattr(location, "occupied_weight_kg", 0) or 0)
    loc_max = getattr(location, "max_weight_kg", None)
    loc_rem = _remaining(float(loc_max) if loc_max is not None else None, loc_occ)

    wh_id = int(location.warehouse_id)
    rack_name = (getattr(location, "rack_name", None) or "").strip()
    level_raw = getattr(location, "level", None)
    level = int(level_raw) if level_raw is not None else None

    shelf_max: Optional[float] = None
    rack_max: Optional[float] = None
    shelf_occ = loc_occ
    rack_occ = loc_occ

    if rack_name:
        t_shelf, t_rack = _limit_from_table(db, warehouse_id=wh_id, rack_name=rack_name, level=level)
        l_shelf, l_rack = _limit_from_layout_rack(db, warehouse_id=wh_id, rack_name=rack_name, level=level)
        shelf_max = t_shelf if t_shelf is not None else l_shelf
        rack_max = t_rack if t_rack is not None else l_rack

        rack_occ = float(
            db.query(func.coalesce(func.sum(Location.occupied_weight_kg), 0.0))
            .filter(Location.warehouse_id == wh_id, Location.rack_name == rack_name)
            .scalar()
            or 0
        )
        if level is not None:
            shelf_occ = float(
                db.query(func.coalesce(func.sum(Location.occupied_weight_kg), 0.0))
                .filter(
                    Location.warehouse_id == wh_id,
                    Location.rack_name == rack_name,
                    Location.level == int(level),
                )
                .scalar()
                or 0
            )
        else:
            shelf_occ = rack_occ

    shelf_rem = _remaining(shelf_max, shelf_occ)
    rack_rem = _remaining(rack_max, rack_occ)
    effective, layer = _min_remaining(loc_rem, shelf_rem, rack_rem)

    return StructuralWeightBudget(
        location_remaining_kg=loc_rem,
        shelf_remaining_kg=shelf_rem,
        rack_remaining_kg=rack_rem,
        effective_remaining_kg=effective,
        location_occupied_kg=loc_occ,
        shelf_occupied_kg=float(shelf_occ),
        rack_occupied_kg=float(rack_occ),
        shelf_max_kg=shelf_max,
        rack_max_kg=rack_max,
        limiting_layer=layer,
    )


def apply_weight_budget_to_additional(
    *,
    additional: float,
    unit_weight_kg: float,
    budget: StructuralWeightBudget,
    limiting_factor: Optional[str],
) -> tuple[float, Optional[str], list[str]]:
    """Trim additional qty by effective shared weight remaining."""
    warnings: list[str] = []
    out = float(additional)
    lim = limiting_factor
    eff = budget.effective_remaining_kg
    uw = float(unit_weight_kg or 0)
    if eff is not None and uw > 1e-9:
        by_w = float(int(eff / uw + 1e-9))
        if by_w + 1e-9 < out:
            out = max(0.0, by_w)
            layer = budget.limiting_layer or "weight"
            lim = f"{layer}_weight"
            warnings.append(f"WEIGHT_LIMIT_{layer.upper()}")
    elif eff is not None and eff <= 1e-9 and uw > 1e-9:
        out = 0.0
        lim = f"{budget.limiting_layer or 'weight'}_weight"
        warnings.append("WEIGHT_LIMIT_EFFECTIVE_ZERO")
    return out, lim, warnings
