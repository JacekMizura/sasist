"""Inventory count ERP dashboard projections."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.inventory_count.constants import (
    INV_STATUS_APPROVED,
    INV_STATUS_AWAITING_APPROVAL,
    INV_STATUS_IN_PROGRESS,
    INV_STATUS_POSTED,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.session import InventorySession
from ...models.inventory_count.constants import SESSION_STATUS_ACTIVE


def build_inventory_dashboard(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> dict[str, Any]:
    q = db.query(InventoryDocument).filter(InventoryDocument.tenant_id == int(tenant_id))
    if warehouse_id is not None:
        q = q.filter(InventoryDocument.warehouse_id == int(warehouse_id))

    active = (
        q.filter(InventoryDocument.status.in_((INV_STATUS_IN_PROGRESS, INV_STATUS_PLANNED)))
        .order_by(InventoryDocument.updated_at.desc())
        .limit(20)
        .all()
    )
    awaiting = (
        q.filter(InventoryDocument.status == INV_STATUS_AWAITING_APPROVAL)
        .order_by(InventoryDocument.updated_at.desc())
        .limit(10)
        .all()
    )
    completed = (
        q.filter(InventoryDocument.status.in_((INV_STATUS_APPROVED, INV_STATUS_POSTED)))
        .order_by(InventoryDocument.completed_at.desc().nullslast(), InventoryDocument.updated_at.desc())
        .limit(10)
        .all()
    )

    open_diff_q = q.filter(InventoryDocument.difference_lines > 0, InventoryDocument.status == INV_STATUS_IN_PROGRESS)
    open_differences_count = open_diff_q.count()

    coverage_rows = q.filter(InventoryDocument.status == INV_STATUS_IN_PROGRESS).all()
    coverage_avg = 0
    if coverage_rows:
        coverage_avg = round(sum(r.coverage_percent or 0 for r in coverage_rows) / len(coverage_rows))

    week_ago = datetime.utcnow() - timedelta(days=7)
    completed_week = q.filter(
        InventoryDocument.status.in_((INV_STATUS_APPROVED, INV_STATUS_POSTED)),
        InventoryDocument.completed_at >= week_ago,
    ).count()

    session_q = db.query(func.count(InventorySession.id)).filter(
        InventorySession.tenant_id == int(tenant_id),
        InventorySession.status == SESSION_STATUS_ACTIVE,
    )
    if warehouse_id is not None:
        session_q = session_q.filter(InventorySession.warehouse_id == int(warehouse_id))
    active_sessions = int(session_q.scalar() or 0)

    return {
        "kpis": {
            "active_inventories": len(active),
            "awaiting_approval": len(awaiting),
            "open_differences": open_differences_count,
            "completed_last_7_days": completed_week,
            "warehouse_coverage_percent": coverage_avg,
            "active_operator_sessions": active_sessions,
        },
        "active_inventories": [_doc_summary(d) for d in active],
        "awaiting_approval": [_doc_summary(d) for d in awaiting],
        "recent_completed": [_doc_summary(d) for d in completed],
    }


def _doc_summary(doc: InventoryDocument) -> dict[str, Any]:
    return {
        "id": doc.id,
        "number": doc.number,
        "inventory_type": doc.inventory_type,
        "status": doc.status,
        "warehouse_id": doc.warehouse_id,
        "coverage_percent": doc.coverage_percent,
        "total_lines": doc.total_lines,
        "counted_lines": doc.counted_lines,
        "difference_lines": doc.difference_lines,
        "snapshot_created_at": doc.snapshot_created_at.isoformat() if doc.snapshot_created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }
