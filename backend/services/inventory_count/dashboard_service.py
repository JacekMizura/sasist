"""Inventory count ERP dashboard — fault-tolerant, schema-safe projections."""

from __future__ import annotations

import logging
import traceback
from datetime import datetime, timedelta
from typing import Any, Callable

from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from ...models.inventory_count.constants import (
    INV_STATUS_APPROVED,
    INV_STATUS_AWAITING_APPROVAL,
    INV_STATUS_IN_PROGRESS,
    INV_STATUS_PLANNED,
    INV_STATUS_POSTED,
    SESSION_STATUS_ACTIVE,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.session import InventorySession
from .dashboard_schema_service import ensure_inventory_dashboard_schema
from .document_service import _doc_to_dict

logger = logging.getLogger(__name__)

SectionBuilder = Callable[[Session, Query, int, int | None], Any]


def _empty_kpis() -> dict[str, int]:
    return {
        "active_inventories": 0,
        "awaiting_approval": 0,
        "open_differences": 0,
        "completed_last_7_days": 0,
        "warehouse_coverage_percent": 0,
        "active_operator_sessions": 0,
    }


def _base_document_query(db: Session, *, tenant_id: int, warehouse_id: int | None) -> Query:
    q = db.query(InventoryDocument).filter(InventoryDocument.tenant_id == int(tenant_id))
    if warehouse_id is not None:
        q = q.filter(InventoryDocument.warehouse_id == int(warehouse_id))
    return q


def _safe_doc_rows(rows: list[InventoryDocument]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for doc in rows:
        try:
            out.append(_doc_to_dict(doc))
        except Exception:
            logger.exception("INVENTORY_DASHBOARD_DOC_SERIALIZE_FAILED doc_id=%s", getattr(doc, "id", None))
            out.append(_fallback_doc_dict(doc))
    return out


def _fallback_doc_dict(doc: InventoryDocument) -> dict[str, Any]:
    """Minimal InventoryDocumentRead-compatible payload when full serialize fails."""
    return {
        "id": int(getattr(doc, "id", 0) or 0),
        "tenant_id": int(getattr(doc, "tenant_id", 0) or 0),
        "warehouse_id": int(getattr(doc, "warehouse_id", 0) or 0),
        "number": str(getattr(doc, "number", "") or ""),
        "inventory_type": str(getattr(doc, "inventory_type", "FULL") or "FULL"),
        "status": str(getattr(doc, "status", "draft") or "draft"),
        "count_mode": str(getattr(doc, "count_mode", "blind") or "blind"),
        "lock_mode": str(getattr(doc, "lock_mode", "snapshot") or "snapshot"),
        "recount_required": bool(getattr(doc, "recount_required", 0)),
        "scan_mode": str(getattr(doc, "scan_mode", "scan_increment") or "scan_increment"),
        "filters": {},
        "strategy": {},
        "metadata": {},
        "notes": getattr(doc, "notes", None),
        "planned_start_at": None,
        "planned_end_at": None,
        "snapshot_created_at": None,
        "approved_at": None,
        "posted_at": None,
        "started_at": None,
        "completed_at": None,
        "total_lines": int(getattr(doc, "total_lines", 0) or 0),
        "counted_lines": int(getattr(doc, "counted_lines", 0) or 0),
        "difference_lines": int(getattr(doc, "difference_lines", 0) or 0),
        "coverage_percent": int(getattr(doc, "coverage_percent", 0) or 0),
        "created_by_user_id": None,
        "approved_by_user_id": None,
        "created_at": None,
        "updated_at": None,
    }


def _build_kpi_summary(db: Session, base_q: Query, *, tenant_id: int, warehouse_id: int | None) -> dict[str, int]:
    active_count = (
        base_q.filter(InventoryDocument.status.in_((INV_STATUS_IN_PROGRESS, INV_STATUS_PLANNED))).count()
    )
    awaiting_count = base_q.filter(InventoryDocument.status == INV_STATUS_AWAITING_APPROVAL).count()
    open_diff_count = (
        base_q.filter(
            InventoryDocument.status == INV_STATUS_IN_PROGRESS,
            InventoryDocument.difference_lines > 0,
        ).count()
    )

    week_ago = datetime.utcnow() - timedelta(days=7)
    completed_week = (
        base_q.filter(
            InventoryDocument.status.in_((INV_STATUS_APPROVED, INV_STATUS_POSTED)),
            InventoryDocument.completed_at.isnot(None),
            InventoryDocument.completed_at >= week_ago,
        ).count()
    )

    coverage_avg = (
        db.query(func.coalesce(func.avg(func.coalesce(InventoryDocument.coverage_percent, 0)), 0))
        .filter(
            InventoryDocument.tenant_id == int(tenant_id),
            InventoryDocument.status == INV_STATUS_IN_PROGRESS,
            *(
                [InventoryDocument.warehouse_id == int(warehouse_id)]
                if warehouse_id is not None
                else []
            ),
        )
        .scalar()
    )
    coverage_pct = int(round(float(coverage_avg or 0)))

    session_q = db.query(func.count(InventorySession.id)).filter(
        InventorySession.tenant_id == int(tenant_id),
        InventorySession.status == SESSION_STATUS_ACTIVE,
    )
    if warehouse_id is not None:
        session_q = session_q.filter(InventorySession.warehouse_id == int(warehouse_id))
    active_sessions = int(session_q.scalar() or 0)

    return {
        "active_inventories": int(active_count),
        "awaiting_approval": int(awaiting_count),
        "open_differences": int(open_diff_count),
        "completed_last_7_days": int(completed_week),
        "warehouse_coverage_percent": coverage_pct,
        "active_operator_sessions": active_sessions,
    }


def _build_active_inventories(_db: Session, base_q: Query, **_kw: Any) -> list[dict[str, Any]]:
    rows = (
        base_q.filter(InventoryDocument.status.in_((INV_STATUS_IN_PROGRESS, INV_STATUS_PLANNED)))
        .order_by(InventoryDocument.updated_at.desc())
        .limit(20)
        .all()
    )
    return _safe_doc_rows(rows)


def _build_awaiting_approvals(_db: Session, base_q: Query, **_kw: Any) -> list[dict[str, Any]]:
    rows = (
        base_q.filter(InventoryDocument.status == INV_STATUS_AWAITING_APPROVAL)
        .order_by(InventoryDocument.updated_at.desc())
        .limit(10)
        .all()
    )
    return _safe_doc_rows(rows)


def _build_recent_completed(_db: Session, base_q: Query, **_kw: Any) -> list[dict[str, Any]]:
    # PostgreSQL-safe: nulls last without dialect-specific DESC NULLS LAST on all backends
    rows = (
        base_q.filter(InventoryDocument.status.in_((INV_STATUS_APPROVED, INV_STATUS_POSTED)))
        .order_by(
            InventoryDocument.completed_at.is_(None),
            InventoryDocument.completed_at.desc(),
            InventoryDocument.updated_at.desc(),
        )
        .limit(10)
        .all()
    )
    return _safe_doc_rows(rows)


def _build_difference_stats(_db: Session, base_q: Query, **_kw: Any) -> dict[str, Any]:
    in_progress = base_q.filter(InventoryDocument.status == INV_STATUS_IN_PROGRESS)
    total_open_lines = (
        in_progress.with_entities(func.coalesce(func.sum(InventoryDocument.difference_lines), 0)).scalar()
    )
    docs_with_diff = in_progress.filter(InventoryDocument.difference_lines > 0).count()
    max_diff = in_progress.with_entities(func.coalesce(func.max(InventoryDocument.difference_lines), 0)).scalar()
    return {
        "documents_with_differences": int(docs_with_diff or 0),
        "total_difference_lines": int(total_open_lines or 0),
        "max_difference_lines_on_document": int(max_diff or 0),
    }


def _build_heatmap_preview(_db: Session, base_q: Query, **_kw: Any) -> list[dict[str, Any]]:
    """Lightweight preview buckets — no line-level joins."""
    rows = (
        base_q.filter(
            InventoryDocument.status == INV_STATUS_IN_PROGRESS,
            InventoryDocument.difference_lines > 0,
        )
        .with_entities(
            InventoryDocument.id,
            InventoryDocument.number,
            InventoryDocument.difference_lines,
            InventoryDocument.coverage_percent,
        )
        .order_by(InventoryDocument.difference_lines.desc())
        .limit(24)
        .all()
    )
    if not rows:
        return []
    max_diff = max(int(r.difference_lines or 0) for r in rows) or 1
    preview: list[dict[str, Any]] = []
    for r in rows:
        diff = int(r.difference_lines or 0)
        intensity = min(4, int(round((diff / max_diff) * 4))) if max_diff else 0
        preview.append(
            {
                "document_id": int(r.id),
                "number": r.number,
                "difference_lines": diff,
                "coverage_percent": int(r.coverage_percent or 0),
                "intensity": intensity,
            }
        )
    return preview


def _build_operator_activity(
    db: Session,
    _base_q: Query,
    *,
    tenant_id: int,
    warehouse_id: int | None,
) -> list[dict[str, Any]]:
    q = db.query(InventorySession).filter(
        InventorySession.tenant_id == int(tenant_id),
        InventorySession.status == SESSION_STATUS_ACTIVE,
    )
    if warehouse_id is not None:
        q = q.filter(InventorySession.warehouse_id == int(warehouse_id))
    sessions = q.order_by(InventorySession.last_activity_at.desc()).limit(15).all()
    return [
        {
            "session_id": int(s.id),
            "user_id": s.user_id,
            "document_id": s.inventory_document_id,
            "task_id": s.inventory_task_id,
            "scan_count": int(s.scan_count or 0),
            "lines_counted": int(s.lines_counted or 0),
            "last_activity_at": s.last_activity_at.isoformat() if s.last_activity_at else None,
        }
        for s in sessions
    ]


def _run_section(
    name: str,
    builder: SectionBuilder,
    db: Session,
    base_q: Query,
    *,
    tenant_id: int,
    warehouse_id: int | None,
    failed_sections: list[str],
    section_errors: list[dict[str, Any]],
    default: Any,
) -> Any:
    try:
        logger.info("INVENTORY_DASHBOARD_SECTION_START section=%s", name)
        result = builder(db, base_q, tenant_id=tenant_id, warehouse_id=warehouse_id)
        logger.info("INVENTORY_DASHBOARD_SECTION_OK section=%s", name)
        return result
    except Exception as exc:
        failed_sections.append(name)
        tb = traceback.format_exc()
        logger.exception("INVENTORY_DASHBOARD_%s_FAILED", name.upper())
        section_errors.append(
            {
                "section": name,
                "error_type": type(exc).__name__,
                "message": str(exc),
                "traceback": tb,
            }
        )
        return default


def build_inventory_dashboard(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    user_id: int | None = None,
) -> dict[str, Any]:
    engine = db.get_bind()
    dialect = getattr(engine, "dialect", None)
    dialect_name = getattr(dialect, "name", "unknown") if dialect else "unknown"

    logger.info(
        "INVENTORY_DASHBOARD_START tenant_id=%s warehouse_id=%s dialect=%s user_id=%s",
        tenant_id,
        warehouse_id,
        dialect_name,
        user_id,
    )

    schema_sync: dict[str, Any] = {}
    try:
        schema_sync = ensure_inventory_dashboard_schema(db)
    except Exception:
        logger.exception("INVENTORY_DASHBOARD_SCHEMA_SYNC_FAILED")
        schema_sync = {"critical_ok": False, "error": "schema_sync_failed"}

    failed_sections: list[str] = []
    section_errors: list[dict[str, Any]] = []

    try:
        base_q = _base_document_query(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    except Exception as exc:
        logger.exception("INVENTORY_DASHBOARD_BASE_QUERY_FAILED")
        return {
            "kpis": _empty_kpis(),
            "active_inventories": [],
            "awaiting_approval": [],
            "recent_completed": [],
            "difference_stats": {},
            "heatmap_preview": [],
            "operator_activity": [],
            "dashboard_status": "failed",
            "failed_sections": ["base_query"],
            "section_errors": [
                {
                    "section": "base_query",
                    "error_type": type(exc).__name__,
                    "message": str(exc),
                    "traceback": traceback.format_exc(),
                }
            ],
            "schema_audit": schema_sync.get("audit_after") or schema_sync,
        }

    kpis = _run_section(
        "kpis",
        lambda db, q, **kw: _build_kpi_summary(db, q, tenant_id=tenant_id, warehouse_id=warehouse_id),
        db,
        base_q,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        failed_sections=failed_sections,
        section_errors=section_errors,
        default=_empty_kpis(),
    )

    active_inventories = _run_section(
        "active_inventories",
        _build_active_inventories,
        db,
        base_q,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        failed_sections=failed_sections,
        section_errors=section_errors,
        default=[],
    )

    awaiting_approval = _run_section(
        "awaiting_approval",
        _build_awaiting_approvals,
        db,
        base_q,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        failed_sections=failed_sections,
        section_errors=section_errors,
        default=[],
    )

    recent_completed = _run_section(
        "recent_completed",
        _build_recent_completed,
        db,
        base_q,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        failed_sections=failed_sections,
        section_errors=section_errors,
        default=[],
    )

    difference_stats = _run_section(
        "difference_stats",
        _build_difference_stats,
        db,
        base_q,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        failed_sections=failed_sections,
        section_errors=section_errors,
        default={},
    )

    heatmap_preview = _run_section(
        "heatmap_preview",
        _build_heatmap_preview,
        db,
        base_q,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        failed_sections=failed_sections,
        section_errors=section_errors,
        default=[],
    )

    operator_activity = _run_section(
        "operator_activity",
        _build_operator_activity,
        db,
        base_q,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        failed_sections=failed_sections,
        section_errors=section_errors,
        default=[],
    )

    if failed_sections:
        status = "partial_failure" if kpis else "failed"
    else:
        status = "ok"

    logger.info(
        "INVENTORY_DASHBOARD_DONE status=%s failed_sections=%s",
        status,
        failed_sections,
    )

    return {
        "kpis": kpis,
        "active_inventories": active_inventories,
        "awaiting_approval": awaiting_approval,
        "recent_completed": recent_completed,
        "difference_stats": difference_stats,
        "heatmap_preview": heatmap_preview,
        "operator_activity": operator_activity,
        "dashboard_status": status,
        "failed_sections": failed_sections,
        "section_errors": section_errors,
        "schema_audit": schema_sync.get("audit_after") or schema_sync,
    }
