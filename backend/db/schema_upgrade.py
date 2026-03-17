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
    """Add building_width_m, building_depth_m, building_height_m, wall_elements_json to warehouse_layouts if missing."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(warehouse_layouts)"))
        columns = [row[1] for row in result]
        for col, typ in [
            ("building_width_m", "REAL"),
            ("building_depth_m", "REAL"),
            ("building_height_m", "REAL"),
            ("wall_elements_json", "TEXT"),
        ]:
            if col not in columns:
                conn.execute(text(f"ALTER TABLE warehouse_layouts ADD COLUMN {col} {typ}"))
        conn.commit()


def ensure_products_physical_columns(engine: Engine) -> None:
    """Add orientation_type and shape_type to products table if missing (nullable). Defaults: NULL → any/box at read time."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(products)"))
        columns = [row[1] for row in result]
        if "orientation_type" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN orientation_type VARCHAR(20)"))
        if "shape_type" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN shape_type VARCHAR(20)"))
        conn.commit()


def ensure_products_stack_columns(engine: Engine) -> None:
    """Add stack_compressible, compressed_height_cm, max_stack_weight to products table if missing (nullable)."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(products)"))
        columns = [row[1] for row in result]
        if "stack_compressible" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN stack_compressible INTEGER"))
        if "compressed_height_cm" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN compressed_height_cm REAL"))
        if "max_stack_weight" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN max_stack_weight REAL"))
        conn.commit()


def ensure_products_stack_behavior_column(engine: Engine) -> None:
    """Add stack_behavior to products table if missing (nullable). Default at read time: stackable."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(products)"))
        columns = [row[1] for row in result]
        if "stack_behavior" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN stack_behavior VARCHAR(20)"))
        conn.commit()
