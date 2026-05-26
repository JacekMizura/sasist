"""
Publiczny, tylko-do-odczytu dostęp do konfiguracji zbierania.

Użyj ``getPickingConfig`` (alias) poza warstwą API — bez efektów ubocznych.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from ..models.picking_config import PickingConfig


def get_picking_config(db: Session, tenant_id: int, warehouse_id: int, status_id: int) -> Optional[PickingConfig]:
    """Zwraca ``PickingConfig`` dla ``source_status_id == status_id`` lub ``None``."""
    return (
        db.query(PickingConfig)
        .filter(
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
            PickingConfig.source_status_id == int(status_id),
        )
        .first()
    )


# Jawny alias pod integrację (camelCase wg konwencji użytkownika)
getPickingConfig = get_picking_config
