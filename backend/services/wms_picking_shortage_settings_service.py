"""Odczyt / zapis ustawień braków przy zbieraniu (tenant + magazyn)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models.wms_picking_shortage_settings import WmsPickingShortageSettings
from .tenant_default_warehouse import assert_tenant_warehouse_scope


def get_or_create_wms_picking_shortage_settings(db: Session, *, tenant_id: int, warehouse_id: int) -> WmsPickingShortageSettings:
    assert_tenant_warehouse_scope(db, tenant_id, warehouse_id)
    row = (
        db.query(WmsPickingShortageSettings)
        .filter(
            WmsPickingShortageSettings.tenant_id == int(tenant_id),
            WmsPickingShortageSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row:
        return row
    row = WmsPickingShortageSettings(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    db.add(row)
    db.flush()
    return row


def touch_wms_picking_shortage_settings_row(row: WmsPickingShortageSettings) -> None:
    row.updated_at = datetime.utcnow()


def is_shortage_auto_detach_enabled(settings: WmsPickingShortageSettings | None) -> bool:
    """
    Semantyka negatywnej flagi UI „Wyłącz auto-odpinanie zamówień z brakami z wózków”:

    - disable_auto_detach_missing_orders_from_carts = False (unchecked) → auto-detach ON
    - disable_auto_detach_missing_orders_from_carts = True (checked) → auto-detach OFF
    """
    if settings is None:
        return True
    return not bool(getattr(settings, "disable_auto_detach_missing_orders_from_carts", False))
