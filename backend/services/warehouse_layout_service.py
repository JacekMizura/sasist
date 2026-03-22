import json
import logging
from uuid import uuid4
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException

from ..models.warehouse import Warehouse, WarehouseLayout, Rack, Bin, Aisle, StorageLocation, GRID_UNIT_CM
from ..models.tenant import Tenant
from ..models.tenant_warehouse import TenantWarehouse
from ..models.product import Product
from ..models.location import Location
from .warehouse_service import WarehouseService
from .graph_location_service import assign_locations_to_graph_nodes
from ..models.label_template import SavedLabelTemplate
from ..storage_types import normalize_storage_type, is_pickable
from .barcode_generation import location_barcode_unique
from .label_render_service import render_label_template

logger = logging.getLogger(__name__)
RACK_IDENTITY_SAVE_ENABLED = True
BIN_IDENTITY_SAVE_ENABLED = True
# SQLite bind limit (~999); batch IN (...) for Location.location_uuid lookups.
_LOCATION_UUID_IN_BATCH = 500


def _parse_assigned_locations_cleanup(raw) -> list:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            out = json.loads(raw)
            return out if isinstance(out, list) else []
        except (json.JSONDecodeError, TypeError):
            return []
    return []


def _entry_location_uuid_for_cleanup(ent) -> str | None:
    if not isinstance(ent, dict):
        return None
    u = ent.get("locationUUID") or ent.get("location_uuid")
    if isinstance(u, str):
        s = u.strip()
        return s or None
    return None


def _assigned_entry_keeps_after_layout_save(
    ent,
    active_this_layout: set[str],
    all_bins_this_layout: set[str],
    active_tenant_wide: set[str],
) -> bool:
    """Keep assignment if UUID still valid; drop if it only belonged to this layout and is gone/inactive."""
    if not isinstance(ent, dict):
        return True
    u = _entry_location_uuid_for_cleanup(ent)
    if not u:
        return True
    if u in active_this_layout:
        return True
    if u in all_bins_this_layout:
        return False
    if u in active_tenant_wide:
        return True
    return False


def _location_uuid_set_from_query_rows(rows) -> set[str]:
    out: set[str] = set()
    for (loc_uuid,) in rows:
        if loc_uuid is None:
            continue
        s = str(loc_uuid).strip()
        if s:
            out.add(s)
    return out


def _float_or_none(v):
    """Return float or None for building dimension fields."""
    if v is None:
        return None
    try:
        x = float(v)
        return x if (x == x) else None  # reject NaN
    except (TypeError, ValueError):
        return None


def _new_uuid() -> str:
    return str(uuid4())


def _normalize_uuid(value) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _int_or_none(value) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
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

    def _has_incomplete_rack_payload(self, rack_payloads: list[dict]) -> bool:
        incomplete = False
        for r_data in rack_payloads:
            if r_data.get("x") is None or r_data.get("y") is None:
                logger.warning(
                    "Skipping rack update due to incomplete payload (uuid=%s, id=%s, x=%r, y=%r)",
                    _normalize_uuid(r_data.get("uuid")),
                    r_data.get("id"),
                    r_data.get("x"),
                    r_data.get("y"),
                )
                incomplete = True
        return incomplete

    def _ensure_layout_identity(self, layout: WarehouseLayout | None) -> None:
        if layout is None:
            return

        layout = (
            self.db.query(WarehouseLayout)
            .options(joinedload(WarehouseLayout.racks).joinedload(Rack.bins))
            .execution_options(include_inactive=True)
            .filter(WarehouseLayout.id == layout.id)
            .first()
        )
        if layout is None:
            return

        changed = False
        for rack in layout.racks or []:
            if not getattr(rack, "uuid", None):
                rack.uuid = _new_uuid()
                changed = True
            if getattr(rack, "is_active", None) is None:
                rack.is_active = True
                changed = True
            for bin_row in rack.bins or []:
                if not getattr(bin_row, "location_uuid", None):
                    bin_row.location_uuid = _new_uuid()
                    changed = True
                if getattr(bin_row, "is_active", None) is None:
                    bin_row.is_active = True
                    changed = True

        if changed:
            self.db.commit()
            self.db.refresh(layout)

    def _apply_rack_fields(self, rack: Rack, r_data: dict, idx: int, *, is_new: bool) -> bool:
        internal_structure_raw = r_data.get("internal_structure")
        rack_x = _int_or_none(r_data.get("x"))
        rack_y = _int_or_none(r_data.get("y"))
        rack_width = _int_or_none(r_data.get("width"))
        rack_height = _int_or_none(r_data.get("height"))
        rack_uuid = _normalize_uuid(r_data.get("uuid")) or getattr(rack, "uuid", None) or _new_uuid()

        if is_new and (rack_x is None or rack_y is None or rack_width is None or rack_height is None):
            logger.warning(
                "Skipping invalid rack: missing position (uuid=%s, id=%s, x=%r, y=%r, width=%r, height=%r)",
                rack_uuid,
                r_data.get("id"),
                r_data.get("x"),
                r_data.get("y"),
                r_data.get("width"),
                r_data.get("height"),
            )
            return False

        fallback_fields: list[str] = []
        if rack_x is None:
            rack_x = getattr(rack, "x", None)
            fallback_fields.append("x")
        if rack_y is None:
            rack_y = getattr(rack, "y", None)
            fallback_fields.append("y")
        if rack_width is None:
            rack_width = getattr(rack, "width", None)
            fallback_fields.append("width")
        if rack_height is None:
            rack_height = getattr(rack, "height", None)
            fallback_fields.append("height")

        if fallback_fields:
            logger.warning(
                "Partial rack update: keeping existing %s for rack uuid=%s id=%s",
                ", ".join(fallback_fields),
                rack_uuid,
                getattr(rack, "id", None) or r_data.get("id"),
            )

        rack.uuid = _normalize_uuid(r_data.get("uuid")) or getattr(rack, "uuid", None) or _new_uuid()
        rack.is_active = True
        rack.rack_type = r_data.get("rack_type") if isinstance(r_data.get("rack_type"), str) and r_data.get("rack_type") in ("warehouse", "store") else getattr(rack, "rack_type", None) or "warehouse"
        rack.name = r_data.get("name")
        rack.x = rack_x if rack_x is not None else 0
        rack.y = rack_y if rack_y is not None else 0
        rack.width = rack_width if rack_width is not None else 1
        rack.height = rack_height if rack_height is not None else 1
        rack.orientation = r_data.get("orientation", "vertical")
        rack.levels = r_data.get("levels", 4)
        rack.bins_per_level = r_data.get("bins_per_level", 4)
        rack.length_cm = r_data.get("length_cm", 100)
        rack.width_cm = r_data.get("width_cm", 80)
        rack.height_cm = r_data.get("height_cm", 200)
        rack.aisle_letter = r_data.get("aisle_letter", "A")
        rack.rack_index = r_data.get("rack_index", idx + 1)
        rack.internal_structure = json.dumps(internal_structure_raw) if internal_structure_raw is not None else None
        rack.color = r_data.get("color") if isinstance(r_data.get("color"), str) else None
        rack.template_id = r_data.get("templateId") if isinstance(r_data.get("templateId"), str) else None
        return True

    def _build_default_bin_rows_for_new_rack(self, rack: Rack, r_data: dict) -> list[tuple[Bin, int, int]]:
        vol_per_bin = _bin_volume_dm3(
            r_data.get("length_cm", 100),
            r_data.get("width_cm", 80),
            r_data.get("height_cm", 200),
            r_data.get("levels", 4),
            r_data.get("bins_per_level", 4),
        )
        payload_bins = r_data.get("bins") or []
        bin_rows: list[tuple[Bin, int, int]] = []
        if payload_bins:
            sorted_bins = sorted(
                payload_bins,
                key=lambda b: (int(b.get("level_index", 0)), int(b.get("segment_index", 0))),
            )
            for bin_data in sorted_bins:
                label = bin_data.get("label") or _bin_label(
                    rack.aisle_letter,
                    rack.rack_index,
                    int(bin_data.get("level_index", 0)),
                    int(bin_data.get("segment_index", 0)),
                )
                lev = int(bin_data.get("level_index", 0))
                seg = int(bin_data.get("segment_index", 0))
                bin_vol = float(bin_data.get("volume_dm3", vol_per_bin))
                bin_load = float(bin_data.get("current_load_dm3", bin_data.get("used_volume_dm3", 0)))
                storage_type = normalize_storage_type(bin_data.get("storage_type"))
                b = Bin(
                    id=bin_data.get("id") if isinstance(bin_data.get("id"), int) else None,
                    rack_id=rack.id,
                    location_uuid=_normalize_uuid(bin_data.get("location_uuid")) or _new_uuid(),
                    is_active=True,
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
                    b = Bin(
                        rack_id=rack.id,
                        location_uuid=_new_uuid(),
                        is_active=True,
                        label=_bin_label(rack.aisle_letter, rack.rack_index, lev, seg),
                        level_index=lev,
                        segment_index=seg,
                        volume_dm3=round(vol_per_bin, 2),
                        current_load_dm3=0,
                        storage_type=normalize_storage_type(None),
                    )
                    self.db.add(b)
                    bin_rows.append((b, lev, seg))
        self.db.flush()
        for b, lev, seg in bin_rows:
            b.barcode = location_barcode_unique(rack.id, lev, seg)
            self.db.refresh(b)
        return bin_rows

    def _replace_layout_racks_legacy(self, layout: WarehouseLayout, data: dict, warehouse_id: int) -> None:
        all_racks = (
            self.db.query(Rack)
            .options(joinedload(Rack.bins))
            .execution_options(include_inactive=True)
            .filter(Rack.layout_id == layout.id)
            .all()
        )
        for r in all_racks:
            for b in r.bins or []:
                self.db.delete(b)
            self.db.delete(r)
        self.db.flush()

        for idx, r_data in enumerate(data.get("racks", [])):
            rack_uuid = _normalize_uuid(r_data.get("uuid")) or _new_uuid()
            logger.warning(
                "Saving rack payload (legacy path): uuid=%s x=%r y=%r width=%r height=%r",
                rack_uuid,
                r_data.get("x"),
                r_data.get("y"),
                r_data.get("width"),
                r_data.get("height"),
            )
            try:
                rack = Rack(
                    id=r_data.get("id") if isinstance(r_data.get("id"), int) else None,
                    layout_id=layout.id,
                    uuid=rack_uuid,
                )
                if not self._apply_rack_fields(rack, r_data, idx, is_new=True):
                    continue
                self.db.add(rack)
                self.db.flush()
                bin_rows = self._build_default_bin_rows_for_new_rack(rack, r_data)
                self._sync_storage_locations(warehouse_id, rack, r_data.get("internal_structure"), bin_rows)
                self._sync_locations_from_bins(warehouse_id, rack, r_data.get("internal_structure"), bin_rows)
            except Exception:
                logger.exception("Rack save failed (legacy path). Full rack payload: %s", r_data)
                raise

    def _active_bins_for_rack(self, rack: Rack) -> list[Bin]:
        return sorted(
            [b for b in (rack.bins or []) if bool(getattr(b, "is_active", True))],
            key=lambda row: (row.level_index, row.segment_index),
        )

    def _apply_bin_fields(self, bin_row: Bin, rack: Rack, bin_data: dict, vol_per_bin: float) -> None:
        lev = int(bin_data.get("level_index", 0))
        seg = int(bin_data.get("segment_index", 0))
        label = bin_data.get("label") or _bin_label(rack.aisle_letter, rack.rack_index, lev, seg)
        bin_vol = float(bin_data.get("volume_dm3", vol_per_bin))
        bin_load = float(bin_data.get("current_load_dm3", bin_data.get("used_volume_dm3", 0)))
        storage_type = normalize_storage_type(bin_data.get("storage_type"))

        bin_row.rack_id = rack.id
        bin_row.is_active = True
        bin_row.label = label
        bin_row.level_index = lev
        bin_row.segment_index = seg
        bin_row.volume_dm3 = round(bin_vol, 2)
        bin_row.current_load_dm3 = round(bin_load, 2)
        bin_row.storage_type = storage_type

    def _ensure_location_links_for_bins(self, warehouse_id: int, bin_rows: list[Bin]) -> None:
        missing_uuid_bins = [b for b in bin_rows if _normalize_uuid(getattr(b, "location_uuid", None))]
        if not missing_uuid_bins:
            return

        location_uuids = [_normalize_uuid(b.location_uuid) for b in missing_uuid_bins]
        existing_locations = (
            self.db.query(Location)
            .execution_options(include_inactive=True)
            .filter(Location.warehouse_id == warehouse_id, Location.location_uuid.in_(location_uuids))
            .all()
        )
        existing_by_uuid = {
            _normalize_uuid(loc.location_uuid): loc
            for loc in existing_locations
            if _normalize_uuid(loc.location_uuid)
        }

        for bin_row in missing_uuid_bins:
            loc_uuid = _normalize_uuid(bin_row.location_uuid)
            if loc_uuid in existing_by_uuid:
                continue
            fallback = (
                self.db.query(Location)
                .execution_options(include_inactive=True)
                .filter(
                    Location.warehouse_id == warehouse_id,
                    Location.location_uuid.is_(None),
                    Location.name == bin_row.label,
                )
                .first()
            )
            if fallback is not None:
                fallback.location_uuid = loc_uuid
                fallback.is_active = True
                existing_by_uuid[loc_uuid] = fallback

    def _sync_locations_from_bins(
        self, warehouse_id: int, rack: Rack, internal_structure: dict, bin_rows: list
    ) -> None:
        """
        Keep operational Location rows stable by matching on location_uuid.
        Label changes update the existing row instead of recreating it.
        """
        raw_bins = [b for b, _, _ in bin_rows]
        self._ensure_location_links_for_bins(warehouse_id, raw_bins)

        location_uuids = [
            loc_uuid
            for loc_uuid in (_normalize_uuid(getattr(b, "location_uuid", None)) for b in raw_bins)
            if loc_uuid is not None
        ]
        existing_locations = (
            self.db.query(Location)
            .execution_options(include_inactive=True)
            .filter(Location.warehouse_id == warehouse_id, Location.location_uuid.in_(location_uuids))
            .all()
            if location_uuids
            else []
        )
        locations_by_uuid = {
            _normalize_uuid(loc.location_uuid): loc
            for loc in existing_locations
            if _normalize_uuid(loc.location_uuid)
        }

        for b, lev, seg in bin_rows:
            center_x, center_y, z_cm, width_cm, depth_cm, height_cm = _bin_center_and_dimensions_cm(
                rack, lev, seg, internal_structure
            )
            loc_uuid = _normalize_uuid(getattr(b, "location_uuid", None))
            loc = locations_by_uuid.get(loc_uuid) if loc_uuid is not None else None
            if loc is None:
                loc = Location(
                    warehouse_id=warehouse_id,
                    name=b.label,
                    location_uuid=loc_uuid,
                    is_active=True,
                    type="pick",
                )
                self.db.add(loc)
                if loc_uuid is not None:
                    locations_by_uuid[loc_uuid] = loc

            loc.name = b.label
            loc.location_uuid = loc_uuid
            loc.is_active = True
            # Reserve is only for replenishment, never direct picking.
            # Future feature may allow override per warehouse.
            loc.type = "pick" if is_pickable(getattr(b, "storage_type", None)) else "reserve"
            loc.width = float(width_cm)
            loc.depth = float(depth_cm)
            loc.height = float(height_cm)
            loc.x = float(center_x)
            loc.y = float(center_y)
            loc.z = float(z_cm)

    def _load_locations_by_uuids_batched(self, warehouse_id: int, location_uuids: list[str]) -> dict[str, Location]:
        """Load Location rows by location_uuid in batches (SQLite-safe)."""
        locations_by_uuid: dict[str, Location] = {}
        uuids = [u for u in location_uuids if u]
        for i in range(0, len(uuids), _LOCATION_UUID_IN_BATCH):
            batch = uuids[i : i + _LOCATION_UUID_IN_BATCH]
            locs = (
                self.db.query(Location)
                .execution_options(include_inactive=True)
                .filter(Location.warehouse_id == warehouse_id, Location.location_uuid.in_(batch))
                .all()
            )
            for loc in locs:
                nu = _normalize_uuid(loc.location_uuid)
                if nu:
                    locations_by_uuid[nu] = loc
        return locations_by_uuid

    def _ensure_missing_locations_for_layout_bins(self, layout_id: int, warehouse_id: int) -> tuple[int, int]:
        """
        Ensure every bin with a location_uuid has a matching Location row (required before StorageLocation sync / graph).
        Returns (created_count, still_missing_count).
        """
        bin_rack_rows = (
            self.db.query(Bin, Rack)
            .join(Rack, Bin.rack_id == Rack.id)
            .execution_options(include_inactive=True)
            .filter(Rack.layout_id == layout_id)
            .all()
        )
        if not bin_rack_rows:
            return 0, 0
        all_uuids: list[str] = []
        for bin_row, _rack in bin_rack_rows:
            u = _normalize_uuid(getattr(bin_row, "location_uuid", None))
            if u:
                all_uuids.append(u)
        locations_by_uuid = self._load_locations_by_uuids_batched(warehouse_id, all_uuids)
        created = 0
        for bin_row, rack in bin_rack_rows:
            loc_uuid = _normalize_uuid(getattr(bin_row, "location_uuid", None))
            if loc_uuid is None or loc_uuid in locations_by_uuid:
                continue
            internal_structure = None
            if rack.internal_structure:
                try:
                    internal_structure = json.loads(rack.internal_structure)
                except (json.JSONDecodeError, TypeError):
                    internal_structure = None
            center_x, center_y, z_cm, width_cm, depth_cm, height_cm = _bin_center_and_dimensions_cm(
                rack, bin_row.level_index, bin_row.segment_index, internal_structure
            )
            loc = Location(
                warehouse_id=warehouse_id,
                name=bin_row.label,
                location_uuid=loc_uuid,
                is_active=True,
                type="pick" if is_pickable(getattr(bin_row, "storage_type", None)) else "reserve",
            )
            loc.width = float(width_cm)
            loc.depth = float(depth_cm)
            loc.height = float(height_cm)
            loc.x = float(center_x)
            loc.y = float(center_y)
            loc.z = float(z_cm)
            rn = getattr(rack, "name", None)
            if rn:
                loc.rack_name = str(rn)[:50]
            self.db.add(loc)
            locations_by_uuid[loc_uuid] = loc
            created += 1
        if created:
            self.db.flush()
        locations_by_uuid = self._load_locations_by_uuids_batched(warehouse_id, all_uuids)
        still_missing = 0
        for bin_row, _rack in bin_rack_rows:
            loc_uuid = _normalize_uuid(getattr(bin_row, "location_uuid", None))
            if loc_uuid is None:
                continue
            if loc_uuid not in locations_by_uuid:
                still_missing += 1
        if still_missing > 0:
            logger.error(
                "[CRITICAL] missing Locations for bins: count=%s warehouse_id=%s layout_id=%s",
                still_missing,
                warehouse_id,
                layout_id,
            )
        return created, still_missing

    def _save_layout_racks_by_identity(self, layout: WarehouseLayout, data: dict, warehouse_id: int) -> None:
        existing_racks = (
            self.db.query(Rack)
            .options(joinedload(Rack.bins))
            .execution_options(include_inactive=True)
            .filter(Rack.layout_id == layout.id)
            .all()
        )
        existing_bins = (
            self.db.query(Bin)
            .join(Rack, Bin.rack_id == Rack.id)
            .execution_options(include_inactive=True)
            .filter(Rack.layout_id == layout.id)
            .all()
        )
        existing_racks_by_uuid = {
            rack.uuid: rack
            for rack in existing_racks
            if _normalize_uuid(getattr(rack, "uuid", None))
        }
        existing_bins_by_location_uuid = {
            loc_uuid: bin_row
            for bin_row in existing_bins
            if (loc_uuid := _normalize_uuid(getattr(bin_row, "location_uuid", None))) is not None
        }
        payload_racks = data.get("racks", [])
        payload_uuids: set[str] = set()
        payload_bin_uuids: set[str] = set()

        for idx, r_data in enumerate(payload_racks):
            incoming_uuid = _normalize_uuid(r_data.get("uuid"))
            incoming_id = r_data.get("id") if isinstance(r_data.get("id"), int) else None
            if incoming_uuid is None and incoming_id is not None:
                raise ValueError("Rack identity save requires uuid for existing racks")

            rack_uuid = incoming_uuid or _new_uuid()
            if rack_uuid in payload_uuids:
                raise ValueError(f"Duplicate rack uuid in payload: {rack_uuid}")
            payload_uuids.add(rack_uuid)

            logger.warning(
                "Saving rack payload (identity path): uuid=%s x=%r y=%r width=%r height=%r",
                rack_uuid,
                r_data.get("x"),
                r_data.get("y"),
                r_data.get("width"),
                r_data.get("height"),
            )
            try:
                rack = existing_racks_by_uuid.get(rack_uuid)
                is_new_rack = rack is None
                if rack is None:
                    rack = Rack(layout_id=layout.id, uuid=rack_uuid)

                if not self._apply_rack_fields(rack, {**r_data, "uuid": rack_uuid}, idx, is_new=is_new_rack):
                    continue
                self.db.add(rack)
                self.db.flush()

                if not BIN_IDENTITY_SAVE_ENABLED:
                    if is_new_rack:
                        bin_rows = self._build_default_bin_rows_for_new_rack(rack, r_data)
                        self._sync_storage_locations(warehouse_id, rack, r_data.get("internal_structure"), bin_rows)
                        self._sync_locations_from_bins(warehouse_id, rack, r_data.get("internal_structure"), bin_rows)
                    else:
                        existing_bin_rows = sorted(
                            ((b, b.level_index, b.segment_index) for b in self._active_bins_for_rack(rack)),
                            key=lambda row: (row[1], row[2]),
                        )
                        if existing_bin_rows:
                            self._sync_storage_locations(warehouse_id, rack, r_data.get("internal_structure"), existing_bin_rows)
                            self._sync_locations_from_bins(warehouse_id, rack, r_data.get("internal_structure"), existing_bin_rows)
                    continue

                vol_per_bin = _bin_volume_dm3(
                    r_data.get("length_cm", 100),
                    r_data.get("width_cm", 80),
                    r_data.get("height_cm", 200),
                    r_data.get("levels", 4),
                    r_data.get("bins_per_level", 4),
                )
                payload_bins = sorted(
                    r_data.get("bins") or [],
                    key=lambda b: (int(b.get("level_index", 0)), int(b.get("segment_index", 0))),
                )
                synced_bin_rows: list[tuple[Bin, int, int]] = []
                for bin_data in payload_bins:
                    logger.warning(
                        "Saving bin payload: rack_uuid=%s location_uuid=%r label=%r",
                        rack_uuid,
                        bin_data.get("location_uuid"),
                        bin_data.get("label"),
                    )
                    try:
                        incoming_loc_uuid = _normalize_uuid(bin_data.get("location_uuid"))
                        if incoming_loc_uuid is not None and incoming_loc_uuid in payload_bin_uuids:
                            raise ValueError(f"Duplicate bin location_uuid in payload: {incoming_loc_uuid}")

                        bin_row = existing_bins_by_location_uuid.get(incoming_loc_uuid) if incoming_loc_uuid is not None else None
                        if bin_row is None:
                            bin_row = Bin(
                                rack_id=rack.id,
                                location_uuid=incoming_loc_uuid or _new_uuid(),
                                is_active=True,
                            )
                            self.db.add(bin_row)

                        self._apply_bin_fields(bin_row, rack, bin_data, vol_per_bin)
                        if not bin_row.label:
                            raise ValueError("Bin label missing before flush")
                        self.db.add(bin_row)
                        self.db.flush()
                        existing_bins_by_location_uuid[_normalize_uuid(bin_row.location_uuid)] = bin_row
                        payload_bin_uuids.add(_normalize_uuid(bin_row.location_uuid))
                        synced_bin_rows.append((bin_row, bin_row.level_index, bin_row.segment_index))
                    except Exception:
                        logger.exception(
                            "FAILED BIN. rack_uuid=%s full bin payload: %s",
                            rack_uuid,
                            bin_data,
                        )
                        raise

                if synced_bin_rows:
                    self._sync_storage_locations(warehouse_id, rack, r_data.get("internal_structure"), synced_bin_rows)
                    self._sync_locations_from_bins(warehouse_id, rack, r_data.get("internal_structure"), synced_bin_rows)
            except Exception:
                logger.exception("Rack save failed (identity path). Full rack payload: %s", r_data)
                raise

        for rack in existing_racks:
            rack_uuid = _normalize_uuid(getattr(rack, "uuid", None))
            if rack_uuid is None or rack_uuid in payload_uuids:
                continue
            rack.is_active = False
            self.db.add(rack)

        if BIN_IDENTITY_SAVE_ENABLED:
            for bin_row in existing_bins:
                loc_uuid = _normalize_uuid(getattr(bin_row, "location_uuid", None))
                if loc_uuid is None or loc_uuid in payload_bin_uuids:
                    continue
                bin_row.is_active = False
                self.db.add(bin_row)
                self.db.query(Location).execution_options(include_inactive=True).filter(
                    Location.warehouse_id == warehouse_id,
                    Location.location_uuid == loc_uuid,
                ).update({"is_active": False}, synchronize_session=False)

    def _upsert_layout_aisles(self, layout: WarehouseLayout, data: dict) -> None:
        existing_aisles = (
            self.db.query(Aisle)
            .filter(Aisle.layout_id == layout.id)
            .all()
        )
        existing_aisles_by_id = {
            aisle.id: aisle
            for aisle in existing_aisles
            if isinstance(aisle.id, int)
        }
        payload_aisles = data.get("aisles", [])
        payload_ids: set[int] = set()

        for a_data in payload_aisles:
            aisle_id = a_data.get("id") if isinstance(a_data.get("id"), int) else None
            if aisle_id is not None and aisle_id in payload_ids:
                raise ValueError(f"Duplicate aisle id in payload: {aisle_id}")

            aisle = existing_aisles_by_id.get(aisle_id) if aisle_id is not None else None
            if aisle is None:
                aisle = Aisle(layout_id=layout.id)
                self.db.add(aisle)

            aisle.name = a_data.get("name")
            aisle.x = a_data.get("x", 0)
            aisle.y = a_data.get("y", 0)
            aisle.width = a_data.get("width", 1)
            aisle.height = a_data.get("height", 1)
            aisle.two_way = 1 if a_data.get("two_way", True) else 0
            self.db.add(aisle)
            self.db.flush()

            if aisle.id is not None:
                payload_ids.add(aisle.id)

        for aisle in existing_aisles:
            if aisle.id is not None and aisle.id in payload_ids:
                continue
            self.db.delete(aisle)

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
                location_id=None,
                rack_id=rack.id,
                bin_id=b.id,
                is_active=True,
                x_cm=x_cm,
                y_cm=y_cm,
                z_cm=z_cm,
            ))

    def _sync_storage_locations_from_bins(self, layout_id: int, warehouse_id: int) -> None:
        bin_rack_rows = (
            self.db.query(Bin, Rack)
            .join(Rack, Bin.rack_id == Rack.id)
            .execution_options(include_inactive=True)
            .filter(Rack.layout_id == layout_id)
            .all()
        )
        if not bin_rack_rows:
            return

        location_uuids = [
            loc_uuid
            for loc_uuid in (_normalize_uuid(getattr(bin_row, "location_uuid", None)) for bin_row, _rack in bin_rack_rows)
            if loc_uuid is not None
        ]
        locations_by_uuid = self._load_locations_by_uuids_batched(warehouse_id, location_uuids)

        existing_storage_locations = (
            self.db.query(StorageLocation)
            .filter(StorageLocation.warehouse_id == warehouse_id)
            .order_by(StorageLocation.id.asc())
            .all()
        )

        storage_by_location_id: dict[int, list[StorageLocation]] = {}
        storage_by_bin_id: dict[int, list[StorageLocation]] = {}
        for storage_location in existing_storage_locations:
            if storage_location.location_id is not None:
                storage_by_location_id.setdefault(storage_location.location_id, []).append(storage_location)
            if storage_location.bin_id is not None:
                storage_by_bin_id.setdefault(storage_location.bin_id, []).append(storage_location)

        active_storage_ids: set[int] = set()
        for bin_row, rack in bin_rack_rows:
            loc_uuid = _normalize_uuid(getattr(bin_row, "location_uuid", None))
            if loc_uuid is None:
                continue
            location = locations_by_uuid.get(loc_uuid)
            if location is None:
                logger.warning("StorageLocation sync skipped: no Location for bin location_uuid=%s", loc_uuid)
                continue

            same_location_rows = storage_by_location_id.get(location.id, [])
            same_bin_rows = storage_by_bin_id.get(bin_row.id, []) if bin_row.id is not None else []
            canonical = (same_location_rows[0] if same_location_rows else (same_bin_rows[0] if same_bin_rows else None))

            is_active_bin = bool(getattr(bin_row, "is_active", True)) and bool(getattr(rack, "is_active", True))
            if is_active_bin:
                internal_structure = None
                if rack.internal_structure:
                    try:
                        internal_structure = json.loads(rack.internal_structure)
                    except (json.JSONDecodeError, TypeError):
                        internal_structure = None
                x_cm, y_cm, z_cm = _bin_coords_cm(rack, bin_row.level_index, bin_row.segment_index, internal_structure)
                if canonical is None:
                    canonical = StorageLocation(
                        warehouse_id=warehouse_id,
                        location_id=location.id,
                        rack_id=rack.id,
                        bin_id=bin_row.id,
                        is_active=True,
                        x_cm=x_cm,
                        y_cm=y_cm,
                        z_cm=z_cm,
                    )
                    self.db.add(canonical)
                    self.db.flush()
                    storage_by_location_id.setdefault(location.id, []).append(canonical)
                    if bin_row.id is not None:
                        storage_by_bin_id.setdefault(bin_row.id, []).append(canonical)
                canonical.warehouse_id = warehouse_id
                canonical.location_id = location.id
                canonical.rack_id = rack.id
                canonical.bin_id = bin_row.id
                canonical.is_active = True
                canonical.x_cm = x_cm
                canonical.y_cm = y_cm
                canonical.z_cm = z_cm
                self.db.add(canonical)
                if canonical.id is not None:
                    active_storage_ids.add(canonical.id)

                for duplicate in same_location_rows:
                    if canonical.id is not None and duplicate.id == canonical.id:
                        continue
                    duplicate.location_id = location.id
                    duplicate.is_active = False
                    self.db.add(duplicate)
                continue

            for storage_location in list({id(row): row for row in [*same_location_rows, *same_bin_rows]}.values()):
                storage_location.location_id = location.id
                storage_location.is_active = False
                self.db.add(storage_location)

        for storage_location in existing_storage_locations:
            if storage_location.id in active_storage_ids:
                continue
            if storage_location.location_id is not None and storage_location.location_id in storage_by_location_id:
                if storage_location.id not in active_storage_ids:
                    storage_location.is_active = False
                    self.db.add(storage_location)

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
                "visual_elements": [],
                "row_containers": [],
                "wall_elements": [],
            }
        self._ensure_layout_identity(layout)

        racks_out = []
        for r in (layout.racks or []):
            if not bool(getattr(r, "is_active", True)):
                continue
            bins_out = [
                {
                    "id": b.id,
                    "location_uuid": getattr(b, "location_uuid", None),
                    "label": b.label,
                    "barcode_data": getattr(b, "barcode", None) or b.label,
                    "level_index": b.level_index,
                    "segment_index": b.segment_index,
                    "volume_dm3": round(b.volume_dm3, 2),
                    "current_load_dm3": round(b.current_load_dm3, 2),
                    "storage_type": normalize_storage_type(getattr(b, "storage_type", None)),
                }
                for b in sorted(
                    [bin_row for bin_row in (r.bins or []) if bool(getattr(bin_row, "is_active", True))],
                    key=lambda x: (x.level_index, x.segment_index),
                )
            ]
            active_bins = [bin_row for bin_row in (r.bins or []) if bool(getattr(bin_row, "is_active", True))]
            total_vol = sum(b.volume_dm3 for b in active_bins)
            used_vol = sum(b.current_load_dm3 for b in active_bins)
            internal_structure = None
            if r.internal_structure:
                try:
                    internal_structure = json.loads(r.internal_structure)
                except (json.JSONDecodeError, TypeError):
                    pass
            racks_out.append({
                "id": r.id,
                "uuid": getattr(r, "uuid", None),
                "rack_type": getattr(r, "rack_type", None) or "warehouse",
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
        visual_elements = []
        if getattr(layout, "visual_elements_json", None):
            try:
                visual_elements = json.loads(layout.visual_elements_json)
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
            "visual_elements": visual_elements,
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

    def _cleanup_product_assigned_locations_after_layout_save(
        self, tenant_id: int, layout_id: int, warehouse_id: int
    ) -> None:
        """
        Remove assigned_locations entries that no longer point at an active bin in this layout.
        Preserves assignments valid in other warehouses (same tenant). Does not touch inventory quantities.
        """
        # TODO: remove after verifying cleanup + include_inactive path in production
        logger.info("Running cleanup with include_inactive=True")
        active_this_layout_rows = (
            self.db.query(Bin.location_uuid)
            .join(Rack, Bin.rack_id == Rack.id)
            .filter(Rack.layout_id == layout_id, Bin.location_uuid.isnot(None))
            .all()
        )
        active_this_layout = _location_uuid_set_from_query_rows(active_this_layout_rows)

        all_bins_layout_rows = (
            self.db.query(Bin.location_uuid)
            .join(Rack, Bin.rack_id == Rack.id)
            .filter(Rack.layout_id == layout_id, Bin.location_uuid.isnot(None))
            .execution_options(include_inactive=True)
            .all()
        )
        all_bins_this_layout = _location_uuid_set_from_query_rows(all_bins_layout_rows)

        active_tenant_rows = (
            self.db.query(Bin.location_uuid)
            .join(Rack, Bin.rack_id == Rack.id)
            .join(WarehouseLayout, Rack.layout_id == WarehouseLayout.id)
            .join(
                TenantWarehouse,
                TenantWarehouse.warehouse_id == WarehouseLayout.warehouse_id,
            )
            .filter(TenantWarehouse.tenant_id == tenant_id, Bin.location_uuid.isnot(None))
            .all()
        )
        active_tenant_wide = _location_uuid_set_from_query_rows(active_tenant_rows)

        prod_rows = (
            self.db.query(Product.id, Product.assigned_locations)
            .filter(
                Product.tenant_id == tenant_id,
                Product.assigned_locations.isnot(None),
                Product.assigned_locations != "",
            )
            .all()
        )
        removed_entries = 0
        updates: list[dict] = []
        for pid, raw in prod_rows:
            entries = _parse_assigned_locations_cleanup(raw)
            if not entries:
                continue
            filtered = [
                e
                for e in entries
                if _assigned_entry_keeps_after_layout_save(
                    e, active_this_layout, all_bins_this_layout, active_tenant_wide
                )
            ]
            dropped = len(entries) - len(filtered)
            if dropped <= 0:
                continue
            removed_entries += dropped
            new_json = json.dumps(filtered)
            updates.append({"id": pid, "assigned_locations": new_json})

        if updates:
            self.db.bulk_update_mappings(Product, updates)
        if removed_entries:
            logger.info(
                "Layout save: removed %s assigned_locations reference(s) from %s product(s) "
                "(tenant_id=%s warehouse_id=%s layout_id=%s)",
                removed_entries,
                len(updates),
                tenant_id,
                warehouse_id,
                layout_id,
            )

    def save_layout(self, tenant_id: int, warehouse_id: int, data: dict) -> dict:
        try:
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
                    visual_elements_json=json.dumps(data.get("visual_elements") or []) if data.get("visual_elements") else None,
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
                if "visual_elements" in data:
                    visual_elements = data.get("visual_elements")
                    layout.visual_elements_json = json.dumps(visual_elements) if visual_elements else None
                if "wall_elements" in data:
                    wall_el = data.get("wall_elements")
                    layout.wall_elements_json = json.dumps(wall_el) if wall_el else None
                self.db.add(layout)
            self._ensure_layout_identity(layout)

            warehouse_id = layout.warehouse_id
            rack_payloads = data.get("racks", [])
            skip_rack_updates = self._has_incomplete_rack_payload(rack_payloads)
            if skip_rack_updates:
                logger.warning("Skipping all rack persistence for warehouse_id=%s due to incomplete rack payload", warehouse_id)
            elif RACK_IDENTITY_SAVE_ENABLED:
                self._save_layout_racks_by_identity(layout, data, warehouse_id)
            else:
                self._replace_layout_racks_legacy(layout, data, warehouse_id)
            # Flush so pending Bin/Location rows are visible; then ensure Location per bin before StorageLocation sync.
            self.db.flush()
            self._ensure_missing_locations_for_layout_bins(layout.id, warehouse_id)
            self._sync_storage_locations_from_bins(layout.id, warehouse_id)
            self._upsert_layout_aisles(layout, data)
            self._cleanup_product_assigned_locations_after_layout_save(
                tenant_id, layout.id, warehouse_id
            )
            self.db.commit()
            self.db.refresh(layout)
            # Regenerate warehouse navigation graph after any layout change (graph generation pipeline only).
            # Keeps API / route_engine unchanged; only graph content updates to avoid new obstacles.
            try:
                from .warehouse_graph_service import WarehouseGraphService
                WarehouseGraphService(self.db).build_graph(warehouse_id)
            except Exception:
                logger.exception("Graph rebuild after layout save failed (warehouse_id=%s)", warehouse_id)
            assign_locations_to_graph_nodes(self.db, warehouse_id)
            return self.get_layout(tenant_id, warehouse_id)
        except Exception:
            logger.exception(
                "save_layout failed (tenant_id=%s, warehouse_id=%s). Payload summary: racks=%s aisles=%s visual_elements=%s row_containers=%s. Full payload: %s",
                tenant_id,
                warehouse_id,
                len(data.get("racks") or []),
                len(data.get("aisles") or []),
                len(data.get("visual_elements") or []),
                len(data.get("row_containers") or []),
                data,
            )
            raise
