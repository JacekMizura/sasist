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
    """Add building/layout JSON columns to warehouse_layouts if missing."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(warehouse_layouts)"))
        columns = [row[1] for row in result]
        for col, typ in [
            ("building_width_m", "REAL"),
            ("building_depth_m", "REAL"),
            ("building_height_m", "REAL"),
            ("visual_elements_json", "TEXT"),
            ("wall_elements_json", "TEXT"),
        ]:
            if col not in columns:
                conn.execute(text(f"ALTER TABLE warehouse_layouts ADD COLUMN {col} {typ}"))
        conn.commit()


def ensure_warehouse_layout_identity_columns(engine: Engine) -> None:
    """Add rack/bin identity and activity columns plus location.location_uuid if missing."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(warehouse_layout_racks)"))
        rack_columns = [row[1] for row in result]
        if "uuid" not in rack_columns:
            conn.execute(text("ALTER TABLE warehouse_layout_racks ADD COLUMN uuid VARCHAR(64)"))
        if "is_active" not in rack_columns:
            conn.execute(text("ALTER TABLE warehouse_layout_racks ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"))
        if "rack_type" not in rack_columns:
            conn.execute(text("ALTER TABLE warehouse_layout_racks ADD COLUMN rack_type VARCHAR(32) NOT NULL DEFAULT 'warehouse'"))

        result = conn.execute(text("PRAGMA table_info(warehouse_bins)"))
        bin_columns = [row[1] for row in result]
        if "location_uuid" not in bin_columns:
            conn.execute(text("ALTER TABLE warehouse_bins ADD COLUMN location_uuid VARCHAR(64)"))
        if "is_active" not in bin_columns:
            conn.execute(text("ALTER TABLE warehouse_bins ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"))

        result = conn.execute(text("PRAGMA table_info(locations)"))
        location_columns = [row[1] for row in result]
        if "location_uuid" not in location_columns:
            conn.execute(text("ALTER TABLE locations ADD COLUMN location_uuid VARCHAR(64)"))
        if "is_active" not in location_columns:
            conn.execute(text("ALTER TABLE locations ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"))

        result = conn.execute(text("PRAGMA table_info(storage_locations)"))
        storage_location_columns = [row[1] for row in result]
        if "location_id" not in storage_location_columns:
            conn.execute(text("ALTER TABLE storage_locations ADD COLUMN location_id INTEGER"))
        if "is_active" not in storage_location_columns:
            conn.execute(text("ALTER TABLE storage_locations ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"))

        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_warehouse_layout_racks_is_active ON warehouse_layout_racks(is_active)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_warehouse_layout_racks_layout_active ON warehouse_layout_racks(layout_id, is_active)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_warehouse_bins_is_active ON warehouse_bins(is_active)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_warehouse_bins_rack_active ON warehouse_bins(rack_id, is_active)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_locations_is_active ON locations(is_active)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_locations_warehouse_active ON locations(warehouse_id, is_active)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_storage_locations_is_active ON storage_locations(is_active)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_storage_locations_location_active ON storage_locations(location_id, is_active)"))

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
