"""Supervisor resolution of operator count conflicts — accept without recount task."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import AUDIT_QTY_CHANGED
from ...models.inventory_count.count_entry import InventoryCountEntry
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from .audit_service import log_inventory_audit
from .errors import InventoryDocumentNotFoundError, InventoryInvalidTransitionError

OPERATOR_CONFLICT_RESOLUTION_KEY = "operator_conflict_resolution"


def _parse_line_metadata(line: InventoryDocumentLine) -> dict[str, Any]:
    if not line.metadata_json:
        return {}
    try:
        data = json.loads(line.metadata_json)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def get_operator_conflict_resolution(line: InventoryDocumentLine) -> dict[str, Any] | None:
    meta = _parse_line_metadata(line)
    res = meta.get(OPERATOR_CONFLICT_RESOLUTION_KEY)
    return res if isinstance(res, dict) else None


def line_operator_conflict_is_resolved(line: InventoryDocumentLine) -> bool:
    return get_operator_conflict_resolution(line) is not None


def accept_operator_count_entry(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    line_id: int,
    count_entry_id: int,
    user_id: int | None = None,
) -> dict[str, Any]:
    """
    Supervisor picks an existing operator count as final — no recount task created.
    """
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")

    line = (
        db.query(InventoryDocumentLine)
        .filter(
            InventoryDocumentLine.id == int(line_id),
            InventoryDocumentLine.inventory_document_id == int(doc.id),
        )
        .first()
    )
    if line is None:
        raise InventoryDocumentNotFoundError(f"Line {line_id} not found on document {document_id}")

    entry = (
        db.query(InventoryCountEntry)
        .filter(
            InventoryCountEntry.id == int(count_entry_id),
            InventoryCountEntry.inventory_document_line_id == int(line.id),
            InventoryCountEntry.inventory_document_id == int(doc.id),
        )
        .first()
    )
    if entry is None:
        raise InventoryInvalidTransitionError(
            f"Count entry {count_entry_id} not found for line {line_id}",
            details={"count_entry_id": int(count_entry_id), "line_id": int(line_id)},
        )

    prev_qty = line.counted_quantity
    qty = float(entry.counted_quantity)
    line.counted_quantity = qty
    line.recompute_difference()
    line.last_counted_at = entry.created_at
    line.last_counted_by_user_id = entry.user_id

    meta = _parse_line_metadata(line)
    meta[OPERATOR_CONFLICT_RESOLUTION_KEY] = {
        "count_entry_id": int(entry.id),
        "quantity": qty,
        "resolved_by_user_id": user_id,
        "resolved_at": datetime.utcnow().isoformat(),
    }
    line.metadata_json = json.dumps(meta, ensure_ascii=False)
    line.touch_updated()

    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(doc.id),
        inventory_document_line_id=int(line.id),
        user_id=user_id,
        action=AUDIT_QTY_CHANGED,
        previous_state={"counted_quantity": prev_qty},
        next_state={
            "counted_quantity": qty,
            "accepted_count_entry_id": int(entry.id),
            "operator_conflict_resolved": True,
        },
        detail={"count_entry_id": int(entry.id), "source": "supervisor_accept"},
    )
    db.flush()
    return {
        "line_id": int(line.id),
        "count_entry_id": int(entry.id),
        "counted_quantity": qty,
        "operator_conflict_resolved": True,
    }
