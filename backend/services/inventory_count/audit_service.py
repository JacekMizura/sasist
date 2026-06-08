"""Inventory count audit trail — append-only event log."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.audit_event import InventoryAuditEvent


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
    ip_address: str | None = None,
) -> InventoryAuditEvent:
    row = InventoryAuditEvent(
        tenant_id=int(tenant_id),
        inventory_document_id=inventory_document_id,
        inventory_document_line_id=inventory_document_line_id,
        inventory_task_id=inventory_task_id,
        user_id=user_id,
        action=str(action),
        entity_type=entity_type,
        entity_id=entity_id,
        detail_json=json.dumps(detail or {}, ensure_ascii=False, default=str),
        ip_address=ip_address,
    )
    db.add(row)
    return row
