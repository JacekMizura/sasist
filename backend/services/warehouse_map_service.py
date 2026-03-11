import json
import logging
from typing import Any, Dict, List

from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException

from ..models.warehouse_map import (
    WarehouseMap,
    MapElement,
    StorageBin,
    ELEMENT_TYPE_RACK,
    ELEMENT_TYPE_AISLE,
    ELEMENT_TYPE_WORKSTATION,
    ELEMENT_TYPE_ZONE,
    RACK_TYPE_PICKING,
)
from ..models.location import Location

logger = logging.getLogger(__name__)


def _parse_props(props: str | None) -> Dict[str, Any]:
    if not props:
        return {}
    try:
        return json.loads(props)
    except Exception:
        return {}


def _dump_props(props: Dict[str, Any] | None) -> str | None:
    if not props:
        return None
    return json.dumps(props)


def _address(aisle_letter: str, rack_num: int, level: int, bin_idx: int) -> str:
    return f"{aisle_letter}-{rack_num:02d}-{level:02d}-{bin_idx:02d}"


def _location_name(aisle_letter: str, rack_index: int, level_index: int, bin_index: int) -> str:
    """Same pattern as warehouse layout generator: A1-1-1, A1-1-2, etc."""
    return f"{aisle_letter}{rack_index}-{level_index + 1}-{bin_index + 1}"


class WarehouseMapService:
    def __init__(self, db: Session):
        self.db = db

    def get_or_create_map(self, tenant_id: int, warehouse_id: int) -> dict:
        m = (
            self.db.query(WarehouseMap)
            .filter(
                WarehouseMap.tenant_id == tenant_id,
                WarehouseMap.warehouse_id == warehouse_id,
            )
            .first()
        )
        if m:
            return self._map_to_read(m)
        m = WarehouseMap(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            name="Layout 1",
            grid_cols=24,
            grid_rows=16,
        )
        self.db.add(m)
        self.db.commit()
        self.db.refresh(m)
        return self._map_to_read(m)

    def get_map(self, map_id: int) -> dict:
        m = (
            self.db.query(WarehouseMap)
            .options(joinedload(WarehouseMap.elements).joinedload(MapElement.bins))
            .filter(WarehouseMap.id == map_id)
            .first()
        )
        if not m:
            raise HTTPException(status_code=404, detail="Mapa nie istnieje")
        return self._map_to_read(m)

    def _map_to_read(self, m: WarehouseMap) -> dict:
        elements = []
        for el in m.elements or []:
            elements.append({
                "id": el.id,
                "map_id": el.map_id,
                "type": el.type,
                "x": el.x,
                "y": el.y,
                "width": el.width,
                "height": el.height,
                "props": _parse_props(el.props),
                "bins": [
                    {
                        "id": b.id,
                        "element_id": b.element_id,
                        "level_index": b.level_index,
                        "bin_index": b.bin_index,
                        "address": b.address,
                        "max_volume_dm3": b.max_volume_dm3,
                        "current_volume_dm3": b.current_volume_dm3,
                        "pos_x": b.pos_x,
                        "pos_y": b.pos_y,
                    }
                    for b in (el.bins or [])
                ],
            })
        return {
            "id": m.id,
            "tenant_id": m.tenant_id,
            "warehouse_id": m.warehouse_id,
            "name": m.name,
            "grid_cols": m.grid_cols,
            "grid_rows": m.grid_rows,
            "elements": elements,
        }

    def update_map(self, map_id: int, name: str | None = None, grid_cols: int | None = None, grid_rows: int | None = None) -> dict:
        m = self.db.query(WarehouseMap).filter(WarehouseMap.id == map_id).first()
        if not m:
            raise HTTPException(status_code=404, detail="Mapa nie istnieje")
        if name is not None:
            m.name = name
        if grid_cols is not None:
            m.grid_cols = grid_cols
        if grid_rows is not None:
            m.grid_rows = grid_rows
        self.db.add(m)
        self.db.commit()
        return self.get_map(map_id)

    def add_element(
        self,
        map_id: int,
        type: str,
        x: int,
        y: int,
        width: int = 1,
        height: int = 1,
        props: Dict[str, Any] | None = None,
    ) -> dict:
        m = self.db.query(WarehouseMap).filter(WarehouseMap.id == map_id).first()
        if not m:
            raise HTTPException(status_code=404, detail="Mapa nie istnieje")
        el = MapElement(
            map_id=map_id,
            type=type,
            x=x,
            y=y,
            width=width,
            height=height,
            props=_dump_props(props or {}),
        )
        self.db.add(el)
        self.db.flush()
        if type == ELEMENT_TYPE_RACK and props:
            self._create_bins_for_rack(el, m, props)
            self._sync_locations_from_map(m.warehouse_id, map_id)
        self.db.commit()
        self.db.refresh(el)
        return self._element_to_read(el)

    def _create_bins_for_rack(self, el: MapElement, m: WarehouseMap, props: Dict[str, Any]) -> None:
        levels = int(props.get("levels", 1))
        bins_per_level = int(props.get("bins_per_level", 1))
        depth_cm = float(props.get("depth_cm", 40))
        width_cm = float(props.get("width_cm", 30))
        height_cm = float(props.get("height_cm", 25))
        aisle_letter = str(props.get("aisle_letter", "A"))
        rack_num = self.db.query(MapElement).filter(
            MapElement.map_id == m.id, MapElement.type == ELEMENT_TYPE_RACK
        ).count()
        vol_dm3 = (depth_cm * width_cm * height_cm) / 1000.0
        center_x = el.x + el.width / 2.0
        center_y = el.y + el.height / 2.0
        for lev in range(levels):
            for bin_idx in range(bins_per_level):
                addr = _address(aisle_letter, rack_num, lev + 1, bin_idx + 1)
                b = StorageBin(
                    element_id=el.id,
                    level_index=lev,
                    bin_index=bin_idx,
                    address=addr,
                    max_volume_dm3=round(vol_dm3, 2),
                    current_volume_dm3=0,
                    pos_x=center_x,
                    pos_y=center_y,
                )
                self.db.add(b)

    def _sync_locations_from_map(self, warehouse_id: int, map_id: int) -> None:
        """
        Create or update Location records for every StorageBin in this map (rack elements only).
        Coordinates from StorageBin.pos_x, pos_y; z=0. Dimensions from rack props (width_cm, depth_cm, height_cm).
        Location name uses layout-style pattern (e.g. A1-1-1). Does not delete any locations.
        """
        m = (
            self.db.query(WarehouseMap)
            .options(joinedload(WarehouseMap.elements).joinedload(MapElement.bins))
            .filter(WarehouseMap.id == map_id, WarehouseMap.warehouse_id == warehouse_id)
            .first()
        )
        if not m or not m.elements:
            return
        rack_elements = sorted(
            [e for e in m.elements if e.type == ELEMENT_TYPE_RACK],
            key=lambda e: (e.id or 0),
        )
        for rack_index_one_based, el in enumerate(rack_elements, start=1):
            props = _parse_props(el.props)
            width_cm = float(props.get("width_cm", 30))
            depth_cm = float(props.get("depth_cm", 40))
            height_cm = float(props.get("height_cm", 25))
            aisle_letter = str(props.get("aisle_letter", "A"))
            for b in el.bins or []:
                name = _location_name(aisle_letter, rack_index_one_based, b.level_index, b.bin_index)
                loc = (
                    self.db.query(Location)
                    .filter(Location.warehouse_id == warehouse_id, Location.name == name)
                    .first()
                )
                x_val = float(b.pos_x) if b.pos_x is not None else 0.0
                y_val = float(b.pos_y) if b.pos_y is not None else 0.0
                if loc is None:
                    loc = Location(
                        warehouse_id=warehouse_id,
                        name=name,
                        type="pick",
                        width=width_cm,
                        depth=depth_cm,
                        height=height_cm,
                        x=x_val,
                        y=y_val,
                        z=0.0,
                    )
                    self.db.add(loc)
                else:
                    loc.x = x_val
                    loc.y = y_val
                    loc.z = 0.0
                    loc.width = width_cm
                    loc.depth = depth_cm
                    loc.height = height_cm

    def _element_to_read(self, el: MapElement) -> dict:
        return {
            "id": el.id,
            "map_id": el.map_id,
            "type": el.type,
            "x": el.x,
            "y": el.y,
            "width": el.width,
            "height": el.height,
            "props": _parse_props(el.props),
            "bins": [
                {"id": b.id, "element_id": b.element_id, "level_index": b.level_index, "bin_index": b.bin_index,
                 "address": b.address, "max_volume_dm3": b.max_volume_dm3, "current_volume_dm3": b.current_volume_dm3,
                 "pos_x": b.pos_x, "pos_y": b.pos_y}
                for b in (el.bins or [])
            ],
        }

    def update_element(self, element_id: int, x: int | None = None, y: int | None = None, width: int | None = None, height: int | None = None, props: Dict[str, Any] | None = None) -> dict:
        el = self.db.query(MapElement).filter(MapElement.id == element_id).first()
        if not el:
            raise HTTPException(status_code=404, detail="Element nie istnieje")
        if x is not None:
            el.x = x
        if y is not None:
            el.y = y
        if width is not None:
            el.width = width
        if height is not None:
            el.height = height
        if props is not None:
            el.props = _dump_props(props)
        self.db.add(el)
        self.db.commit()
        self.db.refresh(el)
        if el.type == ELEMENT_TYPE_RACK:
            position_or_size_changed = x is not None or y is not None or width is not None or height is not None
            if position_or_size_changed:
                for b in self.db.query(StorageBin).filter(StorageBin.element_id == element_id).all():
                    b.pos_x = float(el.x) + float(el.width) / 2.0
                    b.pos_y = float(el.y) + float(el.height) / 2.0
                    self.db.add(b)
            m = self.db.query(WarehouseMap).filter(WarehouseMap.id == el.map_id).first()
            if m:
                self._sync_locations_from_map(m.warehouse_id, el.map_id)
            self.db.commit()
        return self._element_to_read(el)

    def delete_element(self, element_id: int) -> dict:
        el = self.db.query(MapElement).filter(MapElement.id == element_id).first()
        if not el:
            raise HTTPException(status_code=404, detail="Element nie istnieje")
        self.db.delete(el)
        self.db.commit()
        return {"status": "deleted"}

    def get_walkable_grid(self, map_id: int) -> List[List[int]]:
        """1 = walkable, 0 = blocked. Used for pathfinding."""
        m = self.db.query(WarehouseMap).filter(WarehouseMap.id == map_id).first()
        if not m:
            raise HTTPException(status_code=404, detail="Mapa nie istnieje")
        rows, cols = m.grid_rows, m.grid_cols
        grid = [[1] * cols for _ in range(rows)]
        for el in m.elements or []:
            if el.type in (ELEMENT_TYPE_RACK, ELEMENT_TYPE_ZONE):
                for r in range(el.y, min(el.y + el.height, rows)):
                    for c in range(el.x, min(el.x + el.width, cols)):
                        grid[r][c] = 0
        return grid

    def find_path(self, map_id: int, start_x: float, start_y: float, end_x: float, end_y: float) -> dict:
        """A* on grid. Coordinates in cell units (integer)."""
        grid = self.get_walkable_grid(map_id)
        rows, cols = len(grid), len(grid[0]) if grid else 0
        sx, sy = int(round(start_x)), int(round(start_y))
        ex, ey = int(round(end_x)), int(round(end_y))
        if not (0 <= sx < cols and 0 <= sy < rows and 0 <= ex < cols and 0 <= ey < rows):
            raise HTTPException(status_code=400, detail="Punkt poza siatką")
        if grid[sy][sx] == 0 or grid[ey][ex] == 0:
            raise HTTPException(status_code=400, detail="Punkt w zajętej komórce")
        path = _astar(grid, cols, rows, sx, sy, ex, ey)
        if not path:
            return {"path": [], "distance": 0}
        dist = sum(
            ((path[i]["x"] - path[i - 1]["x"]) ** 2 + (path[i]["y"] - path[i - 1]["y"]) ** 2) ** 0.5
            for i in range(1, len(path))
        )
        return {"path": [{"x": float(p[0]), "y": float(p[1])} for p in path], "distance": round(dist, 2)}


def _astar(grid: List[List[int]], cols: int, rows: int, sx: int, sy: int, ex: int, ey: int) -> List[tuple]:
    import heapq
    open_set = [(0, sx, sy)]
    came_from: dict = {}
    g_score = {(sx, sy): 0}
    while open_set:
        _, cx, cy = heapq.heappop(open_set)
        if (cx, cy) == (ex, ey):
            path = []
            while (cx, cy) in came_from:
                path.append((cx, cy))
                cx, cy = came_from[(cx, cy)]
            path.append((sx, sy))
            path.reverse()
            return path
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = cx + dx, cy + dy
            if not (0 <= nx < cols and 0 <= ny < rows) or grid[ny][nx] == 0:
                continue
            tentative = g_score.get((cx, cy), float("inf")) + 1
            if tentative < g_score.get((nx, ny), float("inf")):
                came_from[(nx, ny)] = (cx, cy)
                g_score[(nx, ny)] = tentative
                heapq.heappush(open_set, (tentative + abs(nx - ex) + abs(ny - ey), nx, ny))
    return []
