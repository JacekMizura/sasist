"""Universal stock_reservations schema — production / transfer consumers."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

COLUMNS: tuple[tuple[str, str], ...] = (
    ("warehouse_id", "INTEGER"),
    ("production_batch_id", "INTEGER"),
    ("production_order_id", "INTEGER"),
    ("serial_number", "VARCHAR(128)"),
    ("created_by_user_id", "INTEGER"),
    ("locked_at", "TIMESTAMP"),
    ("inventory_id", "INTEGER"),
)


def ensure_stock_reservations_universal_schema(engine: Engine) -> None:
    if not has_table(engine, "stock_reservations"):
        return
    existing = set(get_table_column_names(engine, "stock_reservations"))
    dialect = engine.dialect.name
    with engine.begin() as conn:
        for name, ddl in COLUMNS:
            if name in existing:
                continue
            conn.execute(text(f"ALTER TABLE stock_reservations ADD COLUMN {name} {ddl}"))
        if dialect == "postgresql":
            conn.execute(
                text(
                    "ALTER TABLE stock_reservations "
                    "ALTER COLUMN order_id DROP NOT NULL"
                )
            )
