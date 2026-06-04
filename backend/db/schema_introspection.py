"""
Dialect-agnostic schema introspection (SQLite, PostgreSQL, …).

Use SQLAlchemy Inspector instead of sqlite_master / PRAGMA where possible.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection, Engine

logger = logging.getLogger(__name__)


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


def list_user_tables(bind: Engine | Connection) -> list[str]:
    """User tables (excludes SQLite internal tables)."""
    engine = get_engine(bind)
    names = list(inspect(engine).get_table_names())
    return [n for n in names if not n.startswith("sqlite_")]
