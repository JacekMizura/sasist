import json
from sqlalchemy.orm import Session
from fastapi import HTTPException

from ..models.warehouse_template import WarehouseTemplate


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
                "reserve_bin_keys": _reserve_bin_keys_from_json(r.reserve_bin_keys),
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
            reserve_bin_keys=_reserve_bin_keys_to_json(payload.get("reserve_bin_keys")),
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
        row.reserve_bin_keys = _reserve_bin_keys_to_json(payload.get("reserve_bin_keys"))

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
            "reserve_bin_keys": _reserve_bin_keys_from_json(r.reserve_bin_keys),
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
