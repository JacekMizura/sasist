"""Read / write warehouse general WMS settings (typography etc.)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models.wms_general_settings import (
    WMS_FONT_SIZE_DEFAULT_PX,
    WMS_FONT_SIZE_PX,
    WmsGeneralSettings,
)
from .tenant_default_warehouse import assert_tenant_warehouse_scope


def normalize_wms_font_size_px(value: object, *, default: int = WMS_FONT_SIZE_DEFAULT_PX) -> int:
    try:
        iv = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return int(default)
    if iv in WMS_FONT_SIZE_PX:
        return iv
    return int(default)


def get_or_create_wms_general_settings(
    db: Session, *, tenant_id: int, warehouse_id: int
) -> WmsGeneralSettings:
    assert_tenant_warehouse_scope(db, tenant_id, warehouse_id)
    row = (
        db.query(WmsGeneralSettings)
        .filter(
            WmsGeneralSettings.tenant_id == int(tenant_id),
            WmsGeneralSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row:
        return row
    row = WmsGeneralSettings(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        font_size_base_px=WMS_FONT_SIZE_DEFAULT_PX,
        font_size_location_px=WMS_FONT_SIZE_DEFAULT_PX,
        font_size_quantity_px=WMS_FONT_SIZE_DEFAULT_PX,
    )
    db.add(row)
    db.flush()
    return row


def touch_wms_general_settings_row(row: WmsGeneralSettings) -> None:
    row.updated_at = datetime.utcnow()


def general_settings_as_dict(row: WmsGeneralSettings) -> dict[str, int]:
    return {
        "font_size_base_px": normalize_wms_font_size_px(row.font_size_base_px),
        "font_size_location_px": normalize_wms_font_size_px(row.font_size_location_px),
        "font_size_quantity_px": normalize_wms_font_size_px(row.font_size_quantity_px),
    }
