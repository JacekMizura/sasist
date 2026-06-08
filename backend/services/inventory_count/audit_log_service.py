"""List immutable inventory audit events for compliance viewer."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.approval import InventoryApproval
from ...models.inventory_count.audit_event import InventoryAuditEvent
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.recount import InventoryRecount
from .errors import InventoryDocumentNotFoundError


def list_document_audit_log(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    offset: int = 0,
    limit: int = 200,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")

    q = db.query(InventoryAuditEvent).filter(
        InventoryAuditEvent.inventory_document_id == int(document_id),
        InventoryAuditEvent.tenant_id == int(tenant_id),
    )
    total = q.count()
    rows = q.order_by(InventoryAuditEvent.id.asc()).offset(max(0, offset)).limit(min(limit, 1000)).all()
    items = [_audit_row_dict(r) for r in rows]
    return {"items": items, "total": total, "offset": offset, "limit": limit}


def get_document_timelines(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")

    approvals = (
        db.query(InventoryApproval)
        .filter(InventoryApproval.inventory_document_id == int(document_id))
        .order_by(InventoryApproval.id.asc())
        .all()
    )
    recounts = (
        db.query(InventoryRecount)
        .filter(InventoryRecount.inventory_document_id == int(document_id))
        .order_by(InventoryRecount.id.asc())
        .all()
    )
    posting_events = (
        db.query(InventoryAuditEvent)
        .filter(
            InventoryAuditEvent.inventory_document_id == int(document_id),
            InventoryAuditEvent.action.in_(("document.posted", "adjustment.generated")),
        )
        .order_by(InventoryAuditEvent.id.asc())
        .limit(500)
        .all()
    )
    return {
        "document_id": document_id,
        "approval_timeline": [
            {
                "id": a.id,
                "action": a.action,
                "user_id": a.user_id,
                "notes": a.notes,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in approvals
        ],
        "recount_timeline": [
            {
                "id": r.id,
                "status": r.status,
                "line_id": r.inventory_document_line_id,
                "assigned_user_id": r.assigned_user_id,
                "reason": r.reason,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in recounts
        ],
        "posting_timeline": [_audit_row_dict(e) for e in posting_events],
    }


def _audit_row_dict(row: InventoryAuditEvent) -> dict[str, Any]:
    detail = None
    prev = None
    nxt = None
    for attr, target in ((row.detail_json, "detail"), (row.previous_state_json, "prev"), (row.next_state_json, "nxt")):
        raw = attr
        if not raw:
            continue
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
        except json.JSONDecodeError:
            parsed = {"raw": raw}
        if target == "detail":
            detail = parsed
        elif target == "prev":
            prev = parsed
        else:
            nxt = parsed
    return {
        "id": row.id,
        "action": row.action,
        "user_id": row.user_id,
        "session_id": row.session_id,
        "device_id": row.device_id,
        "ip_address": row.ip_address,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "detail": detail,
        "previous_state": prev,
        "next_state": nxt,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
