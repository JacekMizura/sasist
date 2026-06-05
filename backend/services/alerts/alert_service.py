"""Operational alerts — low stock, SLA, blocked flows."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.operational_alert import ALERT_ACK, ALERT_OPEN, OperationalAlert
from ..live.constants import EVENT_ALERT_CREATED
from ..live.publisher import publish_live_event

logger = logging.getLogger(__name__)


def create_operational_alert(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    alert_type: str,
    title: str,
    message: str | None = None,
    severity: str = "INFO",
    entity_type: str | None = None,
    entity_id: int | None = None,
    payload: dict[str, Any] | None = None,
) -> OperationalAlert:
    row = OperationalAlert(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        alert_type=str(alert_type).strip().upper(),
        severity=str(severity).strip().upper(),
        status=ALERT_OPEN,
        title=str(title)[:128],
        message=str(message) if message else None,
        entity_type=str(entity_type) if entity_type else None,
        entity_id=int(entity_id) if entity_id else None,
        payload_json=json.dumps(payload or {}, ensure_ascii=False),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    publish_live_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVENT_ALERT_CREATED,
        payload={
            "alert_id": row.id,
            "alert_type": row.alert_type,
            "severity": row.severity,
            "title": row.title,
        },
    )
    logger.info(
        "[replenishment.engine] alert_created id=%s type=%s",
        row.id,
        row.alert_type,
    )
    return row


def list_open_alerts(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    limit: int = 50,
) -> list[OperationalAlert]:
    return list(
        db.query(OperationalAlert)
        .filter(
            OperationalAlert.tenant_id == int(tenant_id),
            OperationalAlert.warehouse_id == int(warehouse_id),
            OperationalAlert.status == ALERT_OPEN,
        )
        .order_by(OperationalAlert.created_at.desc())
        .limit(int(limit))
        .all()
    )


def ack_operational_alert(
    db: Session,
    alert: OperationalAlert,
    *,
    user_id: int,
) -> OperationalAlert:
    alert.status = ALERT_ACK
    alert.acked_at = datetime.utcnow()
    alert.acked_by_user_id = int(user_id)
    db.flush()
    return alert
