"""
Schema upgrade helpers for SQLite. Add missing columns to existing tables
so that older databases match the current SQLAlchemy models without manual migration.
"""

from sqlalchemy import text
from sqlalchemy.engine import Engine


def ensure_locations_columns(engine: Engine) -> None:
    """Add rack_name, level, position, bin to locations table if missing."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(locations)"))
        columns = [row[1] for row in result]

        if "rack_name" not in columns:
            conn.execute(text("ALTER TABLE locations ADD COLUMN rack_name TEXT"))
        if "level" not in columns:
            conn.execute(text("ALTER TABLE locations ADD COLUMN level INTEGER"))
        if "position" not in columns:
            conn.execute(text("ALTER TABLE locations ADD COLUMN position INTEGER"))
        if "bin" not in columns:
            conn.execute(text("ALTER TABLE locations ADD COLUMN bin TEXT"))

        conn.commit()


def ensure_warehouse_layout_building_columns(engine: Engine) -> None:
    """Add building_width_m, building_depth_m, building_height_m to warehouse_layouts if missing."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(warehouse_layouts)"))
        columns = [row[1] for row in result]
        for col, typ in [
            ("building_width_m", "REAL"),
            ("building_depth_m", "REAL"),
            ("building_height_m", "REAL"),
        ]:
            if col not in columns:
                conn.execute(text(f"ALTER TABLE warehouse_layouts ADD COLUMN {col} {typ}"))
        conn.commit()
