"""Cross-dialect purchasing schema sync (PostgreSQL + SQLite).

SQLite-only helpers in ``schema_upgrade`` skip PostgreSQL; this module ensures
ORM columns/tables exist on Railway Postgres after purchasing refactors.
"""

from __future__ import annotations

import logging

from sqlalchemy.engine import Engine

from .schema_introspection import ensure_model_schema_sync, ensure_model_table_from_orm

logger = logging.getLogger(__name__)

PURCHASING_SCHEMA_VERSION = "2026.06.08.purchasing_orm_sync"


def ensure_purchasing_orm_schema(engine: Engine) -> dict[str, int]:
    """Create missing purchasing tables and ADD COLUMN for Supplier / PO models."""
    from ..models.purchase_order import PurchaseOrder, PurchaseOrderItem
    from ..models.supplier import Supplier

    stats = {"tables_created": 0, "columns_added": 0}
    for model in (Supplier, PurchaseOrder, PurchaseOrderItem):
        if ensure_model_table_from_orm(engine, model, log_prefix="purchasing.schema"):
            stats["tables_created"] += 1
        added = ensure_model_schema_sync(
            engine,
            model,
            log_prefix="purchasing.schema",
            sync_indexes=True,
            sync_foreign_keys=False,
        )
        stats["columns_added"] += int(added)
    logger.info("[purchasing.schema] ok version=%s stats=%s", PURCHASING_SCHEMA_VERSION, stats)
    return stats
