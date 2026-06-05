"""Operator runtime context SSOT."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.operator_runtime_context import OperatorRuntimeContext
from ..live.publisher import publish_live_event

logger = logging.getLogger(__name__)


def get_operator_context(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: int,
) -> OperatorRuntimeContext | None:
    return (
        db.query(OperatorRuntimeContext)
        .filter(
            OperatorRuntimeContext.tenant_id == int(tenant_id),
            OperatorRuntimeContext.warehouse_id == int(warehouse_id),
            OperatorRuntimeContext.operator_user_id == int(operator_user_id),
        )
        .first()
    )


def upsert_operator_context(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: int,
    context_type: str,
    cart_id: int | None = None,
    zone_id: int | None = None,
    active_task_id: int | None = None,
    payload: dict[str, Any] | None = None,
) -> OperatorRuntimeContext:
    row = get_operator_context(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        operator_user_id=operator_user_id,
    )
    if row is None:
        row = OperatorRuntimeContext(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            operator_user_id=int(operator_user_id),
        )
        db.add(row)

    row.context_type = str(context_type).strip().upper()
    row.cart_id = int(cart_id) if cart_id else None
    row.zone_id = int(zone_id) if zone_id else None
    row.active_task_id = int(active_task_id) if active_task_id else None
    if payload:
        row.payload_json = json.dumps(payload, ensure_ascii=False)
    row.updated_at = datetime.utcnow()
    db.flush()

    publish_live_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type="runtime.context.updated",
        payload={
            "operator_user_id": int(operator_user_id),
            "context_type": row.context_type,
            "cart_id": row.cart_id,
            "zone_id": row.zone_id,
            "active_task_id": row.active_task_id,
        },
    )
    logger.info(
        "[runtime.context] operator=%s type=%s cart=%s zone=%s",
        operator_user_id,
        row.context_type,
        row.cart_id,
        row.zone_id,
    )
    return row
