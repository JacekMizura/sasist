"""Recount workflow — assign second operator when difference exceeds threshold."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import (
    AUDIT_RECOUNT,
    AUDIT_RECOUNT_COMPLETE,
    DIFF_CLASS_RECOUNT,
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
from .difference_service import analyze_document_differences, difference_percent
from .errors import InventoryDocumentNotFoundError


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

    analysis = analyze_document_differences(db, document=doc)
    created = 0
    for row in analysis["lines"]:
        if row["difference_class"] != DIFF_CLASS_RECOUNT:
            continue
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
        line = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.id == line_id).first()
        if line is None:
            continue
        line.status = LINE_STATUS_RECOUNT
        line.recount_count = int(line.recount_count or 0) + 1
        recount = InventoryRecount(
            inventory_document_id=int(doc.id),
            inventory_document_line_id=line_id,
            status=RECOUNT_STATUS_OPEN,
            reason="threshold_exceeded",
            difference_percent=float(row["difference_percent"]),
            difference_quantity=float(row["difference_quantity"] or 0),
            assigned_user_id=assign_user_id,
            assigned_at=datetime.utcnow() if assign_user_id else None,
            original_counted_quantity=line.counted_quantity,
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
            metadata_json='{"recount":true}',
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
            detail={"difference_percent": row["difference_percent"]},
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
    line.status = LINE_STATUS_RECOUNT
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
            "difference_percent": difference_percent(float(line.expected_quantity or 0), counted_quantity),
        },
    )
    db.commit()
    return {"recount_id": recount.id, "line_id": line.id, "counted_quantity": line.counted_quantity}
