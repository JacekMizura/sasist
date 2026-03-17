import json
import logging
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException

from ..models.warehouse import Warehouse, WarehouseLayout, Rack, Bin, Aisle, StorageLocation, GRID_UNIT_CM
from ..models.tenant import Tenant
from ..models.location import Location
from .warehouse_service import WarehouseService
from .graph_location_service import assign_locations_to_graph_nodes
from ..models.label_template import SavedLabelTemplate
from .barcode_generation import location_barcode_unique
from .label_render_service import render_label_template

logger = logging.getLogger(__name__)


def _float_or_none(v):
    """Return float or None for building dimension fields."""
    if v is None:
        return None
    try:
        x = float(v)
        return x if (x == x) else None  # reject NaN
    except (TypeError, ValueError):
        return None


def _bin_label(aisle_letter: str, rack_index: int, level: int, segment: int) -> str:
    """Canonical location code without leading zeros, e.g. A1-1-3."""
    return f"{aisle_letter}{rack_index}-{level + 1}-{segment + 1}"


def _bin_volume_dm3(length_cm: float, width_cm: float, height_cm: float, levels: int, bins_per_level: int) -> float:
    total_cm3 = length_cm * width_cm * height_cm
    count = levels * bins_per_level
    if count <= 0:
        return 0
    return round((total_cm3 / count) / 1000.0, 2)


def _bin_coords_cm(rack, level_index: int, segment_index: int, internal_structure: dict) -> tuple:
    """Return (x_cm, y_cm, z_cm) for a bin in warehouse space. Rack x,y are in 10cm units."""
    base_x = rack.x * GRID_UNIT_CM
    base_y = rack.y * GRID_UNIT_CM
    levels_data = (internal_structure or {}).get("levels") if isinstance(internal_structure, dict) else []
    # z_cm: sum of level heights below this level
    if levels_data and level_index < len(levels_data):
        z_cm = sum(float(l.get("height_cm", 0)) for l in levels_data[:level_index])
    else:
        z_cm = (rack.height_cm / max(1, rack.levels)) * level_index
    # x,y offset within rack from segment
    if levels_data and level_index < len(levels_data):
        locs = levels_data[level_index].get("locations") or []
        if segment_index < len(locs):
            width_cm = float(locs[segment_index].get("width_cm", 0))
        else:
            width_cm = rack.width_cm / max(1, rack.bins_per_level)
        offset_along = sum(float(locs[i].get("width_cm", 0)) for i in range(segment_index)) if segment_index < len(locs) else (rack.width_cm / max(1, rack.bins_per_level)) * segment_index
    else:
        offset_along = (rack.width_cm / max(1, rack.bins_per_level)) * segment_index
    if rack.orientation == "horizontal":
        x_cm = base_x + offset_along
        y_cm = base_y
    else:
        x_cm = base_x
        y_cm = base_y + offset_along
    return (round(x_cm, 2), round(y_cm, 2), round(z_cm, 2))


def _bin_center_and_dimensions_cm(rack, level_index: int, segment_index: int, internal_structure: dict) -> tuple:
    """
    Return (center_x_cm, center_y_cm, z_cm, width_cm, depth_cm, height_cm) for a storage slot.
    Center point is used for walking-cost, route simulation, heatmaps, slotting.
    Rack x,y are in 10cm units; dimensions come from internal_structure or rack defaults.
    """
    base_x = rack.x * GRID_UNIT_CM
    base_y = rack.y * GRID_UNIT_CM
    levels_data = (internal_structure or {}).get("levels") if isinstance(internal_structure, dict) else []
    # z_cm (floor of bin) and level height
    if levels_data and level_index < len(levels_data):
        z_cm = sum(float(l.get("height_cm", 0)) for l in levels_data[:level_index])
        level_height_cm = float(levels_data[level_index].get("height_cm", 0)) if level_index < len(levels_data) else (rack.height_cm / max(1, rack.levels))
    else:
        z_cm = (rack.height_cm / max(1, rack.levels)) * level_index
        level_height_cm = rack.height_cm / max(1, rack.levels)
    # segment width and offset along rack
    if levels_data and level_index < len(levels_data):
        locs = levels_data[level_index].get("locations") or []
        if segment_index < len(locs):
            width_cm = float(locs[segment_index].get("width_cm", 0))
        else:
            width_cm = rack.width_cm / max(1, rack.bins_per_level)
        offset_along = sum(float(locs[i].get("width_cm", 0)) for i in range(segment_index)) if segment_index < len(locs) else (rack.width_cm / max(1, rack.bins_per_level)) * segment_index
    else:
        width_cm = rack.width_cm / max(1, rack.bins_per_level)
        offset_along = width_cm * segment_index
    # depth = rack extent perpendicular to segment direction (length_cm)
    depth_cm = float(rack.length_cm) if getattr(rack, "length_cm", None) is not None else (rack.width_cm or 80.0)
    # center = base + segment_offset + (width/2) along segment, and (depth/2) along the other axis
    if rack.orientation == "horizontal":
        center_x = base_x + offset_along + (width_cm / 2)
        center_y = base_y + (depth_cm / 2)
    else:
        center_x = base_x + (depth_cm / 2)
        center_y = base_y + offset_along + (width_cm / 2)
    return (
        round(center_x, 2), round(center_y, 2), round(z_cm, 2),
        round(width_cm, 2), round(depth_cm, 2), round(level_height_cm, 2),
    )


class WarehouseLayoutService:
    def __init__(self, db: Session):
        self.db = db

    def _sync_storage_locations(self, warehouse_id: int, rack: Rack, internal_structure: dict, bin_rows: list) -> None:
        """Delete existing StorageLocation for this rack's bins and create new ones with x_cm, y_cm, z_cm."""
        bin_ids = [b.id for b, _, _ in bin_rows]
        self.db.query(StorageLocation).filter(
            StorageLocation.rack_id == rack.id,
            StorageLocation.bin_id.in_(bin_ids),
        ).delete(synchronize_session=False)
        for b, lev, seg in bin_rows:
            x_cm, y_cm, z_cm = _bin_coords_cm(rack, lev, seg, internal_structure)
            self.db.add(StorageLocation(
                warehouse_id=warehouse_id,
                rack_id=rack.id,
                bin_id=b.id,
                x_cm=x_cm,
                y_cm=y_cm,
                z_cm=z_cm,
            ))

    def _sync_locations_from_bins(
        self, warehouse_id: int, rack: Rack, internal_structure: dict, bin_rows: list
    ) -> None:
        """
        Create operational Location rows (locations table) from layout bins when missing.
        Each location receives coordinates (x, y, z) representing the center of the storage slot,
        and dimensions (width, depth, height) for walking-cost, route simulation, heatmaps, slotting.
        Existing locations (same warehouse_id + name) are left unchanged.
        """
        for b, lev, seg in bin_rows:
            center_x, center_y, z_cm, width_cm, depth_cm, height_cm = _bin_center_and_dimensions_cm(
                rack, lev, seg, internal_structure
            )
            loc = (
                self.db.query(Location)
                .filter(Location.warehouse_id == warehouse_id, Location.name == b.label)
                .first()
            )
            if loc is None:
                self.db.add(Location(
                    warehouse_id=warehouse_id,
                    name=b.label,
                    type="pick",
                    width=float(width_cm),
                    depth=float(depth_cm),
                    height=float(height_cm),
                    x=float(center_x),
                    y=float(center_y),
                    z=float(z_cm),
                ))

    def get_layout(self, tenant_id: int, warehouse_id: int) -> dict:
        ws = WarehouseService(self.db)
        if not ws.can_tenant_access_warehouse(tenant_id, warehouse_id):
            raise HTTPException(status_code=404, detail="Magazyn nie istnieje")
        wh = self.db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if not wh:
            raise HTTPException(status_code=404, detail="Magazyn nie istnieje")
        layout = self.db.query(WarehouseLayout).options(
            joinedload(WarehouseLayout.racks).joinedload(Rack.bins),
            joinedload(WarehouseLayout.aisles),
        ).filter(WarehouseLayout.warehouse_id == warehouse_id).first()
        if not layout:
            return {
                "layout_id": None,
                "warehouse_id": warehouse_id,
                "warehouse_name": wh.name,
                "name": "Layout 1",
                "grid_cols": 24,
                "grid_rows": 16,
                "width_m": 24.0,
                "length_m": 16.0,
                "building_width_m": None,
                "building_depth_m": None,
                "building_height_m": None,
                "racks": [],
                "aisles": [],
                "row_containers": [],
                "wall_elements": [],
            }
        racks_out = []
        for r in layout.racks or []:
            bins_out = [
                {
                    "id": b.id,
                    "label": b.label,
                    "barcode_data": getattr(b, "barcode", None) or b.label,
                    "level_index": b.level_index,
                    "segment_index": b.segment_index,
                    "volume_dm3": round(b.volume_dm3, 2),
                    "current_load_dm3": round(b.current_load_dm3, 2),
                    "storage_type": getattr(b, "storage_type", None) or "primary",
                }
                for b in sorted(r.bins or [], key=lambda x: (x.level_index, x.segment_index))
            ]
            total_vol = sum(b.volume_dm3 for b in (r.bins or []))
            used_vol = sum(b.current_load_dm3 for b in (r.bins or []))
            internal_structure = None
            if r.internal_structure:
                try:
                    internal_structure = json.loads(r.internal_structure)
                except (json.JSONDecodeError, TypeError):
                    pass
            racks_out.append({
                "id": r.id,
                "name": r.name,
                "x": r.x, "y": r.y, "width": r.width, "height": r.height,
                "orientation": r.orientation,
                "levels": r.levels, "bins_per_level": r.bins_per_level,
                "length_cm": r.length_cm, "width_cm": r.width_cm, "height_cm": r.height_cm,
                "aisle_letter": r.aisle_letter, "rack_index": r.rack_index,
                "bins": bins_out,
                "internal_structure": internal_structure,
                "total_capacity_dm3": round(total_vol, 2),
                "used_dm3": round(used_vol, 2),
                "color": getattr(r, "color", None),
                "templateId": getattr(r, "template_id", None),
                "show_label": getattr(r, "show_label", None),
            })
        aisles_out = [
            {
                "id": a.id, "name": a.name,
                "x": a.x, "y": a.y, "width": a.width, "height": a.height,
                "two_way": bool(a.two_way),
            }
            for a in (layout.aisles or [])
        ]
        row_containers = []
        if getattr(layout, "row_containers_json", None):
            try:
                row_containers = json.loads(layout.row_containers_json)
            except (json.JSONDecodeError, TypeError):
                pass
        wall_elements = []
        if getattr(layout, "wall_elements_json", None):
            try:
                wall_elements = json.loads(layout.wall_elements_json)
            except (json.JSONDecodeError, TypeError):
                pass
        return {
            "layout_id": layout.id,
            "warehouse_id": layout.warehouse_id,
            "warehouse_name": wh.name,
            "name": layout.name,
            "grid_cols": layout.grid_cols,
            "grid_rows": layout.grid_rows,
            "width_m": float(layout.width_m),
            "length_m": float(layout.length_m),
            "building_width_m": _float_or_none(getattr(layout, "building_width_m", None)),
            "building_depth_m": _float_or_none(getattr(layout, "building_depth_m", None)),
            "building_height_m": _float_or_none(getattr(layout, "building_height_m", None)),
            "racks": racks_out,
            "aisles": aisles_out,
            "row_containers": row_containers,
            "wall_elements": wall_elements,
        }

    def get_location_label_records(self, tenant_id: int, warehouse_id: int) -> list[dict]:
        """Build one record per bin for template rendering. Includes loc_name, loc_barcode, zone for template renderer."""
        layout_data = self.get_layout(tenant_id, warehouse_id)
        zone = "Magazyn"
        for ve in (layout_data.get("visual_elements") or []):
            if ve.get("type") == "zone" and ve.get("name"):
                zone = ve.get("name")
                break
        records = []
        seen = set()
        for rack in layout_data.get("racks") or []:
            aisle = (rack.get("aisle_letter") or "A").strip().upper()[:1]
            r_idx = int(rack.get("rack_index") or 1)
            rack_str = f"{aisle}{r_idx}"
            for bin_data in rack.get("bins") or []:
                lev = int(bin_data.get("level_index", 0))
                seg = int(bin_data.get("segment_index", 0))
                location_name = bin_data.get("label") or _bin_label(aisle, r_idx, lev, seg)
                if location_name in seen:
                    continue
                seen.add(location_name)
                location_barcode = bin_data.get("barcode_data") or bin_data.get("label") or location_name
                level_num = lev + 1
                position_num = seg + 1
                raw_bin = bin_data.get("bin")
                if raw_bin is not None and str(raw_bin).strip():
                    bin_label = str(raw_bin).strip()
                else:
                    bin_label = chr(ord("A") + seg) if seg < 26 else str(seg + 1)
                records.append({
                    "loc_name": location_name,
                    "loc_barcode": location_barcode,
                    "zone": zone,
                    "location_code": location_name,
                    "location_barcode": location_barcode,
                    "rack": rack_str,
                    "rack_name": rack_str,
                    "bin": bin_label,
                    "level": level_num,
                    "position": position_num,
                    "segment_index": seg,
                    "barcode_data": location_barcode,
                    "location_name": location_name,
                    "rack_id": rack_str,
                    "level_num": level_num,
                    "zone_name": zone,
                    "{loc_name}": location_name,
                    "{loc_barcode}": location_barcode,
                    "{rack_id}": rack_str,
                    "{rack_name}": rack_str,
                    "{bin}": bin_label,
                    "{level_num}": level_num,
                    "{bin_pos}": str(position_num),
                    "{zone}": zone,
                })
        return records

    def get_location_labels_pdf(self, tenant_id: int, warehouse_id: int, template_id: int | None = None) -> bytes:
        """Generate location labels PDF via template system. Uses template_id if provided, else default location template."""
        records = self.get_location_label_records(tenant_id, warehouse_id)
        if not records:
            logger.error("Location labels: no location records for tenant_id=%s warehouse_id=%s", tenant_id, warehouse_id)
            raise HTTPException(
                status_code=400,
                detail="No locations in layout. Load a warehouse layout with racks and bins first.",
            )
        if template_id is None:
            tenant = self.db.query(Tenant).filter(Tenant.id == tenant_id).first()
            template_id = getattr(tenant, "default_location_template_id", None) if tenant else None
            if not template_id:
                row = (
                    self.db.query(SavedLabelTemplate)
                    .filter(
                        SavedLabelTemplate.tenant_id == tenant_id,
                        SavedLabelTemplate.template_type == "location",
                    )
                    .order_by(SavedLabelTemplate.updated_at.desc())
                    .first()
                )
                if not row:
                    logger.error("Location labels: no template with template_type=location for tenant_id=%s", tenant_id)
                    raise HTTPException(
                        status_code=404,
                        detail="No location label template found. Create and save a template with type 'Location' in the label designer.",
                    )
                template_id = row.id
        try:
            return render_label_template(self.db, template_id, records, tenant_id)
        except ValueError as e:
            logger.error("Location labels: %s", e)
            raise HTTPException(status_code=404, detail=str(e)) from e

    def save_layout(self, tenant_id: int, warehouse_id: int, data: dict) -> dict:
        ws = WarehouseService(self.db)
        if not ws.can_tenant_access_warehouse(tenant_id, warehouse_id):
            raise HTTPException(status_code=404, detail="Magazyn nie istnieje")
        wh = self.db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if not wh:
            raise HTTPException(status_code=404, detail="Magazyn nie istnieje")

        layout = self.db.query(WarehouseLayout).filter(
            WarehouseLayout.warehouse_id == warehouse_id,
        ).first()

        if not layout:
            layout = WarehouseLayout(
                warehouse_id=warehouse_id,
                name=data.get("name", "Layout 1"),
                grid_cols=data.get("grid_cols", 24),
                grid_rows=data.get("grid_rows", 16),
                width_m=data.get("width_m", 24.0),
                length_m=data.get("length_m", 16.0),
                row_containers_json=json.dumps(data.get("row_containers") or []) if data.get("row_containers") else None,
                wall_elements_json=json.dumps(data.get("wall_elements") or []) if data.get("wall_elements") else None,
                building_width_m=_float_or_none(data.get("building_width_m")),
                building_depth_m=_float_or_none(data.get("building_depth_m")),
                building_height_m=_float_or_none(data.get("building_height_m")),
            )
            self.db.add(layout)
            self.db.flush()
        else:
            layout.name = data.get("name", layout.name)
            layout.grid_cols = data.get("grid_cols", layout.grid_cols)
            layout.grid_rows = data.get("grid_rows", layout.grid_rows)
            layout.width_m = data.get("width_m", layout.width_m)
            layout.length_m = data.get("length_m", layout.length_m)
            if "building_width_m" in data:
                layout.building_width_m = _float_or_none(data.get("building_width_m"))
            if "building_depth_m" in data:
                layout.building_depth_m = _float_or_none(data.get("building_depth_m"))
            if "building_height_m" in data:
                layout.building_height_m = _float_or_none(data.get("building_height_m"))
            row_containers = data.get("row_containers")
            if row_containers is not None:
                layout.row_containers_json = json.dumps(row_containers) if row_containers else None
            if "wall_elements" in data:
                wall_el = data.get("wall_elements")
                layout.wall_elements_json = json.dumps(wall_el) if wall_el else None
            self.db.add(layout)

        for r in layout.racks or []:
            for b in r.bins or []:
                self.db.delete(b)
            self.db.delete(r)
        for a in layout.aisles or []:
            self.db.delete(a)
        self.db.flush()

        warehouse_id = layout.warehouse_id
        for idx, r_data in enumerate(data.get("racks", [])):
            vol_per_bin = _bin_volume_dm3(
                r_data.get("length_cm", 100),
                r_data.get("width_cm", 80),
                r_data.get("height_cm", 200),
                r_data.get("levels", 4),
                r_data.get("bins_per_level", 4),
            )
            internal_structure_raw = r_data.get("internal_structure")
            internal_structure_str = json.dumps(internal_structure_raw) if internal_structure_raw is not None else None
            rack = Rack(
                layout_id=layout.id,
                name=r_data.get("name"),
                x=r_data.get("x", 0),
                y=r_data.get("y", 0),
                width=r_data.get("width", 1),
                height=r_data.get("height", 1),
                orientation=r_data.get("orientation", "vertical"),
                levels=r_data.get("levels", 4),
                bins_per_level=r_data.get("bins_per_level", 4),
                length_cm=r_data.get("length_cm", 100),
                width_cm=r_data.get("width_cm", 80),
                height_cm=r_data.get("height_cm", 200),
                aisle_letter=r_data.get("aisle_letter", "A"),
                rack_index=r_data.get("rack_index", idx + 1),
                internal_structure=internal_structure_str,
                color=r_data.get("color") if isinstance(r_data.get("color"), str) else None,
                template_id=r_data.get("templateId") if isinstance(r_data.get("templateId"), str) else None,
            )
            self.db.add(rack)
            self.db.flush()
            payload_bins = r_data.get("bins") or []
            bin_rows = []
            if payload_bins:
                # Preserve exact labels from editor: no re-indexing. Sort by level_index, segment_index.
                sorted_bins = sorted(
                    payload_bins,
                    key=lambda b: (int(b.get("level_index", 0)), int(b.get("segment_index", 0))),
                )
                for bin_data in sorted_bins:
                    label = bin_data.get("label") or _bin_label(rack.aisle_letter, rack.rack_index, int(bin_data.get("level_index", 0)), int(bin_data.get("segment_index", 0)))
                    lev = int(bin_data.get("level_index", 0))
                    seg = int(bin_data.get("segment_index", 0))
                    bin_vol = float(bin_data.get("volume_dm3", vol_per_bin))
                    bin_load = float(bin_data.get("current_load_dm3", bin_data.get("used_volume_dm3", 0)))
                    raw_storage = (bin_data.get("storage_type") or "").strip().lower()
                    storage_type = "reserve" if raw_storage in ("reserve", "reserved", "reservation") else "primary"
                    b = Bin(
                        rack_id=rack.id,
                        label=label,
                        level_index=lev,
                        segment_index=seg,
                        volume_dm3=round(bin_vol, 2),
                        current_load_dm3=round(bin_load, 2),
                        storage_type=storage_type,
                    )
                    self.db.add(b)
                    bin_rows.append((b, lev, seg))
            else:
                for lev in range(rack.levels):
                    for seg in range(rack.bins_per_level):
                        label = _bin_label(rack.aisle_letter, rack.rack_index, lev, seg)
                        b = Bin(
                            rack_id=rack.id,
                            label=label,
                            level_index=lev,
                            segment_index=seg,
                            volume_dm3=round(vol_per_bin, 2),
                            current_load_dm3=0,
                            storage_type="primary",
                        )
                        self.db.add(b)
                        bin_rows.append((b, lev, seg))
            self.db.flush()
            for b, lev, seg in bin_rows:
                b.barcode = location_barcode_unique(rack.id, lev, seg)
                self.db.refresh(b)
            self._sync_storage_locations(warehouse_id, rack, r_data.get("internal_structure"), bin_rows)
            self._sync_locations_from_bins(warehouse_id, rack, r_data.get("internal_structure"), bin_rows)
        for a_data in data.get("aisles", []):
            self.db.add(Aisle(
                layout_id=layout.id,
                name=a_data.get("name"),
                x=a_data.get("x", 0),
                y=a_data.get("y", 0),
                width=a_data.get("width", 1),
                height=a_data.get("height", 1),
                two_way=1 if a_data.get("two_way", True) else 0,
            ))
        self.db.commit()
        self.db.refresh(layout)
        assign_locations_to_graph_nodes(self.db, warehouse_id)
        return self.get_layout(tenant_id, warehouse_id)
