"""Mobile / Zebra device sessions."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.device_session import DEVICE_SESSION_ACTIVE, DEVICE_SESSION_CLOSED, DeviceSession

logger = logging.getLogger(__name__)


def upsert_device_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    device_key: str,
    operator_user_id: int | None = None,
    workflow_type: str = "PICKING",
    device_kind: str = "SCANNER",
    payload: dict[str, Any] | None = None,
    battery_pct: int | None = None,
    network_state: str | None = None,
) -> DeviceSession:
    key = str(device_key).strip()
    row = (
        db.query(DeviceSession)
        .filter(
            DeviceSession.tenant_id == int(tenant_id),
            DeviceSession.warehouse_id == int(warehouse_id),
            DeviceSession.device_key == key,
            DeviceSession.status == DEVICE_SESSION_ACTIVE,
        )
        .first()
    )
    if row is None:
        row = DeviceSession(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            device_key=key,
            created_at=datetime.utcnow(),
        )
        db.add(row)

    row.operator_user_id = int(operator_user_id) if operator_user_id else None
    row.workflow_type = str(workflow_type).strip().upper()
    row.device_kind = str(device_kind).strip().upper()
    row.status = DEVICE_SESSION_ACTIVE
    row.battery_pct = int(battery_pct) if battery_pct is not None else None
    row.network_state = str(network_state).strip().upper() if network_state else None
    if payload:
        row.payload_json = json.dumps(payload, ensure_ascii=False)
    row.last_seen_at = datetime.utcnow()
    db.flush()
    logger.info(
        "[runtime.context] device_session id=%s device_key=%s workflow=%s",
        row.id,
        key,
        row.workflow_type,
    )
    return row


def touch_device_session(db: Session, session: DeviceSession) -> DeviceSession:
    session.last_seen_at = datetime.utcnow()
    db.flush()
    return session


def close_device_session(db: Session, session: DeviceSession) -> DeviceSession:
    session.status = DEVICE_SESSION_CLOSED
    session.closed_at = datetime.utcnow()
    session.last_seen_at = datetime.utcnow()
    db.flush()
    return session
