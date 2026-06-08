"""Inventory count audit trail — append-only, immutable event log."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.audit_event import InventoryAuditEvent


def _serialize_state(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


def log_inventory_audit(
    db: Session,
    *,
    tenant_id: int,
    action: str,
    inventory_document_id: int | None = None,
    inventory_document_line_id: int | None = None,
    inventory_task_id: int | None = None,
    user_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    detail: dict[str, Any] | None = None,
    previous_state: dict[str, Any] | None = None,
    next_state: dict[str, Any] | None = None,
    ip_address: str | None = None,
    session_id: int | None = None,
    device_id: str | None = None,
) -> InventoryAuditEvent:
    """Append-only audit row — never update or delete via this module."""
    row = InventoryAuditEvent(
        tenant_id=int(tenant_id),
        inventory_document_id=inventory_document_id,
        inventory_document_line_id=inventory_document_line_id,
        inventory_task_id=inventory_task_id,
        user_id=user_id,
        action=str(action),
        entity_type=entity_type,
        entity_id=entity_id,
        detail_json=_serialize_state(detail or {}),
        previous_state_json=_serialize_state(previous_state),
        next_state_json=_serialize_state(next_state),
        ip_address=ip_address,
        session_id=session_id,
        device_id=device_id,
    )
    db.add(row)
    return row


def forbid_audit_mutation() -> None:
    """Application guard — audit rows must never be updated or deleted."""
    raise RuntimeError("Inventory audit events are immutable")
