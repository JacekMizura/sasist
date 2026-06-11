"""
Z-PZ / RMZ schema — explicit, idempotent column sync (PostgreSQL + SQLite).

Non-destructive: ADD COLUMN / CREATE TABLE only. Never drops or recreates stock tables.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateTable

from .schema_introspection import (
    ensure_model_schema_sync,
    get_table_column_names,
    has_table,
)

logger = logging.getLogger(__name__)

Z_PZ_SCHEMA_VERSION = "2026.06.08.4"

# Startup verification — primary Z-PZ columns (user-facing contract).
Z_PZ_VERIFY_COLUMNS: tuple[tuple[str, str], ...] = (
    ("stock_documents", "source_rmz_ids_json"),
    ("stock_documents", "is_collective_return_receipt"),
    ("stock_documents", "collective_business_date"),
    ("stock_document_items", "source_rmz_id"),
    ("stock_document_items", "return_decision"),
)

# Extended Z-PZ ecosystem — ORM fields that must exist after deploy.
Z_PZ_EXTENDED_VERIFY: tuple[tuple[str, str], ...] = (
    ("wms_order_returns", "warehouse_document_id"),
    ("wms_order_returns", "warehouse_document_type"),
    ("document_series", "collective_return_receipt"),
)


@dataclass(frozen=True)
class _ColumnSpec:
    table: str
    column: str
    ddl_sqlite: str
    ddl_postgresql: str


def _column_specs() -> tuple[_ColumnSpec, ...]:
    return (
        _ColumnSpec(
            "stock_documents",
            "source_rmz_ids_json",
            "ALTER TABLE stock_documents ADD COLUMN source_rmz_ids_json TEXT",
            "ALTER TABLE stock_documents ADD COLUMN source_rmz_ids_json TEXT",
        ),
        _ColumnSpec(
            "stock_documents",
            "is_collective_return_receipt",
            "ALTER TABLE stock_documents ADD COLUMN is_collective_return_receipt "
            "INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE stock_documents ADD COLUMN is_collective_return_receipt "
            "BOOLEAN NOT NULL DEFAULT FALSE",
        ),
        _ColumnSpec(
            "stock_documents",
            "collective_business_date",
            "ALTER TABLE stock_documents ADD COLUMN collective_business_date DATE",
            "ALTER TABLE stock_documents ADD COLUMN collective_business_date DATE",
        ),
        _ColumnSpec(
            "stock_document_items",
            "source_rmz_id",
            "ALTER TABLE stock_document_items ADD COLUMN source_rmz_id INTEGER "
            "REFERENCES wms_order_returns(id) ON DELETE SET NULL",
            "ALTER TABLE stock_document_items ADD COLUMN source_rmz_id INTEGER "
            "REFERENCES wms_order_returns(id) ON DELETE SET NULL",
        ),
        _ColumnSpec(
            "stock_document_items",
            "return_decision",
            "ALTER TABLE stock_document_items ADD COLUMN return_decision VARCHAR(24)",
            "ALTER TABLE stock_document_items ADD COLUMN return_decision VARCHAR(24)",
        ),
        _ColumnSpec(
            "wms_order_returns",
            "warehouse_document_id",
            "ALTER TABLE wms_order_returns ADD COLUMN warehouse_document_id INTEGER "
            "REFERENCES stock_documents(id) ON DELETE SET NULL",
            "ALTER TABLE wms_order_returns ADD COLUMN warehouse_document_id INTEGER "
            "REFERENCES stock_documents(id) ON DELETE SET NULL",
        ),
        _ColumnSpec(
            "wms_order_returns",
            "warehouse_document_type",
            "ALTER TABLE wms_order_returns ADD COLUMN warehouse_document_type VARCHAR(32)",
            "ALTER TABLE wms_order_returns ADD COLUMN warehouse_document_type VARCHAR(32)",
        ),
        _ColumnSpec(
            "document_series",
            "collective_return_receipt",
            "ALTER TABLE document_series ADD COLUMN collective_return_receipt "
            "INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE document_series ADD COLUMN collective_return_receipt "
            "BOOLEAN NOT NULL DEFAULT TRUE",
        ),
    )


def _dialect(engine: Engine) -> str:
    return engine.dialect.name


def _add_column_if_missing(engine: Engine, spec: _ColumnSpec) -> bool:
    if not has_table(engine, spec.table):
        return False
    if spec.column in get_table_column_names(engine, spec.table):
        return False
    ddl = spec.ddl_postgresql if _dialect(engine) == "postgresql" else spec.ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info(
        "[z_pz.schema] added_column table=%s column=%s dialect=%s",
        spec.table,
        spec.column,
        _dialect(engine),
    )
    return True


def _ensure_stock_document_return_links_table(engine: Engine) -> bool:
    if has_table(engine, "stock_document_return_links"):
        return False
    from ..models.stock_document_return_link import StockDocumentReturnLink

    ddl = str(CreateTable(StockDocumentReturnLink.__table__).compile(dialect=engine.dialect))
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info(
        "[z_pz.schema] created_table table=stock_document_return_links dialect=%s",
        _dialect(engine),
    )
    return True


def _migrate_collective_z_pz_open_status(engine: Engine) -> None:
    """Legacy daily draft shells → OPEN (operator-close lifecycle)."""
    if not has_table(engine, "stock_documents"):
        return
    with engine.begin() as conn:
        if _dialect(engine) == "postgresql":
            conn.execute(
                text(
                    """
                    UPDATE stock_documents
                    SET status = 'OPEN'
                    WHERE document_type = 'Z_PZ'
                      AND is_collective_return_receipt = TRUE
                      AND status = 'draft'
                      AND relocation_status = 'OPEN'
                    """
                )
            )
        else:
            conn.execute(
                text(
                    """
                    UPDATE stock_documents
                    SET status = 'OPEN'
                    WHERE document_type = 'Z_PZ'
                      AND is_collective_return_receipt = 1
                      AND status = 'draft'
                      AND relocation_status = 'OPEN'
                    """
                )
            )


def _ensure_collective_z_pz_unique_index(engine: Engine) -> None:
    if not has_table(engine, "stock_documents"):
        return
    cols = set(get_table_column_names(engine, "stock_documents"))
    if "status" not in cols or "is_collective_return_receipt" not in cols:
        return
    _migrate_collective_z_pz_open_status(engine)
    with engine.begin() as conn:
        conn.execute(text("DROP INDEX IF EXISTS ux_stock_documents_collective_z_pz_daily"))
    if _dialect(engine) == "postgresql":
        sql = """
            CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_documents_collective_z_pz_open
            ON stock_documents (tenant_id, warehouse_id, document_series_id)
            WHERE is_collective_return_receipt = TRUE
              AND status = 'OPEN'
              AND document_type = 'Z_PZ'
        """
    else:
        sql = """
            CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_documents_collective_z_pz_open
            ON stock_documents (tenant_id, warehouse_id, document_series_id)
            WHERE is_collective_return_receipt = 1
              AND status = 'OPEN'
              AND document_type = 'Z_PZ'
        """
    with engine.begin() as conn:
        conn.execute(text(sql))


def _ensure_wms_order_returns_indexes(engine: Engine) -> None:
    if not has_table(engine, "wms_order_returns"):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_wms_order_returns_warehouse_document_id "
                "ON wms_order_returns(warehouse_document_id)"
            )
        )


def ensure_z_pz_schema(engine: Engine) -> int:
    """
    Idempotent Z-PZ schema sync — explicit ADD COLUMN (not ORM reconcile alone).

    Safe on production PostgreSQL and local SQLite.
    """
    added = 0
    for spec in _column_specs():
        try:
            if _add_column_if_missing(engine, spec):
                added += 1
        except Exception:
            logger.exception(
                "[z_pz.schema] add_column_failed table=%s column=%s dialect=%s",
                spec.table,
                spec.column,
                _dialect(engine),
            )
            raise

    try:
        if _ensure_stock_document_return_links_table(engine):
            added += 1
    except Exception:
        logger.exception("[z_pz.schema] return_links_table_failed dialect=%s", _dialect(engine))
        raise

    try:
        _ensure_collective_z_pz_unique_index(engine)
        _ensure_wms_order_returns_indexes(engine)
    except Exception:
        logger.exception("[z_pz.schema] index_ensure_failed dialect=%s", _dialect(engine))
        # Non-fatal — index requires full stock_documents header; columns are the hard gate.

    # ORM sync for indexes/FKs on link table + any drift on related models.
    try:
        from ..models.document_series import DocumentSeries
        from ..models.stock_document import StockDocument, StockDocumentItem
        from ..models.stock_document_return_link import StockDocumentReturnLink
        from ..models.wms_order_return import WmsOrderReturn

        for model in (
            StockDocument,
            StockDocumentItem,
            WmsOrderReturn,
            DocumentSeries,
            StockDocumentReturnLink,
        ):
            if has_table(engine, model.__tablename__):
                try:
                    added += ensure_model_schema_sync(
                        engine,
                        model,
                        log_prefix="z_pz.schema.orm",
                        sync_indexes=True,
                        sync_foreign_keys=False,
                    )
                except Exception:
                    logger.exception(
                        "[z_pz.schema] orm_sync_skipped table=%s dialect=%s",
                        model.__tablename__,
                        _dialect(engine),
                    )
    except Exception:
        logger.exception("[z_pz.schema] orm_sync_failed dialect=%s", _dialect(engine))

    logger.info(
        "[z_pz.schema] complete version=%s columns_added=%s dialect=%s",
        Z_PZ_SCHEMA_VERSION,
        added,
        _dialect(engine),
    )
    return added


def verify_z_pz_schema(engine: Engine, *, include_extended: bool = True) -> list[str]:
    """
    Return missing ``table.column`` keys (empty list = OK).
    """
    missing: list[str] = []
    for table, column in Z_PZ_VERIFY_COLUMNS:
        if not has_table(engine, table):
            missing.append(f"{table}.{column} (table missing)")
            continue
        if column not in get_table_column_names(engine, table):
            missing.append(f"{table}.{column}")
    if not has_table(engine, "stock_document_return_links"):
        missing.append("stock_document_return_links (table missing)")
    if include_extended:
        for table, column in Z_PZ_EXTENDED_VERIFY:
            if not has_table(engine, table):
                continue
            if column not in get_table_column_names(engine, table):
                missing.append(f"{table}.{column}")
    return missing


def log_z_pz_schema_verification(engine: Engine) -> list[str]:
    """Print ``[Z_PZ_SCHEMA]`` lines for startup diagnostics."""
    missing_critical = verify_z_pz_schema(engine, include_extended=False)

    for table, column in Z_PZ_VERIFY_COLUMNS:
        key = f"{table}.{column}"
        is_missing = key in missing_critical or any(m.startswith(f"{key} ") for m in missing_critical)
        if is_missing:
            line = f"[Z_PZ_SCHEMA] {key}=MISSING"
            print(line, flush=True)
            logger.error(line)
        else:
            line = f"[Z_PZ_SCHEMA] {key}=OK"
            print(line, flush=True)
            logger.info(line)

    if not has_table(engine, "stock_document_return_links"):
        line = "[Z_PZ_SCHEMA] stock_document_return_links=MISSING"
        print(line, flush=True)
        logger.error(line)
    else:
        line = "[Z_PZ_SCHEMA] stock_document_return_links=OK"
        print(line, flush=True)
        logger.info(line)

    for table, column in Z_PZ_EXTENDED_VERIFY:
        if not has_table(engine, table):
            continue
        key = f"{table}.{column}"
        if column not in get_table_column_names(engine, table):
            line = f"[Z_PZ_SCHEMA] {key}=MISSING"
            print(line, flush=True)
            logger.error(line)
        else:
            line = f"[Z_PZ_SCHEMA] {key}=OK"
            print(line, flush=True)
            logger.info(line)

    return missing_critical


def require_z_pz_schema_or_raise(engine: Engine, *, phase: str = "startup") -> None:
    """Hard gate — platform must not serve HTTP with Z-PZ ORM/DB drift."""
    ensure_z_pz_schema(engine)
    missing = log_z_pz_schema_verification(engine)
    if missing:
        msg = f"Z-PZ schema incomplete after sync phase={phase} missing={missing}"
        logger.error("[z_pz.schema] %s", msg)
        raise RuntimeError(msg)
