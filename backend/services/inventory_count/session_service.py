"""WMS operator sessions for parallel counting."""

from __future__ import annotations

import secrets
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import SESSION_STATUS_ACTIVE, SESSION_STATUS_CLOSED
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.session import InventorySession
from .audit_service import log_inventory_audit
from .errors import InventorySessionNotFoundError


def _session_to_dict(session: InventorySession) -> dict[str, Any]:
    return {
        "id": session.id,
        "inventory_document_id": session.inventory_document_id,
        "inventory_task_id": session.inventory_task_id,
        "warehouse_id": session.warehouse_id,
        "user_id": session.user_id,
        "status": session.status,
        "device_id": session.device_id,
        "current_location_id": session.current_location_id,
        "scan_count": session.scan_count,
        "lines_counted": session.lines_counted,
        "session_token": session.session_token,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "last_activity_at": session.last_activity_at.isoformat() if session.last_activity_at else None,
    }


def open_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    document_id: int,
    task_id: int | None = None,
    user_id: int | None = None,
    device_id: str | None = None,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventorySessionNotFoundError("Inventory document not found for session")

    session = InventorySession(
        inventory_document_id=int(document_id),
        inventory_task_id=task_id,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        user_id=user_id,
        device_id=device_id,
        status=SESSION_STATUS_ACTIVE,
        session_token=secrets.token_urlsafe(24),
    )
    db.add(session)
    db.flush()
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(document_id),
        inventory_task_id=task_id,
        user_id=user_id,
        action="session.opened",
        entity_type="inventory_session",
        entity_id=session.id,
    )
    db.commit()
    db.refresh(session)
    return _session_to_dict(session)


def close_session(
    db: Session,
    *,
    tenant_id: int,
    session_id: int,
    user_id: int | None = None,
) -> dict[str, Any]:
    session = (
        db.query(InventorySession)
        .filter(InventorySession.id == int(session_id), InventorySession.tenant_id == int(tenant_id))
        .first()
    )
    if session is None:
        raise InventorySessionNotFoundError(f"Session {session_id} not found")
    session.status = SESSION_STATUS_CLOSED
    session.touch_activity()
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=session.inventory_document_id,
        user_id=user_id,
        action="session.closed",
        entity_type="inventory_session",
        entity_id=session.id,
    )
    db.commit()
    db.refresh(session)
    return _session_to_dict(session)


def heartbeat_session(
    db: Session,
    *,
    tenant_id: int,
    session_id: int,
    user_id: int | None = None,
    device_id: str | None = None,
) -> dict[str, Any]:
    from .concurrency_service import touch_session_heartbeat

    session = (
        db.query(InventorySession)
        .filter(InventorySession.id == int(session_id), InventorySession.tenant_id == int(tenant_id))
        .first()
    )
    if session is None:
        raise InventorySessionNotFoundError(f"Session {session_id} not found")
    if session.status != SESSION_STATUS_ACTIVE:
        raise InventorySessionNotFoundError("Session is not active")
    touch_session_heartbeat(db, session)
    if device_id:
        session.device_id = device_id
    db.commit()
    db.refresh(session)
    return _session_to_dict(session)
