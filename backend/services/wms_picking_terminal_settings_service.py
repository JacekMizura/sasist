"""Read / write warehouse picking terminal scan policy."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models.wms_picking_terminal_settings import WmsPickingTerminalSettings
from .tenant_default_warehouse import assert_tenant_warehouse_scope


def get_or_create_wms_picking_terminal_settings(
    db: Session, *, tenant_id: int, warehouse_id: int
) -> WmsPickingTerminalSettings:
    assert_tenant_warehouse_scope(db, tenant_id, warehouse_id)
    row = (
        db.query(WmsPickingTerminalSettings)
        .filter(
            WmsPickingTerminalSettings.tenant_id == int(tenant_id),
            WmsPickingTerminalSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row:
        return row
    row = WmsPickingTerminalSettings(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    db.add(row)
    db.flush()
    return row


def touch_wms_picking_terminal_settings_row(row: WmsPickingTerminalSettings) -> None:
    row.updated_at = datetime.utcnow()


def terminal_settings_as_dict(row: WmsPickingTerminalSettings) -> dict[str, bool]:
    return {
        "require_product_scan_at_least_once": bool(row.require_product_scan_at_least_once),
        "require_location_scan": bool(row.require_location_scan),
        "disable_force_location_scan_when_many_locations": bool(
            row.disable_force_location_scan_when_many_locations
        ),
        "allow_reserve_location_picking": bool(row.allow_reserve_location_picking),
    }


def location_scan_required(
    *,
    location_count: int,
    require_location_scan: bool,
    disable_force_when_many: bool,
) -> bool:
    """Shared policy: when must the operator scan/select a source location before pick."""
    if require_location_scan:
        return True
    if location_count > 1 and not disable_force_when_many:
        return True
    return False
