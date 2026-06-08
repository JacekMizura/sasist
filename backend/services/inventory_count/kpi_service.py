"""Recompute inventory document KPI fields from lines."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import LINE_STATUS_COUNTED, LINE_STATUS_SKIPPED
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine


def recompute_document_kpis(db: Session, document: InventoryDocument) -> None:
    lines = (
        db.query(InventoryDocumentLine)
        .filter(InventoryDocumentLine.inventory_document_id == int(document.id))
        .all()
    )
    total = len(lines)
    counted = sum(
        1
        for ln in lines
        if ln.status in (LINE_STATUS_COUNTED, LINE_STATUS_SKIPPED)
        or ln.counted_quantity is not None
    )
    diff_lines = sum(
        1
        for ln in lines
        if ln.difference_quantity is not None and abs(float(ln.difference_quantity)) > 1e-9
    )
    coverage = round((counted / total) * 100) if total else 0
    document.total_lines = total
    document.counted_lines = counted
    document.difference_lines = diff_lines
    document.coverage_percent = min(100, max(0, coverage))
    document.touch_updated()
