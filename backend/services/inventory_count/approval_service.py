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
    DIFF_CLASS_REVIEW,
    INV_STATUS_APPROVED,
    INV_STATUS_AWAITING_APPROVAL,
    INV_STATUS_IN_PROGRESS,
    INV_TYPE_CONTROL,
    INV_TYPE_CYCLE,
    INV_TYPE_FULL,
    INV_TYPE_PARTIAL,
    LINE_STATUS_COUNTED,
    LINE_STATUS_SKIPPED,
    RECOUNT_ACTIVE_STATUSES,
    RECOUNT_STATUS_DONE,
    TASK_ACTIVE_STATUSES,
    TASK_STATUS_ASSIGNED,
    TASK_STATUS_IN_PROGRESS,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.recount import InventoryRecount
from ...models.inventory_count.task import InventoryTask
from ...models.location import Location
from .audit_service import log_inventory_audit
from .difference_service import analyze_document_differences
from .errors import (
    InventoryActiveCountingTasksError,
    InventoryDocumentNotFoundError,
    InventoryIncompleteCountError,
    InventoryInvalidTransitionError,
    InventoryPartialSubmitNotReadyError,
    InventoryPendingRecountsError,
)
from .kpi_service import recompute_document_kpis
from .recount_conflict_service import lines_with_unresolved_operator_conflicts
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


def _norm_inventory_type(doc: InventoryDocument) -> str:
    return str(doc.inventory_type or INV_TYPE_FULL).strip().upper()


def _allows_partial_coverage(doc: InventoryDocument) -> bool:
    """PARTIAL / CYCLE / CONTROL — submit on counted subset, not 100% document coverage."""
    return _norm_inventory_type(doc) in (INV_TYPE_PARTIAL, INV_TYPE_CYCLE, INV_TYPE_CONTROL)


def _task_has_incomplete_count_work(db: Session, doc: InventoryDocument, task: InventoryTask) -> bool:
    """True when counting started at task location but uncounted lines remain."""
    lines = (
        db.query(InventoryDocumentLine)
        .filter(
            InventoryDocumentLine.inventory_document_id == int(doc.id),
            InventoryDocumentLine.location_id == int(task.location_id),
        )
        .all()
    )
    if not lines:
        return False
    any_counted = any(ln.counted_quantity is not None for ln in lines)
    if not any_counted:
        return False
    return any(
        ln.counted_quantity is None and ln.status not in (LINE_STATUS_COUNTED, LINE_STATUS_SKIPPED)
        for ln in lines
    )


def _pending_recount_count(db: Session, document_id: int) -> int:
    return (
        db.query(InventoryRecount)
        .filter(
            InventoryRecount.inventory_document_id == int(document_id),
            InventoryRecount.status.in_(RECOUNT_ACTIVE_STATUSES),
        )
        .count()
    )


def _projected_recount_blockers(db: Session, doc: InventoryDocument) -> tuple[int, int]:
    """Return (active_pending_recounts, unresolved_operator_conflicts_without_task)."""
    active = _pending_recount_count(db, int(doc.id))
    unresolved = lines_with_unresolved_operator_conflicts(db, document_id=int(doc.id))
    needs_task = 0
    for row in unresolved:
        line_id = int(row["line_id"])
        existing = (
            db.query(InventoryRecount)
            .filter(
                InventoryRecount.inventory_document_line_id == line_id,
                InventoryRecount.status != RECOUNT_STATUS_DONE,
            )
            .first()
        )
        if existing is None:
            needs_task += 1
    return active, needs_task


def _blocking_task_count(db: Session, doc: InventoryDocument) -> int:
    q = db.query(InventoryTask).filter(InventoryTask.inventory_document_id == int(doc.id))
    if _allows_partial_coverage(doc):
        blocking = 0
        active_tasks = q.filter(InventoryTask.status.in_((TASK_STATUS_IN_PROGRESS, TASK_STATUS_ASSIGNED))).all()
        for task in active_tasks:
            if _task_has_incomplete_count_work(db, doc, task):
                blocking += 1
        return blocking
    return q.filter(InventoryTask.status.in_(TASK_ACTIVE_STATUSES)).count()


def _submit_blockers(db: Session, doc: InventoryDocument) -> dict[str, Any]:
    recompute_document_kpis(db, doc)
    status = _norm_status(doc.status)
    pending_tasks = _blocking_task_count(db, doc)
    uncounted_lines = max(0, int(doc.total_lines or 0) - int(doc.counted_lines or 0))
    inv_type = _norm_inventory_type(doc)
    pending_recounts, projected_recounts = _projected_recount_blockers(db, doc)
    return {
        "document_id": int(doc.id),
        "document_status": status,
        "inventory_type": inv_type,
        "requires_full_coverage": inv_type == INV_TYPE_FULL,
        "allows_partial_coverage": _allows_partial_coverage(doc),
        "allowed_statuses": [INV_STATUS_IN_PROGRESS],
        "counted_lines": int(doc.counted_lines or 0),
        "total_lines": int(doc.total_lines or 0),
        "uncounted_lines": uncounted_lines,
        "coverage_percent": int(doc.coverage_percent or 0),
        "pending_tasks": int(pending_tasks),
        "pending_recounts": int(pending_recounts),
        "projected_recounts": int(projected_recounts),
        "recount_required": bool(doc.recount_required),
        "uncounted_samples": _uncounted_line_samples(db, int(doc.id)),
    }


def _submit_block_message(code: str, blockers: dict[str, Any]) -> str:
    if code == "invalid_status_transition":
        current = blockers.get("document_status")
        return f"Nie można wysłać do zatwierdzenia: dokument musi być w trakcie liczenia (obecny status: {current})."
    if code == "active_counting_tasks":
        pending = blockers.get("pending_tasks")
        return f"Nie można wysłać do zatwierdzenia: otwarte zadania liczenia ({pending})."
    if code == "partial_submit_not_ready":
        return "Dokument nie zawiera policzonych pozycji."
    if code == "incomplete_count":
        counted = blockers.get("counted_lines")
        total = blockers.get("total_lines")
        return f"Nie wszystkie pozycje dokumentu zostały policzone ({counted}/{total})."
    if code == "pending_recounts":
        pending = blockers.get("pending_recounts") or blockers.get("projected_recounts")
        return f"Nie można wysłać do zatwierdzenia: dokończ ponowne liczenia ({pending} aktywnych)."
    return "Nie można wysłać dokumentu do zatwierdzenia."


def evaluate_submit_readiness(db: Session, doc: InventoryDocument) -> dict[str, Any]:
    """Non-throwing submit gate — for ERP document detail UI."""
    blockers = _submit_blockers(db, doc)
    scoped = _allows_partial_coverage(doc)

    if blockers["document_status"] != INV_STATUS_IN_PROGRESS:
        code = "invalid_status_transition"
        return {
            "can_submit": False,
            "block_code": code,
            "block_message": _submit_block_message(code, blockers),
            "details": blockers,
        }

    if blockers["pending_tasks"] > 0:
        code = "active_counting_tasks"
        return {
            "can_submit": False,
            "block_code": code,
            "block_message": _submit_block_message(code, blockers),
            "details": blockers,
        }

    if scoped:
        if blockers["counted_lines"] < 1:
            code = "partial_submit_not_ready"
            blockers = {**blockers, "reason": "no_counted_lines"}
            return {
                "can_submit": False,
                "block_code": code,
                "block_message": _submit_block_message(code, blockers),
                "details": blockers,
            }
    elif blockers["counted_lines"] < blockers["total_lines"]:
        code = "incomplete_count"
        return {
            "can_submit": False,
            "block_code": code,
            "block_message": _submit_block_message(code, blockers),
            "details": blockers,
        }

    pending_recounts = int(blockers.get("pending_recounts") or 0)
    projected_recounts = int(blockers.get("projected_recounts") or 0)
    if pending_recounts > 0 or projected_recounts > 0:
        code = "pending_recounts"
        blockers = {
            **blockers,
            "pending_recounts": max(pending_recounts, projected_recounts),
        }
        return {
            "can_submit": False,
            "block_code": code,
            "block_message": _submit_block_message(code, blockers),
            "details": blockers,
        }

    return {
        "can_submit": True,
        "block_code": None,
        "block_message": None,
        "details": blockers,
    }


def _assert_submit_ready(db: Session, doc: InventoryDocument, blockers: dict[str, Any]) -> None:
    readiness = evaluate_submit_readiness(db, doc)
    if readiness["can_submit"]:
        return
    code = str(readiness.get("block_code") or "inventory_count_error")
    message = str(readiness.get("block_message") or _submit_block_message(code, blockers))
    details = readiness.get("details") or blockers
    if code == "invalid_status_transition":
        raise InventoryInvalidTransitionError(message, details=details)
    if code == "active_counting_tasks":
        raise InventoryActiveCountingTasksError(message, details=details)
    if code == "partial_submit_not_ready":
        raise InventoryPartialSubmitNotReadyError(message, details=details)
    if code == "incomplete_count":
        raise InventoryIncompleteCountError(message, details=details)
    if code == "pending_recounts":
        raise InventoryPendingRecountsError(message, details=details)
    raise InventoryInvalidTransitionError(message, details=details)


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
    _assert_submit_ready(db, doc, blockers)

    analysis = analyze_document_differences(db, document=doc)
    recounts_created = 0
    if auto_create_recounts:
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
        db.rollback()
        raise InventoryPendingRecountsError(
            _submit_block_message("pending_recounts", {**blockers, "pending_recounts": pending_recounts}),
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
