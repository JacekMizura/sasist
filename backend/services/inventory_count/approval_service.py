"""Inventory approval workflow — submit, approve, reject."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.approval import InventoryApproval
from ...models.inventory_count.constants import (
    APPROVAL_ACTION_APPROVE,
    APPROVAL_ACTION_REJECT,
    APPROVAL_ACTION_SUBMIT,
    AUDIT_APPROVAL,
    AUDIT_REJECT,
    AUDIT_SUBMIT_APPROVAL,
    DIFF_CLASS_RECOUNT,
    INV_STATUS_APPROVED,
    INV_STATUS_AWAITING_APPROVAL,
    INV_STATUS_IN_PROGRESS,
    RECOUNT_ACTIVE_STATUSES,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.recount import InventoryRecount
from .audit_service import log_inventory_audit
from .difference_service import analyze_document_differences
from .errors import InventoryDocumentNotFoundError, InventoryInvalidTransitionError
from .kpi_service import recompute_document_kpis
from .recount_service import create_recounts_for_document


def _record_approval(
    db: Session,
    *,
    document_id: int,
    action: str,
    user_id: int | None,
    notes: str | None = None,
    detail: dict | None = None,
) -> None:
    db.add(
        InventoryApproval(
            inventory_document_id=int(document_id),
            action=str(action),
            user_id=user_id,
            notes=notes,
            detail_json=json.dumps(detail or {}, ensure_ascii=False, default=str),
        )
    )


def submit_for_approval(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    user_id: int | None = None,
    notes: str | None = None,
    auto_create_recounts: bool = True,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")
    if doc.status != INV_STATUS_IN_PROGRESS:
        raise InventoryInvalidTransitionError("Only in-progress inventories can be submitted")

    recompute_document_kpis(db, doc)
    if doc.counted_lines < doc.total_lines:
        raise InventoryInvalidTransitionError(
            f"Not all lines counted ({doc.counted_lines}/{doc.total_lines})"
        )

    analysis = analyze_document_differences(db, document=doc)
    recounts_created = 0
    if auto_create_recounts and bool(doc.recount_required):
        result = create_recounts_for_document(db, tenant_id=tenant_id, document_id=document_id, user_id=user_id)
        recounts_created = int(result.get("recounts_created") or 0)

    pending_recounts = (
        db.query(InventoryRecount)
        .filter(
            InventoryRecount.inventory_document_id == int(doc.id),
            InventoryRecount.status.in_(RECOUNT_ACTIVE_STATUSES),
        )
        .count()
    )
    if pending_recounts > 0:
        db.commit()
        return {
            "status": doc.status,
            "pending_recounts": pending_recounts,
            "recounts_created": recounts_created,
            "analysis": analysis["summary"],
        }

    doc.status = INV_STATUS_AWAITING_APPROVAL
    doc.bump_version()
    doc.touch_updated()
    _record_approval(db, document_id=int(doc.id), action=APPROVAL_ACTION_SUBMIT, user_id=user_id, notes=notes, detail=analysis["summary"])
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(doc.id),
        user_id=user_id,
        action=AUDIT_SUBMIT_APPROVAL,
        detail=analysis["summary"],
    )
    db.commit()
    db.refresh(doc)
    return {
        "status": doc.status,
        "analysis": analysis,
        "recounts_created": recounts_created,
    }


def approve_inventory_document(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    user_id: int | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")
    if doc.status != INV_STATUS_AWAITING_APPROVAL:
        raise InventoryInvalidTransitionError("Document is not awaiting approval")

    doc.status = INV_STATUS_APPROVED
    doc.approved_at = datetime.utcnow()
    doc.approved_by_user_id = user_id
    doc.bump_version()
    _record_approval(db, document_id=int(doc.id), action=APPROVAL_ACTION_APPROVE, user_id=user_id, notes=notes)
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(doc.id),
        user_id=user_id,
        action=AUDIT_APPROVAL,
    )
    db.commit()
    db.refresh(doc)
    return {"status": doc.status, "approved_at": doc.approved_at.isoformat() if doc.approved_at else None}


def reject_inventory_document(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    user_id: int | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")
    if doc.status != INV_STATUS_AWAITING_APPROVAL:
        raise InventoryInvalidTransitionError("Document is not awaiting approval")

    doc.status = INV_STATUS_IN_PROGRESS
    doc.bump_version()
    _record_approval(db, document_id=int(doc.id), action=APPROVAL_ACTION_REJECT, user_id=user_id, notes=notes)
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(doc.id),
        user_id=user_id,
        action=AUDIT_REJECT,
        detail={"notes": notes},
    )
    db.commit()
    db.refresh(doc)
    return {"status": doc.status}
