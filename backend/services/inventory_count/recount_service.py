"""Recount workflow — triggered only by conflicting operator counts, not inventory variance."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import (
    AUDIT_RECOUNT,
    AUDIT_RECOUNT_COMPLETE,
    LINE_STATUS_COUNTED,
    LINE_STATUS_RECOUNT,
    RECOUNT_STATUS_DONE,
    RECOUNT_STATUS_OPEN,
    TASK_STATUS_OPEN,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.recount import InventoryRecount
from ...models.inventory_count.task import InventoryTask
from .audit_service import log_inventory_audit
from .difference_service import difference_percent
from .errors import InventoryDocumentNotFoundError, InventoryInvalidTransitionError
from .recount_conflict_service import lines_with_unresolved_operator_conflicts


def _create_single_operator_recount(
    db: Session,
    *,
    doc: InventoryDocument,
    line: InventoryDocumentLine,
    line_id: int,
    operator_qty: dict[Any, Any],
    tenant_id: int,
    user_id: int | None,
    assign_user_id: int | None = None,
) -> InventoryRecount:
    line.status = LINE_STATUS_RECOUNT
    line.recount_count = int(line.recount_count or 0) + 1
    recount = InventoryRecount(
        inventory_document_id=int(doc.id),
        inventory_document_line_id=line_id,
        status=RECOUNT_STATUS_OPEN,
        reason="operator_conflict",
        difference_percent=None,
        difference_quantity=float(line.difference_quantity or 0),
        assigned_user_id=assign_user_id,
        assigned_at=datetime.utcnow() if assign_user_id else None,
        original_counted_quantity=line.counted_quantity,
        notes=str(operator_qty),
    )
    db.add(recount)
    db.flush()
    task = InventoryTask(
        inventory_document_id=int(doc.id),
        tenant_id=int(doc.tenant_id),
        warehouse_id=int(doc.warehouse_id),
        location_id=int(line.location_id),
        task_number=f"{doc.number}-RC{recount.id:04d}",
        status=TASK_STATUS_OPEN,
        priority=90,
        sequence_no=9000 + recount.id,
        metadata_json='{"recount":true,"reason":"operator_conflict"}',
    )
    db.add(task)
    db.flush()
    recount.inventory_task_id = int(task.id)
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(doc.id),
        inventory_document_line_id=line_id,
        inventory_task_id=int(task.id),
        user_id=user_id,
        action=AUDIT_RECOUNT,
        detail={"reason": "operator_conflict", "operator_quantities": operator_qty},
    )
    return recount


def create_recount_for_line(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    line_id: int,
    user_id: int | None = None,
    assign_user_id: int | None = None,
) -> dict[str, Any]:
    """Supervisor-requested recount for one conflict line — exceptional path."""
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")

    target_id = int(line_id)
    row = next(
        (r for r in lines_with_unresolved_operator_conflicts(db, document_id=int(doc.id)) if int(r["line_id"]) == target_id),
        None,
    )
    if row is None:
        raise InventoryInvalidTransitionError(
            f"Line {line_id} has no unresolved operator conflict",
            details={"line_id": target_id},
        )

    existing = (
        db.query(InventoryRecount)
        .filter(
            InventoryRecount.inventory_document_line_id == target_id,
            InventoryRecount.status != RECOUNT_STATUS_DONE,
        )
        .first()
    )
    if existing is not None:
        return {"recount_id": int(existing.id), "line_id": target_id, "recounts_created": 0}

    line = row.get("line") or db.query(InventoryDocumentLine).filter(InventoryDocumentLine.id == target_id).first()
    if line is None:
        raise InventoryDocumentNotFoundError(f"Line {line_id} not found")

    recount = _create_single_operator_recount(
        db,
        doc=doc,
        line=line,
        line_id=target_id,
        operator_qty=row.get("operator_quantities") or {},
        tenant_id=int(tenant_id),
        user_id=user_id,
        assign_user_id=assign_user_id,
    )
    db.flush()
    return {"recount_id": int(recount.id), "line_id": target_id, "recounts_created": 1}


def create_recounts_for_document(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    user_id: int | None = None,
    assign_user_id: int | None = None,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")

    created = 0
    for row in lines_with_unresolved_operator_conflicts(db, document_id=int(doc.id)):
        line_id = int(row["line_id"])
        existing = (
            db.query(InventoryRecount)
            .filter(
                InventoryRecount.inventory_document_line_id == line_id,
                InventoryRecount.status != RECOUNT_STATUS_DONE,
            )
            .first()
        )
        if existing:
            continue
        line = row.get("line") or db.query(InventoryDocumentLine).filter(InventoryDocumentLine.id == line_id).first()
        if line is None:
            continue
        _create_single_operator_recount(
            db,
            doc=doc,
            line=line,
            line_id=line_id,
            operator_qty=row.get("operator_quantities") or {},
            tenant_id=int(tenant_id),
            user_id=user_id,
            assign_user_id=assign_user_id,
        )
        created += 1
    return {"recounts_created": created}


def complete_recount(
    db: Session,
    *,
    tenant_id: int,
    recount_id: int,
    counted_quantity: float,
    user_id: int | None = None,
) -> dict[str, Any]:
    recount = (
        db.query(InventoryRecount)
        .join(InventoryDocument, InventoryDocument.id == InventoryRecount.inventory_document_id)
        .filter(InventoryRecount.id == int(recount_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if recount is None:
        raise InventoryDocumentNotFoundError(f"Recount {recount_id} not found")

    line = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.id == int(recount.inventory_document_line_id)).first()
    if line is None:
        raise InventoryDocumentNotFoundError("Line not found for recount")

    recount.recount_counted_quantity = float(counted_quantity)
    recount.status = RECOUNT_STATUS_DONE
    recount.completed_at = datetime.utcnow()
    recount.completed_by_user_id = user_id
    line.counted_quantity = float(counted_quantity)
    line.recompute_difference()
    line.status = LINE_STATUS_COUNTED
    line.last_counted_at = datetime.utcnow()
    line.last_counted_by_user_id = user_id

    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(recount.inventory_document_id),
        inventory_document_line_id=int(line.id),
        user_id=user_id,
        action=AUDIT_RECOUNT_COMPLETE,
        detail={
            "recount_id": recount.id,
            "from": recount.original_counted_quantity,
            "to": counted_quantity,
            "reason": "operator_conflict_resolved",
        },
    )
    db.commit()
    return {"recount_id": recount.id, "line_id": line.id, "counted_quantity": line.counted_quantity}
