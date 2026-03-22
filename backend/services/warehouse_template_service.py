import json
from sqlalchemy.orm import Session
from fastapi import HTTPException

from ..models.warehouse_template import WarehouseTemplate
from ..storage_types import normalize_storage_type


def _reserve_bin_keys_to_json(keys: list | None) -> str | None:
    if keys is None or len(keys) == 0:
        return None
    return json.dumps(keys)


def _reserve_bin_keys_from_json(raw: str | None) -> list | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _bin_type_map_to_json(mapping: dict | None) -> str | None:
    if mapping is None or len(mapping) == 0:
        return None
    normalized: dict[str, str] = {}
    for key, value in mapping.items():
        if not isinstance(key, str):
            continue
        cell_key = key.strip()
        if not cell_key:
            continue
        normalized[cell_key] = normalize_storage_type(value)
    return json.dumps(normalized) if normalized else None


def _bin_type_map_from_json(raw: str | None) -> dict[str, str] | None:
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    normalized: dict[str, str] = {}
    for key, value in payload.items():
        if not isinstance(key, str):
            continue
        cell_key = key.strip()
        if not cell_key:
            continue
        normalized[cell_key] = normalize_storage_type(value)
    return normalized or None


def _legacy_reserve_keys_to_bin_type_map(keys: list | None) -> dict[str, str] | None:
    if not keys:
        return None
    out: dict[str, str] = {}
    for key in keys:
        if not isinstance(key, str):
            continue
        cell_key = key.strip()
        if not cell_key:
            continue
        out[cell_key] = "reserve"
    return out or None


def _reserve_keys_from_bin_type_map(mapping: dict[str, str] | None) -> list[str] | None:
    if not mapping:
        return None
    keys = [key for key, value in mapping.items() if normalize_storage_type(value) == "reserve"]
    return keys or None


def _effective_bin_type_map(payload: dict | None = None, row: WarehouseTemplate | None = None) -> dict[str, str] | None:
    payload = payload or {}
    if "bin_type_map" in payload:
        return _bin_type_map_from_json(_bin_type_map_to_json(payload.get("bin_type_map")))
    if "reserve_bin_keys" in payload:
        return _legacy_reserve_keys_to_bin_type_map(payload.get("reserve_bin_keys"))
    if row is not None:
        current = _bin_type_map_from_json(getattr(row, "bin_type_map_json", None))
        if current:
            return current
        return _legacy_reserve_keys_to_bin_type_map(_reserve_bin_keys_from_json(getattr(row, "reserve_bin_keys", None)))
    return None


class WarehouseTemplateService:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self, tenant_id: int) -> list[dict]:
        rows = self.db.query(WarehouseTemplate).filter(
            WarehouseTemplate.tenant_id == tenant_id,
        ).order_by(WarehouseTemplate.created_at.desc()).all()
        return [
            {
                "id": r.template_uid,
                "name": r.name,
                "color": r.color,
                "width_cm": r.width_cm,
                "depth_cm": r.depth_cm,
                "height_cm": r.height_cm,
                "levels": r.levels,
                "bins_per_level": r.bins_per_level,
                "aisle_letter": r.aisle_letter,
                "rowId": r.row_id,
                "sectionStartIndex": r.section_start_index,
                "nextSectionIndex": r.next_section_index,
                "addressPattern": r.address_pattern,
                "naming_pattern": r.naming_pattern,
                "binNamingType": r.bin_naming_type or "numeric",
                "autoSectionNumbering": r.auto_section_numbering or False,
                "bin_type_map": _effective_bin_type_map(row=r),
                "reserve_bin_keys": _reserve_bin_keys_from_json(r.reserve_bin_keys),
                "level_max_load_kg": float(r.level_max_load_kg) if r.level_max_load_kg is not None else None,
            }
            for r in rows
        ]

    def create(self, tenant_id: int, payload: dict) -> dict:
        template_uid = payload.get("id") or ""
        if not template_uid:
            raise HTTPException(status_code=400, detail="Template id (uuid) is required")
        existing = self.db.query(WarehouseTemplate).filter(
            WarehouseTemplate.template_uid == template_uid,
            WarehouseTemplate.tenant_id == tenant_id,
        ).first()
        if existing:
            self._update_existing(existing, payload)
            self.db.commit()
            self.db.refresh(existing)
            return self._row_to_dict(existing)
        effective_bin_type_map = _effective_bin_type_map(payload=payload)
        t = WarehouseTemplate(
            template_uid=template_uid,
            tenant_id=tenant_id,
            name=payload.get("name", "Własny regał"),
            color=payload.get("color", "#3b82f6"),
            width_cm=float(payload.get("width_cm", 120)),
            depth_cm=float(payload.get("depth_cm", 80)),
            height_cm=float(payload.get("height_cm", 200)),
            levels=int(payload.get("levels", 4)),
            bins_per_level=int(payload.get("bins_per_level", 4)),
            aisle_letter=str(payload.get("aisle_letter", "A")),
            row_id=payload.get("rowId"),
            section_start_index=payload.get("sectionStartIndex"),
            next_section_index=payload.get("nextSectionIndex"),
            address_pattern=payload.get("addressPattern"),
            naming_pattern=payload.get("naming_pattern"),
            bin_naming_type=str(payload.get("binNamingType", "numeric")),
            auto_section_numbering=bool(payload.get("autoSectionNumbering", False)),
            bin_type_map_json=_bin_type_map_to_json(effective_bin_type_map),
            reserve_bin_keys=_reserve_bin_keys_to_json(
                payload.get("reserve_bin_keys")
                if "reserve_bin_keys" in payload
                else _reserve_keys_from_bin_type_map(effective_bin_type_map)
            ),
            level_max_load_kg=float(payload["level_max_load_kg"]) if payload.get("level_max_load_kg") is not None else 500.0,
        )
        self.db.add(t)
        self.db.commit()
        self.db.refresh(t)
        return self._row_to_dict(t)

    def _update_existing(self, row: WarehouseTemplate, payload: dict) -> None:
        row.name = payload.get("name", row.name)
        row.color = payload.get("color", row.color)
        row.width_cm = float(payload.get("width_cm", row.width_cm))
        row.depth_cm = float(payload.get("depth_cm", row.depth_cm))
        row.height_cm = float(payload.get("height_cm", row.height_cm))
        row.levels = int(payload.get("levels", row.levels))
        row.bins_per_level = int(payload.get("bins_per_level", row.bins_per_level))
        row.aisle_letter = str(payload.get("aisle_letter", row.aisle_letter))
        row.row_id = payload.get("rowId", row.row_id)
        row.section_start_index = payload.get("sectionStartIndex", row.section_start_index)
        row.next_section_index = payload.get("nextSectionIndex", row.next_section_index)
        row.address_pattern = payload.get("addressPattern", row.address_pattern)
        row.naming_pattern = payload.get("naming_pattern", row.naming_pattern)
        row.bin_naming_type = str(payload.get("binNamingType", row.bin_naming_type or "numeric"))
        row.auto_section_numbering = bool(payload.get("autoSectionNumbering", row.auto_section_numbering))
        if "bin_type_map" in payload or "reserve_bin_keys" in payload:
            effective_bin_type_map = _effective_bin_type_map(payload=payload, row=row)
            row.bin_type_map_json = _bin_type_map_to_json(effective_bin_type_map)
            row.reserve_bin_keys = _reserve_bin_keys_to_json(
                payload.get("reserve_bin_keys")
                if "reserve_bin_keys" in payload
                else _reserve_keys_from_bin_type_map(effective_bin_type_map)
            )
        if "level_max_load_kg" in payload:
            row.level_max_load_kg = float(payload["level_max_load_kg"]) if payload.get("level_max_load_kg") is not None else None

    def _row_to_dict(self, r: WarehouseTemplate) -> dict:
        return {
            "id": r.template_uid,
            "name": r.name,
            "color": r.color,
            "width_cm": r.width_cm,
            "depth_cm": r.depth_cm,
            "height_cm": r.height_cm,
            "levels": r.levels,
            "bins_per_level": r.bins_per_level,
            "aisle_letter": r.aisle_letter,
            "rowId": r.row_id,
            "sectionStartIndex": r.section_start_index,
            "nextSectionIndex": r.next_section_index,
            "addressPattern": r.address_pattern,
            "naming_pattern": r.naming_pattern,
            "binNamingType": r.bin_naming_type or "numeric",
            "autoSectionNumbering": r.auto_section_numbering or False,
            "bin_type_map": _effective_bin_type_map(row=r),
            "reserve_bin_keys": _reserve_bin_keys_from_json(r.reserve_bin_keys),
            "level_max_load_kg": float(r.level_max_load_kg) if r.level_max_load_kg is not None else None,
        }

    def delete(self, tenant_id: int, template_uid: str) -> None:
        row = self.db.query(WarehouseTemplate).filter(
            WarehouseTemplate.tenant_id == tenant_id,
            WarehouseTemplate.template_uid == template_uid,
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail="Template not found")
        self.db.delete(row)
        self.db.commit()
