"""Product columns for MRP / production planning."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

PRODUCT_COLUMNS: tuple[tuple[str, str], ...] = (
    ("max_total_stock", "FLOAT"),
    ("production_moq", "FLOAT"),
    ("production_batch_multiple", "FLOAT"),
    ("production_lead_time_days", "INTEGER"),
)

WMS_FORECAST_COLUMN = ("production_forecast_json", "TEXT")


def ensure_production_planning_schema(engine: Engine) -> None:
    if has_table(engine, "products"):
        existing = set(get_table_column_names(engine, "products"))
        with engine.begin() as conn:
            for name, ddl in PRODUCT_COLUMNS:
                if name in existing:
                    continue
                conn.execute(text(f"ALTER TABLE products ADD COLUMN {name} {ddl}"))
    if has_table(engine, "wms_settings"):
        existing = set(get_table_column_names(engine, "wms_settings"))
        name, ddl = WMS_FORECAST_COLUMN
        if name not in existing:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE wms_settings ADD COLUMN {name} {ddl}"))
