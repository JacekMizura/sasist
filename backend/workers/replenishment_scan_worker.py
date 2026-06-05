"""Periodic replenishment scan when engine flag is on."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..services.operational_features_context import build_operational_features_context
from ..services.replenishment.detection_service import scan_warehouse_replenishment
from ..services.tenant_default_warehouse import list_tenant_warehouse_ids

logger = logging.getLogger(__name__)


def run_replenishment_scan_worker(db: Session, *, tenant_id: int = 1, limit_warehouses: int = 5) -> int:
    """Scan warehouses for low shelf stock. Returns count of tasks created."""
    wh_ids = list_tenant_warehouse_ids(db, int(tenant_id))[: int(limit_warehouses)]
    total_created = 0
    for wh_id in wh_ids:
        ctx = build_operational_features_context(db, tenant_id=int(tenant_id), warehouse_id=int(wh_id))
        if not ctx.replenishment_engine_active:
            continue
        result = scan_warehouse_replenishment(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(wh_id),
            features=ctx,
        )
        total_created += int(result.get("created", 0))
    if total_created:
        logger.info(
            "[replenishment.engine] worker_scan tenant_id=%s created=%s",
            tenant_id,
            total_created,
        )
    return total_created
