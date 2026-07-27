"""Warehouse printing feature flags."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.printing.printing_warehouse_setting import PrintingWarehouseSetting
from ...schemas.printing.warehouse_settings import (
    PrintingWarehouseSettingsRead,
    PrintingWarehouseSettingsUpdate,
)


def get_warehouse_printing_settings(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> dict:
    row = (
        db.query(PrintingWarehouseSetting)
        .filter(
            PrintingWarehouseSetting.tenant_id == tenant_id,
            PrintingWarehouseSetting.warehouse_id == warehouse_id,
        )
        .first()
    )
    prefer = bool(row.prefer_sasist_agent) if row is not None else False
    return {
        "tenant_id": tenant_id,
        "warehouse_id": warehouse_id,
        "prefer_sasist_agent": prefer,
    }


def update_warehouse_printing_settings(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    payload: PrintingWarehouseSettingsUpdate,
) -> dict:
    row = (
        db.query(PrintingWarehouseSetting)
        .filter(
            PrintingWarehouseSetting.tenant_id == tenant_id,
            PrintingWarehouseSetting.warehouse_id == warehouse_id,
        )
        .first()
    )
    if row is None:
        row = PrintingWarehouseSetting(tenant_id=tenant_id, warehouse_id=warehouse_id)
        db.add(row)
    if payload.prefer_sasist_agent is not None:
        row.prefer_sasist_agent = bool(payload.prefer_sasist_agent)
    db.commit()
    db.refresh(row)
    return get_warehouse_printing_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


def is_prefer_sasist_agent(db: Session, *, tenant_id: int, warehouse_id: int | None) -> bool:
    if warehouse_id is None:
        return False
    data = get_warehouse_printing_settings(db, tenant_id=tenant_id, warehouse_id=int(warehouse_id))
    return bool(data.get("prefer_sasist_agent"))


def to_read_model(data: dict) -> PrintingWarehouseSettingsRead:
    return PrintingWarehouseSettingsRead(**data)
