"""Create replenishment tasks on unified wms_operational_tasks."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ...models.wms_operational_task import (
    ACTIVE_STATUSES,
    ORCH_QUEUED,
    STATUS_OPEN,
    TASK_GROUP_REPLENISHMENT,
    WmsOperationalTask,
)
from ..orchestration.lifecycle_service import init_orchestration_state

logger = logging.getLogger(__name__)


def _group_key(task_type: str, warehouse_id: int, product_id: int, zone_type: str) -> str:
    return f"replenishment:{warehouse_id}:{product_id}:{zone_type}:{task_type}"


def upsert_replenishment_operational_task(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    task_type: str,
    zone_type: str,
    quantity_required: float,
    shelf_qty: float,
    source_qty: float,
    rule_id: int | None = None,
    priority: int = 50,
) -> WmsOperationalTask:
    tt = str(task_type).strip().upper()
    zt = str(zone_type).strip().upper()
    gk = _group_key(tt, int(warehouse_id), int(product_id), zt)
    existing = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.group_key == gk,
            WmsOperationalTask.status.in_(ACTIVE_STATUSES),
        )
        .first()
    )
    payload = {
        "zone_type": zt,
        "shelf_qty": float(shelf_qty),
        "source_qty": float(source_qty),
        "rule_id": int(rule_id) if rule_id else None,
    }
    if existing is not None:
        existing.quantity_required = float(quantity_required)
        existing.priority = int(priority)
        existing.payload_json = json.dumps(payload, ensure_ascii=False)
        existing.updated_at = datetime.utcnow()
        return existing

    task = WmsOperationalTask(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        task_type=tt,
        task_group=TASK_GROUP_REPLENISHMENT,
        status=STATUS_OPEN,
        queue="DO_ROZLOKOWANIA",
        product_id=int(product_id),
        quantity_required=float(quantity_required),
        quantity_done=0.0,
        group_key=gk,
        source_event_id=f"replenishment:{product_id}:{zt}",
        priority=int(priority),
        payload_json=json.dumps(payload, ensure_ascii=False),
        sla_due_at=datetime.utcnow() + timedelta(hours=4),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    init_orchestration_state(task, ORCH_QUEUED)
    db.add(task)
    db.flush()
    logger.info(
        "[replenishment.engine] task_created id=%s product_id=%s zone=%s qty=%s",
        task.id,
        product_id,
        zt,
        quantity_required,
    )
    return task
