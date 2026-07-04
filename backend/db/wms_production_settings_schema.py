"""WMS production terminal settings columns."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

COLUMNS: tuple[tuple[str, str], ...] = (
    ("production_terminal_display_json", "TEXT"),
    ("production_terminal_required_json", "TEXT"),
)


def ensure_wms_production_settings_schema(engine: Engine) -> None:
    if not has_table(engine, "wms_settings"):
        return
    existing = set(get_table_column_names(engine, "wms_settings"))
    with engine.begin() as conn:
        for name, ddl in COLUMNS:
            if name in existing:
                continue
            conn.execute(text(f"ALTER TABLE wms_settings ADD COLUMN {name} {ddl}"))
