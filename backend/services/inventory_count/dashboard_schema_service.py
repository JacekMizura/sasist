"""Schema audit + sync gate for inventory dashboard (PostgreSQL-safe)."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from ...db.inventory_count_schema import INVENTORY_COUNT_SCHEMA_VERSION, ensure_inventory_count_schema
from ...db.schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

# Tables the dashboard touches directly or via ORM document loads.
DASHBOARD_TABLES: tuple[str, ...] = (
    "inventory_documents",
    "inventory_document_lines",
    "inventory_snapshots",
    "inventory_recounts",
    "inventory_reports",
    "inventory_approvals",
    "inventory_sessions",
)

# Minimum columns required for dashboard aggregates / document serialization.
DASHBOARD_CRITICAL_COLUMNS: dict[str, tuple[str, ...]] = {
    "inventory_documents": (
        "id",
        "tenant_id",
        "warehouse_id",
        "number",
        "inventory_type",
        "status",
        "count_mode",
        "lock_mode",
        "recount_required",
        "scan_mode",
        "filters_json",
        "strategy_json",
        "metadata_json",
        "total_lines",
        "counted_lines",
        "difference_lines",
        "coverage_percent",
        "snapshot_created_at",
        "completed_at",
        "updated_at",
        "created_at",
    ),
    "inventory_sessions": (
        "id",
        "tenant_id",
        "warehouse_id",
        "status",
        "last_activity_at",
        "started_at",
        "user_id",
        "inventory_document_id",
    ),
    "inventory_document_lines": ("id", "inventory_document_id", "status", "difference_quantity"),
    "inventory_snapshots": ("id", "inventory_document_id", "snapshot_kind"),
    "inventory_recounts": ("id", "inventory_document_id", "status"),
    "inventory_reports": ("id", "inventory_document_id", "report_kind"),
    "inventory_approvals": ("id", "inventory_document_id", "action", "created_at"),
}


def audit_inventory_dashboard_schema(engine: Engine) -> dict[str, Any]:
    """Read-only audit — missing tables/columns visible in API payload."""
    logger.info("INVENTORY_SCHEMA_AUDIT dialect=%s version=%s", engine.dialect.name, INVENTORY_COUNT_SCHEMA_VERSION)
    missing_tables: list[str] = []
    missing_columns: dict[str, list[str]] = {}
    for table in DASHBOARD_TABLES:
        if not has_table(engine, table):
            missing_tables.append(table)
            continue
        present = get_table_column_names(engine, table)
        required = DASHBOARD_CRITICAL_COLUMNS.get(table, ("id",))
        absent = [c for c in required if c not in present]
        if absent:
            missing_columns[table] = absent
    ok = not missing_tables and not missing_columns
    payload = {
        "ok": ok,
        "schema_version": INVENTORY_COUNT_SCHEMA_VERSION,
        "dialect": engine.dialect.name,
        "missing_tables": missing_tables,
        "missing_columns": missing_columns,
    }
    if not ok:
        logger.warning(
            "INVENTORY_SCHEMA_AUDIT drift missing_tables=%s missing_columns=%s",
            missing_tables,
            missing_columns,
        )
    return payload


def ensure_inventory_dashboard_schema(db: Session) -> dict[str, Any]:
    """Sync tier-1 inventory schema before dashboard queries."""
    engine = db.get_bind()
    if engine is None:
        return {"ok": False, "error": "no_engine_bind"}
    logger.info("INVENTORY_SCHEMA_SYNC_START dialect=%s", engine.dialect.name)
    audit_before = audit_inventory_dashboard_schema(engine)
    columns_added = 0
    try:
        columns_added = ensure_inventory_count_schema(engine)
    except Exception:
        logger.exception("INVENTORY_SCHEMA_SYNC_FAILED")
    audit_after = audit_inventory_dashboard_schema(engine)
    logger.info(
        "INVENTORY_SCHEMA_SYNC_DONE columns_added=%s ok=%s",
        columns_added,
        audit_after.get("ok"),
    )
    return {
        "columns_added": columns_added,
        "audit_before": audit_before,
        "audit_after": audit_after,
        "critical_ok": bool(audit_after.get("ok")),
    }
