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
        ):
            if _add_column_if_missing(engine, "direct_sale_sessions", col, ddl):
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

    logger.info(
        "[schema] operational_sales_phase3 ensured dialect=%s changes=%s",
        engine.dialect.name,
        added,
    )


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
