"""Inventory approval workflow — submit, approve, reject."""

from __future__ import annotations

import json
import logging
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
    INV_STATUS_APPROVED,
    INV_STATUS_AWAITING_APPROVAL,
    INV_STATUS_IN_PROGRESS,
    LINE_STATUS_COUNTED,
    LINE_STATUS_SKIPPED,
    RECOUNT_ACTIVE_STATUSES,
    TASK_ACTIVE_STATUSES,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.recount import InventoryRecount
from ...models.inventory_count.task import InventoryTask
from ...models.location import Location
from .audit_service import log_inventory_audit
from .difference_service import analyze_document_differences
from .errors import (
    InventoryDocumentNotFoundError,
    InventoryIncompleteCountError,
    InventoryInvalidTransitionError,
    InventoryPendingRecountsError,
)
from .kpi_service import recompute_document_kpis
from .recount_service import create_recounts_for_document

logger = logging.getLogger(__name__)


def _norm_status(status: str | None) -> str:
    return str(status or "").strip().lower()


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


def _uncounted_line_samples(db: Session, document_id: int, *, limit: int = 5) -> list[dict[str, Any]]:
    lines = (
        db.query(InventoryDocumentLine)
        .filter(
            InventoryDocumentLine.inventory_document_id == int(document_id),
            InventoryDocumentLine.counted_quantity.is_(None),
            InventoryDocumentLine.status.notin_((LINE_STATUS_COUNTED, LINE_STATUS_SKIPPED)),
        )
        .order_by(InventoryDocumentLine.id.asc())
        .limit(limit)
        .all()
    )
    loc_ids = {int(ln.location_id) for ln in lines if ln.location_id is not None}
    loc_map: dict[int, str] = {}
    if loc_ids:
        try:
            for loc in db.query(Location).filter(Location.id.in_(loc_ids)).all():
                loc_map[int(loc.id)] = (loc.name or "").strip() or f"#{loc.id}"
        except Exception:
            logger.debug("uncounted_line_samples: location lookup skipped", exc_info=True)

    out: list[dict[str, Any]] = []
    for line in lines:
        lid = int(line.location_id)
        out.append(
            {
                "line_id": int(line.id),
                "location_id": lid,
                "location_code": loc_map.get(lid) or f"#{lid}",
                "product_id": line.product_id,
            }
        )
    return out


def _submit_blockers(db: Session, doc: InventoryDocument) -> dict[str, Any]:
    recompute_document_kpis(db, doc)
    status = _norm_status(doc.status)
    pending_tasks = (
        db.query(InventoryTask)
        .filter(
            InventoryTask.inventory_document_id == int(doc.id),
            InventoryTask.status.in_(TASK_ACTIVE_STATUSES),
        )
        .count()
    )
    uncounted_lines = max(0, int(doc.total_lines or 0) - int(doc.counted_lines or 0))
    return {
        "document_id": int(doc.id),
        "document_status": status,
        "allowed_statuses": [INV_STATUS_IN_PROGRESS],
        "counted_lines": int(doc.counted_lines or 0),
        "total_lines": int(doc.total_lines or 0),
        "uncounted_lines": uncounted_lines,
        "coverage_percent": int(doc.coverage_percent or 0),
        "pending_tasks": int(pending_tasks),
        "recount_required": bool(doc.recount_required),
        "uncounted_samples": _uncounted_line_samples(db, int(doc.id)),
    }


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

    blockers = _submit_blockers(db, doc)
    status = blockers["document_status"]
    if status != INV_STATUS_IN_PROGRESS:
        raise InventoryInvalidTransitionError(
            f"Only in-progress inventories can be submitted (current status: {status or 'unknown'})",
            details=blockers,
        )

    if blockers["counted_lines"] < blockers["total_lines"]:
        raise InventoryIncompleteCountError(
            f"Not all lines counted ({blockers['counted_lines']}/{blockers['total_lines']})",
            details=blockers,
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
        raise InventoryPendingRecountsError(
            f"Complete pending recounts before approval ({pending_recounts} active)",
            details={
                **blockers,
                "pending_recounts": int(pending_recounts),
                "recounts_created": recounts_created,
                "analysis_summary": analysis.get("summary"),
            },
        )

    doc.status = INV_STATUS_AWAITING_APPROVAL
    doc.bump_version()
    doc.touch_updated()
    _record_approval(
        db,
        document_id=int(doc.id),
        action=APPROVAL_ACTION_SUBMIT,
        user_id=user_id,
        notes=notes,
        detail=analysis["summary"],
    )
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
    status = _norm_status(doc.status)
    if status != INV_STATUS_AWAITING_APPROVAL:
        raise InventoryInvalidTransitionError(
            "Document is not awaiting approval",
            details={
                "document_id": int(doc.id),
                "document_status": status,
                "allowed_statuses": [INV_STATUS_AWAITING_APPROVAL],
            },
        )

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
    status = _norm_status(doc.status)
    if status != INV_STATUS_AWAITING_APPROVAL:
        raise InventoryInvalidTransitionError(
            "Document is not awaiting approval",
            details={
                "document_id": int(doc.id),
                "document_status": status,
                "allowed_statuses": [INV_STATUS_AWAITING_APPROVAL],
            },
        )

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
