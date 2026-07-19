"""
Dialect-agnostic schema introspection (SQLite, PostgreSQL, …).

Use SQLAlchemy Inspector instead of sqlite_master / PRAGMA where possible.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection, Engine

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelSchemaSyncResult:
    columns_added: int = 0
    indexes_added: int = 0
    foreign_keys_added: int = 0


def get_engine(bind: Engine | Connection) -> Engine:
    if isinstance(bind, Engine):
        return bind
    eng = getattr(bind, "engine", None)
    if isinstance(eng, Engine):
        return eng
    raise TypeError(f"Expected Engine or Connection, got {type(bind)!r}")


def log_db_engine(engine: Engine, *, log: logging.Logger | None = None) -> None:
    """Startup diagnostic: dialect and driver (no credentials)."""
    lg = log or logger
    dialect = engine.dialect.name
    driver = getattr(engine.dialect, "driver", None) or "unknown"
    url = str(engine.url)
    if "@" in url:
        url = url.split("@", 1)[-1]
    lg.info("[db.engine] dialect=%s driver=%s url=%s", dialect, driver, url)


def has_table(bind: Engine | Connection, table_name: str, schema: str | None = None) -> bool:
    engine = get_engine(bind)
    return bool(inspect(engine).has_table(table_name, schema=schema))


def get_table_column_names(
    bind: Engine | Connection, table_name: str, schema: str | None = None
) -> set[str]:
    engine = get_engine(bind)
    insp = inspect(engine)
    if not insp.has_table(table_name, schema=schema):
        return set()
    return {str(c["name"]) for c in insp.get_columns(table_name, schema=schema)}


def has_index(
    bind: Engine | Connection,
    index_name: str,
    *,
    table_name: str | None = None,
) -> bool:
    engine = get_engine(bind)
    insp = inspect(engine)
    tables: list[str]
    if table_name:
        tables = [table_name] if insp.has_table(table_name) else []
    else:
        tables = list(insp.get_table_names())
    for tbl in tables:
        for idx in insp.get_indexes(tbl):
            if idx.get("name") == index_name:
                return True
    return False


def ensure_order_issue_tasks_archive_columns(engine: Engine) -> None:
    """Add archive columns when missing (SQLite dev DB + older PostgreSQL)."""
    if not has_table(engine, "order_issue_tasks"):
        return
    cols = get_table_column_names(engine, "order_issue_tasks")
    stmts: list[str] = []
    if "archived_at" not in cols:
        stmts.append("ALTER TABLE order_issue_tasks ADD COLUMN archived_at TIMESTAMP")
    if "archived_by_user_id" not in cols:
        stmts.append(
            "ALTER TABLE order_issue_tasks ADD COLUMN archived_by_user_id INTEGER "
            "REFERENCES app_users(id) ON DELETE SET NULL"
        )
    if not stmts:
        return
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))
    logger.info(
        "[schema] order_issue_tasks archive columns ensured dialect=%s added=%s",
        engine.dialect.name,
        len(stmts),
    )


def ensure_order_issue_tasks_lifecycle_columns(engine: Engine) -> None:
    """Priority + resolve audit columns on ``order_issue_tasks``."""
    if not has_table(engine, "order_issue_tasks"):
        return
    cols = get_table_column_names(engine, "order_issue_tasks")
    stmts: list[str] = []
    if "priority_level" not in cols:
        stmts.append("ALTER TABLE order_issue_tasks ADD COLUMN priority_level VARCHAR(16)")
    if "priority_score" not in cols:
        stmts.append("ALTER TABLE order_issue_tasks ADD COLUMN priority_score INTEGER DEFAULT 0")
    if "resolved_at" not in cols:
        stmts.append("ALTER TABLE order_issue_tasks ADD COLUMN resolved_at TIMESTAMP")
    if "resolved_by_user_id" not in cols:
        stmts.append(
            "ALTER TABLE order_issue_tasks ADD COLUMN resolved_by_user_id INTEGER "
            "REFERENCES app_users(id) ON DELETE SET NULL"
        )
    if "resolve_reason" not in cols:
        stmts.append("ALTER TABLE order_issue_tasks ADD COLUMN resolve_reason VARCHAR(64)")
    if not stmts:
        return
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))
    logger.info(
        "[schema] order_issue_tasks lifecycle columns ensured dialect=%s added=%s",
        engine.dialect.name,
        len(stmts),
    )


def ensure_order_issue_task_items_table(engine: Engine) -> None:
    """Operational line items for Braki tasks — dialect-aware ORM DDL (SQLite + PostgreSQL)."""
    if has_table(engine, "order_issue_task_items"):
        return
    from ..models.order_issue_task import OrderIssueTask
    from ..models.order_issue_task_item import OrderIssueTaskItem

    if not has_table(engine, "order_issue_tasks"):
        ensure_model_table_from_orm(engine, OrderIssueTask, log_prefix="schema.order_issue_tasks")
    created = ensure_model_table_from_orm(
        engine, OrderIssueTaskItem, log_prefix="schema.order_issue_task_items"
    )
    if created:
        sync_model_indexes(
            engine, OrderIssueTaskItem, log_prefix="schema.order_issue_task_items"
        )
    logger.info(
        "[schema] order_issue_task_items table ensured dialect=%s created=%s",
        engine.dialect.name,
        bool(created),
    )


def ensure_wms_picking_shortage_settings_columns(engine: Engine) -> None:
    """
    Dialect-safe ALTERs on ``wms_picking_shortage_settings`` (PostgreSQL + SQLite).

    Must run on Railway PG — ``ensure_picking_shortage_support`` is SQLite-gated in main.
    """
    if not has_table(engine, "wms_picking_shortage_settings"):
        return
    cols = get_table_column_names(engine, "wms_picking_shortage_settings")
    stmts: list[str] = []
    if "wms_validation_failed_order_ui_status_id" not in cols:
        stmts.append(
            "ALTER TABLE wms_picking_shortage_settings "
            "ADD COLUMN wms_validation_failed_order_ui_status_id INTEGER "
            "REFERENCES order_ui_statuses(id) ON DELETE SET NULL"
        )
    if "disable_auto_detach_missing_orders_from_carts" not in cols:
        stmts.append(
            "ALTER TABLE wms_picking_shortage_settings "
            "ADD COLUMN disable_auto_detach_missing_orders_from_carts BOOLEAN "
            "NOT NULL DEFAULT FALSE"
        )
    if not stmts:
        return
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))
    logger.info(
        "[schema] wms_picking_shortage_settings columns ensured dialect=%s added=%s",
        engine.dialect.name,
        len(stmts),
    )


def list_user_tables(bind: Engine | Connection) -> list[str]:
    """User tables (excludes SQLite internal tables)."""
    engine = get_engine(bind)
    names = list(inspect(engine).get_table_names())
    return [n for n in names if not n.startswith("sqlite_")]


def _add_column_if_missing(engine: Engine, table: str, col: str, ddl: str) -> bool:
    cols = get_table_column_names(engine, table)
    if col in cols:
        return False
    with engine.begin() as conn:
        conn.execute(text(ddl))
    return True


def _normalize_type_token(type_sql: str) -> str:
    """Normalize compiled/reflected SQL types for cross-dialect comparison."""
    t = str(type_sql or "").upper().replace(" ", "")
    if not t:
        return "UNKNOWN"
    if "TIMESTAMP" in t or "DATETIME" in t:
        return "DATETIME_LIKE"
    if t.startswith("BOOL"):
        return "BOOLEAN"
    if "DOUBLE" in t or t.startswith("REAL") or t.startswith("FLOAT"):
        return "FLOAT"
    if "INT" in t:
        return "INTEGER"
    if "JSON" in t:
        return "JSON_LIKE"
    if "TEXT" in t or "CLOB" in t:
        return "TEXT_LIKE"
    if "VARCHAR" in t or "CHARACTER" in t or t.startswith("CHAR"):
        return "VARCHAR_LIKE"
    return t


def _compile_orm_column_type(col: Any, engine: Engine) -> str:
    return str(col.type.compile(dialect=engine.dialect))


def _get_reflected_columns(engine: Engine, table: str) -> dict[str, dict[str, Any]]:
    insp = inspect(engine)
    if not insp.has_table(table):
        return {}
    return {str(c["name"]): c for c in insp.get_columns(table)}


def audit_model_schema(engine: Engine, model: Any) -> dict[str, Any]:
    """
    Deep ORM vs DB audit: columns, types, nullability, FKs, indexes.

    Does not mutate schema.
    """
    table = model.__tablename__
    orm_cols = list(model.__table__.columns)
    base = audit_orm_table_columns(engine, model)
    if not base.get("exists"):
        return {
            **base,
            "type_mismatches": [],
            "nullable_mismatches": [],
            "fk_mismatches": [],
            "missing_indexes": [],
        }

    reflected = _get_reflected_columns(engine, table)
    type_mismatches: list[dict[str, str]] = []
    nullable_mismatches: list[dict[str, str]] = []

    for col in orm_cols:
        if col.key not in reflected:
            continue
        db_col = reflected[col.key]
        expected_raw = _compile_orm_column_type(col, engine)
        actual_raw = str(db_col.get("type") or "")
        expected_norm = _normalize_type_token(expected_raw)
        actual_norm = _normalize_type_token(actual_raw)
        if expected_norm != actual_norm:
            type_mismatches.append(
                {
                    "column": col.key,
                    "expected": expected_raw,
                    "actual": actual_raw,
                    "expected_norm": expected_norm,
                    "actual_norm": actual_norm,
                }
            )
            logger.warning(
                "[schema.audit] table=%s column=%s expected=%s actual=%s",
                table,
                col.key,
                expected_raw,
                actual_raw,
            )

        expected_nullable = bool(col.nullable)
        actual_nullable = bool(db_col.get("nullable", True))
        if expected_nullable != actual_nullable:
            nullable_mismatches.append(
                {
                    "column": col.key,
                    "expected_nullable": str(expected_nullable),
                    "actual_nullable": str(actual_nullable),
                }
            )

    fk_mismatches: list[dict[str, str]] = []
    insp = inspect(engine)
    db_fks = insp.get_foreign_keys(table)
    orm_fk_cols: set[str] = set()
    for col in orm_cols:
        for fk in col.foreign_keys:
            orm_fk_cols.add(col.key)
    db_fk_cols: set[str] = set()
    for fk in db_fks:
        for local_col in fk.get("constrained_columns") or []:
            db_fk_cols.add(str(local_col))
    for missing_fk in sorted(orm_fk_cols - db_fk_cols):
        fk_mismatches.append({"column": missing_fk, "issue": "orm_fk_missing_in_db"})
    for extra_fk in sorted(db_fk_cols - orm_fk_cols):
        fk_mismatches.append({"column": extra_fk, "issue": "db_fk_not_in_orm"})

    missing_indexes: list[dict[str, str]] = []
    db_index_names = {str(i.get("name") or "") for i in insp.get_indexes(table)}
    for idx in model.__table__.indexes:
        idx_name = str(idx.name or "")
        if idx_name and idx_name not in db_index_names:
            missing_indexes.append({"index": idx_name, "columns": ",".join(c.name for c in idx.columns)})

    return {
        **base,
        "type_mismatches": type_mismatches,
        "nullable_mismatches": nullable_mismatches,
        "fk_mismatches": fk_mismatches,
        "missing_indexes": missing_indexes,
    }


def _alter_table_add_column_sql(engine: Engine, table: str, col_sql: str) -> str:
    """Dialect-correct ``ALTER TABLE ... ADD [COLUMN] ...`` (PostgreSQL requires COLUMN keyword)."""
    if engine.dialect.name == "postgresql":
        return f"ALTER TABLE {table} ADD COLUMN {col_sql}"
    return f"ALTER TABLE {table} ADD COLUMN {col_sql}"


def _strip_not_null_from_col_sql(col_sql: str) -> str:
    import re

    return re.sub(r"\s+NOT NULL\b", "", col_sql, flags=re.IGNORECASE).strip()


def _table_has_rows(engine: Engine, table: str) -> bool:
    if not has_table(engine, table):
        return False
    with engine.connect() as conn:
        return bool(conn.execute(text(f"SELECT 1 FROM {table} LIMIT 1")).scalar())


def _python_default_for_not_null_column(col: Any, table: str) -> Any | None:
    """Resolve backfill value for existing rows when adding NOT NULL without server DEFAULT."""
    if col.server_default is not None:
        arg = getattr(col.server_default, "arg", None)
        if arg is not None and not callable(arg):
            text_val = str(arg).strip().strip("'").strip('"')
            return text_val

    default = col.default
    if default is not None:
        arg = getattr(default, "arg", None)
        if arg is not None and not callable(arg):
            return arg
        if callable(arg):
            try:
                return arg()
            except TypeError:
                try:
                    return arg(None)
                except Exception:
                    pass

    known: dict[tuple[str, str], Any] = {
        ("customers", "customer_type"): "retail",
        ("customers", "customer_status"): "active",
        ("customers", "sales_channel"): "store",
    }
    if (table, col.key) in known:
        return known[(table, col.key)]

    from sqlalchemy import Boolean, Float, Integer, String, Text

    col_type = col.type
    if isinstance(col_type, Boolean):
        return False
    if isinstance(col_type, (Integer,)):
        return 0
    if isinstance(col_type, (Float,)):
        return 0.0
    if isinstance(col_type, (String, Text)):
        return ""
    return None


def _add_orm_column_with_optional_backfill(
    engine: Engine,
    *,
    table: str,
    col: Any,
    col_sql: str,
    log_prefix: str,
) -> None:
    """
    PostgreSQL/SQLite: NOT NULL on populated tables requires nullable add → backfill → SET NOT NULL.
    Empty tables or nullable columns use a single ADD COLUMN.
    """
    dialect = engine.dialect.name
    direct_stmt = _alter_table_add_column_sql(engine, table, col_sql)
    needs_backfill = (
        col.nullable is False
        and _table_has_rows(engine, table)
        and dialect in ("postgresql", "sqlite")
    )

    if not needs_backfill:
        with engine.begin() as conn:
            conn.execute(text(direct_stmt))
        return

    backfill = _python_default_for_not_null_column(col, table)
    if backfill is None:
        logger.warning(
            "[%s] not_null_backfill_missing table=%s column=%s — attempting direct ADD",
            log_prefix,
            table,
            col.key,
        )
        with engine.begin() as conn:
            conn.execute(text(direct_stmt))
        return

    nullable_sql = _alter_table_add_column_sql(
        engine,
        table,
        _strip_not_null_from_col_sql(col_sql),
    )
    with engine.begin() as conn:
        conn.execute(text(nullable_sql))
        conn.execute(
            text(f"UPDATE {table} SET {col.key} = :v WHERE {col.key} IS NULL"),
            {"v": backfill},
        )
        if dialect == "postgresql":
            conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {col.key} SET NOT NULL"))
        logger.info(
            "[%s] not_null_backfill table=%s column=%s default=%r dialect=%s",
            log_prefix,
            table,
            col.key,
            backfill,
            dialect,
        )

def _create_index_if_missing_sql(engine: Engine, create_index_stmt: str) -> str:
    """Append IF NOT EXISTS where supported (safe re-run on startup)."""
    upper = create_index_stmt.upper()
    if "IF NOT EXISTS" in upper:
        return create_index_stmt
    if engine.dialect.name in ("postgresql", "sqlite"):
        if upper.startswith("CREATE UNIQUE INDEX "):
            return create_index_stmt.replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", 1)
        if upper.startswith("CREATE INDEX "):
            return create_index_stmt.replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", 1)
    return create_index_stmt


def _db_foreign_key_local_columns(engine: Engine, table: str) -> set[str]:
    insp = inspect(engine)
    cols: set[str] = set()
    for fk in insp.get_foreign_keys(table):
        for local_col in fk.get("constrained_columns") or []:
            cols.add(str(local_col))
    return cols


def _count_fk_orphan_rows(
    engine: Engine,
    local_table: str,
    local_col: str,
    remote_table: str,
    remote_col: str,
) -> int:
    if not has_table(engine, local_table) or not has_table(engine, remote_table):
        return 0
    sql = text(
        f"""
        SELECT COUNT(*) FROM {local_table} AS t
        WHERE t.{local_col} IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM {remote_table} AS r
            WHERE r.{remote_col} = t.{local_col}
          )
        """
    )
    with engine.connect() as conn:
        return int(conn.execute(sql).scalar() or 0)


def _null_fk_orphan_rows(
    engine: Engine,
    local_table: str,
    local_col: str,
    remote_table: str,
    remote_col: str,
) -> int:
    before = _count_fk_orphan_rows(engine, local_table, local_col, remote_table, remote_col)
    if before == 0:
        return 0
    sql = text(
        f"""
        UPDATE {local_table} AS t
        SET {local_col} = NULL
        WHERE t.{local_col} IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM {remote_table} AS r
            WHERE r.{remote_col} = t.{local_col}
          )
        """
    )
    with engine.begin() as conn:
        conn.execute(sql)
    return before


def _repair_fk_orphans_for_constraint(
    engine: Engine,
    model: Any,
    fk_constraint: Any,
    *,
    log_prefix: str,
) -> bool:
    """
    Null orphan FK values when column is nullable.

    Returns False when orphans exist on a NOT NULL column (FK must be skipped).
    """
    table = model.__tablename__
    can_add = True

    for col in fk_constraint.columns:
        orphan_refs: list[tuple[str, str, int]] = []
        for fk in col.foreign_keys:
            remote_table = fk.column.table.name
            remote_col = fk.column.name
            count = _count_fk_orphan_rows(engine, table, col.key, remote_table, remote_col)
            if count:
                orphan_refs.append((remote_table, remote_col, count))

        if not orphan_refs:
            continue

        if not col.nullable:
            for remote_table, remote_col, count in orphan_refs:
                logger.warning(
                    "[%s] fk_orphan_skip table=%s column=%s remote=%s.%s orphans=%s "
                    "reason=column_not_nullable",
                    log_prefix,
                    table,
                    col.key,
                    remote_table,
                    remote_col,
                    count,
                )
            can_add = False
            continue

        for remote_table, remote_col, _ in orphan_refs:
            nulled = _null_fk_orphan_rows(engine, table, col.key, remote_table, remote_col)
            logger.warning(
                "[%s] fk_orphan_repaired table=%s column=%s remote=%s.%s orphans_nulled=%s",
                log_prefix,
                table,
                col.key,
                remote_table,
                remote_col,
                nulled,
            )

    return can_add


def _ensure_model_foreign_keys(
    engine: Engine,
    model: Any,
    *,
    log_prefix: str,
    strict: bool,
    errors: list[str],
) -> int:
    from sqlalchemy.schema import AddConstraint

    table = model.__tablename__
    if not has_table(engine, table):
        return 0

    db_cols = get_table_column_names(engine, table)
    db_fk_cols = _db_foreign_key_local_columns(engine, table)
    added = 0

    for fk_constraint in model.__table__.foreign_key_constraints:
        local_cols = [c.key for c in fk_constraint.columns]
        if not local_cols or all(c in db_fk_cols for c in local_cols):
            continue
        if not all(c in db_cols for c in local_cols):
            continue
        if not _repair_fk_orphans_for_constraint(
            engine, model, fk_constraint, log_prefix=log_prefix
        ):
            errors.append(
                f"{table}.fk.{fk_constraint.name}: orphan_rows_non_nullable"
            )
            logger.warning(
                "[%s] add_fk_skipped table=%s constraint=%s reason=orphan_rows",
                log_prefix,
                table,
                fk_constraint.name,
            )
            continue
        try:
            stmt = str(AddConstraint(fk_constraint).compile(dialect=engine.dialect))
            with engine.begin() as conn:
                conn.execute(text(stmt))
            added += 1
            logger.debug(
                "[%s] added_fk table=%s constraint=%s dialect=%s",
                log_prefix,
                table,
                fk_constraint.name,
                engine.dialect.name,
            )
        except Exception as exc:
            logger.debug(
                "[%s] add_fk_failed table=%s constraint=%s dialect=%s err=%s",
                log_prefix,
                table,
                fk_constraint.name,
                engine.dialect.name,
                exc,
            )
            errors.append(f"{table}.fk.{fk_constraint.name}: {exc}")
            if strict:
                raise
    return added


def sync_model_foreign_keys(
    engine: Engine,
    model: Any,
    *,
    log_prefix: str = "schema.model_sync",
    strict: bool = False,
    errors: list[str] | None = None,
) -> int:
    err_list = errors if errors is not None else []
    return _ensure_model_foreign_keys(
        engine, model, log_prefix=log_prefix, strict=strict, errors=err_list
    )


def _ensure_model_indexes(
    engine: Engine,
    model: Any,
    *,
    log_prefix: str,
    strict: bool,
    errors: list[str],
) -> int:
    from sqlalchemy.schema import CreateIndex

    table = model.__tablename__
    if not has_table(engine, table):
        return 0

    existing = {str(i.get("name") or "") for i in inspect(engine).get_indexes(table)}
    db_col_set = set(get_table_column_names(engine, table))
    added = 0
    for idx in model.__table__.indexes:
        idx_name = str(idx.name or "")
        if not idx_name or idx_name in existing:
            continue
        idx_cols = {c.name for c in idx.columns}
        missing_cols = idx_cols - db_col_set
        if missing_cols:
            logger.debug(
                "[%s] skip_index table=%s index=%s reason=missing_columns missing=%s",
                log_prefix,
                table,
                idx_name,
                sorted(missing_cols),
            )
            continue
        try:
            raw = str(CreateIndex(idx).compile(dialect=engine.dialect))
            stmt = _create_index_if_missing_sql(engine, raw)
            with engine.begin() as conn:
                conn.execute(text(stmt))
            added += 1
            logger.debug("[%s] added_index table=%s index=%s dialect=%s", log_prefix, table, idx_name, engine.dialect.name)
        except Exception as exc:
            logger.exception("[%s] add_index_failed table=%s index=%s", log_prefix, table, idx_name)
            errors.append(f"{table}.index.{idx_name}: {exc}")
            if strict:
                raise
    return added


def sync_model_indexes(
    engine: Engine,
    model: Any,
    *,
    log_prefix: str = "schema.model_sync",
    strict: bool = False,
    errors: list[str] | None = None,
) -> int:
    err_list = errors if errors is not None else []
    return _ensure_model_indexes(
        engine, model, log_prefix=log_prefix, strict=strict, errors=err_list
    )


def ensure_model_table_from_orm(engine: Engine, model: Any, *, log_prefix: str = "schema.model_sync") -> bool:
    """Create a single missing table from ORM metadata (no create_all)."""
    from sqlalchemy.schema import CreateTable

    table = model.__tablename__
    if has_table(engine, table):
        return False
    ddl = str(CreateTable(model.__table__).compile(dialect=engine.dialect))
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.debug("[%s] created_table table=%s dialect=%s", log_prefix, table, engine.dialect.name)
    return True


def sync_model_columns(
    engine: Engine,
    model: Any,
    *,
    log_prefix: str = "schema.model_sync",
    strict: bool = False,
    errors: list[str] | None = None,
    failed_columns: set[str] | None = None,
) -> int:
    """ADD COLUMN only — no indexes or foreign keys."""
    from sqlalchemy.schema import CreateColumn

    err_list = errors if errors is not None else []
    failed = failed_columns if failed_columns is not None else set()
    table = model.__tablename__
    if not has_table(engine, table):
        logger.debug("[%s] skip table=%s reason=missing_table", log_prefix, table)
        return 0

    columns_added = 0
    dialect = engine.dialect.name
    db_cols = set(get_table_column_names(engine, table))

    for col in model.__table__.columns:
        if col.key in db_cols:
            continue
        col_sql = str(CreateColumn(col).compile(dialect=engine.dialect))
        try:
            _add_orm_column_with_optional_backfill(
                engine,
                table=table,
                col=col,
                col_sql=col_sql,
                log_prefix=log_prefix,
            )
            columns_added += 1
            db_cols.add(col.key)
            logger.debug(
                "[%s] added_column table=%s column=%s dialect=%s",
                log_prefix,
                table,
                col.key,
                dialect,
            )
        except Exception as exc:
            failed.add(col.key)
            logger.exception(
                "[%s] add_column_failed table=%s column=%s dialect=%s",
                log_prefix,
                table,
                col.key,
                dialect,
            )
            err_list.append(f"{table}.{col.key}: {exc}")
            if strict:
                raise
    return columns_added


def sync_model_schema(
    engine: Engine,
    model: Any,
    *,
    log_prefix: str = "schema.model_sync",
    sync_indexes: bool = True,
    sync_foreign_keys: bool = True,
    strict: bool = False,
) -> ModelSchemaSyncResult:
    """
    Full non-destructive sync for one ORM model:
    ADD COLUMN, CREATE INDEX (IF NOT EXISTS), ADD FK constraints when missing.
    Never drops columns, tables, or data.
    """
    errors: list[str] = []
    failed_columns: set[str] = set()
    columns_added = sync_model_columns(
        engine,
        model,
        log_prefix=log_prefix,
        strict=strict,
        errors=errors,
        failed_columns=failed_columns,
    )
    indexes_added = 0
    if sync_indexes:
        indexes_added = sync_model_indexes(
            engine, model, log_prefix=log_prefix, strict=strict, errors=errors
        )
    foreign_keys_added = 0
    if sync_foreign_keys:
        foreign_keys_added = sync_model_foreign_keys(
            engine, model, log_prefix=log_prefix, strict=strict, errors=errors
        )

    table = model.__tablename__
    dialect = engine.dialect.name
    if columns_added or indexes_added or foreign_keys_added:
        logger.info(
            "[%s] complete table=%s dialect=%s columns=%s indexes=%s fks=%s",
            log_prefix,
            table,
            dialect,
            columns_added,
            indexes_added,
            foreign_keys_added,
        )
    if strict and errors:
        raise RuntimeError(f"schema sync failed for {table}: {'; '.join(errors)}")
    return ModelSchemaSyncResult(
        columns_added=columns_added,
        indexes_added=indexes_added,
        foreign_keys_added=foreign_keys_added,
    )


def ensure_model_schema_sync(
    engine: Engine,
    model: Any,
    *,
    log_prefix: str = "schema.model_sync",
    sync_indexes: bool = False,
    sync_foreign_keys: bool = False,
    strict: bool = False,
) -> int:
    """
    Reusable isolated schema sync for a single ORM model.

    - Adds missing columns (one transaction per column)
    - Optionally creates missing ORM indexes and foreign keys
    - Never alters existing column types (audit reports drift instead)
    """
    result = sync_model_schema(
        engine,
        model,
        log_prefix=log_prefix,
        sync_indexes=sync_indexes,
        sync_foreign_keys=sync_foreign_keys,
        strict=strict,
    )
    return result.columns_added


def _ensure_orm_columns_for_model(engine: Engine, model: Any) -> int:
    """Backward-compatible wrapper — delegates to ``ensure_model_schema_sync``."""
    return ensure_model_schema_sync(engine, model, log_prefix="schema.tier0")


def ensure_sale_documents_orm_columns(engine: Engine) -> int:
    """Sync ``sale_documents`` ORM columns."""
    from ..models.sale_document import SaleDocument

    return _ensure_orm_columns_for_model(engine, SaleDocument)


def ensure_stock_documents_orm_columns(engine: Engine) -> int:
    """Sync ``stock_documents`` ORM columns (WZ numbering, direct-sale linkage)."""
    from ..models.stock_document import StockDocument

    return _ensure_orm_columns_for_model(engine, StockDocument)


def audit_orm_table_columns(engine: Engine, model: Any) -> dict[str, Any]:
    """Compare ORM model columns vs physical DB table (startup diagnostics)."""
    table = model.__tablename__
    orm_cols = [c.key for c in model.__table__.columns]
    if not has_table(engine, table):
        return {
            "table": table,
            "exists": False,
            "orm_columns": orm_cols,
            "db_columns": [],
            "missing_in_db": orm_cols,
            "extra_in_db": [],
        }
    db_cols = sorted(get_table_column_names(engine, table))
    orm_set = set(orm_cols)
    db_set = set(db_cols)
    return {
        "table": table,
        "exists": True,
        "orm_columns": sorted(orm_set),
        "db_columns": db_cols,
        "missing_in_db": sorted(orm_set - db_set),
        "extra_in_db": sorted(db_set - orm_set),
    }


def ensure_production_batches_orm_columns(engine: Engine) -> int:
    """Sync ``production_batches`` ORM columns (WMS workflow fields)."""
    from ..models.product_composition import ProductionBatch

    return _ensure_orm_columns_for_model(engine, ProductionBatch)


def ensure_production_batch_lines_orm_columns(engine: Engine) -> int:
    """Sync ``production_batch_lines`` ORM columns."""
    from ..models.product_composition import ProductionBatchLine

    return _ensure_orm_columns_for_model(engine, ProductionBatchLine)


def sync_production_batch_orm_columns(engine: Engine) -> int:
    """Legacy entry — delegates to production schema evolution sync layer."""
    from .production_schema import sync_production_registered_models

    return sync_production_registered_models(engine)


def ensure_stock_document_items_orm_columns(engine: Engine) -> int:
    """Sync ``stock_document_items`` ORM columns."""
    from ..models.stock_document import StockDocumentItem

    return _ensure_orm_columns_for_model(engine, StockDocumentItem)


def ensure_order_documents_orm_columns(engine: Engine) -> int:
    """Sync ``order_documents`` ORM columns."""
    from ..models.order_document import OrderDocument

    return _ensure_orm_columns_for_model(engine, OrderDocument)


def ensure_sale_document_stock_links_orm_columns(engine: Engine) -> int:
    """Sync ``sale_document_stock_links`` ORM columns (PA/FV ↔ WZ)."""
    from ..models.sale_document_stock_link import SaleDocumentStockLink

    return _ensure_orm_columns_for_model(engine, SaleDocumentStockLink)


def ensure_document_series_orm_columns(engine: Engine) -> int:
    """Sync ``document_series`` ORM columns (numbering / warehouse series link)."""
    from ..models.document_series import DocumentSeries

    return _ensure_orm_columns_for_model(engine, DocumentSeries)


def ensure_sale_document_stock_links_table(engine: Engine) -> int:
    """Create ``sale_document_stock_links`` when missing (dialect-agnostic via ORM metadata)."""
    if has_table(engine, "sale_document_stock_links"):
        return 0
    from ..models.sale_document_stock_link import SaleDocumentStockLink

    SaleDocumentStockLink.__table__.create(engine, checkfirst=True)
    logger.info(
        "[schema.tier0] sale_document_stock_links table created dialect=%s",
        engine.dialect.name,
    )
    return 1


def ensure_tier0_document_warehouse_schema(engine: Engine) -> int:
    """
    Full ORM-vs-DB reconciliation for document/warehouse tables used by Direct Sales.

    Startup only — never during /complete, WZ, or payment handlers.
    """
    added = 0
    added += ensure_sale_document_stock_links_table(engine)
    added += ensure_document_series_orm_columns(engine)
    added += ensure_sale_documents_orm_columns(engine)
    added += ensure_stock_documents_orm_columns(engine)
    added += ensure_stock_document_items_orm_columns(engine)
    from .z_pz_schema import ensure_z_pz_schema

    ensure_z_pz_schema(engine)
    added += ensure_sale_document_stock_links_orm_columns(engine)
    added += ensure_order_documents_orm_columns(engine)
    return added


def verify_tier0_sql_probes(engine: Engine) -> list[dict[str, Any]]:
    """
    Direct SQL probes for production recovery — do not trust ORM alone.
    Returns list of failures (empty = all probes OK).
    """
    optional_tables = frozenset(
        {
            "sale_documents",
            "stock_documents",
            "stock_document_items",
            "document_series",
            "sale_document_stock_links",
            "order_documents",
        }
    )
    probes = (
        ("orders", "SELECT order_channel, fulfillment_mode FROM orders LIMIT 1"),
        (
            "order_items",
            "SELECT source_location_id, source_movement_id FROM order_items LIMIT 1",
        ),
        ("locations", "SELECT operational_zone_type FROM locations LIMIT 1"),
        (
            "sale_documents",
            "SELECT document_type_id, payment_captured_at FROM sale_documents LIMIT 1",
        ),
        (
            "stock_documents",
            "SELECT document_series_id, document_number, order_id, source_sale_document_id, "
            "source_rmz_ids_json, is_collective_return_receipt, collective_business_date "
            "FROM stock_documents LIMIT 1",
        ),
        (
            "stock_document_items",
            "SELECT source_rmz_id, return_decision FROM stock_document_items LIMIT 1",
        ),
        (
            "document_series",
            "SELECT warehouse_document_series_id, numbering_format FROM document_series LIMIT 1",
        ),
    )
    failures: list[dict[str, Any]] = []
    for table, sql in probes:
        if not has_table(engine, table):
            if table not in optional_tables:
                failures.append({"table": table, "error": "table_missing", "sql": sql})
            continue
        try:
            with engine.connect() as conn:
                conn.execute(text(sql))
        except Exception as exc:
            failures.append(
                {
                    "table": table,
                    "error": f"{type(exc).__name__}: {exc}",
                    "sql": sql,
                }
            )
    return failures


def sync_tier0_orm_columns_from_models(engine: Engine) -> int:
    """
    Dialect-agnostic Tier 0 sync: add ORM columns missing in DB.
    Required on PostgreSQL where legacy schema_upgrade helpers are SQLite-only no-ops.
    """
    from sqlalchemy.schema import CreateColumn

    from ..models.location import Location
    from ..models.order import Order
    from ..models.order_item import OrderItem
    from ..models.product import Product

    models: list[Any] = [Order, OrderItem, Location, Product]
    try:
        from ..models.inventory import Inventory

        models.append(Inventory)
    except Exception:
        pass
    try:
        from ..models.inventory_unit import InventoryUnit

        models.append(InventoryUnit)
    except Exception:
        pass

    added = 0
    dialect = engine.dialect.name
    for model in models:
        table = model.__tablename__
        if not has_table(engine, table):
            continue
        db_cols = get_table_column_names(engine, table)
        for col in model.__table__.columns:
            if col.key in db_cols:
                continue
            try:
                col_sql = str(CreateColumn(col).compile(dialect=engine.dialect))
                stmt = f"ALTER TABLE {table} ADD {col_sql}"
                with engine.begin() as conn:
                    conn.execute(text(stmt))
                added += 1
                logger.info(
                    "[schema.tier0] orm_sync added table=%s column=%s dialect=%s",
                    table,
                    col.key,
                    dialect,
                )
            except Exception:
                logger.exception(
                    "[schema.tier0] orm_sync failed table=%s column=%s dialect=%s",
                    table,
                    col.key,
                    dialect,
                )
    if added:
        logger.info("[schema.tier0] orm_sync complete dialect=%s added=%s", dialect, added)
    return added


def ensure_operational_core_orm_columns(engine: Engine) -> int:
    """
    Sync ORM columns on existing core tables (orders, locations, order_items).

    Must run synchronously at import / before first HTTP request — classic OMS/WMS
    queries use these models even when operational feature flags are OFF.
    """
    added = 0
    if has_table(engine, "orders"):
        for col, ddl in (
            ("order_channel", "ALTER TABLE orders ADD COLUMN order_channel VARCHAR(32)"),
            ("fulfillment_mode", "ALTER TABLE orders ADD COLUMN fulfillment_mode VARCHAR(32)"),
        ):
            if _add_column_if_missing(engine, "orders", col, ddl):
                added += 1
    if has_table(engine, "locations"):
        for col, ddl in (
            ("operational_zone_type", "ALTER TABLE locations ADD COLUMN operational_zone_type VARCHAR(24)"),
            ("sales_priority", "ALTER TABLE locations ADD COLUMN sales_priority INTEGER DEFAULT 100"),
            ("picking_priority", "ALTER TABLE locations ADD COLUMN picking_priority INTEGER DEFAULT 100"),
            ("replenishment_priority", "ALTER TABLE locations ADD COLUMN replenishment_priority INTEGER DEFAULT 100"),
        ):
            if _add_column_if_missing(engine, "locations", col, ddl):
                added += 1
    if has_table(engine, "order_items"):
        for col, ddl in (
            (
                "source_location_id",
                "ALTER TABLE order_items ADD COLUMN source_location_id INTEGER "
                "REFERENCES locations(id) ON DELETE SET NULL",
            ),
            (
                "source_movement_id",
                "ALTER TABLE order_items ADD COLUMN source_movement_id INTEGER "
                "REFERENCES warehouse_inventory_movements(id) ON DELETE SET NULL",
            ),
            (
                "issue_session_id",
                "ALTER TABLE order_items ADD COLUMN issue_session_id INTEGER "
                "REFERENCES direct_sale_sessions(id) ON DELETE SET NULL",
            ),
            ("issued_by_user_id", "ALTER TABLE order_items ADD COLUMN issued_by_user_id INTEGER"),
        ):
            if _add_column_if_missing(engine, "order_items", col, ddl):
                added += 1
    if added:
        logger.info("[startup.schema] operational_core_orm_columns added=%s", added)
    return added


def ensure_operational_sales_phase1_schema(engine: Engine) -> None:
    """Phase 1: order channel/mode, zones, sessions, payments, traceability."""
    added = ensure_operational_core_orm_columns(engine)

    if not has_table(engine, "operational_workstations"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE operational_workstations (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        code VARCHAR(64) NOT NULL,
                        name VARCHAR(128) NOT NULL,
                        operational_zone_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        device_type VARCHAR(32),
                        is_active INTEGER NOT NULL DEFAULT 1,
                        metadata_json TEXT,
                        created_at TIMESTAMP NOT NULL DEFAULT (datetime('now'))
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_operational_workstations_wh "
                    "ON operational_workstations(warehouse_id, code)"
                )
            )
        added += 1

    if not has_table(engine, "direct_sale_sessions"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE direct_sale_sessions (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        operator_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                        workstation_id INTEGER REFERENCES operational_workstations(id) ON DELETE SET NULL,
                        operational_zone_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
                        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
                        payment_context_json TEXT,
                        issue_strategy VARCHAR(32) NOT NULL DEFAULT 'STRICT_LOCATION',
                        reservation_scope VARCHAR(16) NOT NULL DEFAULT 'SESSION',
                        started_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                        suspended_at TIMESTAMP,
                        last_activity_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                        completed_at TIMESTAMP,
                        created_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                        metadata_json TEXT
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_direct_sale_sessions_wh ON direct_sale_sessions(warehouse_id, status)"))
        added += 1

    if not has_table(engine, "direct_sale_session_lines"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE direct_sale_session_lines (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        session_id INTEGER NOT NULL REFERENCES direct_sale_sessions(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        quantity REAL NOT NULL DEFAULT 1,
                        unit_price REAL,
                        discount_amount REAL NOT NULL DEFAULT 0,
                        source_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        suggested_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        stock_reservation_id INTEGER REFERENCES stock_reservations(id) ON DELETE SET NULL,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        metadata_json TEXT
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_direct_sale_session_lines_sess ON direct_sale_session_lines(session_id)"))
        added += 1

    if not has_table(engine, "payments"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE payments (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                        direct_sale_session_id INTEGER REFERENCES direct_sale_sessions(id) ON DELETE SET NULL,
                        status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
                        method VARCHAR(24) NOT NULL DEFAULT 'CASH',
                        amount REAL NOT NULL DEFAULT 0,
                        currency VARCHAR(8) NOT NULL DEFAULT 'PLN',
                        captured_at TIMESTAMP,
                        created_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                        performed_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                        device_id INTEGER REFERENCES operational_workstations(id) ON DELETE SET NULL,
                        metadata_json TEXT,
                        created_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                        updated_at TIMESTAMP NOT NULL DEFAULT (datetime('now'))
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_payments_order ON payments(order_id)"))
        added += 1

    if not has_table(engine, "payment_transactions"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE payment_transactions (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
                        method VARCHAR(24) NOT NULL,
                        amount REAL NOT NULL,
                        status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
                        external_ref VARCHAR(128),
                        metadata_json TEXT,
                        created_at TIMESTAMP NOT NULL DEFAULT (datetime('now'))
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_payment_transactions_pay ON payment_transactions(payment_id)"))
        added += 1

    logger.info(
        "[schema] operational_sales_phase1 ensured dialect=%s changes=%s",
        engine.dialect.name,
        added,
    )


def ensure_operational_sales_phase2_schema(engine: Engine) -> None:
    """Phase 2: traceability, reservation TTL, commerce event log."""
    added = 0
    if has_table(engine, "stock_reservations"):
        for col, ddl in (
            ("expires_at", "ALTER TABLE stock_reservations ADD COLUMN expires_at TIMESTAMP"),
            (
                "direct_sale_session_id",
                "ALTER TABLE stock_reservations ADD COLUMN direct_sale_session_id INTEGER "
                "REFERENCES direct_sale_sessions(id) ON DELETE SET NULL",
            ),
            ("reservation_kind", "ALTER TABLE stock_reservations ADD COLUMN reservation_kind VARCHAR(24)"),
        ):
            if _add_column_if_missing(engine, "stock_reservations", col, ddl):
                added += 1
    added += ensure_operational_core_orm_columns(engine)
    if has_table(engine, "direct_sale_sessions"):
        for col, ddl in (
            ("customer_id", "ALTER TABLE direct_sale_sessions ADD COLUMN customer_id INTEGER"),
            ("expires_at", "ALTER TABLE direct_sale_sessions ADD COLUMN expires_at TIMESTAMP"),
            ("document_subtype", "ALTER TABLE direct_sale_sessions ADD COLUMN document_subtype VARCHAR(16) DEFAULT 'RECEIPT'"),
            ("order_discount_type", "ALTER TABLE direct_sale_sessions ADD COLUMN order_discount_type VARCHAR(16)"),
            ("order_discount_value", "ALTER TABLE direct_sale_sessions ADD COLUMN order_discount_value REAL DEFAULT 0"),
        ):
            if _add_column_if_missing(engine, "direct_sale_sessions", col, ddl):
                added += 1
    if has_table(engine, "direct_sale_session_lines"):
        for col, ddl in (
            ("line_discount_type", "ALTER TABLE direct_sale_session_lines ADD COLUMN line_discount_type VARCHAR(16)"),
            ("line_discount_value", "ALTER TABLE direct_sale_session_lines ADD COLUMN line_discount_value REAL DEFAULT 0"),
        ):
            if _add_column_if_missing(engine, "direct_sale_session_lines", col, ddl):
                added += 1

    if not has_table(engine, "operational_commerce_events"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE operational_commerce_events (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
                        event VARCHAR(64) NOT NULL,
                        version INTEGER NOT NULL DEFAULT 1,
                        occurred_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
                        session_id INTEGER REFERENCES direct_sale_sessions(id) ON DELETE SET NULL,
                        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
                        location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        qty REAL,
                        source VARCHAR(64),
                        performed_by_user_id INTEGER,
                        device_id INTEGER,
                        payload_json TEXT NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_operational_commerce_events_tenant "
                    "ON operational_commerce_events(tenant_id, event, occurred_at)"
                )
            )
        added += 1

    logger.info(
        "[schema] operational_sales_phase2 ensured dialect=%s changes=%s",
        engine.dialect.name,
        added,
    )


def ensure_operational_feature_scopes_schema(engine: Engine) -> None:
    """Tenant/warehouse scoped feature overrides for staged rollout."""
    if has_table(engine, "operational_feature_scopes"):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE operational_feature_scopes (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    warehouse_id INTEGER NOT NULL DEFAULT 0,
                    operational_sales INTEGER,
                    immediate_wms_exclusion INTEGER,
                    operational_sales_sessions INTEGER,
                    updated_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                    UNIQUE(tenant_id, warehouse_id)
                )
                """
            )
        )
        conn.execute(
            text(
                "CREATE INDEX ix_operational_feature_scopes_tenant "
                "ON operational_feature_scopes(tenant_id)"
            )
        )
    logger.info("[schema] operational_feature_scopes created dialect=%s", engine.dialect.name)


def ensure_operational_sales_phase3_schema(engine: Engine) -> None:
    """Phase 3: async documents, series rules, reservation lifecycle, pickup tasks, devices."""
    added = 0

    if not has_table(engine, "document_generation_jobs"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE document_generation_jobs (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
                        session_id INTEGER REFERENCES direct_sale_sessions(id) ON DELETE SET NULL,
                        document_type VARCHAR(24) NOT NULL,
                        document_subtype VARCHAR(32) NOT NULL,
                        series_id VARCHAR(36) REFERENCES document_series(id) ON DELETE SET NULL,
                        status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
                        attempt_count INTEGER NOT NULL DEFAULT 0,
                        max_attempts INTEGER NOT NULL DEFAULT 3,
                        sale_document_id VARCHAR(36),
                        error_message TEXT,
                        fiscal_status VARCHAR(24),
                        fiscal_ref VARCHAR(128),
                        payload_json TEXT NOT NULL DEFAULT '{}',
                        result_json TEXT,
                        created_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                        started_at TIMESTAMP,
                        completed_at TIMESTAMP,
                        next_retry_at TIMESTAMP
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_doc_gen_jobs_status ON document_generation_jobs(status, next_retry_at)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_doc_gen_jobs_order ON document_generation_jobs(order_id, status)"
                )
            )
        added += 1

    if not has_table(engine, "document_series_resolution_rules"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE document_series_resolution_rules (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
                        organization_id INTEGER,
                        country_id INTEGER,
                        document_type VARCHAR(24) NOT NULL,
                        document_subtype VARCHAR(32),
                        order_channel VARCHAR(24),
                        fulfillment_mode VARCHAR(24),
                        fiscal_profile VARCHAR(32),
                        operational_zone VARCHAR(24),
                        series_id VARCHAR(36) NOT NULL REFERENCES document_series(id) ON DELETE CASCADE,
                        priority INTEGER NOT NULL DEFAULT 100,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at TIMESTAMP NOT NULL DEFAULT (datetime('now'))
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_doc_series_rules_lookup "
                    "ON document_series_resolution_rules(tenant_id, document_type, is_active)"
                )
            )
        added += 1

    if has_table(engine, "payments"):
        for col, ddl in (
            ("payment_provider", "ALTER TABLE payments ADD COLUMN payment_provider VARCHAR(32)"),
            ("external_transaction_id", "ALTER TABLE payments ADD COLUMN external_transaction_id VARCHAR(128)"),
            ("terminal_id", "ALTER TABLE payments ADD COLUMN terminal_id VARCHAR(64)"),
            ("authorization_reference", "ALTER TABLE payments ADD COLUMN authorization_reference VARCHAR(128)"),
            ("settlement_state", "ALTER TABLE payments ADD COLUMN settlement_state VARCHAR(24)"),
        ):
            if _add_column_if_missing(engine, "payments", col, ddl):
                added += 1

    if has_table(engine, "operational_workstations"):
        for col, ddl in (
            ("printer_id", "ALTER TABLE operational_workstations ADD COLUMN printer_id INTEGER"),
            ("scanner_type", "ALTER TABLE operational_workstations ADD COLUMN scanner_type VARCHAR(32)"),
            ("fiscal_terminal_id", "ALTER TABLE operational_workstations ADD COLUMN fiscal_terminal_id INTEGER"),
            ("zone_id", "ALTER TABLE operational_workstations ADD COLUMN zone_id INTEGER"),
        ):
            if _add_column_if_missing(engine, "operational_workstations", col, ddl):
                added += 1

    if has_table(engine, "wms_operational_tasks"):
        for col, ddl in (
            ("task_group", "ALTER TABLE wms_operational_tasks ADD COLUMN task_group VARCHAR(32)"),
            (
                "related_session_id",
                "ALTER TABLE wms_operational_tasks ADD COLUMN related_session_id INTEGER "
                "REFERENCES direct_sale_sessions(id) ON DELETE SET NULL",
            ),
            (
                "related_reservation_id",
                "ALTER TABLE wms_operational_tasks ADD COLUMN related_reservation_id INTEGER "
                "REFERENCES stock_reservations(id) ON DELETE SET NULL",
            ),
            ("zone_id", "ALTER TABLE wms_operational_tasks ADD COLUMN zone_id INTEGER"),
        ):
            if _add_column_if_missing(engine, "wms_operational_tasks", col, ddl):
                added += 1

    added += _ensure_sale_warehouse_document_link_schema(engine)

    logger.info(
        "[schema] operational_sales_phase3 ensured dialect=%s changes=%s",
        engine.dialect.name,
        added,
    )


def _ensure_sale_warehouse_document_link_schema(engine: Engine) -> int:
    """PA/FV ↔ WZ linkage: series FK, stock_documents context, sale_document_stock_links."""
    added = 0

    if has_table(engine, "direct_sale_sessions"):
        for col, ddl in (
            (
                "pipeline_status",
                "ALTER TABLE direct_sale_sessions ADD COLUMN pipeline_status VARCHAR(32) "
                "NOT NULL DEFAULT 'OPEN'",
            ),
            (
                "pipeline_failed_stage",
                "ALTER TABLE direct_sale_sessions ADD COLUMN pipeline_failed_stage VARCHAR(32)",
            ),
            (
                "pipeline_state_json",
                "ALTER TABLE direct_sale_sessions ADD COLUMN pipeline_state_json TEXT",
            ),
        ):
            if _add_column_if_missing(engine, "direct_sale_sessions", col, ddl):
                added += 1

    if has_table(engine, "document_series"):
        if _add_column_if_missing(
            engine,
            "document_series",
            "warehouse_document_series_id",
            "ALTER TABLE document_series ADD COLUMN warehouse_document_series_id VARCHAR(36) "
            "REFERENCES document_series(id) ON DELETE SET NULL",
        ):
            added += 1

    if has_table(engine, "stock_documents"):
        for col, ddl in (
            (
                "order_id",
                "ALTER TABLE stock_documents ADD COLUMN order_id INTEGER "
                "REFERENCES orders(id) ON DELETE SET NULL",
            ),
            (
                "source_sale_document_id",
                "ALTER TABLE stock_documents ADD COLUMN source_sale_document_id VARCHAR(36) "
                "REFERENCES sale_documents(id) ON DELETE SET NULL",
            ),
            (
                "direct_sale_session_id",
                "ALTER TABLE stock_documents ADD COLUMN direct_sale_session_id INTEGER "
                "REFERENCES direct_sale_sessions(id) ON DELETE SET NULL",
            ),
        ):
            if _add_column_if_missing(engine, "stock_documents", col, ddl):
                added += 1

    if not has_table(engine, "sale_document_stock_links"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE sale_document_stock_links (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        sale_document_id VARCHAR(36) NOT NULL
                            REFERENCES sale_documents(id) ON DELETE CASCADE,
                        stock_document_id INTEGER NOT NULL
                            REFERENCES stock_documents(id) ON DELETE CASCADE,
                        link_type VARCHAR(16) NOT NULL DEFAULT 'WZ',
                        created_at TIMESTAMP DEFAULT (datetime('now'))
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_sale_doc_stock_links_sale "
                    "ON sale_document_stock_links(sale_document_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_sale_doc_stock_links_stock "
                    "ON sale_document_stock_links(stock_document_id)"
                )
            )
        added += 1

    if added:
        logger.info(
            "[schema] sale_warehouse_document_link ensured dialect=%s changes=%s",
            engine.dialect.name,
            added,
        )
    return added


def ensure_operational_runtime_phase4_schema(engine: Engine) -> None:
    """Phase 4: replenishment rules, live events, runtime context, orchestration columns."""
    added = 0

    if not has_table(engine, "operational_replenishment_rules"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE operational_replenishment_rules (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                        zone_type VARCHAR(24) NOT NULL,
                        task_type VARCHAR(32) NOT NULL DEFAULT 'REPLENISHMENT',
                        min_qty REAL NOT NULL DEFAULT 0,
                        max_qty REAL,
                        target_qty REAL,
                        preferred_source_zone_type VARCHAR(24),
                        season_key VARCHAR(32),
                        time_window_json TEXT,
                        priority INTEGER NOT NULL DEFAULT 50,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                        updated_at TIMESTAMP NOT NULL DEFAULT (datetime('now'))
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_op_repl_rules_wh_zone "
                    "ON operational_replenishment_rules(warehouse_id, zone_type, is_active)"
                )
            )
        added += 1

    if not has_table(engine, "operational_alerts"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE operational_alerts (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        alert_type VARCHAR(32) NOT NULL,
                        severity VARCHAR(16) NOT NULL DEFAULT 'INFO',
                        status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
                        title VARCHAR(128) NOT NULL,
                        message TEXT,
                        entity_type VARCHAR(32),
                        entity_id INTEGER,
                        payload_json TEXT NOT NULL DEFAULT '{}',
                        created_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                        acked_at TIMESTAMP,
                        acked_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(
                text("CREATE INDEX ix_op_alerts_wh_status ON operational_alerts(warehouse_id, status)")
            )
        added += 1

    if not has_table(engine, "device_sessions"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE device_sessions (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        operator_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                        device_key VARCHAR(64) NOT NULL,
                        device_kind VARCHAR(24) NOT NULL DEFAULT 'SCANNER',
                        workflow_type VARCHAR(32) NOT NULL DEFAULT 'PICKING',
                        status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
                        battery_pct INTEGER,
                        network_state VARCHAR(16),
                        payload_json TEXT NOT NULL DEFAULT '{}',
                        created_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                        last_seen_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                        suspended_at TIMESTAMP,
                        closed_at TIMESTAMP
                    )
                    """
                )
            )
            conn.execute(
                text("CREATE INDEX ix_device_sessions_wh ON device_sessions(warehouse_id, status)")
            )
        added += 1

    if not has_table(engine, "operator_runtime_context"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE operator_runtime_context (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        operator_user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
                        context_type VARCHAR(32) NOT NULL DEFAULT 'PICKING',
                        cart_id INTEGER REFERENCES carts(id) ON DELETE SET NULL,
                        zone_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        active_task_id INTEGER REFERENCES wms_operational_tasks(id) ON DELETE SET NULL,
                        payload_json TEXT NOT NULL DEFAULT '{}',
                        updated_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                        UNIQUE(tenant_id, warehouse_id, operator_user_id)
                    )
                    """
                )
            )
        added += 1

    if not has_table(engine, "operational_live_events"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE operational_live_events (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        event_type VARCHAR(48) NOT NULL,
                        channel VARCHAR(32) NOT NULL DEFAULT 'warehouse',
                        revision VARCHAR(64),
                        payload_json TEXT NOT NULL DEFAULT '{}',
                        created_at TIMESTAMP NOT NULL DEFAULT (datetime('now'))
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_op_live_events_wh_id "
                    "ON operational_live_events(warehouse_id, id)"
                )
            )
        added += 1

    if not has_table(engine, "store_transfer_requests"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE store_transfer_requests (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        quantity REAL NOT NULL DEFAULT 0,
                        status VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
                        created_at TIMESTAMP NOT NULL DEFAULT (datetime('now'))
                    )
                    """
                )
            )
        added += 1

    if has_table(engine, "wms_operational_tasks"):
        for col, ddl in (
            ("orchestration_state", "ALTER TABLE wms_operational_tasks ADD COLUMN orchestration_state VARCHAR(16)"),
            (
                "assigned_user_id",
                "ALTER TABLE wms_operational_tasks ADD COLUMN assigned_user_id INTEGER "
                "REFERENCES app_users(id) ON DELETE SET NULL",
            ),
            ("sla_due_at", "ALTER TABLE wms_operational_tasks ADD COLUMN sla_due_at TIMESTAMP"),
            ("blocked_reason", "ALTER TABLE wms_operational_tasks ADD COLUMN blocked_reason VARCHAR(128)"),
        ):
            if _add_column_if_missing(engine, "wms_operational_tasks", col, ddl):
                added += 1

    if has_table(engine, "operational_feature_scopes"):
        for col, ddl in (
            ("operational_runtime", "ALTER TABLE operational_feature_scopes ADD COLUMN operational_runtime INTEGER"),
            ("replenishment_engine", "ALTER TABLE operational_feature_scopes ADD COLUMN replenishment_engine INTEGER"),
        ):
            if _add_column_if_missing(engine, "operational_feature_scopes", col, ddl):
                added += 1

    logger.info(
        "[schema] operational_runtime_phase4 ensured dialect=%s changes=%s",
        engine.dialect.name,
        added,
    )
