"""
SSOT odczytu konfiguracji produkcji.

Storage: wiersze ``picking_config`` z ``is_production_mode=True``.
Nie używaj surowego ``get_picking_config`` do triggera ORDERS / handoff — tu.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session, joinedload

from ..models.picking_config import PickingConfig


def _production_base_query(db: Session):
    return (
        db.query(PickingConfig)
        .options(
            joinedload(PickingConfig.source_status),
            joinedload(PickingConfig.status_after_production),
            joinedload(PickingConfig.status_on_component_shortage),
            joinedload(PickingConfig.status_awaiting_production),
            joinedload(PickingConfig.finished_goods_buffer_location),
        )
        .filter(PickingConfig.is_production_mode.is_(True))
    )


def get_production_config_by_id(
    db: Session,
    config_id: int,
    *,
    require_active: bool = False,
) -> Optional[PickingConfig]:
    """Odczyt po ID (historyczne MO: ``require_active=False``)."""
    q = _production_base_query(db).filter(PickingConfig.id == int(config_id))
    if require_active:
        q = q.filter(PickingConfig.is_active.is_(True))
    return q.first()


def get_production_config_by_source_status(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    *,
    require_active: bool = True,
) -> Optional[PickingConfig]:
    """Konfiguracja produkcji dla statusu wejściowego panelu zamówień."""
    q = _production_base_query(db).filter(
        PickingConfig.tenant_id == int(tenant_id),
        PickingConfig.warehouse_id == int(warehouse_id),
        PickingConfig.source_status_id == int(source_status_id),
    )
    if require_active:
        q = q.filter(PickingConfig.is_active.is_(True))
    return q.first()


def list_production_configs(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    include_inactive: bool = True,
) -> list[PickingConfig]:
    q = _production_base_query(db).filter(
        PickingConfig.tenant_id == int(tenant_id),
        PickingConfig.warehouse_id == int(warehouse_id),
    )
    if not include_inactive:
        q = q.filter(PickingConfig.is_active.is_(True))
    return list(q.order_by(PickingConfig.id.asc()).all())


def is_production_entry_status(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
) -> bool:
    row = get_production_config_by_source_status(
        db, tenant_id, warehouse_id, status_id, require_active=True
    )
    return row is not None
