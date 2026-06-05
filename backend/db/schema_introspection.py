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
    """Operational line items for Braki tasks."""
    if has_table(engine, "order_issue_task_items"):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE order_issue_task_items (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER NOT NULL REFERENCES order_issue_tasks(id) ON DELETE CASCADE,
                    order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
                    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    missing_qty REAL NOT NULL DEFAULT 0,
                    recovered_qty REAL NOT NULL DEFAULT 0,
                    status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
                    source_event_id VARCHAR(128),
                    source_picking_cart_id INTEGER,
                    source_operator_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                    updated_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
                    UNIQUE(task_id, order_item_id)
                )
                """
            )
        )
        conn.execute(
            text("CREATE INDEX ix_order_issue_task_items_task ON order_issue_task_items(task_id)")
        )
        conn.execute(
            text(
                "CREATE INDEX ix_order_issue_task_items_product "
                "ON order_issue_task_items(product_id, status)"
            )
        )
    logger.info("[schema] order_issue_task_items table created dialect=%s", engine.dialect.name)


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


def ensure_operational_sales_phase1_schema(engine: Engine) -> None:
    """Phase 1: order channel/mode, zones, sessions, payments, traceability."""
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
        if _add_column_if_missing(
            engine,
            "order_items",
            "source_location_id",
            "ALTER TABLE order_items ADD COLUMN source_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL",
        ):
            added += 1

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
