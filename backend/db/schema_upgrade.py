"""
Schema upgrade helpers for SQLite. Add missing columns to existing tables
so that older databases match the current SQLAlchemy models without manual migration.
"""

import json
import logging
from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from ..utils.ui_status_color import normalize_stored_color

logger = logging.getLogger(__name__)


def _migrate_panel_ui_status_colors_to_hex(conn, table: str) -> None:
    """Convert legacy color names to #RRGGBB on panel UI status tables."""
    if table not in ("return_ui_statuses", "order_ui_statuses", "complaint_ui_statuses"):
        raise ValueError(f"unsupported table for color migration: {table}")
    rows = conn.execute(text(f"SELECT id, color FROM {table}")).fetchall()
    for rid, col in rows:
        old_s = (col if col is not None else "").strip()
        new_c = normalize_stored_color(col if col is not None else None)
        if new_c != old_s:
            conn.execute(
                text(f"UPDATE {table} SET color = :c WHERE id = :id"),
                {"c": new_c, "id": rid},
            )


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


def ensure_products_import_metadata_columns(engine: Engine) -> None:
    """Add catalog_number and metadata_json for full CSV product import (nullable)."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(products)"))
        columns = [row[1] for row in result]
        if "catalog_number" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN catalog_number VARCHAR(128)"))
        if "metadata_json" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN metadata_json TEXT"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_products_catalog_number ON products(catalog_number)"))
        conn.commit()


def ensure_products_replenishment_levels_columns(engine: Engine) -> None:
    """Add min_pick_quantity / max_pick_quantity for WMS replenishment thresholds (nullable)."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(products)"))
        columns = [row[1] for row in result]
        if "min_pick_quantity" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN min_pick_quantity REAL"))
        if "max_pick_quantity" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN max_pick_quantity REAL"))
        conn.commit()


def ensure_products_stock_alert_columns(engine: Engine) -> None:
    """Add enable_stock_alert / min_total_stock for global low-stock threshold (nullable)."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(products)"))
        columns = [row[1] for row in result]
        if "enable_stock_alert" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN enable_stock_alert INTEGER"))
        if "min_total_stock" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN min_total_stock REAL"))
        conn.commit()


def ensure_products_carton_columns(engine: Engine) -> None:
    """Bulk packaging (carton) fields on products — separate from single-unit dimensions."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(products)"))
        columns = [row[1] for row in result]
        specs = [
            ("bulk_ean", "TEXT"),
            ("units_per_carton", "REAL"),
            ("carton_length_cm", "REAL"),
            ("carton_width_cm", "REAL"),
            ("carton_height_cm", "REAL"),
            ("carton_weight_kg", "REAL"),
            ("carton_volume_dm3", "REAL"),
        ]
        for col_name, col_type in specs:
            if col_name not in columns:
                conn.execute(text(f"ALTER TABLE products ADD COLUMN {col_name} {col_type}"))
        conn.commit()


def ensure_products_carton_stacking_columns(engine: Engine) -> None:
    """Carton orientation / stacking — separate from single-unit orientation_type / stack_behavior."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(products)"))
        columns = [row[1] for row in result]
        specs = [
            ("carton_orientation_type", "VARCHAR(20)"),
            ("carton_shape_type", "VARCHAR(20)"),
            ("carton_stack_behavior", "VARCHAR(20)"),
            ("carton_stack_compressible", "INTEGER"),
            ("carton_compressed_height_cm", "REAL"),
            ("carton_max_stack_weight", "REAL"),
        ]
        for col_name, col_type in specs:
            if col_name not in columns:
                conn.execute(text(f"ALTER TABLE products ADD COLUMN {col_name} {col_type}"))
        conn.commit()


def ensure_orders_deleted_at_column(engine: Engine) -> None:
    """Archiwizacja zamówienia — ukrycie z listy przy zachowaniu FK (np. zarchiwizowany RMZ)."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders' LIMIT 1")
        ).fetchone()
        if not exists:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(orders)"))}
        if "deleted_at" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN deleted_at DATETIME"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_deleted_at ON orders(deleted_at)"))
        conn.commit()


def ensure_products_deleted_at_column(engine: Engine) -> None:
    """Soft delete asortymentu — ukrycie z listy przy zachowaniu historii."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='products' LIMIT 1")
        ).fetchone()
        if not exists:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(products)"))}
        if "deleted_at" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN deleted_at DATETIME"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_products_deleted_at ON products(deleted_at)"))
        conn.commit()


def ensure_wms_order_returns_deleted_at_column(engine: Engine) -> None:
    """Archiwizacja RMZ — nagłówek ze znacznikiem; linie operacyjne kasowane w serwisie."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wms_order_returns' LIMIT 1")
        ).fetchone()
        if not exists:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(wms_order_returns)"))}
        if "deleted_at" not in cols:
            conn.execute(text("ALTER TABLE wms_order_returns ADD COLUMN deleted_at DATETIME"))
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_wms_order_returns_deleted_at ON wms_order_returns(deleted_at)")
        )
        conn.commit()


def ensure_customers_deleted_at_column(engine: Engine) -> None:
    """Archiwizacja klienta — lista ukrywa deleted_at; zamówienia zachowują customer_id."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='customers' LIMIT 1")
        ).fetchone()
        if not exists:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(customers)"))}
        if "deleted_at" not in cols:
            conn.execute(text("ALTER TABLE customers ADD COLUMN deleted_at DATETIME"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_customers_deleted_at ON customers(deleted_at)"))
        conn.commit()


def ensure_bundles_deleted_at_column(engine: Engine) -> None:
    """Archiwizacja zestawu (bundle) — ukrycie z listy."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='bundles' LIMIT 1")
        ).fetchone()
        if not exists:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(bundles)"))}
        if "deleted_at" not in cols:
            conn.execute(text("ALTER TABLE bundles ADD COLUMN deleted_at DATETIME"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_bundles_deleted_at ON bundles(deleted_at)"))
        conn.commit()


def ensure_warehouse_layout_rack_name_unique_index(engine: Engine) -> None:
    """UNIQUE(layout_id, name) for non-empty names among active racks only.

    Inactive racks may keep historical names; replacing a removed rack with a new UUID but the same
    display name must not hit UNIQUE (see soft-delete before insert in layout save).
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("DROP INDEX IF EXISTS uq_warehouse_layout_racks_layout_name"))
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_layout_racks_layout_name "
                    "ON warehouse_layout_racks(layout_id, name) "
                    "WHERE name IS NOT NULL AND name != '' AND is_active = true"
                )
            )
            conn.commit()
    except Exception:
        pass


def ensure_inventory_location_uuid_columns(engine: Engine) -> None:
    """Add location_uuid to stock/inventory tables and backfill from locations via location_id."""
    with engine.connect() as conn:
        for table in ("stock", "inventory"):
            result = conn.execute(text(f"PRAGMA table_info({table})"))
            columns = [row[1] for row in result]
            if "location_uuid" not in columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN location_uuid VARCHAR(64)"))
            conn.execute(
                text(
                    f"""
                    UPDATE {table}
                    SET location_uuid = (
                      SELECT l.location_uuid
                      FROM locations l
                      WHERE l.id = {table}.location_id
                    )
                    WHERE location_uuid IS NULL OR TRIM(location_uuid) = '' OR LOWER(TRIM(location_uuid)) = 'null'
                    """
                )
            )
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_location_uuid ON {table}(location_uuid)"))
        conn.commit()


def ensure_wms_refunds_columns(engine: Engine) -> None:
    """Add missing refund columns for WMS RMZ refunds."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(wms_refunds)"))
        columns = [row[1] for row in result]
        if "refund_shipping_amount" not in columns:
            conn.execute(text("ALTER TABLE wms_refunds ADD COLUMN refund_shipping_amount REAL"))
        conn.commit()


def migrate_orders_sales_document_misassigned_number(engine: Engine) -> None:
    """
    Gdy import zapisał numer dokumentu sprzedaży w order.number (zgodność z import_metadata_json),
    przenieś go do sales_document_number i nadaj nowy numer sekwencyjny (1,2,3...) per tenant+warehouse.

    Dodatkowo:
    - jeśli order.number jest NIE-cyfrowy (np. "4010...-A"), przenieś jego wartość do
      sales_document_number (lub external_id gdy metadata sugeruje), a potem przelicz order.number
      na spójne 1..N.
    """
    # Local imports: avoid loading models at module import time for scripts that only PRAGMA.
    from ..models.order import Order
    from datetime import datetime
    from sqlalchemy import func

    def col_base(cn: str) -> str:
        s = (cn or "").strip().strip('"').strip("'")
        if " (" in s and s.endswith(")"):
            return s.rsplit(" (", 1)[0].strip()
        return s

    def meta_lookup(o, key_base: str) -> str | None:
        raw = getattr(o, "import_metadata_json", None)
        if not raw or not str(raw).strip():
            return None
        try:
            meta = json.loads(raw)
            if not isinstance(meta, dict):
                return None
            for k, v in meta.items():
                if not v or str(v).strip() == "":
                    continue
                if col_base(k) == key_base:
                    return str(v).strip()
        except (json.JSONDecodeError, TypeError):
            return None
        return None

    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        orders = db.query(Order).all()
        groups: dict[tuple[int, int], list] = {}
        for o in orders:
            groups.setdefault((o.tenant_id, o.warehouse_id), []).append(o)

        for (tenant_id, warehouse_id), olist in groups.items():
            # 1) Move wrong (non-numeric) values out of order.number
            for o in olist:
                num_raw = (o.number or "").strip() if o.number is not None else ""
                if not num_raw:
                    continue
                if num_raw.isdigit():
                    continue

                doc = meta_lookup(o, "Numer dokumentu sprzedaży")
                ext = meta_lookup(o, "Zewnętrzny identyfikator")

                # Prefer the explicit document number when available.
                if doc and not (o.sales_document_number or "").strip():
                    o.sales_document_number = doc
                elif (not doc) and (not (o.sales_document_number or "").strip()):
                    # If the old order.number looks like an external id (based on metadata), store it there instead.
                    if ext and ext == num_raw:
                        if not (o.external_id or "").strip():
                            o.external_id = ext
                    else:
                        o.sales_document_number = num_raw

                # If metadata indicates an external id and it's missing, store it.
                if ext and not (o.external_id or "").strip():
                    o.external_id = ext

            # 2) Renumber all orders in the group to exact sequential integers (1..N)
            # Use created_at when possible to preserve approximate order, fallback to id.
            def _sort_key(x):
                dt = getattr(x, "created_at", None)
                return (
                    dt if dt is not None else datetime.min,
                    x.id if x.id is not None else 0,
                )

            sorted_orders = sorted(olist, key=_sort_key)

            # Avoid temporary unique constraint collisions.
            for o in sorted_orders:
                o.number = None
            db.flush()

            for idx, o in enumerate(sorted_orders, start=1):
                o.number = str(idx)

        # 3) Validation: order.number must be digits and unique per tenant+warehouse
        bad_not_digit = (
            db.query(func.count(Order.id))
            .filter(Order.number != None)  # noqa: E711
            .filter(~Order.number.op("GLOB")("[0-9]*"))
            .scalar()
            or 0
        )
        if bad_not_digit:
            # Nothing else we can do safely here without re-running the logic.
            pass

        dupes = (
            db.query(
                Order.tenant_id,
                Order.warehouse_id,
                Order.number,
                func.count(Order.id).label("c"),
            )
            .filter(Order.number != None)  # noqa: E711
            .group_by(Order.tenant_id, Order.warehouse_id, Order.number)
            .having(func.count(Order.id) > 1)
            .count()
        )
        if dupes:
            pass

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def ensure_damage_report_columns(engine: Engine) -> None:
    """Add newer damage-report columns and indexes for entry-based workflow if missing."""
    with engine.connect() as conn:
        # damage_report_items extensions
        result = conn.execute(text("PRAGMA table_info(damage_report_items)"))
        cols = [row[1] for row in result]
        if cols:
            if "damage_entry_id" not in cols:
                conn.execute(text("ALTER TABLE damage_report_items ADD COLUMN damage_entry_id INTEGER"))
            if "decision" not in cols:
                conn.execute(text("ALTER TABLE damage_report_items ADD COLUMN decision VARCHAR(32)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_damage_report_items_damage_entry_id ON damage_report_items(damage_entry_id)"))

        # damage_entries table may not exist in old DBs when create_all timing differs
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS damage_entries (
                  id INTEGER PRIMARY KEY,
                  created_at DATETIME NOT NULL,
                  updated_at DATETIME NOT NULL,
                  tenant_id INTEGER NOT NULL,
                  warehouse_id INTEGER NOT NULL,
                  product_id INTEGER,
                  product_name VARCHAR NOT NULL,
                  sku VARCHAR,
                  location_uuid VARCHAR(64) NOT NULL,
                  location_label VARCHAR,
                  quantity FLOAT NOT NULL DEFAULT 0,
                  photo_url VARCHAR NOT NULL,
                  created_by VARCHAR(128),
                  status VARCHAR(24) NOT NULL DEFAULT 'NEW',
                  damage_type VARCHAR(32) DEFAULT 'other',
                  description VARCHAR,
                  decision VARCHAR(32),
                  reviewed_by VARCHAR(128),
                  reviewed_at VARCHAR(64),
                  purchase_price FLOAT NOT NULL DEFAULT 0,
                  total_value FLOAT NOT NULL DEFAULT 0
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_damage_entries_tenant_id ON damage_entries(tenant_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_damage_entries_warehouse_id ON damage_entries(warehouse_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_damage_entries_status ON damage_entries(status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_damage_entries_location_uuid ON damage_entries(location_uuid)"))

        result = conn.execute(text("PRAGMA table_info(damage_entries)"))
        de_cols = [row[1] for row in result]
        if de_cols and "photo_urls" not in de_cols:
            conn.execute(text("ALTER TABLE damage_entries ADD COLUMN photo_urls TEXT"))

        conn.commit()


def ensure_return_statuses_and_rmz(engine: Engine) -> None:
    """
    Create return_statuses, migrate wms_order_returns.status -> status_id, drop legacy status column.
    Idempotent for DBs already on status_id-only schema.
    """
    from sqlalchemy import text

    from ..services.return_status_service import ensure_defaults_raw_conn, legacy_status_to_transition_key

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS return_statuses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    name VARCHAR(128) NOT NULL,
                    color VARCHAR(32) NOT NULL DEFAULT 'blue',
                    type VARCHAR(24) NOT NULL,
                    transition_key VARCHAR(32),
                    FOREIGN KEY(tenant_id) REFERENCES tenants(id),
                    FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rs_tenant ON return_statuses(tenant_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rs_wh ON return_statuses(warehouse_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rs_type ON return_statuses(type)"))
        try:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_rs_twh_transition "
                    "ON return_statuses(tenant_id, warehouse_id, transition_key) "
                    "WHERE transition_key IS NOT NULL"
                )
            )
        except Exception:
            pass

        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wms_order_returns' LIMIT 1")
        ).fetchone()
        if not exists:
            return

        r = conn.execute(text("PRAGMA table_info(wms_order_returns)"))
        colmap = {row[1]: row for row in r}
        has_status = "status" in colmap
        has_status_id = "status_id" in colmap

        pairs = conn.execute(
            text("SELECT DISTINCT tenant_id, warehouse_id FROM wms_order_returns")
        ).fetchall()
        if not pairs:
            try:
                pairs = conn.execute(
                    text("SELECT tenant_id, warehouse_id FROM tenant_warehouses")
                ).fetchall()
            except Exception:
                pairs = []

        for tid, wid in pairs:
            ensure_defaults_raw_conn(conn, int(tid), int(wid))

        if has_status and not has_status_id:
            conn.execute(
                text(
                    "ALTER TABLE wms_order_returns ADD COLUMN status_id INTEGER REFERENCES return_statuses(id)"
                )
            )
            rows = conn.execute(
                text("SELECT id, tenant_id, warehouse_id, status FROM wms_order_returns")
            ).fetchall()
            for rid, tid, wid, st in rows:
                tkey = legacy_status_to_transition_key(st or "")
                row = conn.execute(
                    text(
                        "SELECT id FROM return_statuses WHERE tenant_id = :t AND warehouse_id = :w "
                        "AND transition_key = :k LIMIT 1"
                    ),
                    {"t": tid, "w": wid, "k": tkey},
                ).fetchone()
                if not row:
                    ensure_defaults_raw_conn(conn, int(tid), int(wid))
                    row = conn.execute(
                        text(
                            "SELECT id FROM return_statuses WHERE tenant_id = :t AND warehouse_id = :w "
                            "AND transition_key = :k LIMIT 1"
                        ),
                        {"t": tid, "w": wid, "k": tkey},
                    ).fetchone()
                sid = row[0] if row else None
                if sid is None:
                    row0 = conn.execute(
                        text(
                            "SELECT id FROM return_statuses WHERE tenant_id = :t AND warehouse_id = :w "
                            "AND transition_key = 'start' LIMIT 1"
                        ),
                        {"t": tid, "w": wid},
                    ).fetchone()
                    sid = row0[0]
                conn.execute(
                    text("UPDATE wms_order_returns SET status_id = :s WHERE id = :i"),
                    {"s": sid, "i": rid},
                )
            has_status_id = True

        if has_status_id and has_status:
            conn.execute(
                text(
                    """
                    CREATE TABLE wms_order_returns__new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        order_id INTEGER NOT NULL,
                        external_id VARCHAR(128),
                        rmz_number VARCHAR(48) NOT NULL,
                        return_type VARCHAR(24) NOT NULL DEFAULT 'RMA',
                        status_id INTEGER NOT NULL,
                        lines_json TEXT NOT NULL DEFAULT '[]',
                        created_at DATETIME,
                        FOREIGN KEY(tenant_id) REFERENCES tenants(id),
                        FOREIGN KEY(warehouse_id) REFERENCES warehouses(id),
                        FOREIGN KEY(order_id) REFERENCES orders(id),
                        FOREIGN KEY(status_id) REFERENCES return_statuses(id)
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO wms_order_returns__new
                    (id, tenant_id, warehouse_id, order_id, external_id, rmz_number, return_type, status_id, lines_json, created_at)
                    SELECT id, tenant_id, warehouse_id, order_id, external_id, rmz_number,
                           'RMA',
                           status_id,
                           COALESCE(lines_json, '[]'), created_at
                    FROM wms_order_returns
                    """
                )
            )
            conn.execute(text("DROP TABLE wms_order_returns"))
            conn.execute(text("ALTER TABLE wms_order_returns__new RENAME TO wms_order_returns"))
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_wms_order_returns_external_id ON wms_order_returns(external_id)"
                )
            )
            try:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS uq_wms_order_returns_tenant_wh_rmz "
                        "ON wms_order_returns(tenant_id, warehouse_id, rmz_number)"
                    )
                )
            except Exception:
                pass
        elif has_status_id and not has_status:
            for tid, wid in pairs:
                ensure_defaults_raw_conn(conn, int(tid), int(wid))
            nulls = conn.execute(
                text("SELECT COUNT(*) FROM wms_order_returns WHERE status_id IS NULL")
            ).scalar()
            if nulls and int(nulls) > 0:
                for rid, tid, wid in conn.execute(
                    text(
                        "SELECT id, tenant_id, warehouse_id FROM wms_order_returns WHERE status_id IS NULL"
                    )
                ).fetchall():
                    row0 = conn.execute(
                        text(
                            "SELECT id FROM return_statuses WHERE tenant_id = :t AND warehouse_id = :w "
                            "AND transition_key = 'start' LIMIT 1"
                        ),
                        {"t": tid, "w": wid},
                    ).fetchone()
                    if row0:
                        conn.execute(
                            text("UPDATE wms_order_returns SET status_id = :s WHERE id = :i"),
                            {"s": row0[0], "i": rid},
                        )


def ensure_wms_order_returns_columns(engine: Engine) -> None:
    """
    Add columns introduced after the first RMZ table shipped (external_id, status, etc.).
    Without this, older SQLite files raise OperationalError on INSERT/SELECT vs ORM.
    """
    with engine.connect() as conn:
        exists = conn.execute(
            text(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='wms_order_returns' LIMIT 1"
            )
        ).fetchone()
        if not exists:
            conn.commit()
            return

        r = conn.execute(text("PRAGMA table_info(wms_order_returns)"))
        columns = {row[1] for row in r}

        if "external_id" not in columns:
            conn.execute(text("ALTER TABLE wms_order_returns ADD COLUMN external_id VARCHAR(128)"))
        if "lines_json" not in columns:
            conn.execute(
                text("ALTER TABLE wms_order_returns ADD COLUMN lines_json TEXT NOT NULL DEFAULT '[]'")
            )
        if "created_at" not in columns:
            conn.execute(text("ALTER TABLE wms_order_returns ADD COLUMN created_at DATETIME"))
        if "return_type" not in columns:
            conn.execute(text("ALTER TABLE wms_order_returns ADD COLUMN return_type VARCHAR(24) NOT NULL DEFAULT 'RMA'"))

        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_wms_order_returns_external_id ON wms_order_returns(external_id)")
        )

        try:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_wms_order_returns_tenant_wh_rmz "
                    "ON wms_order_returns(tenant_id, warehouse_id, rmz_number)"
                )
            )
        except Exception:
            # Duplicates or legacy data: skip so app stays up; new inserts still validated by ORM where possible
            pass

        conn.commit()


def ensure_return_ui_statuses_and_column(engine: Engine) -> None:
    """Create return_ui_statuses table and wms_order_returns.ui_status_id for panel labels."""
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS return_ui_statuses (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
                    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
                    main_group VARCHAR(24) NOT NULL DEFAULT 'NEW',
                    name VARCHAR(128) NOT NULL,
                    color VARCHAR(32) NOT NULL DEFAULT '#64748b',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    UNIQUE (tenant_id, warehouse_id, main_group, name)
                )
                """
            )
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_return_ui_statuses_tenant ON return_ui_statuses(tenant_id)")
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_return_ui_statuses_wh ON return_ui_statuses(warehouse_id)")
        )

        # Legacy DBs: add main_group BEFORE any index on main_group (old tables lack the column).
        r_tab = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='return_ui_statuses' LIMIT 1")
        ).fetchone()
        if r_tab:
            r = conn.execute(text("PRAGMA table_info(return_ui_statuses)"))
            cols = {row[1] for row in r}
            if "main_group" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE return_ui_statuses ADD COLUMN main_group VARCHAR(24) NOT NULL DEFAULT 'NEW'"
                    )
                )
            for legacy_idx in (
                "uq_return_ui_status_twh_name",
            ):
                try:
                    conn.execute(text(f"DROP INDEX IF EXISTS {legacy_idx}"))
                except Exception:
                    pass
            try:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS uq_return_ui_wh_group_name "
                        "ON return_ui_statuses(tenant_id, warehouse_id, main_group, name)"
                    )
                )
            except Exception:
                # Old DB may still have inline UNIQUE(tenant_id, warehouse_id, name); app stays up.
                pass

        r_cols = conn.execute(text("PRAGMA table_info(return_ui_statuses)"))
        col_names = {row[1] for row in r_cols}
        if "main_group" in col_names:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_return_ui_statuses_main_group ON return_ui_statuses(main_group)"
                )
            )

        exists = conn.execute(
            text(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='wms_order_returns' LIMIT 1"
            )
        ).fetchone()
        if exists:
            r = conn.execute(text("PRAGMA table_info(wms_order_returns)"))
            cols = {row[1] for row in r}
            if "ui_status_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE wms_order_returns ADD COLUMN ui_status_id INTEGER "
                        "REFERENCES return_ui_statuses(id) ON DELETE SET NULL"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_wms_order_returns_ui_status_id "
                        "ON wms_order_returns(ui_status_id)"
                    )
                )
        _migrate_panel_ui_status_colors_to_hex(conn, "return_ui_statuses")
        conn.commit()


def ensure_order_ui_statuses_and_column(engine: Engine) -> None:
    """Create order_ui_statuses table and orders.order_ui_status_id for panel labels."""
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS order_ui_statuses (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
                    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
                    main_group VARCHAR(24) NOT NULL DEFAULT 'NEW',
                    name VARCHAR(128) NOT NULL,
                    color VARCHAR(32) NOT NULL DEFAULT '#64748b',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    UNIQUE (tenant_id, warehouse_id, main_group, name)
                )
                """
            )
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_order_ui_statuses_tenant ON order_ui_statuses(tenant_id)")
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_order_ui_statuses_wh ON order_ui_statuses(warehouse_id)")
        )

        r_tab = conn.execute(
            text(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='order_ui_statuses' LIMIT 1"
            )
        ).fetchone()
        if r_tab:
            r = conn.execute(text("PRAGMA table_info(order_ui_statuses)"))
            cols = {row[1] for row in r}
            if "main_group" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE order_ui_statuses ADD COLUMN main_group VARCHAR(24) NOT NULL DEFAULT 'NEW'"
                    )
                )
            try:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS uq_order_ui_wh_group_name "
                        "ON order_ui_statuses(tenant_id, warehouse_id, main_group, name)"
                    )
                )
            except Exception:
                pass

        r_cols = conn.execute(text("PRAGMA table_info(order_ui_statuses)"))
        col_names = {row[1] for row in r_cols}
        if "main_group" in col_names:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_order_ui_statuses_main_group ON order_ui_statuses(main_group)"
                )
            )

        oexists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders' LIMIT 1")
        ).fetchone()
        if oexists:
            r = conn.execute(text("PRAGMA table_info(orders)"))
            cols = {row[1] for row in r}
            if "order_ui_status_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE orders ADD COLUMN order_ui_status_id INTEGER "
                        "REFERENCES order_ui_statuses(id) ON DELETE SET NULL"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_orders_order_ui_status_id ON orders(order_ui_status_id)"
                    )
                )
        _migrate_panel_ui_status_colors_to_hex(conn, "order_ui_statuses")
        conn.commit()


def ensure_order_ui_statuses_is_system_column(engine: Engine) -> None:
    """Panel order sub-status: built-in rows cannot be reordered/deleted via panel APIs."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='order_ui_statuses' LIMIT 1")
        ).fetchone()
        if not exists:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(order_ui_statuses)")).fetchall()}
        if "is_system" not in cols:
            conn.execute(
                text("ALTER TABLE order_ui_statuses ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0")
            )
        conn.commit()


def ensure_panel_ui_statuses_advanced_columns(engine: Engine) -> None:
    """
    Rozszerzenie statusów panelu (zamówienia + zwroty): grupa/podgrupa, sortowanie,
    kolory (pas / tło / tekst), miniaturka, aktywność. Zachowuje ``color`` jako legacy.
    """
    with engine.connect() as conn:
        adds: list[tuple[str, str]] = [
            ("group_name", "VARCHAR(128)"),
            ("subgroup_name", "VARCHAR(128)"),
            ("sort_group", "INTEGER NOT NULL DEFAULT 0"),
            ("sort_subgroup", "INTEGER NOT NULL DEFAULT 0"),
            ("sort_status", "INTEGER NOT NULL DEFAULT 0"),
            ("badge_color", "VARCHAR(32)"),
            ("background_color", "VARCHAR(32)"),
            ("text_color", "VARCHAR(32)"),
            ("image_url", "VARCHAR(512)"),
            ("is_active", "INTEGER NOT NULL DEFAULT 1"),
        ]

        def upgrade_table(table: str) -> None:
            exists = conn.execute(
                text(f"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{table}' LIMIT 1")
            ).fetchone()
            if not exists:
                return
            cols = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
            had_sort_status = "sort_status" in cols
            had_badge_color = "badge_color" in cols
            for col, typ in adds:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {typ}"))
            if not had_sort_status:
                conn.execute(text(f"UPDATE {table} SET sort_status = sort_order"))
            if not had_badge_color:
                conn.execute(text(f"UPDATE {table} SET badge_color = color WHERE badge_color IS NULL"))
                conn.execute(text(f"UPDATE {table} SET background_color = color WHERE background_color IS NULL"))
                conn.execute(text(f"UPDATE {table} SET text_color = '#0f172a' WHERE text_color IS NULL"))

        upgrade_table("order_ui_statuses")
        upgrade_table("return_ui_statuses")
        conn.commit()


def ensure_orders_complaint_origin_columns(engine: Engine) -> None:
    """Powiązanie zamówienia z reklamacją (wymiana — nowe zamówienie z panelu reklamacji)."""
    with engine.connect() as conn:
        oexists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders' LIMIT 1")
        ).fetchone()
        if not oexists:
            conn.commit()
            return
        r = conn.execute(text("PRAGMA table_info(orders)"))
        cols = {row[1] for row in r}
        if "order_origin" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN order_origin VARCHAR(32)"))
        if "complaint_id" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE orders ADD COLUMN complaint_id INTEGER "
                    "REFERENCES complaints(id) ON DELETE SET NULL"
                )
            )
        if "original_order_id" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE orders ADD COLUMN original_order_id INTEGER "
                    "REFERENCES orders(id) ON DELETE SET NULL"
                )
            )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_order_origin ON orders(order_origin)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_complaint_id ON orders(complaint_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_original_order_id ON orders(original_order_id)"))
        if "complaint_order_type" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN complaint_order_type VARCHAR(24)"))
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_orders_complaint_order_type ON orders(complaint_order_type)")
        )
        conn.commit()


def ensure_complaints_and_complaint_ui_statuses(engine: Engine) -> None:
    """Panel complaints + tenant-scoped complaint_ui_statuses."""
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS complaint_ui_statuses (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
                    main_group VARCHAR(24) NOT NULL DEFAULT 'NEW',
                    name VARCHAR(128) NOT NULL,
                    color VARCHAR(32) NOT NULL DEFAULT '#64748b',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    UNIQUE (tenant_id, main_group, name)
                )
                """
            )
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_complaint_ui_statuses_tenant ON complaint_ui_statuses(tenant_id)")
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_complaint_ui_statuses_main_group ON complaint_ui_statuses(main_group)"
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS complaints (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
                    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
                    reference_code VARCHAR(64),
                    title VARCHAR(256) NOT NULL,
                    description TEXT,
                    created_at DATETIME,
                    complaint_ui_status_id INTEGER REFERENCES complaint_ui_statuses(id) ON DELETE SET NULL
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaints_tenant ON complaints(tenant_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaints_warehouse ON complaints(warehouse_id)"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_complaints_complaint_ui_status_id ON complaints(complaint_ui_status_id)"
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaints_reference_code ON complaints(reference_code)"))

        _migrate_panel_ui_status_colors_to_hex(conn, "complaint_ui_statuses")
        conn.commit()


def _complaint_shipment_table_columns(conn, table: str) -> list[str]:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return [str(r[1]) for r in rows]


def _complaint_shipments_single_column_unique_on_complaint_id(conn) -> bool:
    """True when only legacy UNIQUE(complaint_id) exists (blocks a second SERVICE row)."""
    rows = conn.execute(text("PRAGMA index_list('complaint_shipments')")).fetchall()
    for row in rows:
        # seq, name, unique, origin, partial
        unique = int(row[2] or 0)
        if not unique:
            continue
        name = str(row[1])
        info = conn.execute(text(f"PRAGMA index_info('{name}')")).fetchall()
        cols = [str(r[2]) for r in info if r[2]]
        if cols == ["complaint_id"]:
            return True
    create_sql = conn.execute(
        text("SELECT sql FROM sqlite_master WHERE type='table' AND name='complaint_shipments'")
    ).fetchone()
    if create_sql and create_sql[0]:
        norm = create_sql[0].replace(" ", "").upper()
        if "COMPLAINT_IDINTEGERNOTNULLUNIQUE" in norm:
            return True
    return False


def _rebuild_complaint_shipments_composite_unique(conn) -> None:
    conn.execute(text("PRAGMA foreign_keys=OFF"))
    conn.execute(text("DROP TABLE IF EXISTS complaint_shipments__new"))
    conn.execute(
        text(
            """
            CREATE TABLE complaint_shipments__new (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
                shipment_role VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER',
                method VARCHAR(32) NOT NULL,
                carrier VARCHAR(16) NOT NULL,
                status VARCHAR(32) NOT NULL,
                tracking_number VARCHAR(64) NOT NULL,
                label_url VARCHAR(512),
                pickup_date DATE,
                pickup_name VARCHAR(256),
                pickup_address TEXT,
                pickup_phone VARCHAR(64),
                pickup_email VARCHAR(256),
                created_at DATETIME,
                service_rma VARCHAR(128),
                destination_line TEXT,
                notes TEXT,
                UNIQUE(complaint_id, shipment_role)
            )
            """
        )
    )
    conn.execute(
        text(
            """
            INSERT INTO complaint_shipments__new
            (id, complaint_id, shipment_role, method, carrier, status, tracking_number, label_url,
             pickup_date, pickup_name, pickup_address, pickup_phone, pickup_email, created_at,
             service_rma, destination_line, notes)
            SELECT
                id, complaint_id,
                COALESCE(NULLIF(TRIM(shipment_role), ''), 'CUSTOMER'),
                method, carrier, status, tracking_number, label_url,
                pickup_date, pickup_name, pickup_address, pickup_phone, pickup_email, created_at,
                service_rma, destination_line, notes
            FROM complaint_shipments
            """
        )
    )
    conn.execute(text("DROP TABLE complaint_shipments"))
    conn.execute(text("ALTER TABLE complaint_shipments__new RENAME TO complaint_shipments"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shipments_complaint ON complaint_shipments(complaint_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shipments_status ON complaint_shipments(status)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shipments_role ON complaint_shipments(shipment_role)"))
    conn.execute(text("PRAGMA foreign_keys=ON"))


def migrate_complaint_shipments_roles_and_uniqueness(engine: Engine) -> None:
    """Add SERVICE shipment columns + UNIQUE(complaint_id, shipment_role) for legacy DBs."""
    with engine.connect() as conn:
        cols = _complaint_shipment_table_columns(conn, "complaint_shipments")
        if not cols:
            return
        if "shipment_role" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE complaint_shipments ADD COLUMN shipment_role "
                    "VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER'"
                )
            )
        if "service_rma" not in cols:
            conn.execute(text("ALTER TABLE complaint_shipments ADD COLUMN service_rma VARCHAR(128)"))
        if "destination_line" not in cols:
            conn.execute(text("ALTER TABLE complaint_shipments ADD COLUMN destination_line TEXT"))
        if "notes" not in cols:
            conn.execute(text("ALTER TABLE complaint_shipments ADD COLUMN notes TEXT"))
        cols2 = _complaint_shipment_table_columns(conn, "complaint_shipments")
        if "shipment_business_type" not in cols2:
            conn.execute(text("ALTER TABLE complaint_shipments ADD COLUMN shipment_business_type VARCHAR(24)"))
        if "fulfillment_mode" not in cols2:
            conn.execute(text("ALTER TABLE complaint_shipments ADD COLUMN fulfillment_mode VARCHAR(32)"))
        conn.execute(
            text(
                "UPDATE complaint_shipments SET shipment_role = 'CUSTOMER' "
                "WHERE shipment_role IS NULL OR TRIM(shipment_role) = ''"
            )
        )
        conn.commit()

        if _complaint_shipments_single_column_unique_on_complaint_id(conn):
            _rebuild_complaint_shipments_composite_unique(conn)
            conn.commit()


def ensure_complaint_shipments_tables(engine: Engine) -> None:
    """MVP complaint courier / drop-off shipments + timeline events."""
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS complaint_shipments (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
                    shipment_role VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER',
                    method VARCHAR(32) NOT NULL,
                    carrier VARCHAR(16) NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    tracking_number VARCHAR(64) NOT NULL,
                    label_url VARCHAR(512),
                    pickup_date DATE,
                    pickup_name VARCHAR(256),
                    pickup_address TEXT,
                    pickup_phone VARCHAR(64),
                    pickup_email VARCHAR(256),
                    created_at DATETIME,
                    service_rma VARCHAR(128),
                    destination_line TEXT,
                    notes TEXT,
                    UNIQUE(complaint_id, shipment_role)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shipments_complaint ON complaint_shipments(complaint_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shipments_status ON complaint_shipments(status)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS complaint_shipment_events (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    shipment_id INTEGER NOT NULL REFERENCES complaint_shipments(id) ON DELETE CASCADE,
                    kind VARCHAR(32) NOT NULL,
                    title VARCHAR(256) NOT NULL,
                    created_at DATETIME
                )
                """
            )
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_shipment_events_shipment ON complaint_shipment_events(shipment_id)")
        )
        conn.commit()
    migrate_complaint_shipments_roles_and_uniqueness(engine)
    with engine.connect() as conn:
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shipments_role ON complaint_shipments(shipment_role)"))
        conn.commit()


def ensure_complaint_order_and_lines(engine: Engine) -> None:
    """Complaints linked to orders + complaint_lines (panel)."""
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS complaint_lines (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
                    order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
                    quantity INTEGER NOT NULL,
                    reason TEXT
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaint_lines_complaint ON complaint_lines(complaint_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaint_lines_order_item ON complaint_lines(order_item_id)"))
        line_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(complaint_lines)")).fetchall()}
        if "line_status" not in line_cols:
            conn.execute(
                text(
                    "ALTER TABLE complaint_lines ADD COLUMN line_status VARCHAR(24) NOT NULL DEFAULT 'NOWE'"
                )
            )
        if "line_decision" not in line_cols:
            conn.execute(text("ALTER TABLE complaint_lines ADD COLUMN line_decision VARCHAR(32)"))
        if "operation_status" not in line_cols:
            conn.execute(text("ALTER TABLE complaint_lines ADD COLUMN operation_status VARCHAR(32)"))
        line_cols2 = {row[1] for row in conn.execute(text("PRAGMA table_info(complaint_lines)")).fetchall()}
        if "exchange_kind" not in line_cols2:
            conn.execute(text("ALTER TABLE complaint_lines ADD COLUMN exchange_kind VARCHAR(16)"))
        line_cols3 = {row[1] for row in conn.execute(text("PRAGMA table_info(complaint_lines)")).fetchall()}
        if "photo_urls_json" not in line_cols3:
            conn.execute(text("ALTER TABLE complaint_lines ADD COLUMN photo_urls_json TEXT"))
        if "note_warehouse" not in line_cols3:
            conn.execute(text("ALTER TABLE complaint_lines ADD COLUMN note_warehouse TEXT"))
        if "defect_ids_json" not in line_cols3:
            conn.execute(text("ALTER TABLE complaint_lines ADD COLUMN defect_ids_json TEXT"))
        line_cols4 = {row[1] for row in conn.execute(text("PRAGMA table_info(complaint_lines)")).fetchall()}
        if "settlement_type" not in line_cols4:
            conn.execute(text("ALTER TABLE complaint_lines ADD COLUMN settlement_type VARCHAR(24)"))
        if "settlement_amount" not in line_cols4:
            conn.execute(text("ALTER TABLE complaint_lines ADD COLUMN settlement_amount FLOAT"))
        if "settlement_currency" not in line_cols4:
            conn.execute(text("ALTER TABLE complaint_lines ADD COLUMN settlement_currency VARCHAR(8)"))
        if "warehouse_note" in line_cols3 and "note_warehouse" in {row[1] for row in conn.execute(text("PRAGMA table_info(complaint_lines)")).fetchall()}:
            conn.execute(
                text(
                    "UPDATE complaint_lines SET note_warehouse = warehouse_note "
                    "WHERE (note_warehouse IS NULL OR TRIM(note_warehouse) = '') "
                    "AND warehouse_note IS NOT NULL AND TRIM(warehouse_note) <> ''"
                )
            )
        conn.execute(
            text(
                "UPDATE complaint_lines SET line_status = 'NOWE' "
                "WHERE line_status IS NULL OR TRIM(line_status) = ''"
            )
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_complaint_lines_line_status ON complaint_lines(line_status)")
        )

        rows = conn.execute(text("PRAGMA table_info(complaints)")).fetchall()
        cols = {row[1] for row in rows}
        if "order_id" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN order_id INTEGER REFERENCES orders(id)"))
        if "photo_urls_json" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN photo_urls_json TEXT"))
        if "warehouse_photo_urls_json" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN warehouse_photo_urls_json TEXT"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaints_order_id ON complaints(order_id)"))
        conn.commit()


def ensure_complaint_process_status_column(engine: Engine) -> None:
    """Panel: fixed process steps (Przebieg reklamacji)."""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(complaints)")).fetchall()
        cols = {row[1] for row in rows}
        if "complaint_process_status" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE complaints ADD COLUMN complaint_process_status VARCHAR(24) DEFAULT 'NOWE'"
                )
            )
        conn.execute(
            text(
                "UPDATE complaints SET complaint_process_status = 'NOWE' "
                "WHERE complaint_process_status IS NULL OR TRIM(complaint_process_status) = ''"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_complaints_process_status ON complaints(complaint_process_status)"
            )
        )
        conn.commit()


def ensure_complaint_deleted_at_column(engine: Engine) -> None:
    """Soft delete dla reklamacji w panelu (deleted_at)."""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(complaints)")).fetchall()
        cols = {row[1] for row in rows}
        if "deleted_at" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN deleted_at DATETIME"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaints_deleted_at ON complaints(deleted_at)"))
        conn.commit()


def ensure_complaint_defects_reason_columns(engine: Engine) -> None:
    """Lista reklamacji: defects_json (tag ids), customer_reason (powód)."""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(complaints)")).fetchall()
        cols = {row[1] for row in rows}
        if "defects_json" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN defects_json TEXT"))
        if "customer_reason" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN customer_reason TEXT"))
        conn.commit()


def ensure_complaint_response_deadline_columns(engine: Engine) -> None:
    """Termin odpowiedzi (14 dni od created_at) + flaga automatycznej akceptacji."""
    from datetime import datetime, timedelta

    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(complaints)")).fetchall()
        cols = {row[1] for row in rows}
        if "response_deadline" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN response_deadline DATETIME"))
        if "auto_accepted" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN auto_accepted INTEGER DEFAULT 0"))
        conn.commit()

    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT id, created_at FROM complaints WHERE response_deadline IS NULL AND created_at IS NOT NULL")
        )
        for rid, cat in r.fetchall():
            if cat is None:
                continue
            if not isinstance(cat, datetime):
                try:
                    cat = datetime.fromisoformat(str(cat).replace("Z", "+00:00").split("+")[0])
                except Exception:
                    continue
            dl = cat + timedelta(days=14)
            conn.execute(
                text("UPDATE complaints SET response_deadline = :dl WHERE id = :id"),
                {"dl": dl, "id": rid},
            )
        conn.commit()


def ensure_complaint_decision_hierarchy_columns(engine: Engine) -> None:
    """Pola hierarchii decyzji: naprawa/wymiana przed zwrotem, obniżeniem, odmową."""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(complaints)")).fetchall()
        cols = {row[1] for row in rows}
        if "major_defect" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN major_defect INTEGER DEFAULT 0"))
        if "repair_failed" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN repair_failed INTEGER DEFAULT 0"))
        if "replacement_failed" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN replacement_failed INTEGER DEFAULT 0"))
        if "operational_decision" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN operational_decision VARCHAR(32)"))
        if "financial_decision" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN financial_decision VARCHAR(32)"))
        conn.commit()


def ensure_complaint_resolution_columns(engine: Engine) -> None:
    """Rozliczenie z klientem: typ, status, kwota waluta."""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(complaints)")).fetchall()
        cols = {row[1] for row in rows}
        if "resolution_type" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN resolution_type VARCHAR(24)"))
        if "resolution_status" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN resolution_status VARCHAR(24)"))
        if "resolution_amount" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN resolution_amount REAL"))
        if "resolution_currency" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN resolution_currency VARCHAR(8)"))
        conn.commit()


def ensure_complaint_documents_table(engine: Engine) -> None:
    """PDF-y reklamacji: decyzja, korekta, RMA."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='complaint_documents' LIMIT 1")
        ).fetchone()
        if exists:
            conn.commit()
            return
        conn.execute(
            text(
                """
                CREATE TABLE complaint_documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    complaint_id INTEGER NOT NULL,
                    type VARCHAR(16) NOT NULL,
                    file_url VARCHAR(512) NOT NULL,
                    title VARCHAR(256),
                    meta_json TEXT,
                    created_at DATETIME,
                    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX ix_complaint_documents_complaint_id ON complaint_documents(complaint_id)"))
        conn.execute(text("CREATE INDEX ix_complaint_documents_type ON complaint_documents(type)"))
        conn.commit()


def ensure_complaint_logistics_columns(engine: Engine) -> None:
    """Status logistyczny reklamacji (osobno od complaint_process_status)."""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(complaints)")).fetchall()
        cols = {row[1] for row in rows}
        if "logistics_status" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN logistics_status VARCHAR(32)"))
        if "logistics_service_rma" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN logistics_service_rma VARCHAR(128)"))
        if "logistics_expected_return_date" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN logistics_expected_return_date DATE"))
        if "logistics_in_service_since" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN logistics_in_service_since DATETIME"))
        conn.commit()
    with engine.connect() as conn:
        # Istniejące rekordy: brak danych logistycznych → przyjęte (katalog), nowe ustawia API wg produktu.
        conn.execute(
            text(
                "UPDATE complaints SET logistics_status = 'RECEIVED' "
                "WHERE logistics_status IS NULL OR TRIM(COALESCE(logistics_status, '')) = ''"
            )
        )
        conn.commit()


def ensure_complaint_customer_snapshot_columns(engine: Engine) -> None:
    """Imię / telefon / e-mail skopiowane z zamówienia przy tworzeniu reklamacji."""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(complaints)")).fetchall()
        cols = {row[1] for row in rows}
        if "customer_name" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN customer_name VARCHAR(256)"))
        if "customer_phone" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN customer_phone VARCHAR(128)"))
        if "customer_email" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN customer_email VARCHAR(256)"))
        conn.commit()


def ensure_complaint_production_columns(engine: Engine) -> None:
    """Snapshot klienta, oczekiwanie na produkt, audyt zdarzeń."""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(complaints)")).fetchall()
        cols = {row[1] for row in rows}
        if "customer_address" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN customer_address TEXT"))
        if "waiting_for_product_since" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN waiting_for_product_since DATETIME"))
        if "waiting_reminder_sent_at" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN waiting_reminder_sent_at DATETIME"))
        if "audit_events_json" not in cols:
            conn.execute(text("ALTER TABLE complaints ADD COLUMN audit_events_json TEXT"))
        if "parent_complaint_id" not in cols:
            conn.execute(
                text("ALTER TABLE complaints ADD COLUMN parent_complaint_id INTEGER REFERENCES complaints(id) ON DELETE SET NULL")
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaints_parent_complaint ON complaints(parent_complaint_id)"))
        conn.commit()


def ensure_complaint_events_table(engine: Engine) -> None:
    """Structured complaint event log: complaint_id + payload JSON, indexed for large datasets."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='complaint_events' LIMIT 1")
        ).fetchone()
        if not exists:
            conn.execute(
                text(
                    """
                    CREATE TABLE complaint_events (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
                        line_id INTEGER REFERENCES complaint_lines(id) ON DELETE SET NULL,
                        event_type VARCHAR(64) NOT NULL,
                        payload_json TEXT NOT NULL,
                        created_at DATETIME NOT NULL,
                        actor VARCHAR(128) NOT NULL DEFAULT 'System'
                    )
                    """
                )
            )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaint_events_complaint_id ON complaint_events(complaint_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaint_events_created_at ON complaint_events(created_at DESC)"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_complaint_events_complaint_created "
                "ON complaint_events(complaint_id, created_at DESC)"
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaint_events_line_id ON complaint_events(line_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_complaint_events_event_type ON complaint_events(event_type)"))
        conn.commit()


def ensure_bundles_tables_and_order_item_bundle_columns(engine: Engine) -> None:
    """Product bundles (virtual SKUs) and traceability columns on order_items."""
    with engine.connect() as conn:
        b = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='bundles' LIMIT 1")
        ).fetchone()
        if not b:
            conn.execute(
                text(
                    """
                    CREATE TABLE bundles (
                        id INTEGER NOT NULL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        name VARCHAR NOT NULL,
                        sku VARCHAR,
                        ean VARCHAR,
                        sale_price FLOAT,
                        active BOOLEAN NOT NULL DEFAULT true
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_bundles_tenant_id ON bundles(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_bundles_sku ON bundles(sku)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_bundles_ean ON bundles(ean)"))
        bi = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='bundle_items' LIMIT 1")
        ).fetchone()
        if not bi:
            conn.execute(
                text(
                    """
                    CREATE TABLE bundle_items (
                        id INTEGER NOT NULL PRIMARY KEY,
                        bundle_id INTEGER NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        quantity INTEGER NOT NULL,
                        sort_order INTEGER NOT NULL DEFAULT 0
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_bundle_items_bundle_id ON bundle_items(bundle_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_bundle_items_product_id ON bundle_items(product_id)"))
        rows = conn.execute(text("PRAGMA table_info(order_items)")).fetchall()
        cols = {row[1] for row in rows}
        if "source_bundle_id" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE order_items ADD COLUMN source_bundle_id INTEGER REFERENCES bundles(id) ON DELETE SET NULL"
                )
            )
        if "bundle_instance_id" not in cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN bundle_instance_id VARCHAR(36)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_order_items_source_bundle_id ON order_items(source_bundle_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_order_items_bundle_instance_id ON order_items(bundle_instance_id)"))
        # Optional image URL for bundle list / parity with products
        b_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(bundles)")).fetchall()}
        if "image_url" not in b_cols:
            conn.execute(text("ALTER TABLE bundles ADD COLUMN image_url VARCHAR"))
        bi_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(bundle_items)")).fetchall()}
        if bi_cols and "metadata_json" not in bi_cols:
            conn.execute(text("ALTER TABLE bundle_items ADD COLUMN metadata_json VARCHAR"))
        conn.commit()


def ensure_order_items_packing_quantity_packed_column(engine: Engine) -> None:
    """WMS pakowanie: własna ilość spakowana per pozycja (bez Pick / zbierania)."""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(order_items)")).fetchall()
        cols = {row[1] for row in rows}
        if "packing_quantity_packed" not in cols:
            conn.execute(
                text("ALTER TABLE order_items ADD COLUMN packing_quantity_packed INTEGER NOT NULL DEFAULT 0")
            )
        conn.commit()


def ensure_wms_packing_settings_table(engine: Engine) -> None:
    """WMS packing automation + panel status bindings per tenant + warehouse."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wms_packing_settings' LIMIT 1")
        ).fetchone()
        if not exists:
            conn.execute(
                text(
                    """
                    CREATE TABLE wms_packing_settings (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        start_status_id INTEGER REFERENCES order_ui_statuses(id) ON DELETE SET NULL,
                        packed_status_id INTEGER REFERENCES order_ui_statuses(id) ON DELETE SET NULL,
                        missing_status_id INTEGER REFERENCES order_ui_statuses(id) ON DELETE SET NULL,
                        auto_actions_json TEXT NOT NULL DEFAULT '{}',
                        document_settings_json TEXT NOT NULL DEFAULT '{}',
                        fallback_label_json TEXT NOT NULL DEFAULT '{}',
                        interface_display_json TEXT NOT NULL DEFAULT '{}',
                        packing_after_finish_action VARCHAR(24) NOT NULL DEFAULT 'STAY',
                        created_at DATETIME,
                        updated_at DATETIME,
                        UNIQUE(tenant_id, warehouse_id)
                    )
                    """
                )
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_wms_packing_settings_tenant ON wms_packing_settings(tenant_id)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_wms_packing_settings_wh ON wms_packing_settings(warehouse_id)")
            )
        tbl = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wms_packing_settings' LIMIT 1")
        ).fetchone()
        if tbl:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(wms_packing_settings)")).fetchall()}
            if "packing_after_finish_action" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE wms_packing_settings ADD COLUMN packing_after_finish_action VARCHAR(24) NOT NULL DEFAULT 'STAY'"
                    )
                )
            if "interface_display_json" not in cols:
                conn.execute(
                    text("ALTER TABLE wms_packing_settings ADD COLUMN interface_display_json TEXT NOT NULL DEFAULT '{}'")
                )
        conn.commit()


def ensure_manufacturers_table_and_product_manufacturer_id(engine: Engine) -> None:
    """Manufacturers catalog + optional FK on products."""
    with engine.connect() as conn:
        m = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='manufacturers' LIMIT 1")
        ).fetchone()
        if not m:
            conn.execute(
                text(
                    """
                    CREATE TABLE manufacturers (
                        id INTEGER NOT NULL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        name VARCHAR NOT NULL,
                        logo_url VARCHAR,
                        country VARCHAR,
                        website VARCHAR,
                        email VARCHAR,
                        phone VARCHAR,
                        active BOOLEAN NOT NULL DEFAULT true,
                        responsible_person_name VARCHAR,
                        responsible_person_email VARCHAR
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_manufacturers_tenant_id ON manufacturers(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_manufacturers_name ON manufacturers(name)"))
        pcols = {row[1] for row in conn.execute(text("PRAGMA table_info(products)")).fetchall()}
        if "manufacturer_id" not in pcols:
            conn.execute(
                text(
                    "ALTER TABLE products ADD COLUMN manufacturer_id INTEGER REFERENCES manufacturers(id) ON DELETE SET NULL"
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_products_manufacturer_id ON products(manufacturer_id)"))
        conn.commit()


def ensure_rmz_line_split_columns(engine: Engine) -> None:
    """Add split-quantity columns for RMZ line processing on existing DBs."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rmz_lines' LIMIT 1")
        ).fetchone()
        if not exists:
            conn.commit()
            return

        rows = conn.execute(text("PRAGMA table_info(rmz_lines)")).fetchall()
        cols = {row[1] for row in rows}
        if "accepted_qty" not in cols:
            conn.execute(text("ALTER TABLE rmz_lines ADD COLUMN accepted_qty INTEGER"))
        if "damaged_b_qty" not in cols:
            conn.execute(text("ALTER TABLE rmz_lines ADD COLUMN damaged_b_qty INTEGER"))
        if "damaged_c_qty" not in cols:
            conn.execute(text("ALTER TABLE rmz_lines ADD COLUMN damaged_c_qty INTEGER"))
        if "rejected_qty" not in cols:
            conn.execute(text("ALTER TABLE rmz_lines ADD COLUMN rejected_qty INTEGER"))
        if "final_disposition" not in cols:
            conn.execute(text("ALTER TABLE rmz_lines ADD COLUMN final_disposition VARCHAR(32)"))

        conn.execute(
            text(
                "UPDATE rmz_lines SET accepted_qty = CAST(quantity AS INTEGER), damaged_b_qty = 0, damaged_c_qty = 0, rejected_qty = 0 "
                "WHERE accepted_qty IS NULL AND damaged_b_qty IS NULL AND damaged_c_qty IS NULL AND rejected_qty IS NULL"
            )
        )
        # Migrate old single damaged_qty into class B if present on legacy DB.
        if "damaged_qty" in cols:
            conn.execute(
                text(
                    "UPDATE rmz_lines SET damaged_b_qty = COALESCE(damaged_b_qty, CAST(damaged_qty AS INTEGER), 0) "
                    "WHERE damaged_qty IS NOT NULL"
                )
            )
        conn.commit()


def ensure_rmz_line_damage_entries_json(engine: Engine) -> None:
    """Persist independent damage entry list per RMZ line (WMS split-process)."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rmz_lines' LIMIT 1")
        ).fetchone()
        if not exists:
            conn.commit()
            return

        rows = conn.execute(text("PRAGMA table_info(rmz_lines)")).fetchall()
        cols = {row[1] for row in rows}
        if "damage_entries_json" not in cols:
            conn.execute(text("ALTER TABLE rmz_lines ADD COLUMN damage_entries_json TEXT"))
        conn.commit()


def ensure_suppliers_and_inbound_deliveries_tables(engine: Engine) -> None:
    """Suppliers + inbound deliveries (WMS); delivery_items link products without touching assigned_locations."""
    with engine.connect() as conn:
        s = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='suppliers' LIMIT 1")
        ).fetchone()
        if not s:
            conn.execute(
                text(
                    """
                    CREATE TABLE suppliers (
                        id INTEGER NOT NULL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        name VARCHAR NOT NULL,
                        email VARCHAR,
                        phone VARCHAR,
                        website VARCHAR,
                        country VARCHAR,
                        address TEXT,
                        active BOOLEAN NOT NULL DEFAULT true,
                        default_lead_time_days INTEGER,
                        default_currency VARCHAR(8),
                        minimum_order_value NUMERIC(12, 2),
                        notes TEXT
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_suppliers_tenant_id ON suppliers(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_suppliers_name ON suppliers(name)"))
        d = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='deliveries' LIMIT 1")
        ).fetchone()
        if not d:
            conn.execute(
                text(
                    """
                    CREATE TABLE deliveries (
                        id INTEGER NOT NULL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
                        name VARCHAR(512),
                        status VARCHAR(32) NOT NULL DEFAULT 'draft',
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        expected_date DATETIME,
                        received_at DATETIME,
                        notes TEXT
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_deliveries_tenant_id ON deliveries(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_deliveries_supplier_id ON deliveries(supplier_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_deliveries_status ON deliveries(status)"))
        di = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='delivery_items' LIMIT 1")
        ).fetchone()
        if not di:
            conn.execute(
                text(
                    """
                    CREATE TABLE delivery_items (
                        id INTEGER NOT NULL PRIMARY KEY,
                        delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
                        quantity_ordered REAL NOT NULL,
                        quantity_received REAL NOT NULL DEFAULT 0,
                        purchase_price REAL
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_delivery_items_delivery_id ON delivery_items(delivery_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_delivery_items_product_id ON delivery_items(product_id)"))
        conn.commit()


def ensure_deliveries_name_column(engine: Engine) -> None:
    """Purchase orders: optional display name on deliveries."""
    with engine.connect() as conn:
        d = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='deliveries' LIMIT 1")
        ).fetchone()
        if not d:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(deliveries)")).fetchall()}
        if "name" not in cols:
            conn.execute(text("ALTER TABLE deliveries ADD COLUMN name VARCHAR(512)"))
        conn.commit()


def ensure_supplier_assortment_columns_and_product_default_supplier(engine: Engine) -> None:
    """Assortment: supplier currency/min order; product.default_supplier_id."""
    with engine.connect() as conn:
        s = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='suppliers' LIMIT 1")
        ).fetchone()
        if s:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(suppliers)")).fetchall()}
            if "default_currency" not in cols:
                conn.execute(text("ALTER TABLE suppliers ADD COLUMN default_currency VARCHAR(8)"))
            if "minimum_order_value" not in cols:
                conn.execute(text("ALTER TABLE suppliers ADD COLUMN minimum_order_value NUMERIC(12, 2)"))
        p = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='products' LIMIT 1")
        ).fetchone()
        if p:
            pcols = {row[1] for row in conn.execute(text("PRAGMA table_info(products)")).fetchall()}
            if "default_supplier_id" not in pcols:
                conn.execute(
                    text(
                        "ALTER TABLE products ADD COLUMN default_supplier_id INTEGER "
                        "REFERENCES suppliers(id) ON DELETE SET NULL"
                    )
                )
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_products_default_supplier_id ON products(default_supplier_id)"))
        conn.commit()


def ensure_tenant_default_warehouse_column(engine: Engine) -> None:
    with engine.connect() as conn:
        r = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tenants' LIMIT 1")).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(tenants)")).fetchall()}
        if "default_warehouse_id" not in cols:
            conn.execute(text("ALTER TABLE tenants ADD COLUMN default_warehouse_id INTEGER"))
        conn.commit()


def ensure_tenant_business_profile_columns(engine: Engine) -> None:
    """Nullable buyer / company fields on tenants (PDFs, future settings UI)."""
    with engine.connect() as conn:
        t = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tenants' LIMIT 1")
        ).fetchone()
        if not t:
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(tenants)")).fetchall()}
        for col, typ in [
            ("company_name", "TEXT"),
            ("tax_id", "TEXT"),
            ("email", "TEXT"),
            ("phone", "TEXT"),
            ("country", "TEXT"),
            ("city", "TEXT"),
            ("postal_code", "TEXT"),
            ("street", "TEXT"),
            ("address", "TEXT"),
        ]:
            if col not in cols:
                conn.execute(text(f"ALTER TABLE tenants ADD COLUMN {col} {typ}"))
        conn.commit()


def ensure_manufacturer_supplier_business_entity_columns(engine: Engine) -> None:
    """Nullable company_name, tax_id, structured address (city, postal_code, street) on manufacturers and suppliers."""
    with engine.connect() as conn:
        m = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='manufacturers' LIMIT 1")
        ).fetchone()
        if m:
            mcols = {row[1] for row in conn.execute(text("PRAGMA table_info(manufacturers)")).fetchall()}
            for col, typ in [
                ("company_name", "TEXT"),
                ("tax_id", "TEXT"),
                ("city", "TEXT"),
                ("postal_code", "TEXT"),
                ("street", "TEXT"),
            ]:
                if col not in mcols:
                    conn.execute(text(f"ALTER TABLE manufacturers ADD COLUMN {col} {typ}"))
        s = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='suppliers' LIMIT 1")
        ).fetchone()
        if s:
            scols = {row[1] for row in conn.execute(text("PRAGMA table_info(suppliers)")).fetchall()}
            for col, typ in [
                ("company_name", "TEXT"),
                ("tax_id", "TEXT"),
                ("city", "TEXT"),
                ("postal_code", "TEXT"),
                ("street", "TEXT"),
            ]:
                if col not in scols:
                    conn.execute(text(f"ALTER TABLE suppliers ADD COLUMN {col} {typ}"))
        conn.commit()


def ensure_supplier_products_table(engine: Engine) -> None:
    """Many-to-many supplier catalog: supplier_products + tenant_id + backfill from products.default_supplier_id."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='supplier_products' LIMIT 1")
        ).fetchone()
        if not r:
            conn.execute(
                text(
                    """
                    CREATE TABLE supplier_products (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
                        supplier_id INTEGER NOT NULL,
                        product_id INTEGER NOT NULL,
                        purchase_price NUMERIC(12, 2),
                        lead_time_days INTEGER,
                        min_order_qty NUMERIC(12, 3),
                        FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
                        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                        CONSTRAINT uq_supplier_products_supplier_product UNIQUE (supplier_id, product_id)
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_supplier_products_tenant_id ON supplier_products(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_supplier_products_supplier_id ON supplier_products(supplier_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_supplier_products_product_id ON supplier_products(product_id)"))
        else:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(supplier_products)")).fetchall()}
            if "tenant_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE supplier_products ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE"
                    )
                )
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_supplier_products_tenant_id ON supplier_products(tenant_id)"))
        conn.execute(
            text(
                """
                UPDATE supplier_products
                SET tenant_id = (SELECT s.tenant_id FROM suppliers s WHERE s.id = supplier_products.supplier_id)
                WHERE tenant_id IS NULL
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT OR IGNORE INTO supplier_products (supplier_id, product_id, purchase_price, lead_time_days, min_order_qty, tenant_id)
                SELECT p.default_supplier_id, p.id, p.purchase_price, NULL, NULL, s.tenant_id
                FROM products p
                JOIN suppliers s ON s.id = p.default_supplier_id
                WHERE p.default_supplier_id IS NOT NULL
                """
            )
        )
        cols2 = {row[1] for row in conn.execute(text("PRAGMA table_info(supplier_products)")).fetchall()}
        for col, typ in (("pack_qty", "NUMERIC(12,3)"), ("carton_qty", "NUMERIC(12,3)")):
            if col not in cols2:
                conn.execute(text(f"ALTER TABLE supplier_products ADD COLUMN {col} {typ}"))
        conn.commit()


def ensure_supplier_purchasing_columns(engine: Engine) -> None:
    """
    Extra supplier fields for purchasing / replenishment (MOQ, free-shipping threshold).
    SQLite-only ALTERs (same pattern as other helpers; PostgreSQL would use migrations).
    """
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='suppliers' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(suppliers)")).fetchall()}
        if "minimum_order_qty" not in cols:
            conn.execute(text("ALTER TABLE suppliers ADD COLUMN minimum_order_qty INTEGER"))
        if "free_shipping_threshold" not in cols:
            conn.execute(text("ALTER TABLE suppliers ADD COLUMN free_shipping_threshold NUMERIC(12, 2)"))
        added_supplier_flags = False
        if "offers_free_shipping" not in cols:
            conn.execute(text("ALTER TABLE suppliers ADD COLUMN offers_free_shipping BOOLEAN NOT NULL DEFAULT true"))
            added_supplier_flags = True
        if "requires_moq" not in cols:
            conn.execute(text("ALTER TABLE suppliers ADD COLUMN requires_moq BOOLEAN NOT NULL DEFAULT true"))
            added_supplier_flags = True
        if added_supplier_flags:
            conn.execute(
                text(
                    """
                    UPDATE suppliers SET
                      offers_free_shipping = CASE
                        WHEN free_shipping_threshold IS NOT NULL AND CAST(free_shipping_threshold AS REAL) > 0 THEN true
                        ELSE false
                      END,
                      requires_moq = CASE
                        WHEN (minimum_order_qty IS NOT NULL AND CAST(minimum_order_qty AS INTEGER) > 0)
                          OR (minimum_order_value IS NOT NULL AND CAST(minimum_order_value AS REAL) > 0)
                        THEN true
                        ELSE false
                      END
                    """
                )
            )
        conn.commit()


def ensure_purchase_orders_tables(engine: Engine) -> None:
    """Formal purchase orders + lines (separate workflow from inbound `deliveries`)."""
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        po = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchase_orders' LIMIT 1")
        ).fetchone()
        if not po:
            conn.execute(
                text(
                    """
                    CREATE TABLE purchase_orders (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
                        supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
                        order_number VARCHAR(64) NOT NULL,
                        status VARCHAR(32) NOT NULL DEFAULT 'Draft',
                        currency VARCHAR(8) NOT NULL DEFAULT 'PLN',
                        subtotal REAL NOT NULL DEFAULT 0,
                        shipping_cost REAL NOT NULL DEFAULT 0,
                        total_value REAL NOT NULL DEFAULT 0,
                        notes TEXT,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        expected_date DATETIME,
                        sent_at DATETIME,
                        confirmed_at DATETIME,
                        closed_at DATETIME
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_orders_tenant_id ON purchase_orders(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_orders_supplier_id ON purchase_orders(supplier_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_orders_status ON purchase_orders(status)"))
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_tenant_order_number "
                    "ON purchase_orders(tenant_id, order_number)"
                )
            )
        poi = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchase_order_items' LIMIT 1")
        ).fetchone()
        if not poi:
            conn.execute(
                text(
                    """
                    CREATE TABLE purchase_order_items (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
                        qty REAL NOT NULL,
                        received_qty REAL NOT NULL DEFAULT 0,
                        unit_price REAL,
                        line_total REAL NOT NULL DEFAULT 0,
                        notes TEXT
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_purchase_order_items_po_id ON purchase_order_items(purchase_order_id)"
                )
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_purchase_order_items_product_id ON purchase_order_items(product_id)")
            )
        conn.commit()


def ensure_deliveries_purchase_order_id_column(engine: Engine) -> None:
    """Link inbound delivery to originating purchase order (optional FK column)."""
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        d = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='deliveries' LIMIT 1")
        ).fetchone()
        if not d:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(deliveries)")).fetchall()}
        if "purchase_order_id" not in cols:
            conn.execute(text("ALTER TABLE deliveries ADD COLUMN purchase_order_id INTEGER"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_deliveries_purchase_order_id ON deliveries(purchase_order_id)"))
        conn.commit()


def ensure_purchasing_alert_tables(engine: Engine) -> None:
    """Alert rules, events, and auto-draft audit for purchasing module."""
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        rt = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchasing_alert_rules' LIMIT 1")
        ).fetchone()
        if not rt:
            conn.execute(
                text(
                    """
                    CREATE TABLE purchasing_alert_rules (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        name VARCHAR(256) NOT NULL,
                        type VARCHAR(64) NOT NULL,
                        is_enabled INTEGER NOT NULL DEFAULT 1,
                        severity VARCHAR(32) NOT NULL,
                        config_json TEXT NOT NULL DEFAULT '{}',
                        created_at DATETIME NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_purch_alert_rules_tenant ON purchasing_alert_rules(tenant_id)")
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purch_alert_rules_type ON purchasing_alert_rules(type)"))
        ev = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchasing_alert_events' LIMIT 1")
        ).fetchone()
        if not ev:
            conn.execute(
                text(
                    """
                    CREATE TABLE purchasing_alert_events (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        rule_id INTEGER NOT NULL REFERENCES purchasing_alert_rules(id) ON DELETE CASCADE,
                        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
                        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
                        status VARCHAR(32) NOT NULL DEFAULT 'open',
                        severity VARCHAR(32) NOT NULL,
                        title VARCHAR(512) NOT NULL,
                        message TEXT,
                        payload_json TEXT,
                        dedupe_key VARCHAR(256) NOT NULL,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        resolved_at DATETIME
                    )
                    """
                )
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_purch_alert_ev_tenant ON purchasing_alert_events(tenant_id)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_purch_alert_ev_rule ON purchasing_alert_events(rule_id)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_purch_alert_ev_status ON purchasing_alert_events(status)")
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_purch_alert_ev_dedupe "
                    "ON purchasing_alert_events(tenant_id, rule_id, dedupe_key, status)"
                )
            )
        ad = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchasing_auto_drafts' LIMIT 1")
        ).fetchone()
        if not ad:
            conn.execute(
                text(
                    """
                    CREATE TABLE purchasing_auto_drafts (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        generated_at DATETIME NOT NULL,
                        purchase_order_ids_json TEXT NOT NULL,
                        summary_json TEXT
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purch_auto_draft_tenant ON purchasing_auto_drafts(tenant_id)"))
        conn.commit()


def ensure_purchase_auto_reorder_tables(engine: Engine) -> None:
    """Reguły i historia silnika auto-reorder (szkice PO — bez automatycznej wysyłki)."""
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        rt = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchase_auto_rules' LIMIT 1")
        ).fetchone()
        if not rt:
            conn.execute(
                text(
                    """
                    CREATE TABLE purchase_auto_rules (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        name VARCHAR(256) NOT NULL,
                        is_enabled INTEGER NOT NULL DEFAULT 1,
                        run_time VARCHAR(8) NOT NULL DEFAULT '07:00',
                        weekdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
                        config_json TEXT NOT NULL DEFAULT '{}',
                        created_at DATETIME NOT NULL
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_auto_rules_tenant ON purchase_auto_rules(tenant_id)"))
        rn = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchase_auto_runs' LIMIT 1")
        ).fetchone()
        if not rn:
            conn.execute(
                text(
                    """
                    CREATE TABLE purchase_auto_runs (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        started_at DATETIME NOT NULL,
                        finished_at DATETIME,
                        status VARCHAR(32) NOT NULL DEFAULT 'running',
                        created_orders_count INTEGER NOT NULL DEFAULT 0,
                        skipped_products_count INTEGER NOT NULL DEFAULT 0,
                        log_json TEXT
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_auto_runs_tenant ON purchase_auto_runs(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_auto_runs_status ON purchase_auto_runs(status)"))
        conn.commit()


def ensure_stock_documents_tables(engine: Engine) -> None:
    """PZ (and future) stock documents + lines; links deliveries to inventory receipts."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_documents' LIMIT 1")
        ).fetchone()
        if not r:
            conn.execute(
                text(
                    """
                    CREATE TABLE stock_documents (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        document_type VARCHAR(32) NOT NULL DEFAULT 'PZ',
                        rmz_id INTEGER REFERENCES wms_order_returns(id) ON DELETE SET NULL,
                        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE RESTRICT,
                        delivery_id INTEGER REFERENCES deliveries(id) ON DELETE RESTRICT,
                        warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
                        location_id INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
                        status VARCHAR(32) NOT NULL DEFAULT 'draft',
                        receiving_status VARCHAR(32) NOT NULL DEFAULT 'NEW',
                        putaway_status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_tenant_id ON stock_documents(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_delivery_id ON stock_documents(delivery_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_supplier_id ON stock_documents(supplier_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_document_type ON stock_documents(document_type)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_rmz_id ON stock_documents(rmz_id)"))
        it = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
        ).fetchone()
        if not it:
            conn.execute(
                text(
                    """
                    CREATE TABLE stock_document_items (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        document_id INTEGER NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
                        delivery_item_id INTEGER REFERENCES delivery_items(id) ON DELETE SET NULL,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
                        ordered_quantity REAL NOT NULL DEFAULT 0,
                        received_quantity REAL NOT NULL DEFAULT 0,
                        quantity REAL NOT NULL,
                        purchase_price_net REAL,
                        vat_rate REAL NOT NULL DEFAULT 23
                    )
                    """
                )
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_document_id ON stock_document_items(document_id)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_product_id ON stock_document_items(product_id)")
            )
        conn.commit()


def ensure_wms_ad_hoc_receiving_schema(engine: Engine) -> None:
    """WMS „Nowa dostawa”: suppliers.is_incomplete + stock_documents.creation_source."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='suppliers' LIMIT 1")
        ).fetchone()
        if r:
            scols = {row[1] for row in conn.execute(text("PRAGMA table_info(suppliers)")).fetchall()}
            if "is_incomplete" not in scols:
                conn.execute(
                    text("ALTER TABLE suppliers ADD COLUMN is_incomplete BOOLEAN NOT NULL DEFAULT false")
                )
        r2 = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_documents' LIMIT 1")
        ).fetchone()
        if r2:
            dcols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_documents)")).fetchall()}
            if "creation_source" not in dcols:
                conn.execute(
                    text(
                        "ALTER TABLE stock_documents ADD COLUMN creation_source VARCHAR(16) "
                        "NOT NULL DEFAULT 'PANEL'"
                    )
                )
                conn.execute(
                    text(
                        "UPDATE stock_documents SET creation_source = 'PANEL' "
                        "WHERE creation_source IS NULL OR TRIM(creation_source) = ''"
                    )
                )
        conn.commit()


def ensure_stock_documents_created_by_columns(engine: Engine) -> None:
    """PZ / stock document creator (WMS + panel)."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_documents' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_documents)")).fetchall()}
        if "created_by_user_id" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE stock_documents ADD COLUMN created_by_user_id INTEGER "
                    "REFERENCES app_users(id) ON DELETE SET NULL"
                )
            )
        if "created_by_user_name" not in cols:
            conn.execute(text("ALTER TABLE stock_documents ADD COLUMN created_by_user_name VARCHAR(256)"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_stock_documents_created_by_user_id "
                "ON stock_documents(created_by_user_id)"
            )
        )
        conn.commit()


def ensure_stock_documents_receiving_status_column(engine: Engine) -> None:
    """WMS przyjęcie / rozlokowanie workflow columns + legacy enum migration."""
    # Must run before ORM touches StockDocument (migrate_wms_pz_workflow_statuses): adds rmz_id + nullable supplier/delivery.
    ensure_stock_documents_return_receipt_schema(engine)
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_documents' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_documents)")).fetchall()}
        if "receiving_status" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE stock_documents ADD COLUMN receiving_status VARCHAR(32) NOT NULL DEFAULT 'NEW'"
                )
            )
        conn.commit()
    migrate_wms_pz_workflow_statuses(engine)


def ensure_stock_documents_updated_at_column(engine: Engine) -> None:
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_documents' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_documents)")).fetchall()}
        if "updated_at" not in cols:
            conn.execute(text("ALTER TABLE stock_documents ADD COLUMN updated_at DATETIME"))
            conn.execute(text("UPDATE stock_documents SET updated_at = created_at WHERE updated_at IS NULL"))
        conn.commit()


def ensure_stock_documents_financial_columns(engine: Engine) -> None:
    """currency, total_net, total_gross for warehouse documents list / PDF."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_documents' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_documents)")).fetchall()}
        if "currency" not in cols:
            conn.execute(text("ALTER TABLE stock_documents ADD COLUMN currency VARCHAR(8) NOT NULL DEFAULT 'PLN'"))
        if "total_net" not in cols:
            conn.execute(text("ALTER TABLE stock_documents ADD COLUMN total_net REAL"))
        if "total_gross" not in cols:
            conn.execute(text("ALTER TABLE stock_documents ADD COLUMN total_gross REAL"))
        conn.commit()


def ensure_stock_documents_relocation_status_column(engine: Engine) -> None:
    """WMS: OPEN | DONE — zamknięcie procesu rozlokowania (bez zmiany stanów)."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_documents' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_documents)")).fetchall()}
        if "relocation_status" not in cols:
            conn.execute(
                text("ALTER TABLE stock_documents ADD COLUMN relocation_status VARCHAR(32) NOT NULL DEFAULT 'OPEN'")
            )
            conn.execute(
                text(
                    "UPDATE stock_documents SET relocation_status = 'DONE' "
                    "WHERE document_type = 'PZ' AND status = 'draft' AND putaway_status = 'DONE'"
                )
            )
        conn.commit()


def ensure_stock_documents_mm_location_columns(engine: Engine) -> None:
    """MM transfer: optional from/to location ids on stock_documents header."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_documents' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_documents)")).fetchall()}
        if "mm_from_location_id" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE stock_documents ADD COLUMN mm_from_location_id INTEGER "
                    "REFERENCES locations(id) ON DELETE SET NULL"
                )
            )
        if "mm_to_location_id" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE stock_documents ADD COLUMN mm_to_location_id INTEGER "
                    "REFERENCES locations(id) ON DELETE SET NULL"
                )
            )
        conn.commit()


def ensure_stock_operations_unit_price_net_column(engine: Engine) -> None:
    """unit_price_net on stock_operations for RECEIPT weighted average pricing."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_operations' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_operations)")).fetchall()}
        if "unit_price_net" not in cols:
            conn.execute(text("ALTER TABLE stock_operations ADD COLUMN unit_price_net REAL"))
        conn.commit()


def migrate_stock_documents_nullable_warehouse_location(engine: Engine) -> None:
    """PZ header may exist without warehouse/location until WMS receiving (SQLite cannot DROP NOT NULL in place)."""
    ensure_stock_documents_updated_at_column(engine)
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_documents' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        info = list(conn.execute(text("PRAGMA table_info(stock_documents)")))
        wh = next((row for row in info if row[1] == "warehouse_id"), None)
        loc = next((row for row in info if row[1] == "location_id"), None)
        if not wh or not loc:
            conn.commit()
            return
        # PRAGMA notnull: 0 = nullable, 1 = NOT NULL
        if int(wh[3]) == 0 and int(loc[3]) == 0:
            conn.commit()
            return

        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("CREATE TABLE stock_document_items__mig_tmp AS SELECT * FROM stock_document_items;"))
        conn.execute(text("CREATE TABLE stock_documents__mig_tmp AS SELECT * FROM stock_documents;"))
        conn.execute(text("DROP TABLE stock_document_items;"))
        conn.execute(text("DROP TABLE stock_documents;"))
        conn.execute(
            text(
                """
                CREATE TABLE stock_documents (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    document_type VARCHAR(8) NOT NULL DEFAULT 'PZ',
                    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
                    delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
                    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
                    location_id INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
                    status VARCHAR(32) NOT NULL DEFAULT 'draft',
                    receiving_status VARCHAR(32) NOT NULL DEFAULT 'pending',
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO stock_documents
                (id, tenant_id, document_type, supplier_id, delivery_id, warehouse_id, location_id,
                 status, receiving_status, created_at, updated_at)
                SELECT id, tenant_id, document_type, supplier_id, delivery_id, warehouse_id, location_id,
                       status, receiving_status, created_at, updated_at
                FROM stock_documents__mig_tmp
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE stock_document_items (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    document_id INTEGER NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
                    delivery_item_id INTEGER REFERENCES delivery_items(id) ON DELETE SET NULL,
                    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
                    ordered_quantity REAL NOT NULL DEFAULT 0,
                    received_quantity REAL NOT NULL DEFAULT 0,
                    quantity REAL NOT NULL,
                    purchase_price_net REAL,
                    vat_rate REAL NOT NULL DEFAULT 23
                )
                """
            )
        )
        conn.execute(text("INSERT INTO stock_document_items SELECT * FROM stock_document_items__mig_tmp;"))
        conn.execute(text("DROP TABLE stock_documents__mig_tmp;"))
        conn.execute(text("DROP TABLE stock_document_items__mig_tmp;"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_tenant_id ON stock_documents(tenant_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_delivery_id ON stock_documents(delivery_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_supplier_id ON stock_documents(supplier_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_document_type ON stock_documents(document_type)"))
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_document_id ON stock_document_items(document_id)")
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_product_id ON stock_document_items(product_id)")
        )
        conn.execute(text("DELETE FROM sqlite_sequence WHERE name IN ('stock_documents', 'stock_document_items')"))
        conn.execute(
            text(
                "INSERT INTO sqlite_sequence (name, seq) SELECT 'stock_documents', IFNULL(MAX(id), 0) FROM stock_documents"
            )
        )
        conn.execute(
            text(
                "INSERT INTO sqlite_sequence (name, seq) SELECT 'stock_document_items', IFNULL(MAX(id), 0) FROM stock_document_items"
            )
        )
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()


def ensure_product_barcodes_table(engine: Engine) -> None:
    """Multipack / alternate EANs linked to products (WMS receiving scan)."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='product_barcodes' LIMIT 1")
        ).fetchone()
        if not exists:
            conn.execute(
                text(
                    """
                    CREATE TABLE product_barcodes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        product_id INTEGER NOT NULL,
                        ean VARCHAR(64) NOT NULL,
                        multiplier INTEGER NOT NULL DEFAULT 1,
                        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_product_barcodes_product_id ON product_barcodes(product_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_product_barcodes_ean ON product_barcodes(ean)"))
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_product_barcodes_product_ean "
                    "ON product_barcodes(product_id, ean)"
                )
            )
        conn.commit()


def migrate_wms_pz_workflow_statuses(engine: Engine) -> None:
    """Legacy pending|in_progress|received → NEW|IN_PROGRESS|DONE; add putaway_status; recompute putaway (draft PZ)."""
    from sqlalchemy.orm import sessionmaker

    from ..models.stock_document import StockDocument, StockDocumentItem
    from ..services.stock_document_service import recompute_putaway_status_for_document

    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_documents' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_documents)")).fetchall()}
        if "putaway_status" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE stock_documents ADD COLUMN putaway_status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED'"
                )
            )
        conn.execute(
            text(
                "UPDATE stock_documents SET receiving_status = 'NEW' "
                "WHERE receiving_status IS NULL OR TRIM(receiving_status) = '' "
                "OR LOWER(receiving_status) IN ('pending','new')"
            )
        )
        conn.execute(
            text(
                "UPDATE stock_documents SET receiving_status = 'IN_PROGRESS' "
                "WHERE LOWER(receiving_status) = 'in_progress'"
            )
        )
        conn.execute(
            text(
                "UPDATE stock_documents SET receiving_status = 'DONE' "
                "WHERE LOWER(receiving_status) IN ('received','done','completed')"
            )
        )
        conn.commit()

    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        for doc in (
            db.query(StockDocument)
            .filter(StockDocument.document_type == "PZ", StockDocument.status == "draft")
            .all()
        ):
            items = (
                db.query(StockDocumentItem)
                .filter(StockDocumentItem.document_id == doc.id)
                .order_by(StockDocumentItem.id)
                .all()
            )
            recompute_putaway_status_for_document(doc, items)
        db.commit()
    finally:
        db.close()


def ensure_stock_document_item_ordered_received_columns(engine: Engine) -> None:
    """Add ordered_quantity / received_quantity; backfill from legacy quantity."""
    with engine.connect() as conn:
        it = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
        ).fetchone()
        if not it:
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
        if "ordered_quantity" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN ordered_quantity REAL NOT NULL DEFAULT 0"))
        if "received_quantity" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN received_quantity REAL NOT NULL DEFAULT 0"))
        conn.execute(
            text(
                """
                UPDATE stock_document_items
                SET ordered_quantity = quantity, received_quantity = quantity
                WHERE ordered_quantity = 0 AND received_quantity = 0
                  AND quantity IS NOT NULL AND quantity > 0
                """
            )
        )
        conn.commit()


def ensure_product_track_batch_expiry_columns(engine: Engine) -> None:
    with engine.connect() as conn:
        r = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='products' LIMIT 1")).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(products)")).fetchall()}
        if "track_batch" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN track_batch BOOLEAN NOT NULL DEFAULT false"))
        if "track_expiry" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN track_expiry BOOLEAN NOT NULL DEFAULT false"))
        if "track_serial" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN track_serial BOOLEAN NOT NULL DEFAULT false"))
        conn.commit()


def ensure_inventory_serials_table(engine: Engine) -> None:
    """Per-unit serial registry + extended scan/operation columns."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='inventory_serials' LIMIT 1")
        ).fetchone()
        if not r:
            conn.execute(
                text(
                    """
                    CREATE TABLE inventory_serials (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        serial_number VARCHAR(128) NOT NULL,
                        batch_number VARCHAR(128) NOT NULL DEFAULT '',
                        expiry_date DATE NOT NULL DEFAULT '9999-12-31',
                        status VARCHAR(32) NOT NULL DEFAULT 'ON_HAND',
                        stock_disposition VARCHAR(32) NOT NULL DEFAULT 'SALEABLE',
                        warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
                        location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        carrier_id INTEGER REFERENCES warehouse_carriers(id) ON DELETE SET NULL,
                        source_document_id INTEGER REFERENCES stock_documents(id) ON DELETE SET NULL,
                        document_line_id INTEGER REFERENCES stock_document_items(id) ON DELETE SET NULL,
                        stock_operation_id INTEGER REFERENCES stock_operations(id) ON DELETE SET NULL,
                        created_at DATETIME NOT NULL DEFAULT (datetime('now')),
                        updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
                        CONSTRAINT uq_inventory_serial_tenant_product_sn UNIQUE (tenant_id, product_id, serial_number)
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_serials_tenant_id ON inventory_serials(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_serials_product_id ON inventory_serials(product_id)"))
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_inventory_serials_serial_number ON inventory_serials(serial_number)")
            )
        rlog = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='receiving_scan_logs' LIMIT 1")
        ).fetchone()
        if rlog:
            lcols = {row[1] for row in conn.execute(text("PRAGMA table_info(receiving_scan_logs)")).fetchall()}
            if "serial_number" not in lcols:
                conn.execute(text("ALTER TABLE receiving_scan_logs ADD COLUMN serial_number VARCHAR(128)"))
            if "batch_number" not in lcols:
                conn.execute(text("ALTER TABLE receiving_scan_logs ADD COLUMN batch_number VARCHAR(128)"))
            if "expiry_date" not in lcols:
                conn.execute(text("ALTER TABLE receiving_scan_logs ADD COLUMN expiry_date DATE"))
            if "raw_scan" not in lcols:
                conn.execute(text("ALTER TABLE receiving_scan_logs ADD COLUMN raw_scan VARCHAR(512)"))
            if "scan_kind" not in lcols:
                conn.execute(text("ALTER TABLE receiving_scan_logs ADD COLUMN scan_kind VARCHAR(32)"))
        rop = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_operations' LIMIT 1")
        ).fetchone()
        if rop:
            ocols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_operations)")).fetchall()}
            if "serial_number" not in ocols:
                conn.execute(text("ALTER TABLE stock_operations ADD COLUMN serial_number VARCHAR(128)"))
        conn.commit()


def ensure_stock_document_item_lot_columns(engine: Engine) -> None:
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
        if "batch_number" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN batch_number VARCHAR(128) NOT NULL DEFAULT ''"))
        if "expiry_date" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN expiry_date DATE NOT NULL DEFAULT '9999-12-31'"))
        conn.commit()


def ensure_stock_document_item_quantity_putaway_column(engine: Engine) -> None:
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
        if "quantity_putaway" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN quantity_putaway REAL NOT NULL DEFAULT 0"))
        conn.commit()


def ensure_stock_document_item_putaway_meta_columns(engine: Engine) -> None:
    """putaway_updated_at, putaway_last_location_name for WMS ordering / UX."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
        if "putaway_updated_at" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN putaway_updated_at DATETIME"))
        if "putaway_last_location_name" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN putaway_last_location_name VARCHAR(256)"))
        if "putaway_last_location_type" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN putaway_last_location_type VARCHAR(20)"))
        if "putaway_last_admin_id" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN putaway_last_admin_id INTEGER"))
        if "putaway_last_quantity" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN putaway_last_quantity REAL"))
        conn.commit()


def ensure_stock_document_item_mm_line_from_location_column(engine: Engine) -> None:
    """MM draft lines: source bin before rozlokowanie (putaway assigns destination)."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
        if "mm_line_from_location_id" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN mm_line_from_location_id INTEGER"))
        conn.commit()


def ensure_stock_document_item_wms_line_source_column(engine: Engine) -> None:
    """WMS PZ: linie dodane spoza dokumentu (WMS_SCAN / WMS_MANUAL)."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
        if "wms_line_source" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN wms_line_source VARCHAR(32)"))
        conn.commit()


def ensure_stock_item_locations_table(engine: Engine) -> None:
    """WMS putaway: per PZ line, per bin quantity (UNIQUE item + location); accumulates on repeat save."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_item_locations' LIMIT 1")
        ).fetchone()
        if r:
            conn.commit()
            return
        conn.execute(
            text(
                """
                CREATE TABLE stock_item_locations (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
                    updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
                    stock_document_item_id INTEGER NOT NULL,
                    location_id INTEGER NOT NULL,
                    quantity REAL NOT NULL DEFAULT 0,
                    FOREIGN KEY (stock_document_item_id) REFERENCES stock_document_items (id) ON DELETE CASCADE,
                    FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE CASCADE,
                    CONSTRAINT uq_stock_item_locations_item_location UNIQUE (stock_document_item_id, location_id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX ix_stock_item_locations_item ON stock_item_locations (stock_document_item_id)"))
        conn.execute(text("CREATE INDEX ix_stock_item_locations_loc ON stock_item_locations (location_id)"))
        conn.commit()


def migrate_inventory_lot_unique_sqlite(engine: Engine) -> None:
    """Replace flat inventory unique key with lot-aware unique (SQLite)."""
    with engine.connect() as conn:
        r = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='inventory' LIMIT 1")).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(inventory)")).fetchall()}
        if "batch_number" in cols and "expiry_date" in cols:
            conn.commit()
            return
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(
            text(
                """
                CREATE TABLE inventory__lot_mig (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    location_id INTEGER NOT NULL,
                    location_uuid VARCHAR(64),
                    quantity REAL NOT NULL,
                    batch_number VARCHAR(128) NOT NULL DEFAULT '',
                    expiry_date DATE NOT NULL DEFAULT '9999-12-31',
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
                    FOREIGN KEY(product_id) REFERENCES products (id) ON DELETE CASCADE,
                    FOREIGN KEY(warehouse_id) REFERENCES warehouses (id) ON DELETE CASCADE,
                    FOREIGN KEY(location_id) REFERENCES locations (id) ON DELETE CASCADE,
                    CONSTRAINT uq_inventory_tenant_product_location_lot
                      UNIQUE (tenant_id, product_id, location_id, batch_number, expiry_date)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO inventory__lot_mig (
                  id, created_at, updated_at, tenant_id, product_id, warehouse_id, location_id, location_uuid, quantity,
                  batch_number, expiry_date
                )
                SELECT id, created_at, updated_at, tenant_id, product_id, warehouse_id, location_id, location_uuid, quantity,
                       '', '9999-12-31'
                FROM inventory
                """
            )
        )
        conn.execute(text("DROP TABLE inventory"))
        conn.execute(text("ALTER TABLE inventory__lot_mig RENAME TO inventory"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_tenant_id ON inventory(tenant_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_product_id ON inventory(product_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_warehouse_id ON inventory(warehouse_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_location_id ON inventory(location_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_location_uuid ON inventory(location_uuid)"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()


def ensure_stock_document_items_stock_disposition_column(engine: Engine) -> None:
    """Warehouse quality bucket on document lines (default SALEABLE; copy legacy ``return_disposition`` when set)."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            t = conn.execute(
                text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
            ).fetchone()
            if not t:
                conn.commit()
                return
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
            if "stock_disposition" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE stock_document_items ADD COLUMN stock_disposition VARCHAR(32) "
                        "NOT NULL DEFAULT 'SALEABLE'"
                    )
                )
                conn.execute(
                    text(
                        "UPDATE stock_document_items SET stock_disposition = TRIM(return_disposition) "
                        "WHERE return_disposition IS NOT NULL AND TRIM(return_disposition) != ''"
                    )
                )
            try:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_stock_document_items_stock_disposition "
                        "ON stock_document_items(stock_disposition)"
                    )
                )
            except Exception:
                pass
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE stock_document_items ADD COLUMN IF NOT EXISTS stock_disposition "
                    "VARCHAR(32) NOT NULL DEFAULT 'SALEABLE'"
                )
            )
            conn.execute(
                text(
                    "UPDATE stock_document_items SET stock_disposition = TRIM(BOTH FROM return_disposition) "
                    "WHERE return_disposition IS NOT NULL AND TRIM(BOTH FROM return_disposition) != ''"
                )
            )
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_stock_document_items_stock_disposition "
                        "ON stock_document_items(stock_disposition)"
                    )
                )
        except Exception:
            pass
        return


def ensure_stock_operations_stock_disposition_column(engine: Engine) -> None:
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            t = conn.execute(
                text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_operations' LIMIT 1")
            ).fetchone()
            if not t:
                conn.commit()
                return
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_operations)")).fetchall()}
            if "stock_disposition" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE stock_operations ADD COLUMN stock_disposition VARCHAR(32) "
                        "NOT NULL DEFAULT 'SALEABLE'"
                    )
                )
            try:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_stock_operations_stock_disposition "
                        "ON stock_operations(stock_disposition)"
                    )
                )
            except Exception:
                pass
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE stock_operations ADD COLUMN IF NOT EXISTS stock_disposition "
                    "VARCHAR(32) NOT NULL DEFAULT 'SALEABLE'"
                )
            )
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_stock_operations_stock_disposition "
                        "ON stock_operations(stock_disposition)"
                    )
                )
        except Exception:
            pass
        return


def migrate_inventory_stock_disposition_sqlite(engine: Engine) -> None:
    """Extend inventory unique key with ``stock_disposition`` so outlet/service buckets split per bin."""
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        r = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='inventory' LIMIT 1")).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(inventory)")).fetchall()}
        if "stock_disposition" in cols:
            conn.commit()
            return
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("DROP TABLE IF EXISTS inventory__disp_mig"))
        conn.execute(
            text(
                """
                CREATE TABLE inventory__disp_mig (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    location_id INTEGER NOT NULL,
                    location_uuid VARCHAR(64),
                    quantity REAL NOT NULL,
                    batch_number VARCHAR(128) NOT NULL DEFAULT '',
                    expiry_date DATE NOT NULL DEFAULT '9999-12-31',
                    stock_disposition VARCHAR(32) NOT NULL DEFAULT 'SALEABLE',
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
                    FOREIGN KEY(product_id) REFERENCES products (id) ON DELETE CASCADE,
                    FOREIGN KEY(warehouse_id) REFERENCES warehouses (id) ON DELETE CASCADE,
                    FOREIGN KEY(location_id) REFERENCES locations (id) ON DELETE CASCADE,
                    CONSTRAINT uq_inventory_tenant_product_location_lot_disp
                      UNIQUE (tenant_id, product_id, location_id, batch_number, expiry_date, stock_disposition)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO inventory__disp_mig (
                  id, created_at, updated_at, tenant_id, product_id, warehouse_id, location_id, location_uuid, quantity,
                  batch_number, expiry_date, stock_disposition
                )
                SELECT id, created_at, updated_at, tenant_id, product_id, warehouse_id, location_id, location_uuid, quantity,
                       batch_number, expiry_date, 'SALEABLE'
                FROM inventory
                """
            )
        )
        conn.execute(text("DROP TABLE inventory"))
        conn.execute(text("ALTER TABLE inventory__disp_mig RENAME TO inventory"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_tenant_id ON inventory(tenant_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_product_id ON inventory(product_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_warehouse_id ON inventory(warehouse_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_location_id ON inventory(location_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_location_uuid ON inventory(location_uuid)"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_inventory_stock_disposition ON inventory(stock_disposition)"
            )
        )
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()


def migrate_inventory_stock_disposition_postgresql(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE inventory ADD COLUMN IF NOT EXISTS stock_disposition VARCHAR(32) "
                "NOT NULL DEFAULT 'SALEABLE'"
            )
        )
        conn.execute(text("UPDATE inventory SET stock_disposition = 'SALEABLE' WHERE stock_disposition IS NULL"))
    # Replace unique constraint name from lot-only migration when present.
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE inventory DROP CONSTRAINT IF EXISTS uq_inventory_tenant_product_location_lot"))
    except Exception:
        pass
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE inventory ADD CONSTRAINT uq_inventory_tenant_product_location_lot_disp "
                    "UNIQUE (tenant_id, product_id, location_id, batch_number, expiry_date, stock_disposition)"
                )
            )
    except Exception:
        pass
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_inventory_stock_disposition ON inventory(stock_disposition)"
                )
            )
    except Exception:
        pass


def ensure_inventory_stock_disposition_columns(engine: Engine) -> None:
    migrate_inventory_stock_disposition_sqlite(engine)
    migrate_inventory_stock_disposition_postgresql(engine)


def ensure_stock_reservation_lot_columns(engine: Engine) -> None:
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_reservations' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_reservations)")).fetchall()}
        if "batch_number" not in cols:
            conn.execute(text("ALTER TABLE stock_reservations ADD COLUMN batch_number VARCHAR(128) NOT NULL DEFAULT ''"))
        if "expiry_date" not in cols:
            conn.execute(text("ALTER TABLE stock_reservations ADD COLUMN expiry_date DATE NOT NULL DEFAULT '9999-12-31'"))
        conn.commit()


def ensure_pick_task_lot_columns(engine: Engine) -> None:
    with engine.connect() as conn:
        r = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pick_tasks' LIMIT 1")).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(pick_tasks)")).fetchall()}
        if "batch_number" not in cols:
            conn.execute(text("ALTER TABLE pick_tasks ADD COLUMN batch_number VARCHAR(128) NOT NULL DEFAULT ''"))
        if "expiry_date" not in cols:
            conn.execute(text("ALTER TABLE pick_tasks ADD COLUMN expiry_date DATE NOT NULL DEFAULT '9999-12-31'"))
        conn.commit()


def ensure_pick_lot_columns(engine: Engine) -> None:
    with engine.connect() as conn:
        r = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='picks' LIMIT 1")).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(picks)")).fetchall()}
        if "batch_number" not in cols:
            conn.execute(text("ALTER TABLE picks ADD COLUMN batch_number VARCHAR(128) NOT NULL DEFAULT ''"))
        if "expiry_date" not in cols:
            conn.execute(text("ALTER TABLE picks ADD COLUMN expiry_date DATE NOT NULL DEFAULT '9999-12-31'"))
        conn.commit()


def ensure_picks_cart_id_column(engine: Engine) -> None:
    """Nullable ``cart_id`` → ``carts.id`` (WMS zbieranie, statystyki wózków)."""
    with engine.connect() as conn:
        r = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='picks' LIMIT 1")).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(picks)")).fetchall()}
        if "cart_id" not in cols:
            conn.execute(
                text("ALTER TABLE picks ADD COLUMN cart_id INTEGER REFERENCES carts(id) ON DELETE SET NULL")
            )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_picks_cart_id ON picks(cart_id)"))
        conn.commit()


def ensure_picking_config_workflow_columns(engine: Engine) -> None:
    """``pick_unit`` (orders|products) i ``order_sort`` (date|location|courier) — rozróżnienie trybu zbierania."""
    with engine.connect() as conn:
        r = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='picking_config' LIMIT 1")).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(picking_config)")).fetchall()}
        if "pick_unit" not in cols:
            conn.execute(text("ALTER TABLE picking_config ADD COLUMN pick_unit VARCHAR(32) NOT NULL DEFAULT 'products'"))
        if "order_sort" not in cols:
            conn.execute(text("ALTER TABLE picking_config ADD COLUMN order_sort VARCHAR(32) NOT NULL DEFAULT 'date'"))
        conn.commit()
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                UPDATE picking_config SET pick_unit = CASE
                    WHEN lower(trim(strategy)) = 'orders' THEN 'orders'
                    ELSE 'products'
                END
                """
            )
        )
        conn.execute(text("UPDATE picking_config SET order_sort = 'date' WHERE order_sort IS NULL OR trim(order_sort) = ''"))
        conn.execute(
            text(
                """
                UPDATE picking_config SET strategy = CASE
                    WHEN pick_unit = 'products' THEN 'locations'
                    WHEN pick_unit = 'orders' AND lower(trim(order_sort)) = 'location' THEN 'locations'
                    ELSE 'orders'
                END
                """
            )
        )
        conn.commit()


def ensure_picking_shortage_support(engine: Engine) -> None:
    """Kolumna ``status_on_shortage_id`` w ``picking_config`` + tabela audytu braków WMS."""
    with engine.connect() as conn:
        r = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='picking_config' LIMIT 1")).fetchone()
        if r:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(picking_config)")).fetchall()}
            if "status_on_shortage_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE picking_config ADD COLUMN status_on_shortage_id INTEGER "
                        "REFERENCES order_ui_statuses(id) ON DELETE SET NULL"
                    )
                )
        conn.commit()
    with engine.connect() as conn:
        ex = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wms_picking_shortage_reports' LIMIT 1")
        ).fetchone()
        if not ex:
            conn.execute(
                text(
                    """
                    CREATE TABLE wms_picking_shortage_reports (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        source_status_id INTEGER NOT NULL,
                        order_type VARCHAR(16) NOT NULL,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        missing_qty FLOAT NOT NULL,
                        order_ids_json TEXT NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT (datetime('now'))
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_wms_shortage_wh ON wms_picking_shortage_reports(warehouse_id)"))
            conn.execute(text("CREATE INDEX ix_wms_shortage_product ON wms_picking_shortage_reports(product_id)"))
        conn.commit()


def ensure_carts_code_column(engine: Engine) -> None:
    """
    Dodaje ``carts.code`` / ``carts.scan_code`` (raw SQL + backfill), usuwa globalny UNIQUE na ``barcode``,
    potem backfill ``code``/``barcode`` przez ORM oraz indeks (tenant, magazyn, code).

    ``scan_code`` musi istnieć przed pierwszym ``db.query(Cart)``, bo model ORM zawiera tę kolumnę
    (SELECT zawierałby ``carts.scan_code`` i wywaliłby starą bazę bez kolumny).
    """
    with engine.connect() as conn:
        if not conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='carts' LIMIT 1")).fetchone():
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(carts)")).fetchall()}
        if "code" not in cols:
            conn.execute(text("ALTER TABLE carts ADD COLUMN code VARCHAR(64)"))
        # Usuń wyłącznie jednokolumnowy indeks UNIQUE na barcode (blokuje ten sam kod w dwóch magazynach).
        for row in conn.execute(text("PRAGMA index_list('carts')")).fetchall():
            idx_name = row[1]
            is_unique = int(row[2] or 0)
            if not is_unique:
                continue
            info = conn.execute(text(f'PRAGMA index_info("{idx_name}")')).fetchall()
            col_names = []
            for inf in info:
                cid = inf[1]
                if cid is None or int(cid) < 0:
                    continue
                col_names.append(inf[2])
            if col_names == ["barcode"]:
                conn.execute(text(f'DROP INDEX IF EXISTS "{idx_name}"'))
        # Cart ORM declares ``scan_code``; SQLite must have the column before any SELECT.
        # (``ensure_esp_scan_code_columns`` runs later and would add it, but this function uses ORM first.)
        cart_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(carts)")).fetchall()}
        if "scan_code" not in cart_cols:
            conn.execute(text("ALTER TABLE carts ADD COLUMN scan_code TEXT"))
        # Canonical prefixes match ``backend.services.esp_scan_codes`` (ESP:shpcart: / ESP:brck:).
        conn.execute(
            text(
                """
                UPDATE carts
                SET scan_code = CASE
                    WHEN LOWER(CAST(type AS TEXT)) IN ('multi', 'basket_cart') THEN 'ESP:brck:' || CAST(id AS TEXT)
                    WHEN CAST(type AS TEXT) IN ('MULTI', 'CartType.MULTI') THEN 'ESP:brck:' || CAST(id AS TEXT)
                    WHEN LOWER(CAST(type AS TEXT)) IN ('bulk', 'standard') THEN 'ESP:shpcart:' || CAST(id AS TEXT)
                    WHEN CAST(type AS TEXT) IN ('BULK', 'CartType.BULK') THEN 'ESP:shpcart:' || CAST(id AS TEXT)
                    ELSE 'ESP:shpcart:' || CAST(id AS TEXT)
                END
                WHERE scan_code IS NULL OR TRIM(COALESCE(scan_code, '')) = ''
                """
            )
        )
        conn.commit()

    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        from ..models.cart import Cart
        from ..services.cart_service import _assign_basket_barcodes, _generate_cart_barcode, _norm_cart_code

        for cart in db.query(Cart).all():
            if not _norm_cart_code(getattr(cart, "code", None)):
                bc = _norm_cart_code(getattr(cart, "barcode", None))
                cart.code = bc if bc else _generate_cart_barcode(db, cart.tenant_id, cart.warehouse_id)
            if not _norm_cart_code(getattr(cart, "barcode", None)):
                cart.barcode = cart.code

        bucket: dict[tuple, list] = defaultdict(list)
        for cart in db.query(Cart).all():
            ck = _norm_cart_code(getattr(cart, "code", None))
            if ck:
                bucket[(cart.tenant_id, cart.warehouse_id, ck)].append(cart)
        for _key, lst in bucket.items():
            if len(lst) <= 1:
                continue
            for extra in lst[1:]:
                extra.code = _generate_cart_barcode(db, extra.tenant_id, extra.warehouse_id)
                extra.barcode = extra.code
                _assign_basket_barcodes(extra)

        db.commit()

        for cart in db.query(Cart).all():
            if not _norm_cart_code(getattr(cart, "barcode", None)):
                cart.barcode = cart.code
            _assign_basket_barcodes(cart)
        db.commit()
    finally:
        db.close()

    with engine.connect() as conn:
        conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_tenant_wh_code ON carts(tenant_id, warehouse_id, code)")
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_carts_code ON carts(code)"))
        conn.commit()


def ensure_esp_scan_code_columns(engine: Engine) -> None:
    """
    Internal WMS scan tokens: ESP:shpcart: / ESP:brck: / ESP:bsh: / ESP:sh: / ESP:O: + PK.
    Adds ``scan_code``, backfills from ids, creates unique indexes (SQLite).
    """
    scan_tables = ("carts", "cart_baskets", "warehouse_bins", "orders")
    with engine.connect() as conn:
        for tbl in scan_tables:
            if not conn.execute(
                text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t LIMIT 1"),
                {"t": tbl},
            ).fetchone():
                continue
            cols = {row[1] for row in conn.execute(text(f"PRAGMA table_info({tbl})")).fetchall()}
            if "scan_code" not in cols:
                conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN scan_code VARCHAR(80)"))
        conn.commit()

    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        from ..models.cart import Cart
        from ..models.cart_basket import CartBasket
        from ..models.order import Order
        from ..models.warehouse import Bin
        from ..services.esp_scan_codes import (
            assign_bin_scan_code,
            assign_basket_scan_code,
            assign_cart_scan_code,
            assign_order_scan_code,
        )

        for cart in db.query(Cart).all():
            if not (getattr(cart, "scan_code", None) or "").strip():
                assign_cart_scan_code(cart)
        for basket in db.query(CartBasket).all():
            if not (getattr(basket, "scan_code", None) or "").strip():
                assign_basket_scan_code(basket)
        for order in db.query(Order).all():
            if not (getattr(order, "scan_code", None) or "").strip():
                assign_order_scan_code(order)
        for bin_row in db.query(Bin).all():
            if not (getattr(bin_row, "scan_code", None) or "").strip():
                assign_bin_scan_code(bin_row)
        db.commit()
    finally:
        db.close()

    with engine.connect() as conn:
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_carts_scan_code ON carts(scan_code)"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_baskets_scan_code ON cart_baskets(scan_code)"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_bins_scan_code ON warehouse_bins(scan_code)"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_scan_code ON orders(scan_code)"))
        conn.commit()


def ensure_shipping_methods_table_and_order_fk(engine: Engine) -> None:
    """
    ``shipping_methods`` (UUID id) + ``orders.shipping_method_id`` FK.
    Adds ``code`` + ``aliases_json``, unique (tenant, warehouse, code), default OTHER row per warehouse.
    Backfill FK from legacy ``orders.shipping_method`` free-text (per tenant + warehouse).
    """
    from datetime import datetime

    from ..models.order import Order
    from ..models.shipping_method import ShippingMethod
    from ..models.warehouse import Warehouse
    from ..services.shipping_method_service import (
        _allocate_unique_code,
        cleanup_junk_shipping_methods,
        ensure_canonical_carriers_for_warehouse,
        get_or_create_other_method,
        purge_non_canonical_shipping_methods,
        resolve_shipping_method_for_import_label,
        slug_code_from_name,
    )

    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shipping_methods' LIMIT 1")
        ).fetchone()
        if not r:
            conn.execute(
                text(
                    """
                    CREATE TABLE shipping_methods (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
                        code VARCHAR(64) NOT NULL DEFAULT 'MIGR',
                        name VARCHAR(256) NOT NULL,
                        aliases_json TEXT,
                        logo_url VARCHAR(512),
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at DATETIME,
                        updated_at DATETIME,
                        CONSTRAINT uq_shipping_method_tenant_wh_name UNIQUE (tenant_id, warehouse_id, name)
                    )
                    """
                )
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_shipping_methods_tenant_wh ON shipping_methods(tenant_id, warehouse_id)")
            )
        else:
            smcols = {row[1] for row in conn.execute(text("PRAGMA table_info(shipping_methods)")).fetchall()}
            if "code" not in smcols:
                conn.execute(
                    text(
                        "ALTER TABLE shipping_methods ADD COLUMN code VARCHAR(64) NOT NULL DEFAULT 'MIGR'"
                    )
                )
            if "aliases_json" not in smcols:
                conn.execute(text("ALTER TABLE shipping_methods ADD COLUMN aliases_json TEXT"))
        ocols = {row[1] for row in conn.execute(text("PRAGMA table_info(orders)")).fetchall()}
        if "shipping_method_id" not in ocols:
            conn.execute(
                text(
                    "ALTER TABLE orders ADD COLUMN shipping_method_id VARCHAR(36) "
                    "REFERENCES shipping_methods(id) ON DELETE SET NULL"
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_shipping_method_id ON orders(shipping_method_id)"))
        conn.commit()

    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        rows = (
            db.query(Order.tenant_id, Order.warehouse_id, Order.shipping_method)
            .filter(Order.shipping_method.isnot(None))
            .filter(Order.shipping_method != "")
            .distinct()
            .all()
        )
        for tid, wid, sm_raw in rows:
            if tid is None or wid is None or not str(sm_raw or "").strip():
                continue
            sid, canon_name = resolve_shipping_method_for_import_label(
                db,
                tenant_id=int(tid),
                warehouse_id=int(wid),
                label=str(sm_raw).strip(),
            )
            db.query(Order).filter(
                Order.tenant_id == int(tid),
                Order.warehouse_id == int(wid),
                Order.shipping_method == sm_raw,
                Order.shipping_method_id.is_(None),
            ).update(
                {Order.shipping_method_id: sid, Order.shipping_method: canon_name},
                synchronize_session=False,
            )
        db.commit()

        # Unique ``code`` per tenant + warehouse (placeholder ``MIGR`` from ALTER → real slugs).
        for m in db.query(ShippingMethod).order_by(ShippingMethod.id).all():
            raw = (getattr(m, "code", None) or "").strip().upper()
            if raw and raw != "MIGR":
                continue
            base = slug_code_from_name(m.name or "METHOD") or "METHOD"
            m.code = _allocate_unique_code(
                db,
                tenant_id=int(m.tenant_id),
                warehouse_id=int(m.warehouse_id),
                base=base,
                exclude_id=str(m.id),
            )
            m.updated_at = datetime.utcnow()
        db.commit()

        pairs: set[tuple[int, int]] = set()
        for tid, wid in db.query(ShippingMethod.tenant_id, ShippingMethod.warehouse_id).distinct().all():
            if tid is not None and wid is not None:
                pairs.add((int(tid), int(wid)))
        for w in db.query(Warehouse).all():
            wtid = getattr(w, "tenant_id", None)
            if wtid is not None and getattr(w, "id", None) is not None:
                pairs.add((int(wtid), int(w.id)))
        for tid, wid in sorted(pairs):
            get_or_create_other_method(db, tenant_id=tid, warehouse_id=wid)
            ensure_canonical_carriers_for_warehouse(db, tenant_id=tid, warehouse_id=wid)
        db.commit()
        cleanup_junk_shipping_methods(db)
        db.commit()
        purge_non_canonical_shipping_methods(db)
        db.commit()
    finally:
        db.close()

    with engine.connect() as conn:
        idx = conn.execute(
            text(
                "SELECT 1 FROM sqlite_master WHERE type='index' "
                "AND name='uq_shipping_method_tenant_wh_code' LIMIT 1"
            )
        ).fetchone()
        if not idx:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX uq_shipping_method_tenant_wh_code "
                    "ON shipping_methods(tenant_id, warehouse_id, code)"
                )
            )
        conn.commit()


def ensure_warehouse_materials_tables(engine: Engine) -> None:
    """Cartons (M2M shipping methods) + packaging consumables per tenant + warehouse."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cartons' LIMIT 1")
        ).fetchone()
        if not r:
            conn.execute(
                text(
                    """
                    CREATE TABLE cartons (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
                        name VARCHAR(256) NOT NULL,
                        image_url VARCHAR(512),
                        sku VARCHAR(128),
                        ean VARCHAR(64),
                        length_cm REAL NOT NULL,
                        width_cm REAL NOT NULL,
                        height_cm REAL NOT NULL,
                        weight_kg REAL NOT NULL DEFAULT 0,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        notes TEXT,
                        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
                        supplier_sku VARCHAR(128),
                        stock REAL NOT NULL DEFAULT 0,
                        reserved_qty REAL NOT NULL DEFAULT 0,
                        location_label VARCHAR(512),
                        purchase_price REAL,
                        unit_cost REAL,
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                    """
                )
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_cartons_tenant_wh ON cartons(tenant_id, warehouse_id)")
            )
        r2 = conn.execute(
            text(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='carton_shipping_method_links' LIMIT 1"
            )
        ).fetchone()
        if not r2:
            conn.execute(
                text(
                    """
                    CREATE TABLE carton_shipping_method_links (
                        carton_id VARCHAR(36) NOT NULL REFERENCES cartons(id) ON DELETE CASCADE,
                        shipping_method_id VARCHAR(36) NOT NULL REFERENCES shipping_methods(id) ON DELETE CASCADE,
                        PRIMARY KEY (carton_id, shipping_method_id)
                    )
                    """
                )
            )
        r3 = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='packaging_materials' LIMIT 1")
        ).fetchone()
        if not r3:
            conn.execute(
                text(
                    """
                    CREATE TABLE packaging_materials (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
                        name VARCHAR(256) NOT NULL,
                        material_type VARCHAR(32) NOT NULL,
                        unit VARCHAR(32) NOT NULL,
                        stock REAL NOT NULL DEFAULT 0,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_packaging_materials_tenant_wh "
                    "ON packaging_materials(tenant_id, warehouse_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_packaging_materials_type "
                    "ON packaging_materials(tenant_id, warehouse_id, material_type)"
                )
            )
        cart_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(cartons)")).fetchall()}
        if cart_cols:
            if "supplier_id" not in cart_cols:
                conn.execute(
                    text(
                        "ALTER TABLE cartons ADD COLUMN supplier_id INTEGER "
                        "REFERENCES suppliers(id) ON DELETE SET NULL"
                    )
                )
            if "supplier_sku" not in cart_cols:
                conn.execute(text("ALTER TABLE cartons ADD COLUMN supplier_sku VARCHAR(128)"))
            if "stock" not in cart_cols:
                conn.execute(text("ALTER TABLE cartons ADD COLUMN stock REAL NOT NULL DEFAULT 0"))
            if "location_label" not in cart_cols:
                conn.execute(text("ALTER TABLE cartons ADD COLUMN location_label VARCHAR(512)"))
            if "purchase_price" not in cart_cols:
                conn.execute(text("ALTER TABLE cartons ADD COLUMN purchase_price REAL"))
            if "unit_cost" not in cart_cols:
                conn.execute(text("ALTER TABLE cartons ADD COLUMN unit_cost REAL"))
            if "image_url" not in cart_cols:
                conn.execute(text("ALTER TABLE cartons ADD COLUMN image_url VARCHAR(512)"))
            if "sku" not in cart_cols:
                conn.execute(text("ALTER TABLE cartons ADD COLUMN sku VARCHAR(128)"))
            if "ean" not in cart_cols:
                conn.execute(text("ALTER TABLE cartons ADD COLUMN ean VARCHAR(64)"))
            if "reserved_qty" not in cart_cols:
                conn.execute(text("ALTER TABLE cartons ADD COLUMN reserved_qty REAL NOT NULL DEFAULT 0"))
        conn.commit()


def ensure_warehouse_materials_bdo_columns(engine: Engine) -> None:
    """BDO columns on packaging_materials and cartons (single catalog, no duplicate BDO materials table)."""
    float_bdo = [
        ("plastic_kg_per_unit", "REAL NOT NULL DEFAULT 0"),
        ("paper_kg_per_unit", "REAL NOT NULL DEFAULT 0"),
        ("wood_kg_per_unit", "REAL NOT NULL DEFAULT 0"),
        ("glass_kg_per_unit", "REAL NOT NULL DEFAULT 0"),
        ("metal_kg_per_unit", "REAL NOT NULL DEFAULT 0"),
    ]
    with engine.connect() as conn:
        pm = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='packaging_materials' LIMIT 1")
        ).fetchone()
        if pm:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(packaging_materials)")).fetchall()}
            for col, typ in float_bdo:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE packaging_materials ADD COLUMN {col} {typ}"))
            if "packaging_type" not in cols:
                conn.execute(text("ALTER TABLE packaging_materials ADD COLUMN packaging_type VARCHAR(64)"))
            if "include_in_bdo" not in cols:
                conn.execute(
                    text("ALTER TABLE packaging_materials ADD COLUMN include_in_bdo INTEGER NOT NULL DEFAULT 0")
                )
        ct = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cartons' LIMIT 1")
        ).fetchone()
        if ct:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(cartons)")).fetchall()}
            for col, typ in float_bdo:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE cartons ADD COLUMN {col} {typ}"))
            if "packaging_type" not in cols:
                conn.execute(text("ALTER TABLE cartons ADD COLUMN packaging_type VARCHAR(64)"))
            if "include_in_bdo" not in cols:
                conn.execute(text("ALTER TABLE cartons ADD COLUMN include_in_bdo INTEGER NOT NULL DEFAULT 0"))
        conn.commit()


def ensure_warehouse_materials_master_data(engine: Engine) -> None:
    """Master data: pricing columns, tiers table, packaging attributes, thresholds."""
    with engine.connect() as conn:
        t_tiers = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wm_price_tiers' LIMIT 1")
        ).fetchone()
        if not t_tiers:
            conn.execute(
                text(
                    """
                    CREATE TABLE wm_price_tiers (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
                        carton_id VARCHAR(36) REFERENCES cartons(id) ON DELETE CASCADE,
                        packaging_material_id VARCHAR(36) REFERENCES packaging_materials(id) ON DELETE CASCADE,
                        sort_index INTEGER NOT NULL DEFAULT 0,
                        qty_from REAL NOT NULL DEFAULT 1,
                        package_qty REAL,
                        package_net_total REAL,
                        package_gross_total REAL,
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wm_price_tiers_carton ON wm_price_tiers(carton_id)"))
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_wm_price_tiers_packaging "
                    "ON wm_price_tiers(packaging_material_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_wm_price_tiers_tenant_wh "
                    "ON wm_price_tiers(tenant_id, warehouse_id)"
                )
            )

        ct = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cartons' LIMIT 1")
        ).fetchone()
        if ct:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(cartons)")).fetchall()}
            for col, typ in [
                ("material_type", "VARCHAR(128)"),
                ("vat_rate_pct", "REAL NOT NULL DEFAULT 23"),
                ("package_qty", "REAL"),
                ("package_net_total", "REAL"),
                ("package_gross_total", "REAL"),
                ("low_stock_threshold", "REAL"),
                ("reorder_qty", "REAL"),
            ]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE cartons ADD COLUMN {col} {typ}"))

        pm = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='packaging_materials' LIMIT 1")
        ).fetchone()
        if pm:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(packaging_materials)")).fetchall()}
            for col, typ in [
                ("image_url", "VARCHAR(512)"),
                ("sku", "VARCHAR(128)"),
                ("supplier_id", "INTEGER REFERENCES suppliers(id) ON DELETE SET NULL"),
                ("supplier_sku", "VARCHAR(128)"),
                ("reserved_qty", "REAL NOT NULL DEFAULT 0"),
                ("location_label", "VARCHAR(512)"),
                ("purchase_price", "REAL"),
                ("unit_cost", "REAL"),
                ("vat_rate_pct", "REAL NOT NULL DEFAULT 23"),
                ("package_qty", "REAL"),
                ("package_net_total", "REAL"),
                ("package_gross_total", "REAL"),
                ("low_stock_threshold", "REAL"),
                ("reorder_qty", "REAL"),
                ("notes", "TEXT"),
                ("width_mm", "REAL"),
                ("length_m", "REAL"),
                ("thickness_micron", "REAL"),
                ("color", "VARCHAR(64)"),
                ("net_weight_foil_kg", "REAL"),
                ("tube_weight_kg", "REAL"),
                ("stretch_percent", "REAL"),
                ("tube_diameter_mm", "REAL"),
                ("adhesive_type", "VARCHAR(64)"),
                ("tape_weight_kg", "REAL"),
                ("core_paper_weight_kg", "REAL"),
                ("roll_diameter_mm", "REAL"),
                ("grammage_gsm", "REAL"),
                ("paper_type", "VARCHAR(128)"),
                ("roll_weight_kg", "REAL"),
                ("bubble_width_cm", "REAL"),
                ("bubble_diameter_mm", "REAL"),
                ("tolerance_percent", "REAL"),
                ("bubble_weight_kg", "REAL"),
            ]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE packaging_materials ADD COLUMN {col} {typ}"))
        conn.commit()


def ensure_bdo_packaging_wm_ref_migration(engine: Engine) -> None:
    """Replace legacy bdo_packaging_materials + integer material_id with wm_kind + wm_id."""
    from ..models.bdo_packaging import BdoCorrection, BdoPackagingPurchase, BdoStockCountLine, BdoStockCountSession

    with engine.connect() as conn:
        t = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='bdo_packaging_purchases' LIMIT 1")
        ).fetchone()
        if not t:
            return
        names = {row[1] for row in conn.execute(text("PRAGMA table_info(bdo_packaging_purchases)")).fetchall()}
        if "wm_kind" in names:
            return
        for tbl in (
            "bdo_corrections",
            "bdo_stock_count_lines",
            "bdo_stock_count_sessions",
            "bdo_packaging_purchases",
            "bdo_packaging_materials",
        ):
            conn.execute(text(f"DROP TABLE IF EXISTS {tbl}"))
        conn.commit()
    BdoPackagingPurchase.__table__.create(bind=engine, checkfirst=True)
    BdoStockCountSession.__table__.create(bind=engine, checkfirst=True)
    BdoStockCountLine.__table__.create(bind=engine, checkfirst=True)
    BdoCorrection.__table__.create(bind=engine, checkfirst=True)


def ensure_document_series_extended_columns(engine: Engine) -> None:
    """Print template id, VAT line calc modes, structured company address on document_series."""
    with engine.connect() as conn:
        t = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='document_series' LIMIT 1")
        ).fetchone()
        if not t:
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(document_series)")).fetchall()}
        for col, typ in [
            ("print_template_id", "INTEGER"),
            ("vat_calc_shipping", "VARCHAR(32) NOT NULL DEFAULT 'DEFAULT'"),
            ("vat_calc_payment", "VARCHAR(32) NOT NULL DEFAULT 'DEFAULT'"),
            ("company_street", "VARCHAR(256)"),
            ("company_house_number", "VARCHAR(32)"),
            ("company_apartment_number", "VARCHAR(32)"),
            ("company_regon", "VARCHAR(32)"),
            ("vat_rate_percent", "INTEGER"),
        ]:
            if col not in cols:
                conn.execute(text(f"ALTER TABLE document_series ADD COLUMN {col} {typ}"))
        conn.commit()


def ensure_sale_documents_table(engine: Engine) -> None:
    """WMS packing: wystawione dokumenty sprzedaży (powiązanie order + seria + numer)."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sale_documents' LIMIT 1")
        ).fetchone()
        if exists:
            conn.commit()
            return
        conn.execute(
            text(
                """
                CREATE TABLE sale_documents (
                    id VARCHAR(36) PRIMARY KEY,
                    tenant_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    order_id INTEGER NOT NULL,
                    document_series_id VARCHAR(36) NOT NULL,
                    document_number VARCHAR(128) NOT NULL,
                    panel_document_type VARCHAR(16) NOT NULL,
                    series_type VARCHAR(24) NOT NULL DEFAULT 'SALE',
                    created_at DATETIME,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
                    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                    FOREIGN KEY (document_series_id) REFERENCES document_series(id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX ix_sale_documents_order_id ON sale_documents(order_id)"))
        conn.execute(text("CREATE INDEX ix_sale_documents_series_id ON sale_documents(document_series_id)"))
        conn.execute(
            text("CREATE INDEX ix_sale_documents_tenant_wh ON sale_documents(tenant_id, warehouse_id)")
        )
        conn.commit()


def ensure_orders_customer_id_column(engine: Engine) -> None:
    """Panel: optional link zamówienia do klienta (``customers``)."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(orders)"))
        cols = {row[1] for row in r}
        if "customer_id" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE orders ADD COLUMN customer_id INTEGER "
                    "REFERENCES customers(id) ON DELETE SET NULL"
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_customer_id ON orders(customer_id)"))
        conn.commit()


def ensure_order_issue_tasks_table(engine: Engine) -> None:
    """WMS: zadania operacyjne przy brakach (Order Issues)."""
    with engine.connect() as conn:
        ex = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='order_issue_tasks' LIMIT 1")
        ).fetchone()
        if ex:
            return
        conn.execute(
            text(
                """
                CREATE TABLE order_issue_tasks (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                    type VARCHAR(32) NOT NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
                    missing_items TEXT NOT NULL DEFAULT '[]',
                    picked_items TEXT NOT NULL DEFAULT '[]',
                    baseline_order_lines_json TEXT NOT NULL DEFAULT '{}',
                    logs_json TEXT NOT NULL DEFAULT '[]',
                    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
                    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX ix_order_issue_tasks_wh ON order_issue_tasks(warehouse_id)"))
        conn.execute(text("CREATE INDEX ix_order_issue_tasks_order ON order_issue_tasks(order_id)"))
        conn.execute(text("CREATE INDEX ix_order_issue_tasks_status ON order_issue_tasks(status)"))
        conn.commit()


def ensure_wms_operational_tasks_table(engine: Engine) -> None:
    """WMS operational tasks — product-centric work queue (source of truth)."""
    with engine.connect() as conn:
        ex = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wms_operational_tasks' LIMIT 1")
        ).fetchone()
        if not ex:
            conn.execute(
                text(
                    """
                    CREATE TABLE wms_operational_tasks (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        task_type VARCHAR(32) NOT NULL,
                        status VARCHAR(16) NOT NULL DEFAULT 'open',
                        queue VARCHAR(32) NOT NULL,
                        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
                        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                        order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
                        quantity_required REAL NOT NULL DEFAULT 0,
                        quantity_done REAL NOT NULL DEFAULT 0,
                        location_hint VARCHAR(128),
                        substitute_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
                        group_key VARCHAR(191) NOT NULL,
                        source_event_id VARCHAR(191),
                        priority INTEGER NOT NULL DEFAULT 0,
                        payload_json TEXT NOT NULL DEFAULT '{}',
                        created_at DATETIME NOT NULL DEFAULT (datetime('now')),
                        updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
                        completed_at DATETIME
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_wms_op_tasks_wh_queue ON wms_operational_tasks(warehouse_id, queue, status)"
                )
            )
            conn.execute(text("CREATE INDEX ix_wms_op_tasks_group_key ON wms_operational_tasks(group_key)"))
            conn.execute(text("CREATE INDEX ix_wms_op_tasks_product ON wms_operational_tasks(product_id)"))
            conn.execute(text("CREATE INDEX ix_wms_op_tasks_order ON wms_operational_tasks(order_id)"))
            conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_wms_op_waiting_open
                    ON wms_operational_tasks(warehouse_id, product_id)
                    WHERE task_type = 'WAITING_SUPPLY' AND status IN ('open', 'in_progress')
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_wms_op_relocation_open
                    ON wms_operational_tasks(group_key)
                    WHERE task_type = 'RELOCATION' AND status IN ('open', 'in_progress')
                    """
                )
            )
        conn.commit()


def ensure_orders_fulfillment_state_columns(engine: Engine) -> None:
    """WMS: ``fulfillment_state`` + ``picking_session_id`` na zamówieniach."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(orders)"))
        cols = {row[1] for row in r}
        if "fulfillment_state" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN fulfillment_state VARCHAR(32)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_fulfillment_state ON orders(fulfillment_state)"))
        if "picking_session_id" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN picking_session_id INTEGER"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_picking_session_id ON orders(picking_session_id)"))
        conn.commit()


def ensure_orders_priority_color_column(engine: Engine) -> None:
    """Panel OMS: wizualna flaga priorytetu zamówienia (flame)."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(orders)"))
        cols = {row[1] for row in r}
        if "priority_color" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN priority_color VARCHAR(32)"))
        conn.commit()


def ensure_orders_discount_columns(engine: Engine) -> None:
    """Panel OMS: persisted order-level discount used in totals and margin."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(orders)"))
        cols = {row[1] for row in r}
        if "discount_type" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN discount_type VARCHAR(16)"))
        if "discount_value" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN discount_value REAL"))
        conn.commit()


def ensure_orders_wms_timeline_columns(engine: Engine) -> None:
    """WMS: znaczniki czasu zbierania / pakowania dla osi czasu OMS."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(orders)"))
        cols = {row[1] for row in r}
        if "picking_started_at" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN picking_started_at DATETIME"))
        if "picked_at" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN picked_at DATETIME"))
        if "packing_started_at" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN packing_started_at DATETIME"))
        if "packed_at" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN packed_at DATETIME"))
        if "picking_finished_at" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN picking_finished_at DATETIME"))
            conn.execute(
                text(
                    "UPDATE orders SET picking_finished_at = picked_at "
                    "WHERE picking_finished_at IS NULL AND picked_at IS NOT NULL"
                )
            )
        conn.commit()


def ensure_orders_wms_packing_automation_finished_at_column(engine: Engine) -> None:
    """WMS: koniec potoku pakowania (automatyka), nie równy ``packed_at``."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(orders)"))
        cols = {row[1] for row in r}
        if "wms_packing_automation_finished_at" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN wms_packing_automation_finished_at DATETIME"))
        conn.commit()


def ensure_wms_packing_sessions_automation_finished_at_column(engine: Engine) -> None:
    """Sesja pakowania: znacznik zakończenia automatyki."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wms_packing_sessions' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(wms_packing_sessions)")).fetchall()}
        if "automation_finished_at" not in cols:
            conn.execute(text("ALTER TABLE wms_packing_sessions ADD COLUMN automation_finished_at DATETIME"))
        conn.commit()


def ensure_order_items_wms_picking_line_missing_qty(engine: Engine) -> None:
    """WMS: brak na linii (widok braków)."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(order_items)"))
        cols = {row[1] for row in r}
        if "wms_picking_line_missing_qty" not in cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN wms_picking_line_missing_qty REAL DEFAULT 0"))
        conn.commit()


def ensure_order_items_wms_picking_line_status(engine: Engine) -> None:
    """WMS: status linii zbierania (np. missing)."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(order_items)"))
        cols = {row[1] for row in r}
        if "wms_picking_line_status" not in cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN wms_picking_line_status VARCHAR(32)"))
        conn.commit()


def ensure_order_items_fulfillment_sync_columns(engine: Engine) -> None:
    """OMS/WMS: zgłoszony brak vs wyliczony, ślad zamiany, korekty braku."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(order_items)"))
        cols = {row[1] for row in r}
        if "wms_shortage_declared_qty" not in cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN wms_shortage_declared_qty REAL DEFAULT 0"))
        if "oms_removed_qty" not in cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN oms_removed_qty REAL DEFAULT 0"))
        if "oms_replaced_qty" not in cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN oms_replaced_qty REAL DEFAULT 0"))
        if "replaced_from_order_item_id" not in cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN replaced_from_order_item_id INTEGER"))
        if "replaced_from_product_name" not in cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN replaced_from_product_name VARCHAR(255)"))
        try:
            conn.execute(
                text(
                    "UPDATE order_items SET wms_shortage_declared_qty = COALESCE(wms_picking_line_missing_qty, 0) "
                    "WHERE ABS(COALESCE(wms_shortage_declared_qty, 0)) < 1e-12 "
                    "AND COALESCE(wms_picking_line_missing_qty, 0) > 1e-12"
                )
            )
        except Exception:
            pass
        conn.commit()


def ensure_order_items_bundle_hierarchy_columns(engine: Engine) -> None:
    """Zestawy OMS: nagłówek komercyjny + komponenty (FK do rodzica)."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(order_items)"))
        cols = {row[1] for row in r}
        if "is_bundle_parent" not in cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN is_bundle_parent INTEGER NOT NULL DEFAULT 0"))
        if "parent_bundle_order_item_id" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE order_items ADD COLUMN parent_bundle_order_item_id INTEGER "
                    "REFERENCES order_items(id) ON DELETE CASCADE"
                )
            )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_order_items_parent_bundle_order_item_id "
                "ON order_items(parent_bundle_order_item_id)"
            )
        )
        conn.commit()


def ensure_order_items_oms_line_status(engine: Engine) -> None:
    """OMS: status linii po zamianie produktu (REPLACED / TO_PICK)."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(order_items)"))
        cols = {row[1] for row in r}
        if "oms_line_status" not in cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN oms_line_status VARCHAR(32)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_order_items_oms_line_status ON order_items(oms_line_status)"))
        conn.commit()


def ensure_fulfillment_events_table(engine: Engine) -> None:
    """Ledger: PICK / MISSING / REPLACED / REMOVED / WAITING quantities per order line."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='fulfillment_events'")
        )
        if r.fetchone() is None:
            conn.execute(
                text(
                    """
                    CREATE TABLE fulfillment_events (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        order_item_id INTEGER NOT NULL,
                        type VARCHAR(32) NOT NULL,
                        quantity REAL NOT NULL,
                        metadata_json TEXT,
                        FOREIGN KEY(order_item_id) REFERENCES order_items (id) ON DELETE CASCADE
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_fulfillment_events_order_item_id ON fulfillment_events(order_item_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_fulfillment_events_type ON fulfillment_events(type)"))
        conn.commit()


def ensure_export_templates_table(engine: Engine) -> None:
    """Tabela szablonów eksportu CSV (Settings → Eksporty)."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='export_templates'")
        )
        if r.fetchone() is None:
            conn.execute(
                text(
                    """
                    CREATE TABLE export_templates (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL,
                        name VARCHAR(256) NOT NULL,
                        type VARCHAR(32) NOT NULL,
                        fields_json TEXT NOT NULL,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at DATETIME NOT NULL,
                        FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_export_templates_tenant_id ON export_templates(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_export_templates_type ON export_templates(type)"))
        conn.commit()


def ensure_warehouse_materials_purchasing_columns(engine: Engine) -> None:
    """Purchasing metadata on cartons + packaging_materials (supplier UX, MOQ, lead time, etc.)."""
    wm_cols = [
        ("producer_id", "INTEGER REFERENCES manufacturers(id) ON DELETE SET NULL"),
        ("supplier_name_override", "VARCHAR(256)"),
        ("lead_time_days", "INTEGER"),
        ("moq", "REAL"),
        ("purchase_pack_qty", "REAL"),
        ("free_shipping_threshold_net", "REAL"),
        ("last_purchase_price_net", "REAL"),
    ]
    with engine.connect() as conn:
        for tbl in ("cartons", "packaging_materials"):
            t = conn.execute(
                text(f"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{tbl}' LIMIT 1")
            ).fetchone()
            if not t:
                continue
            cols = {row[1] for row in conn.execute(text(f"PRAGMA table_info({tbl})")).fetchall()}
            for col, typ in wm_cols:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN {col} {typ}"))
        conn.commit()


def ensure_delivery_items_warehouse_material_lines(engine: Engine) -> None:
    """
    Allow purchase-order lines for warehouse materials (carton / packaging) without a Product row.

    Rebuilds ``delivery_items``: ``product_id`` becomes nullable; adds ``wm_kind``, ``wm_id``.
    Preserves primary keys for ``stock_document_items.delivery_item_id`` FK integrity.
    """
    with engine.begin() as conn:
        t = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='delivery_items' LIMIT 1")
        ).fetchone()
        if not t:
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(delivery_items)")).fetchall()}
        if "wm_kind" in cols:
            return
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(
            text(
                """
                CREATE TABLE delivery_items__wm (
                    id INTEGER NOT NULL PRIMARY KEY,
                    delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
                    product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
                    wm_kind VARCHAR(16),
                    wm_id VARCHAR(36),
                    quantity_ordered REAL NOT NULL,
                    quantity_received REAL NOT NULL DEFAULT 0,
                    purchase_price REAL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO delivery_items__wm (
                    id, delivery_id, product_id, wm_kind, wm_id, quantity_ordered, quantity_received, purchase_price
                )
                SELECT id, delivery_id, product_id, NULL, NULL, quantity_ordered, quantity_received, purchase_price
                FROM delivery_items
                """
            )
        )
        conn.execute(text("DROP TABLE delivery_items"))
        conn.execute(text("ALTER TABLE delivery_items__wm RENAME TO delivery_items"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_delivery_items_delivery_id ON delivery_items(delivery_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_delivery_items_product_id ON delivery_items(product_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_delivery_items_wm_kind ON delivery_items(wm_kind)"))
        conn.execute(text("PRAGMA foreign_keys=ON"))


def ensure_supplier_product_tiers_and_delivery_price_manual_columns(engine: Engine) -> None:
    """supplier_products.purchase_price_tiers_json; delivery_items.purchase_price_manual (SQLite)."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(supplier_products)"))
        cols = [row[1] for row in r]
        if "purchase_price_tiers_json" not in cols:
            conn.execute(text("ALTER TABLE supplier_products ADD COLUMN purchase_price_tiers_json TEXT"))
        r2 = conn.execute(text("PRAGMA table_info(delivery_items)"))
        cols2 = [row[1] for row in r2]
        if "purchase_price_manual" not in cols2:
            conn.execute(
                text("ALTER TABLE delivery_items ADD COLUMN purchase_price_manual INTEGER NOT NULL DEFAULT 0")
            )
        conn.commit()


def ensure_delivery_item_catalog_snapshot_columns(engine: Engine) -> None:
    """Snapshot + polymorphic hints on delivery_items for PDF / history (SQLite)."""
    with engine.connect() as conn:
        t = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='delivery_items' LIMIT 1")
        ).fetchone()
        if not t:
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(delivery_items)")).fetchall()}
        for col, typ in [
            ("line_item_type", "VARCHAR(32)"),
            ("line_item_ref_id", "VARCHAR(64)"),
            ("item_name", "VARCHAR(512)"),
            ("item_sku", "VARCHAR(256)"),
            ("item_ean", "VARCHAR(128)"),
            ("item_photo_url", "VARCHAR(512)"),
            ("item_unit", "VARCHAR(64)"),
            ("source_label", "VARCHAR(64)"),
        ]:
            if col not in cols:
                conn.execute(text(f"ALTER TABLE delivery_items ADD COLUMN {col} {typ}"))
        conn.commit()

    with engine.connect() as conn:
        # Backfill from catalog where snapshot still empty (idempotent for most rows).
        conn.execute(
            text(
                """
                UPDATE delivery_items
                SET
                    item_name = (
                        SELECT TRIM(p.name) FROM products p
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE p.id = delivery_items.product_id AND p.tenant_id = d.tenant_id
                    ),
                    item_sku = (
                        SELECT COALESCE(
                            NULLIF(TRIM(p.symbol), ''),
                            NULLIF(TRIM(p.sku), '')
                        ) FROM products p
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE p.id = delivery_items.product_id AND p.tenant_id = d.tenant_id
                    ),
                    item_ean = (
                        SELECT NULLIF(TRIM(p.ean), '') FROM products p
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE p.id = delivery_items.product_id AND p.tenant_id = d.tenant_id
                    ),
                    item_photo_url = (
                        SELECT NULLIF(TRIM(p.image_url), '') FROM products p
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE p.id = delivery_items.product_id AND p.tenant_id = d.tenant_id
                    ),
                    item_unit = (
                        SELECT NULLIF(TRIM(p.unit), '') FROM products p
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE p.id = delivery_items.product_id AND p.tenant_id = d.tenant_id
                    ),
                    line_item_type = 'product',
                    line_item_ref_id = printf('%d', delivery_items.product_id),
                    source_label = 'Produkt'
                WHERE delivery_items.product_id IS NOT NULL
                  AND (delivery_items.item_name IS NULL OR TRIM(COALESCE(delivery_items.item_name, '')) = '')
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE delivery_items
                SET
                    item_name = (
                        SELECT TRIM(c.name) FROM cartons c
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE c.id = delivery_items.wm_id AND c.tenant_id = d.tenant_id
                    ),
                    item_sku = (
                        SELECT COALESCE(
                            NULLIF(TRIM(c.sku), ''),
                            NULLIF(TRIM(c.supplier_sku), '')
                        ) FROM cartons c
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE c.id = delivery_items.wm_id AND c.tenant_id = d.tenant_id
                    ),
                    item_ean = (
                        SELECT NULLIF(TRIM(c.ean), '') FROM cartons c
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE c.id = delivery_items.wm_id AND c.tenant_id = d.tenant_id
                    ),
                    item_photo_url = (
                        SELECT NULLIF(TRIM(c.image_url), '') FROM cartons c
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE c.id = delivery_items.wm_id AND c.tenant_id = d.tenant_id
                    ),
                    item_unit = 'szt.',
                    line_item_type = 'carton',
                    line_item_ref_id = delivery_items.wm_id,
                    source_label = 'Karton'
                WHERE LOWER(TRIM(COALESCE(delivery_items.wm_kind, ''))) = 'carton'
                  AND delivery_items.wm_id IS NOT NULL AND TRIM(delivery_items.wm_id) != ''
                  AND (delivery_items.item_name IS NULL OR TRIM(COALESCE(delivery_items.item_name, '')) = '')
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE delivery_items
                SET
                    item_name = (
                        SELECT TRIM(m.name) FROM packaging_materials m
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE m.id = delivery_items.wm_id AND m.tenant_id = d.tenant_id
                    ),
                    item_sku = (
                        SELECT COALESCE(
                            NULLIF(TRIM(m.sku), ''),
                            NULLIF(TRIM(m.supplier_sku), '')
                        ) FROM packaging_materials m
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE m.id = delivery_items.wm_id AND m.tenant_id = d.tenant_id
                    ),
                    item_photo_url = (
                        SELECT NULLIF(TRIM(m.image_url), '') FROM packaging_materials m
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE m.id = delivery_items.wm_id AND m.tenant_id = d.tenant_id
                    ),
                    item_unit = (
                        SELECT NULLIF(TRIM(m.unit), '') FROM packaging_materials m
                        INNER JOIN deliveries d ON d.id = delivery_items.delivery_id
                        WHERE m.id = delivery_items.wm_id AND m.tenant_id = d.tenant_id
                    ),
                    line_item_type = 'packaging_material',
                    line_item_ref_id = delivery_items.wm_id,
                    source_label = 'Materiał pakowy'
                WHERE LOWER(TRIM(COALESCE(delivery_items.wm_kind, ''))) = 'packaging'
                  AND delivery_items.wm_id IS NOT NULL AND TRIM(delivery_items.wm_id) != ''
                  AND (delivery_items.item_name IS NULL OR TRIM(COALESCE(delivery_items.item_name, '')) = '')
                """
            )
        )
        conn.commit()


def ensure_stock_document_items_wm_receipt_columns(engine: Engine) -> None:
    """
    PZ lines may reference warehouse materials (carton / packaging) without a ``products`` row.

    SQLite: add ``wm_kind``, ``wm_id``; rebuild ``stock_document_items`` so ``product_id`` is nullable.
    """
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        orphan = conn.execute(
            text(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items__wmrecv' LIMIT 1"
            )
        ).fetchone()
        if orphan:
            conn.execute(text("DROP TABLE stock_document_items__wmrecv"))
        t = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
        ).fetchone()
        if not t:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
        if "wm_kind" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN wm_kind VARCHAR(16)"))
        if "wm_id" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN wm_id VARCHAR(36)"))
        conn.commit()

    with engine.connect() as conn:
        pragma_rows = list(conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall())
        prod_row = next((r for r in pragma_rows if r[1] == "product_id"), None)
        if prod_row is None:
            conn.commit()
            return
        if int(prod_row[3]) == 0:
            conn.commit()
            return
        conn.commit()

    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("DROP TABLE IF EXISTS stock_document_items__wmrecv"))
        conn.execute(
            text(
                """
                CREATE TABLE stock_document_items__wmrecv (
                    id INTEGER NOT NULL PRIMARY KEY,
                    document_id INTEGER NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
                    delivery_item_id INTEGER REFERENCES delivery_items(id) ON DELETE SET NULL,
                    product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
                    mm_line_from_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                    ordered_quantity REAL NOT NULL DEFAULT 0,
                    received_quantity REAL NOT NULL DEFAULT 0,
                    quantity_putaway REAL NOT NULL DEFAULT 0,
                    putaway_updated_at DATETIME,
                    putaway_last_location_name VARCHAR(256),
                    putaway_last_location_type VARCHAR(20),
                    quantity REAL NOT NULL,
                    purchase_price_net REAL,
                    vat_rate REAL NOT NULL DEFAULT 23,
                    batch_number VARCHAR(128) NOT NULL DEFAULT '',
                    expiry_date DATE NOT NULL DEFAULT '9999-12-31',
                    wm_kind VARCHAR(16),
                    wm_id VARCHAR(36)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO stock_document_items__wmrecv (
                    id, document_id, delivery_item_id, product_id, mm_line_from_location_id,
                    ordered_quantity, received_quantity, quantity_putaway,
                    putaway_updated_at, putaway_last_location_name, putaway_last_location_type,
                    quantity, purchase_price_net, vat_rate, batch_number, expiry_date,
                    wm_kind, wm_id
                )
                SELECT
                    id, document_id, delivery_item_id, product_id, mm_line_from_location_id,
                    ordered_quantity, received_quantity, quantity_putaway,
                    putaway_updated_at, putaway_last_location_name, putaway_last_location_type,
                    quantity, purchase_price_net, vat_rate, batch_number, expiry_date,
                    wm_kind, wm_id
                FROM stock_document_items
                """
            )
        )
        conn.execute(text("DROP TABLE stock_document_items"))
        conn.execute(text("ALTER TABLE stock_document_items__wmrecv RENAME TO stock_document_items"))
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_document_id ON stock_document_items(document_id)")
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_product_id ON stock_document_items(product_id)")
        )
        seq_tbl = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence' LIMIT 1")
        ).fetchone()
        if seq_tbl:
            conn.execute(text("DELETE FROM sqlite_sequence WHERE name = 'stock_document_items'"))
            conn.execute(
                text(
                    "INSERT INTO sqlite_sequence (name, seq) SELECT 'stock_document_items', IFNULL(MAX(id), 0) FROM stock_document_items"
                )
            )
        conn.execute(text("PRAGMA foreign_keys=ON"))


def ensure_wm_last_purchase_extension_columns(engine: Engine) -> None:
    """Gross + timestamp last purchase on WM catalog; last receipt time on products."""
    wm_cols = [
        ("last_purchase_price_gross", "REAL"),
        ("last_purchased_at", "DATETIME"),
    ]
    with engine.connect() as conn:
        for tbl in ("cartons", "packaging_materials"):
            t = conn.execute(
                text(f"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{tbl}' LIMIT 1")
            ).fetchone()
            if not t:
                continue
            cols = {row[1] for row in conn.execute(text(f"PRAGMA table_info({tbl})")).fetchall()}
            for col, typ in wm_cols:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN {col} {typ}"))
        pt = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='products' LIMIT 1")
        ).fetchone()
        if pt:
            pcols = {row[1] for row in conn.execute(text("PRAGMA table_info(products)")).fetchall()}
            if "last_purchased_at" not in pcols:
                conn.execute(text("ALTER TABLE products ADD COLUMN last_purchased_at DATETIME"))
        conn.commit()


def ensure_currency_exchange_rates_table(engine: Engine) -> None:
    """NBP + manual FX table for purchasing (rate_to_pln = PLN per 1 unit foreign)."""
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        t = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='currency_exchange_rates' LIMIT 1")
        ).fetchone()
        if not t:
            conn.execute(
                text(
                    """
                    CREATE TABLE currency_exchange_rates (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
                        currency VARCHAR(8) NOT NULL,
                        rate_date DATE NOT NULL,
                        rate_to_pln REAL NOT NULL,
                        source VARCHAR(16) NOT NULL,
                        created_at DATETIME NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_currency_exchange_rates_lookup "
                    "ON currency_exchange_rates(currency, rate_date)"
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_currency_exchange_rates_tenant ON currency_exchange_rates(tenant_id)"))
            try:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS uq_currency_exchange_rates_nbp_global "
                        "ON currency_exchange_rates(currency, rate_date) "
                        "WHERE source = 'nbp' AND tenant_id IS NULL"
                    )
                )
            except Exception:
                pass
        conn.commit()


def ensure_purchase_order_tax_invoice_columns(engine: Engine) -> None:
    """PO tax mode + optional invoice date for FX basis."""
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        po = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchase_orders' LIMIT 1")
        ).fetchone()
        if not po:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(purchase_orders)")).fetchall()}
        if "tax_mode" not in cols:
            conn.execute(
                text("ALTER TABLE purchase_orders ADD COLUMN tax_mode VARCHAR(48) NOT NULL DEFAULT 'domestic_vat'")
            )
        if "invoice_date" not in cols:
            conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN invoice_date DATE"))
        conn.commit()


def ensure_products_purchase_snapshot_columns(engine: Engine) -> None:
    """Purchasing snapshot columns updated from posted PZ lines."""
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        pt = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='products' LIMIT 1")
        ).fetchone()
        if not pt:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(products)")).fetchall()}
        if "previous_purchase_price" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN previous_purchase_price NUMERIC(10, 2)"))
        if "purchase_price_original" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN purchase_price_original NUMERIC(12, 4)"))
        if "purchase_currency" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN purchase_currency VARCHAR(8)"))
        if "last_purchase_date" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN last_purchase_date DATETIME"))
        if "last_supplier_id" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN last_supplier_id INTEGER"))
        if "last_purchase_currency" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN last_purchase_currency VARCHAR(8)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_products_last_supplier_id ON products(last_supplier_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_products_last_purchase_date ON products(last_purchase_date)"))
        conn.commit()


def ensure_products_extra_cost_columns(engine: Engine) -> None:
    """Per-product landed cost components used by central product_cost_service."""
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        pt = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='products' LIMIT 1")
        ).fetchone()
        if not pt:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(products)")).fetchall()}
        if "extra_cost_packaging_net" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN extra_cost_packaging_net NUMERIC(12, 2) NOT NULL DEFAULT 0"))
        if "extra_cost_commission_percent" not in cols:
            conn.execute(
                text("ALTER TABLE products ADD COLUMN extra_cost_commission_percent NUMERIC(8, 2) NOT NULL DEFAULT 0")
            )
        if "extra_cost_other_net" not in cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN extra_cost_other_net NUMERIC(12, 2) NOT NULL DEFAULT 0"))
        conn.commit()


def ensure_order_documents_and_activity_logs_tables(engine: Engine) -> None:
    """Tabele: dokumenty zamówienia (upload) oraz log aktywności panelu."""
    with engine.connect() as conn:
        ex_od = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='order_documents' LIMIT 1")
        ).fetchone()
        if not ex_od:
            conn.execute(
                text(
                    """
                    CREATE TABLE order_documents (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        order_id INTEGER NOT NULL,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        document_type VARCHAR(32) NOT NULL,
                        original_filename VARCHAR(512) NOT NULL,
                        stored_filename VARCHAR(512) NOT NULL,
                        file_url VARCHAR(512) NOT NULL,
                        created_at DATETIME,
                        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_order_documents_order_id ON order_documents(order_id)"))
            conn.execute(text("CREATE INDEX ix_order_documents_document_type ON order_documents(document_type)"))
        ex_al = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='order_activity_logs' LIMIT 1")
        ).fetchone()
        if not ex_al:
            conn.execute(
                text(
                    """
                    CREATE TABLE order_activity_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        order_id INTEGER NOT NULL,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        event_type VARCHAR(64) NOT NULL,
                        message TEXT NOT NULL,
                        created_at DATETIME,
                        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_order_activity_logs_order_id ON order_activity_logs(order_id)"))
            conn.execute(text("CREATE INDEX ix_order_activity_logs_event_type ON order_activity_logs(event_type)"))
        ex_ord = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='order_refund_drafts' LIMIT 1")
        ).fetchone()
        if not ex_ord:
            conn.execute(
                text(
                    """
                    CREATE TABLE order_refund_drafts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        order_id INTEGER NOT NULL,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
                        created_at DATETIME,
                        updated_at DATETIME,
                        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
                        UNIQUE (order_id)
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_order_refund_drafts_order_id ON order_refund_drafts(order_id)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE order_refund_draft_lines (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        draft_id INTEGER NOT NULL,
                        product_id INTEGER NOT NULL,
                        order_item_id INTEGER,
                        quantity REAL NOT NULL,
                        amount REAL,
                        reason VARCHAR(32) NOT NULL,
                        created_at DATETIME,
                        FOREIGN KEY (draft_id) REFERENCES order_refund_drafts(id) ON DELETE CASCADE,
                        FOREIGN KEY (product_id) REFERENCES products(id),
                        FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_order_refund_draft_lines_draft_id ON order_refund_draft_lines(draft_id)"))
            conn.execute(text("CREATE INDEX ix_order_refund_draft_lines_product_id ON order_refund_draft_lines(product_id)"))
        conn.commit()


def ensure_order_notes_table(engine: Engine) -> None:
    """Single source of truth for order notes (details + bulk)."""
    with engine.connect() as conn:
        ex = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='order_notes' LIMIT 1")
        ).fetchone()
        if not ex:
            conn.execute(
                text(
                    """
                    CREATE TABLE order_notes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        order_id INTEGER NOT NULL,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        type VARCHAR(32) NOT NULL DEFAULT 'internal',
                        content TEXT NOT NULL,
                        created_at DATETIME,
                        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_order_notes_order_id ON order_notes(order_id)"))
            conn.execute(text("CREATE INDEX ix_order_notes_type ON order_notes(type)"))
            conn.execute(text("CREATE INDEX ix_order_notes_created_at ON order_notes(created_at)"))
        conn.commit()


def ensure_order_operational_notes_table(engine: Engine) -> None:
    """Internal warehouse / WMS workflow notes (visibility per module)."""
    with engine.connect() as conn:
        ex = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='order_operational_notes' LIMIT 1")
        ).fetchone()
        if not ex:
            conn.execute(
                text(
                    """
                    CREATE TABLE order_operational_notes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        order_id INTEGER NOT NULL,
                        author_user_id INTEGER,
                        content TEXT NOT NULL,
                        show_in_picking INTEGER NOT NULL DEFAULT 0,
                        show_in_packing INTEGER NOT NULL DEFAULT 0,
                        show_in_returns INTEGER NOT NULL DEFAULT 0,
                        show_in_complaints INTEGER NOT NULL DEFAULT 0,
                        priority INTEGER,
                        color_tag VARCHAR(32),
                        created_at DATETIME,
                        updated_at DATETIME,
                        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                        FOREIGN KEY (author_user_id) REFERENCES app_users(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_order_operational_notes_order_id ON order_operational_notes(order_id)"))
            conn.execute(
                text("CREATE INDEX ix_order_operational_notes_updated_at ON order_operational_notes(updated_at)")
            )
        conn.commit()


def ensure_app_users_bootstrap_columns(engine: Engine) -> None:
    """Add is_system_seed and password_must_change for bootstrap / forced password change UX."""
    with engine.connect() as conn:
        ex = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_users' LIMIT 1")
        ).fetchone()
        if not ex:
            conn.commit()
            return
        r = conn.execute(text("PRAGMA table_info(app_users)"))
        cols = {row[1] for row in r}
        if "is_system_seed" not in cols:
            conn.execute(text("ALTER TABLE app_users ADD COLUMN is_system_seed INTEGER NOT NULL DEFAULT 0"))
        if "password_must_change" not in cols:
            conn.execute(text("ALTER TABLE app_users ADD COLUMN password_must_change INTEGER NOT NULL DEFAULT 0"))
        if "phone" not in cols:
            conn.execute(text("ALTER TABLE app_users ADD COLUMN phone VARCHAR(64)"))
        if "barcode_login_code" not in cols:
            conn.execute(text("ALTER TABLE app_users ADD COLUMN barcode_login_code VARCHAR(128)"))
        if "avatar_url" not in cols:
            conn.execute(text("ALTER TABLE app_users ADD COLUMN avatar_url VARCHAR(512)"))
        if "timezone" not in cols:
            conn.execute(text("ALTER TABLE app_users ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Warsaw'"))
        if "default_warehouse_id" not in cols:
            conn.execute(
                text("ALTER TABLE app_users ADD COLUMN default_warehouse_id INTEGER REFERENCES warehouses(id)")
            )
        if "wms_language" not in cols:
            conn.execute(text("ALTER TABLE app_users ADD COLUMN wms_language VARCHAR(16) NOT NULL DEFAULT 'pl'"))
        if "wms_currency" not in cols:
            conn.execute(text("ALTER TABLE app_users ADD COLUMN wms_currency VARCHAR(8) NOT NULL DEFAULT 'PLN'"))

        try:
            conn.execute(text("UPDATE app_users SET wms_language = 'pl' WHERE wms_language IS NULL"))
            conn.execute(text("UPDATE app_users SET wms_currency = 'PLN' WHERE wms_currency IS NULL"))
        except Exception:
            pass

        tw = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_user_warehouses' LIMIT 1")
        ).fetchone()
        if not tw:
            conn.execute(
                text(
                    """
                    CREATE TABLE app_user_warehouses (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        UNIQUE(user_id, warehouse_id)
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_app_user_warehouses_user_id ON app_user_warehouses(user_id)"))
            conn.execute(
                text("CREATE INDEX ix_app_user_warehouses_warehouse_id ON app_user_warehouses(warehouse_id)")
            )
        conn.commit()


def _sqlite_ensure_user_wms_profiles_operational_columns(conn) -> None:
    """
    SQLite: add NOT NULL operational columns with defaults when missing.

    Avoids bootstrap INSERT failures when a column was added to the ORM without ALTER + DEFAULT on live DBs.
    """
    t = conn.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_wms_profiles' LIMIT 1")
    ).fetchone()
    if not t:
        return
    cols = {row[1] for row in conn.execute(text("PRAGMA table_info(user_wms_profiles)")).fetchall()}
    # BOOLEAN stored as INTEGER in SQLite
    if "require_scan_every_product" not in cols:
        conn.execute(
            text(
                "ALTER TABLE user_wms_profiles ADD COLUMN require_scan_every_product INTEGER NOT NULL DEFAULT 0"
            )
        )
    if "can_edit_products_preview" not in cols:
        conn.execute(
            text(
                "ALTER TABLE user_wms_profiles ADD COLUMN can_edit_products_preview INTEGER NOT NULL DEFAULT 0"
            )
        )
    if "timezone" not in cols:
        conn.execute(
            text(
                "ALTER TABLE user_wms_profiles ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Warsaw'"
            )
        )


def ensure_user_wms_profiles_table(engine: Engine) -> None:
    """Separate WMS workstation profile rows; migrate legacy columns from app_users when present."""
    with engine.connect() as conn:
        base = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_users' LIMIT 1")
        ).fetchone()
        if not base:
            conn.commit()
            return

        tex = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_wms_profiles' LIMIT 1")
        ).fetchone()
        if not tex:
            conn.execute(
                text(
                    """
                    CREATE TABLE user_wms_profiles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        user_id INTEGER NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
                        barcode_login_code VARCHAR(128),
                        language VARCHAR(16) NOT NULL DEFAULT 'pl',
                        default_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
                        require_scan_every_product INTEGER NOT NULL DEFAULT 0,
                        can_edit_products_preview INTEGER NOT NULL DEFAULT 0,
                        picking_permissions_json TEXT,
                        packing_permissions_json TEXT,
                        picker_color VARCHAR(32),
                        packing_station_id INTEGER,
                        default_printer_id INTEGER,
                        timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Warsaw'
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_user_wms_profiles_user_id ON user_wms_profiles(user_id)"))
        else:
            _sqlite_ensure_user_wms_profiles_operational_columns(conn)

        r = conn.execute(text("PRAGMA table_info(app_users)"))
        cols = {row[1] for row in r}
        has_wm = "wms_language" in cols
        if has_wm:
            try:
                conn.execute(
                    text(
                        """
                        INSERT INTO user_wms_profiles (
                            created_at, updated_at, user_id, barcode_login_code, language,
                            default_warehouse_id, timezone,
                            require_scan_every_product, can_edit_products_preview
                        )
                        SELECT datetime('now'), datetime('now'), u.id,
                               u.barcode_login_code,
                               COALESCE(u.wms_language, 'pl'),
                               u.default_warehouse_id,
                               COALESCE(u.timezone, 'Europe/Warsaw'),
                               0, 0
                        FROM app_users u
                        WHERE NOT EXISTS (SELECT 1 FROM user_wms_profiles w WHERE w.user_id = u.id)
                        """
                    )
                )
            except Exception:
                conn.execute(
                    text(
                        """
                        INSERT INTO user_wms_profiles (
                            created_at, updated_at, user_id, language,
                            timezone, require_scan_every_product, can_edit_products_preview
                        )
                        SELECT datetime('now'), datetime('now'), id, 'pl',
                               'Europe/Warsaw', 0, 0
                        FROM app_users u
                        WHERE NOT EXISTS (SELECT 1 FROM user_wms_profiles w WHERE w.user_id = u.id)
                        """
                    )
                )
        else:
            conn.execute(
                text(
                    """
                    INSERT INTO user_wms_profiles (
                        created_at, updated_at, user_id, language,
                        timezone, require_scan_every_product, can_edit_products_preview
                    )
                    SELECT datetime('now'), datetime('now'), id, 'pl',
                           'Europe/Warsaw', 0, 0
                    FROM app_users u
                    WHERE NOT EXISTS (SELECT 1 FROM user_wms_profiles w WHERE w.user_id = u.id)
                    """
                )
            )
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_app_users_email ON app_users(email)"))
        except Exception:
            pass
        conn.commit()


def ensure_stock_documents_return_receipt_schema(engine: Engine) -> None:
    """Return receipts (PZ_RT / RETURN_RECEIPT): rmz_id + nullable supplier/delivery + wider document_type.

    SQLite: ALTER cannot drop NOT NULL — rebuild ``stock_documents`` when needed.
    PostgreSQL (and others): ALTER COLUMN / ADD COLUMN.
    """
    dialect = engine.dialect.name
    if dialect == "postgresql":
        _ensure_stock_documents_return_receipt_schema_postgresql(engine)
        return
    if dialect != "sqlite":
        logger.warning(
            "ensure_stock_documents_return_receipt_schema: unsupported dialect %r — add rmz_id manually if needed",
            dialect,
        )
        return

    _ensure_stock_documents_return_receipt_schema_sqlite(engine)


def _ensure_stock_documents_return_receipt_schema_postgresql(engine: Engine) -> None:
    from sqlalchemy import inspect

    insp = inspect(engine)
    if not insp.has_table("stock_documents"):
        return
    col_names = {c["name"] for c in insp.get_columns("stock_documents")}
    with engine.begin() as conn:
        if "rmz_id" not in col_names:
            conn.execute(text("ALTER TABLE stock_documents ADD COLUMN rmz_id INTEGER"))
            try:
                conn.execute(
                    text(
                        "ALTER TABLE stock_documents ADD CONSTRAINT fk_stock_documents_rmz_id "
                        "FOREIGN KEY (rmz_id) REFERENCES wms_order_returns(id) ON DELETE SET NULL"
                    )
                )
            except Exception:
                logger.info("PostgreSQL: rmz_id FK constraint skipped or already present")
        for stmt in (
            "ALTER TABLE stock_documents ALTER COLUMN supplier_id DROP NOT NULL",
            "ALTER TABLE stock_documents ALTER COLUMN delivery_id DROP NOT NULL",
        ):
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
        try:
            conn.execute(
                text(
                    "ALTER TABLE stock_documents ALTER COLUMN document_type TYPE VARCHAR(32) "
                    "USING CAST(document_type AS VARCHAR(32))"
                )
            )
        except Exception:
            pass
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_rmz_id ON stock_documents(rmz_id)"))
        except Exception:
            pass


# --- SQLite: explicit DDL for tables where CREATE TABLE AS SELECT loses PRIMARY KEY (breaks FK from stock_operations). ---

_SQLITE_STOCK_DOCUMENT_ITEMS_FULL_CREATE = """
CREATE TABLE stock_document_items (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
    delivery_item_id INTEGER REFERENCES delivery_items(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
    wm_kind VARCHAR(16),
    wm_id VARCHAR(36),
    mm_line_from_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    ordered_quantity REAL NOT NULL DEFAULT 0,
    received_quantity REAL NOT NULL DEFAULT 0,
    quantity_putaway REAL NOT NULL DEFAULT 0,
    putaway_updated_at DATETIME,
    putaway_last_location_name VARCHAR(256),
    putaway_last_location_type VARCHAR(20),
    quantity REAL NOT NULL,
    purchase_price_net REAL,
    vat_rate REAL NOT NULL DEFAULT 23,
    batch_number VARCHAR(128) NOT NULL DEFAULT '',
    expiry_date DATE NOT NULL DEFAULT '9999-12-31',
    return_disposition VARCHAR(32),
    stock_disposition VARCHAR(32) NOT NULL DEFAULT 'SALEABLE',
    rmz_damage_entry_id VARCHAR(96)
)
"""

_SQLITE_STOCK_OPERATIONS_FULL_CREATE = """
CREATE TABLE stock_operations (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    document_id INTEGER NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
    document_line_id INTEGER NOT NULL REFERENCES stock_document_items(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    location_id INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
    qty REAL NOT NULL,
    type VARCHAR(32) NOT NULL,
    batch VARCHAR(128),
    expiry_date DATE,
    stock_disposition VARCHAR(32) NOT NULL DEFAULT 'SALEABLE',
    unit_price_net REAL
)
"""

_STOCK_DOCUMENT_ITEM_COLUMNS_ORDERED = (
    "id",
    "document_id",
    "delivery_item_id",
    "product_id",
    "wm_kind",
    "wm_id",
    "mm_line_from_location_id",
    "ordered_quantity",
    "received_quantity",
    "quantity_putaway",
    "putaway_updated_at",
    "putaway_last_location_name",
    "putaway_last_location_type",
    "quantity",
    "purchase_price_net",
    "vat_rate",
    "batch_number",
    "expiry_date",
    "return_disposition",
    "stock_disposition",
    "rmz_damage_entry_id",
)

_STOCK_OPERATIONS_COLUMNS_ORDERED = (
    "id",
    "created_at",
    "updated_at",
    "document_id",
    "document_line_id",
    "product_id",
    "location_id",
    "qty",
    "type",
    "batch",
    "expiry_date",
    "stock_disposition",
    "unit_price_net",
)


def _sqlite_tmp_col_names(conn, table: str) -> set[str]:
    rows = conn.execute(text(f'PRAGMA table_info("{table}")')).fetchall()
    return {str(r[1]) for r in rows}


def _sqlite_fragment_copy_stock_document_item_col(col: str, tmp_have: set[str]) -> str:
    if col in tmp_have:
        return f'"{col}"'
    if col == "quantity_putaway":
        return "0"
    if col == "batch_number":
        return "''"
    if col == "expiry_date":
        return "'9999-12-31'"
    if col == "vat_rate":
        return "23"
    if col == "ordered_quantity":
        return "0"
    if col == "received_quantity":
        return "0"
    if col == "quantity":
        return "0"
    if col == "stock_disposition":
        if "stock_disposition" in tmp_have:
            return '"stock_disposition"'
        if "return_disposition" in tmp_have:
            return """COALESCE(NULLIF(TRIM("return_disposition"), ''), 'SALEABLE')"""
        return "'SALEABLE'"
    return "NULL"


def _sqlite_fragment_copy_stock_operation_col(col: str, tmp_have: set[str]) -> str:
    if col in tmp_have:
        return f'"{col}"'
    if col == "stock_disposition":
        return "'SALEABLE'"
    if col == "unit_price_net":
        return "NULL"
    if col in ("created_at", "updated_at"):
        return "CURRENT_TIMESTAMP"
    return "NULL"


def _sqlite_create_indexes_stock_document_items(conn) -> None:
    conn.execute(
        text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_document_id ON stock_document_items(document_id)")
    )
    conn.execute(
        text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_product_id ON stock_document_items(product_id)")
    )
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_stock_document_items_stock_disposition "
            "ON stock_document_items(stock_disposition)"
        )
    )


def _sqlite_create_indexes_stock_operations(conn) -> None:
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_operations_document_id ON stock_operations(document_id)"))
    conn.execute(
        text("CREATE INDEX IF NOT EXISTS ix_stock_operations_document_line_id ON stock_operations(document_line_id)")
    )
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_operations_product_id ON stock_operations(product_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_operations_location_id ON stock_operations(location_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_operations_type ON stock_operations(type)"))
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_stock_operations_stock_disposition ON stock_operations(stock_disposition)"
        )
    )


def _sqlite_insert_stock_document_items_from_tmp(conn, tmp_table: str) -> None:
    tmp_have = _sqlite_tmp_col_names(conn, tmp_table)
    select_parts = [_sqlite_fragment_copy_stock_document_item_col(c, tmp_have) for c in _STOCK_DOCUMENT_ITEM_COLUMNS_ORDERED]
    insert_cols = ", ".join(f'"{c}"' for c in _STOCK_DOCUMENT_ITEM_COLUMNS_ORDERED)
    sel = ", ".join(select_parts)
    conn.execute(text(f'INSERT INTO stock_document_items ({insert_cols}) SELECT {sel} FROM "{tmp_table}"'))


def _sqlite_insert_stock_operations_from_tmp(conn, tmp_table: str) -> None:
    tmp_have = _sqlite_tmp_col_names(conn, tmp_table)
    select_parts = [_sqlite_fragment_copy_stock_operation_col(c, tmp_have) for c in _STOCK_OPERATIONS_COLUMNS_ORDERED]
    insert_cols = ", ".join(f'"{c}"' for c in _STOCK_OPERATIONS_COLUMNS_ORDERED)
    sel = ", ".join(select_parts)
    conn.execute(text(f'INSERT INTO stock_operations ({insert_cols}) SELECT {sel} FROM "{tmp_table}"'))


def _sqlite_stock_document_items_primary_key_ok(conn) -> bool:
    rows = conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()
    id_row = next((r for r in rows if str(r[1]) == "id"), None)
    if id_row is None:
        return False
    return int(id_row[5] or 0) >= 1


def repair_stock_document_items_and_stock_operations_sqlite(conn) -> None:
    """
    Recreate ``stock_document_items`` with a real PRIMARY KEY and rebuild ``stock_operations`` FK targets.

    Needed after ``CREATE TABLE AS SELECT … WHERE 0`` (loses PK) — SQLite then reports
    ``foreign key mismatch`` on INSERT into ``stock_operations``.
    """
    ops_exist = conn.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_operations' LIMIT 1")
    ).fetchone()
    items_exist = conn.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
    ).fetchone()
    if not items_exist:
        return

    if _sqlite_stock_document_items_primary_key_ok(conn):
        return

    logger.warning(
        "SQLite: rebuilding stock_document_items + stock_operations — PK missing on stock_document_items.id (FK mismatch risk)"
    )

    conn.execute(text("PRAGMA foreign_keys=OFF"))
    conn.execute(text("DROP TABLE IF EXISTS stock_operations__fkrepair_tmp"))
    conn.execute(text("DROP TABLE IF EXISTS stock_document_items__fkrepair_tmp"))

    if ops_exist:
        conn.execute(text("CREATE TABLE stock_operations__fkrepair_tmp AS SELECT * FROM stock_operations"))
    conn.execute(text("CREATE TABLE stock_document_items__fkrepair_tmp AS SELECT * FROM stock_document_items"))

    conn.execute(text("DROP TABLE IF EXISTS stock_operations"))
    conn.execute(text("DROP TABLE IF EXISTS stock_document_items"))

    conn.execute(text(_SQLITE_STOCK_DOCUMENT_ITEMS_FULL_CREATE))
    _sqlite_insert_stock_document_items_from_tmp(conn, "stock_document_items__fkrepair_tmp")

    conn.execute(text(_SQLITE_STOCK_OPERATIONS_FULL_CREATE))
    if ops_exist:
        _sqlite_insert_stock_operations_from_tmp(conn, "stock_operations__fkrepair_tmp")

    conn.execute(text("DROP TABLE IF EXISTS stock_document_items__fkrepair_tmp"))
    conn.execute(text("DROP TABLE IF EXISTS stock_operations__fkrepair_tmp"))

    _sqlite_create_indexes_stock_document_items(conn)
    _sqlite_create_indexes_stock_operations(conn)

    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_return_disp ON stock_document_items(return_disposition)"))
    conn.execute(
        text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_rmz_damage_entry ON stock_document_items(rmz_damage_entry_id)")
    )

    seq_tbl = conn.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence' LIMIT 1")
    ).fetchone()
    if seq_tbl:
        conn.execute(text("DELETE FROM sqlite_sequence WHERE name IN ('stock_document_items', 'stock_operations')"))
        conn.execute(
            text(
                "INSERT INTO sqlite_sequence (name, seq) SELECT 'stock_document_items', IFNULL(MAX(id), 0) FROM stock_document_items"
            )
        )
        conn.execute(
            text(
                "INSERT INTO sqlite_sequence (name, seq) SELECT 'stock_operations', IFNULL(MAX(id), 0) FROM stock_operations"
            )
        )
    conn.execute(text("PRAGMA foreign_keys=ON"))


def ensure_stock_document_items_stock_operations_sqlite_fk_integrity(engine: Engine) -> None:
    """Startup guard: repair PK/FK metadata after partial SQLite rebuilds."""
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        repair_stock_document_items_and_stock_operations_sqlite(conn)


def ensure_warehouse_sqlite_schema_stabilization(engine: Engine) -> None:
    """
    Single post-incremental SQLite pass for warehouse core tables.

    Run after ``ensure_stock_documents_return_receipt_schema`` and line-item migrations so
    ``stock_document_items.id`` keeps a real PRIMARY KEY for ``stock_operations.document_line_id``.

    ``user_wms_profiles`` NOT NULL defaults live in ``ensure_user_wms_profiles_table`` (bootstrap SQL +
    ``_sqlite_ensure_user_wms_profiles_operational_columns``); keep that paired with app user migrations.

    Prefer adding new NOT NULL columns only via ``ALTER ... ADD ... DEFAULT`` or full rebuild + copy — never
    ``NOT NULL`` without a default on live SQLite.
    """
    ensure_stock_document_items_stock_operations_sqlite_fk_integrity(engine)


def _ensure_stock_documents_return_receipt_schema_sqlite(engine: Engine) -> None:
    """Rebuild stock_documents when supplier_id/delivery_id are NOT NULL or document_type is VARCHAR(8)."""
    new_doc_column_order = (
        "id",
        "tenant_id",
        "document_type",
        "rmz_id",
        "supplier_id",
        "delivery_id",
        "warehouse_id",
        "location_id",
        "mm_from_location_id",
        "mm_to_location_id",
        "status",
        "receiving_status",
        "putaway_status",
        "relocation_status",
        "currency",
        "total_net",
        "total_gross",
        "created_at",
        "updated_at",
    )

    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_documents' LIMIT 1")
        ).fetchone()
        if not exists:
            return

        info = list(conn.execute(text("PRAGMA table_info(stock_documents)")))
        by_name = {row[1]: row for row in info}
        tmp_col_names = [row[1] for row in sorted(info, key=lambda r: int(r[0]))]
        tmp_set = set(tmp_col_names)

        sup_nn = int(by_name["supplier_id"][3]) if "supplier_id" in by_name else 1
        del_nn = int(by_name["delivery_id"][3]) if "delivery_id" in by_name else 1
        has_rmz = "rmz_id" in by_name
        dt_row = by_name.get("document_type")
        dt_sql_type = str(dt_row[2] or "").replace(" ", "").upper() if dt_row else ""
        narrow_dt = dt_sql_type == "VARCHAR(8)" or dt_sql_type == "CHARACTER(8)"

        need_rebuild = (sup_nn == 1) or (del_nn == 1) or narrow_dt

        if not need_rebuild:
            if not has_rmz:
                conn.execute(text("ALTER TABLE stock_documents ADD COLUMN rmz_id INTEGER"))
                try:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_rmz_id ON stock_documents(rmz_id)"))
                except Exception:
                    pass
                logger.info("SQLite: added stock_documents.rmz_id (ALTER)")
            return

        items_exist = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
        ).fetchone()
        if not items_exist:
            return

        logger.warning(
            "SQLite: rebuilding stock_documents for return receipts (nullable supplier/delivery, rmz_id, document_type VARCHAR(32))"
        )

        def col_expr(col: str) -> str:
            if col in tmp_set:
                return f'"{col}"'
            if col == "rmz_id":
                return "NULL"
            if col == "mm_from_location_id":
                return "NULL"
            if col == "mm_to_location_id":
                return "NULL"
            if col == "receiving_status":
                if "receiving_status" in tmp_set:
                    return (
                        "CASE WHEN \"receiving_status\" IS NULL OR TRIM(\"receiving_status\") = '' "
                        "THEN 'NEW' ELSE \"receiving_status\" END"
                    )
                return "'NEW'"
            if col == "putaway_status":
                return '"putaway_status"' if "putaway_status" in tmp_set else "'NOT_STARTED'"
            if col == "relocation_status":
                return '"relocation_status"' if "relocation_status" in tmp_set else "'OPEN'"
            if col == "currency":
                return '"currency"' if "currency" in tmp_set else "'PLN'"
            if col in ("total_net", "total_gross"):
                return f'"{col}"' if col in tmp_set else "NULL"
            if col == "updated_at":
                if "updated_at" in tmp_set:
                    return 'COALESCE("updated_at", "created_at")'
                return '"created_at"'
            raise ValueError(f"unexpected column in stock_documents rebuild: {col}")

        select_sql = ", ".join(col_expr(c) for c in new_doc_column_order)
        insert_cols_sql = ", ".join(f'"{c}"' for c in new_doc_column_order)

        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("DROP TABLE IF EXISTS stock_documents__rr_tmp"))
        conn.execute(text("DROP TABLE IF EXISTS stock_document_items__rr_tmp"))
        conn.execute(text("CREATE TABLE stock_documents__rr_tmp AS SELECT * FROM stock_documents"))
        conn.execute(text("CREATE TABLE stock_document_items__rr_tmp AS SELECT * FROM stock_document_items"))
        conn.execute(text("DROP TABLE stock_document_items"))
        conn.execute(text("DROP TABLE stock_documents"))

        conn.execute(
            text(
                """
                CREATE TABLE stock_documents (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    document_type VARCHAR(32) NOT NULL DEFAULT 'PZ',
                    rmz_id INTEGER REFERENCES wms_order_returns(id) ON DELETE SET NULL,
                    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE RESTRICT,
                    delivery_id INTEGER REFERENCES deliveries(id) ON DELETE RESTRICT,
                    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
                    location_id INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
                    mm_from_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                    mm_to_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                    status VARCHAR(32) NOT NULL DEFAULT 'draft',
                    receiving_status VARCHAR(32) NOT NULL DEFAULT 'NEW',
                    putaway_status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
                    relocation_status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
                    currency VARCHAR(8) NOT NULL DEFAULT 'PLN',
                    total_net REAL,
                    total_gross REAL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(f"INSERT INTO stock_documents ({insert_cols_sql}) SELECT {select_sql} FROM stock_documents__rr_tmp")
        )

        conn.execute(text(_SQLITE_STOCK_DOCUMENT_ITEMS_FULL_CREATE))
        _sqlite_insert_stock_document_items_from_tmp(conn, "stock_document_items__rr_tmp")

        conn.execute(text("DROP TABLE stock_documents__rr_tmp"))
        conn.execute(text("DROP TABLE stock_document_items__rr_tmp"))

        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_tenant_id ON stock_documents(tenant_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_delivery_id ON stock_documents(delivery_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_supplier_id ON stock_documents(supplier_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_document_type ON stock_documents(document_type)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stock_documents_rmz_id ON stock_documents(rmz_id)"))
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_document_id ON stock_document_items(document_id)")
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_stock_document_items_product_id ON stock_document_items(product_id)")
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_stock_document_items_return_disp ON stock_document_items(return_disposition)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_stock_document_items_rmz_damage_entry ON stock_document_items(rmz_damage_entry_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_stock_document_items_stock_disposition ON stock_document_items(stock_disposition)"
            )
        )

        conn.execute(text("DELETE FROM sqlite_sequence WHERE name IN ('stock_documents', 'stock_document_items')"))
        conn.execute(
            text(
                "INSERT INTO sqlite_sequence (name, seq) SELECT 'stock_documents', IFNULL(MAX(id), 0) FROM stock_documents"
            )
        )
        conn.execute(
            text(
                "INSERT INTO sqlite_sequence (name, seq) SELECT 'stock_document_items', IFNULL(MAX(id), 0) FROM stock_document_items"
            )
        )
        conn.execute(text("PRAGMA foreign_keys=ON"))


# Backwards-compatible alias (older imports).
def ensure_stock_documents_rmz_id_column(engine: Engine) -> None:
    ensure_stock_documents_return_receipt_schema(engine)


def ensure_stock_document_items_return_receipt_columns(engine: Engine) -> None:
    """PZ_RT line metadata: disposition bucket + RMZ damage entry key."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
        if "return_disposition" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN return_disposition VARCHAR(32)"))
        if "rmz_damage_entry_id" not in cols:
            conn.execute(text("ALTER TABLE stock_document_items ADD COLUMN rmz_damage_entry_id VARCHAR(96)"))
        try:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_stock_document_items_return_disp "
                    "ON stock_document_items(return_disposition)"
                )
            )
        except Exception:
            pass
        try:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_stock_document_items_rmz_damage_entry "
                    "ON stock_document_items(rmz_damage_entry_id)"
                )
            )
        except Exception:
            pass
        conn.commit()


def ensure_wms_audit_tables(engine: Engine) -> None:
    """Canonical WMS audit events (event-sourced trail) + operation session aggregates."""
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS wms_order_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    order_id INTEGER NOT NULL,
                    operator_user_id INTEGER,
                    event_type VARCHAR(64) NOT NULL,
                    product_id INTEGER,
                    order_item_id INTEGER,
                    source_location_id INTEGER,
                    target_cart_id INTEGER,
                    quantity REAL,
                    metadata_json TEXT,
                    created_at DATETIME NOT NULL,
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id),
                    FOREIGN KEY(warehouse_id) REFERENCES warehouses (id),
                    FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE CASCADE,
                    FOREIGN KEY(operator_user_id) REFERENCES app_users (id) ON DELETE SET NULL,
                    FOREIGN KEY(product_id) REFERENCES products (id) ON DELETE SET NULL,
                    FOREIGN KEY(order_item_id) REFERENCES order_items (id) ON DELETE SET NULL,
                    FOREIGN KEY(source_location_id) REFERENCES locations (id) ON DELETE SET NULL,
                    FOREIGN KEY(target_cart_id) REFERENCES carts (id) ON DELETE SET NULL
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wms_order_events_order_id ON wms_order_events(order_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wms_order_events_created_at ON wms_order_events(created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wms_order_events_event_type ON wms_order_events(event_type)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wms_order_events_operator ON wms_order_events(operator_user_id)"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS wms_operation_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    cart_id INTEGER,
                    order_id INTEGER,
                    session_kind VARCHAR(32) NOT NULL,
                    operator_user_id INTEGER,
                    started_at DATETIME NOT NULL,
                    completed_at DATETIME,
                    paused_duration_seconds INTEGER NOT NULL DEFAULT 0,
                    active_duration_seconds INTEGER,
                    metadata_json TEXT,
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id),
                    FOREIGN KEY(warehouse_id) REFERENCES warehouses (id),
                    FOREIGN KEY(cart_id) REFERENCES carts (id) ON DELETE SET NULL,
                    FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE SET NULL,
                    FOREIGN KEY(operator_user_id) REFERENCES app_users (id) ON DELETE SET NULL
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wms_operation_sessions_cart ON wms_operation_sessions(cart_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wms_operation_sessions_order ON wms_operation_sessions(order_id)"))
        op_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(wms_operation_sessions)")).fetchall()}
        if "last_activity_at" not in op_cols:
            conn.execute(text("ALTER TABLE wms_operation_sessions ADD COLUMN last_activity_at DATETIME"))
        if "completed_reason" not in op_cols:
            conn.execute(text("ALTER TABLE wms_operation_sessions ADD COLUMN completed_reason VARCHAR(32)"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_wms_operation_sessions_last_activity "
                "ON wms_operation_sessions(last_activity_at)"
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS wms_packing_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    order_id INTEGER NOT NULL,
                    operator_user_id INTEGER,
                    workstation_id INTEGER,
                    started_at DATETIME NOT NULL,
                    completed_at DATETIME,
                    duration_seconds INTEGER,
                    metadata_json TEXT,
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id),
                    FOREIGN KEY(warehouse_id) REFERENCES warehouses (id),
                    FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE CASCADE,
                    FOREIGN KEY(operator_user_id) REFERENCES app_users (id) ON DELETE SET NULL
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wms_packing_sessions_order ON wms_packing_sessions(order_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wms_packing_sessions_open ON wms_packing_sessions(order_id, completed_at)"))
        pack_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(wms_packing_sessions)")).fetchall()}
        if "last_activity_at" not in pack_cols:
            conn.execute(text("ALTER TABLE wms_packing_sessions ADD COLUMN last_activity_at DATETIME"))
        if "completed_reason" not in pack_cols:
            conn.execute(text("ALTER TABLE wms_packing_sessions ADD COLUMN completed_reason VARCHAR(32)"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_wms_packing_sessions_last_activity "
                "ON wms_packing_sessions(last_activity_at)"
            )
        )
        conn.commit()


def ensure_order_custom_fields_tables(engine: Engine) -> None:
    """Definicje dodatkowych pól zamówienia + wartości per zamówienie."""
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS order_custom_fields (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    name VARCHAR(256) NOT NULL,
                    slug VARCHAR(128) NOT NULL,
                    type VARCHAR(32) NOT NULL,
                    settings_json TEXT,
                    icon_file_id INTEGER,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id),
                    FOREIGN KEY(warehouse_id) REFERENCES warehouses (id),
                    UNIQUE (tenant_id, warehouse_id, slug)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ocf_tenant_wh ON order_custom_fields(tenant_id, warehouse_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ocf_type ON order_custom_fields(type)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ocf_active ON order_custom_fields(is_active)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS order_custom_field_options (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    field_id INTEGER NOT NULL,
                    label VARCHAR(512) NOT NULL,
                    icon_file_id INTEGER,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(field_id) REFERENCES order_custom_fields (id) ON DELETE CASCADE
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ocfo_field ON order_custom_field_options(field_id)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS order_custom_field_values (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    order_id INTEGER NOT NULL,
                    field_id INTEGER NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    value_string TEXT,
                    value_number REAL,
                    value_json TEXT,
                    updated_at DATETIME,
                    FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE CASCADE,
                    FOREIGN KEY(field_id) REFERENCES order_custom_fields (id) ON DELETE CASCADE,
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id),
                    FOREIGN KEY(warehouse_id) REFERENCES warehouses (id),
                    UNIQUE (order_id, field_id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ocfv_order ON order_custom_field_values(order_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ocfv_field ON order_custom_field_values(field_id)"))
        conn.commit()


def ensure_workforce_operational_tables(engine: Engine) -> None:
    """User operational activity, employer cost profiles, panel status access matrix (WMS workforce)."""
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_activity_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    user_id INTEGER,
                    tenant_id INTEGER,
                    action_type VARCHAR(96) NOT NULL,
                    module VARCHAR(64) NOT NULL,
                    entity_type VARCHAR(80),
                    entity_id INTEGER,
                    metadata_json TEXT,
                    created_at DATETIME NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES app_users (id) ON DELETE SET NULL,
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE SET NULL
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_activity_logs_user_created ON user_activity_logs(user_id, created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_activity_logs_module_created ON user_activity_logs(module, created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_activity_logs_action ON user_activity_logs(action_type)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS employee_cost_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    user_id INTEGER NOT NULL,
                    tenant_id INTEGER,
                    contract_type VARCHAR(16) NOT NULL DEFAULT 'uop',
                    gross_monthly_pln REAL,
                    employer_total_monthly_pln REAL,
                    net_monthly_pln REAL,
                    default_hours_per_month REAL NOT NULL DEFAULT 168,
                    hourly_pln REAL,
                    employer_hourly_pln REAL,
                    ppk_enabled INTEGER NOT NULL DEFAULT 0,
                    employer_side_rate_override REAL,
                    notes TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(user_id) REFERENCES app_users (id) ON DELETE CASCADE,
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE SET NULL,
                    UNIQUE (user_id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_employee_cost_profiles_tenant ON employee_cost_profiles(tenant_id)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS workforce_status_access (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    role VARCHAR(64) NOT NULL,
                    order_ui_status_id INTEGER NOT NULL,
                    can_visible INTEGER NOT NULL DEFAULT 1,
                    can_edit INTEGER NOT NULL DEFAULT 0,
                    can_transition INTEGER NOT NULL DEFAULT 0,
                    can_process INTEGER NOT NULL DEFAULT 0,
                    can_print INTEGER NOT NULL DEFAULT 0,
                    can_complete INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
                    FOREIGN KEY(warehouse_id) REFERENCES warehouses (id) ON DELETE CASCADE,
                    FOREIGN KEY(order_ui_status_id) REFERENCES order_ui_statuses (id) ON DELETE CASCADE,
                    UNIQUE (tenant_id, warehouse_id, role, order_ui_status_id)
                )
                """
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_workforce_status_access_lookup ON workforce_status_access(tenant_id, warehouse_id, role)"
            )
        )
        conn.commit()


def ensure_workforce_user_groups_schema(engine: Engine) -> None:
    """Operational user groups, primary group on app_users, WMS modes + org fields on user_wms_profiles, per-user status overrides."""
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS workforce_user_groups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    name VARCHAR(128) NOT NULL,
                    color VARCHAR(32) NOT NULL DEFAULT '#64748b',
                    icon_key VARCHAR(64) NOT NULL DEFAULT 'Users',
                    archived_at DATETIME,
                    default_permission_keys_json TEXT,
                    default_wms_modes_json TEXT
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS workforce_user_status_access (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    order_ui_status_id INTEGER NOT NULL,
                    can_visible INTEGER NOT NULL DEFAULT 1,
                    can_edit INTEGER NOT NULL DEFAULT 0,
                    can_transition INTEGER NOT NULL DEFAULT 0,
                    can_process INTEGER NOT NULL DEFAULT 0,
                    can_print INTEGER NOT NULL DEFAULT 0,
                    can_complete INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
                    FOREIGN KEY(warehouse_id) REFERENCES warehouses (id) ON DELETE CASCADE,
                    FOREIGN KEY(user_id) REFERENCES app_users (id) ON DELETE CASCADE,
                    FOREIGN KEY(order_ui_status_id) REFERENCES order_ui_statuses (id) ON DELETE CASCADE,
                    UNIQUE (tenant_id, warehouse_id, user_id, order_ui_status_id)
                )
                """
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_workforce_user_status_access_lookup "
                "ON workforce_user_status_access(tenant_id, warehouse_id, user_id)"
            )
        )

        r = conn.execute(text("PRAGMA table_info(app_users)"))
        au_cols = {row[1] for row in r}
        if "primary_workforce_group_id" not in au_cols:
            conn.execute(text("ALTER TABLE app_users ADD COLUMN primary_workforce_group_id INTEGER"))

        r2 = conn.execute(text("PRAGMA table_info(user_wms_profiles)"))
        wp_cols = {row[1] for row in r2}
        extra_wp: list[tuple[str, str]] = [
            ("wms_operational_modes_json", "TEXT"),
            ("workforce_supervisor_user_id", "INTEGER"),
            ("workforce_employment_type", "VARCHAR(32)"),
            ("workforce_shift_type", "VARCHAR(32)"),
            ("workforce_active_zone_ids_json", "TEXT"),
            ("workforce_default_workstation", "VARCHAR(128)"),
            ("workforce_color_tag", "VARCHAR(32)"),
        ]
        for col, ddl in extra_wp:
            if col not in wp_cols:
                conn.execute(text(f"ALTER TABLE user_wms_profiles ADD COLUMN {col} {ddl}"))
        conn.commit()


def ensure_return_product_decisions_creates_stock_document_column(engine: Engine) -> None:
    """REJECTED reasons: optional inbound stock line on PZ_RT."""
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='return_product_decisions' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(return_product_decisions)")).fetchall()}
        if "creates_stock_document" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE return_product_decisions ADD COLUMN creates_stock_document INTEGER NOT NULL DEFAULT 0"
                )
            )
        conn.commit()


def ensure_company_profile_table(engine: Engine) -> None:
    """Create company_profiles (one row per tenant) for Firma / documents branding."""
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS company_profiles (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL,
                    company_name VARCHAR(512),
                    street VARCHAR(256),
                    building_number VARCHAR(32),
                    apartment_number VARCHAR(32),
                    postal_code VARCHAR(32),
                    city VARCHAR(128),
                    country VARCHAR(128),
                    nip VARCHAR(32),
                    regon VARCHAR(32),
                    address_extra_line VARCHAR(512),
                    bank_name VARCHAR(256),
                    iban VARCHAR(64),
                    bic_swift VARCHAR(32),
                    document_email VARCHAR(256),
                    company_phone VARCHAR(64),
                    website_url VARCHAR(512),
                    logo_url VARCHAR(512),
                    FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
                )
                """
            )
        )
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_company_profile_tenant ON company_profiles(tenant_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_company_profiles_tenant ON company_profiles(tenant_id)"))
        conn.commit()


def ensure_stock_document_item_receiving_split_columns(engine: Engine) -> None:
    """WMS receiving: persisted carton vs loose-unit counters on PZ lines."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            t = conn.execute(
                text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
            ).fetchone()
            if not t:
                conn.commit()
                return
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
            if "cartons_count" not in cols:
                conn.execute(
                    text("ALTER TABLE stock_document_items ADD COLUMN cartons_count INTEGER NOT NULL DEFAULT 0")
                )
            if "loose_units_count" not in cols:
                conn.execute(
                    text("ALTER TABLE stock_document_items ADD COLUMN loose_units_count INTEGER NOT NULL DEFAULT 0")
                )
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE stock_document_items ADD COLUMN IF NOT EXISTS cartons_count "
                    "INTEGER NOT NULL DEFAULT 0"
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE stock_document_items ADD COLUMN IF NOT EXISTS loose_units_count "
                    "INTEGER NOT NULL DEFAULT 0"
                )
            )
        return


def ensure_receiving_scan_logs_table(engine: Engine) -> None:
    """WMS receiving audit: one row per quantity save on a PZ line."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS receiving_scan_logs (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        document_id INTEGER NOT NULL,
                        item_id INTEGER NOT NULL,
                        admin_id INTEGER NOT NULL,
                        quantity_added REAL NOT NULL,
                        packaging_type VARCHAR(32) NOT NULL,
                        cartons_added INTEGER,
                        loose_units_added INTEGER,
                        created_at DATETIME NOT NULL DEFAULT (datetime('now')),
                        FOREIGN KEY(document_id) REFERENCES stock_documents (id) ON DELETE CASCADE,
                        FOREIGN KEY(item_id) REFERENCES stock_document_items (id) ON DELETE CASCADE,
                        FOREIGN KEY(admin_id) REFERENCES app_users (id) ON DELETE RESTRICT
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_receiving_scan_logs_document ON receiving_scan_logs(document_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_receiving_scan_logs_item ON receiving_scan_logs(item_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_receiving_scan_logs_admin ON receiving_scan_logs(admin_id)"))
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS receiving_scan_logs (
                        id SERIAL PRIMARY KEY,
                        document_id INTEGER NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
                        item_id INTEGER NOT NULL REFERENCES stock_document_items(id) ON DELETE CASCADE,
                        admin_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
                        quantity_added DOUBLE PRECISION NOT NULL,
                        packaging_type VARCHAR(32) NOT NULL,
                        cartons_added INTEGER,
                        loose_units_added INTEGER,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()))
                    )
                    """
                )
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_receiving_scan_logs_document ON receiving_scan_logs(document_id)")
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_receiving_scan_logs_item ON receiving_scan_logs(item_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_receiving_scan_logs_admin ON receiving_scan_logs(admin_id)"))
        return


def ensure_products_reserve_replenishment_columns(engine: Engine) -> None:
    """Add min_reserve_quantity / max_reserve_quantity for WMS buffer/reserve thresholds (nullable)."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(products)"))
        columns = [row[1] for row in result]
        if "min_reserve_quantity" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN min_reserve_quantity REAL"))
        if "max_reserve_quantity" not in columns:
            conn.execute(text("ALTER TABLE products ADD COLUMN max_reserve_quantity REAL"))
        conn.commit()


def ensure_replenishment_tasks_table(engine: Engine) -> None:
    """Operational replenishment queue: buffer/reserve → pick."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS replenishment_tasks (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        product_id INTEGER NOT NULL,
                        source_location_id INTEGER NOT NULL,
                        target_location_id INTEGER NOT NULL,
                        quantity REAL NOT NULL,
                        priority_score REAL NOT NULL DEFAULT 0,
                        priority_band VARCHAR(16) NOT NULL DEFAULT 'LOW',
                        status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
                        created_at DATETIME,
                        completed_at DATETIME,
                        assigned_admin_id INTEGER,
                        FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                        FOREIGN KEY(warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
                        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                        FOREIGN KEY(source_location_id) REFERENCES locations(id) ON DELETE CASCADE,
                        FOREIGN KEY(target_location_id) REFERENCES locations(id) ON DELETE CASCADE,
                        FOREIGN KEY(assigned_admin_id) REFERENCES app_users(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rep_tasks_tw ON replenishment_tasks(tenant_id, warehouse_id, status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rep_tasks_product ON replenishment_tasks(product_id)"))
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS replenishment_tasks (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        source_location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
                        target_location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
                        quantity DOUBLE PRECISION NOT NULL,
                        priority_score DOUBLE PRECISION NOT NULL DEFAULT 0,
                        priority_band VARCHAR(16) NOT NULL DEFAULT 'LOW',
                        status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
                        created_at TIMESTAMPTZ,
                        completed_at TIMESTAMPTZ,
                        assigned_admin_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rep_tasks_tw ON replenishment_tasks(tenant_id, warehouse_id, status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rep_tasks_product ON replenishment_tasks(product_id)"))


def ensure_wms_product_warehouse_operations_table(engine: Engine) -> None:
    """Per-product WMS warehouse operation audit (non-anonymous actor, movement type, locations, packaging)."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS wms_product_warehouse_operations (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        product_id INTEGER NOT NULL,
                        movement_type VARCHAR(32) NOT NULL,
                        source_location_id INTEGER,
                        target_location_id INTEGER,
                        quantity REAL NOT NULL,
                        packaging_type VARCHAR(24) NOT NULL DEFAULT 'UNIT',
                        packaging_quantity REAL,
                        admin_id INTEGER NOT NULL,
                        admin_login VARCHAR(128) NOT NULL,
                        admin_first_name VARCHAR(128),
                        admin_last_name VARCHAR(128),
                        created_at DATETIME NOT NULL,
                        reference_document VARCHAR(160),
                        stock_document_id INTEGER,
                        replenishment_task_id INTEGER,
                        wms_mode VARCHAR(64),
                        FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                        FOREIGN KEY(warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
                        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                        FOREIGN KEY(source_location_id) REFERENCES locations(id) ON DELETE SET NULL,
                        FOREIGN KEY(target_location_id) REFERENCES locations(id) ON DELETE SET NULL,
                        FOREIGN KEY(admin_id) REFERENCES app_users(id) ON DELETE RESTRICT,
                        FOREIGN KEY(stock_document_id) REFERENCES stock_documents(id) ON DELETE SET NULL,
                        FOREIGN KEY(replenishment_task_id) REFERENCES replenishment_tasks(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_wms_prod_wh_ops_tp "
                    "ON wms_product_warehouse_operations(tenant_id, product_id, created_at)"
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wms_prod_wh_ops_tw ON wms_product_warehouse_operations(tenant_id, warehouse_id)"))
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS wms_product_warehouse_operations (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        movement_type VARCHAR(32) NOT NULL,
                        source_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        target_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        quantity DOUBLE PRECISION NOT NULL,
                        packaging_type VARCHAR(24) NOT NULL DEFAULT 'UNIT',
                        packaging_quantity DOUBLE PRECISION,
                        admin_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
                        admin_login VARCHAR(128) NOT NULL,
                        admin_first_name VARCHAR(128),
                        admin_last_name VARCHAR(128),
                        created_at TIMESTAMPTZ NOT NULL,
                        reference_document VARCHAR(160),
                        stock_document_id INTEGER REFERENCES stock_documents(id) ON DELETE SET NULL,
                        replenishment_task_id INTEGER REFERENCES replenishment_tasks(id) ON DELETE SET NULL,
                        wms_mode VARCHAR(64)
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_wms_prod_wh_ops_tp "
                    "ON wms_product_warehouse_operations(tenant_id, product_id, created_at)"
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wms_prod_wh_ops_tw ON wms_product_warehouse_operations(tenant_id, warehouse_id)"))


def ensure_replenishment_tasks_sources_json_column(engine: Engine) -> None:
    """Multi-source BUFFER chain for replenishment tasks (planned qty per location)."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(replenishment_tasks)"))
            cols = [row[1] for row in r]
            if "sources_json" not in cols:
                conn.execute(text("ALTER TABLE replenishment_tasks ADD COLUMN sources_json TEXT"))
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE replenishment_tasks
                    ADD COLUMN IF NOT EXISTS sources_json TEXT
                    """
                )
            )


def ensure_warehouse_carrier_tables(engine: Engine) -> None:
    """WMS nośniki: grupy, nośniki, pozycje manifestu, log operacji."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS warehouse_carrier_groups (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL,
                        name VARCHAR(128) NOT NULL DEFAULT '',
                        code VARCHAR(32) NOT NULL DEFAULT '',
                        color VARCHAR(32),
                        default_weight REAL,
                        default_width REAL,
                        default_height REAL,
                        default_depth REAL,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS warehouse_carriers (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL,
                        code VARCHAR(64) NOT NULL DEFAULT '',
                        barcode VARCHAR(96) NOT NULL,
                        name VARCHAR(256),
                        carrier_group_id INTEGER,
                        current_location_id INTEGER,
                        status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
                        is_mixed INTEGER NOT NULL DEFAULT 0,
                        weight REAL,
                        width REAL,
                        height REAL,
                        depth REAL,
                        notes TEXT,
                        locked_by_user_id INTEGER,
                        locked_at DATETIME,
                        created_by_user_id INTEGER,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        deleted_at DATETIME,
                        FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                        FOREIGN KEY(carrier_group_id) REFERENCES warehouse_carrier_groups(id) ON DELETE SET NULL,
                        FOREIGN KEY(current_location_id) REFERENCES locations(id) ON DELETE SET NULL,
                        FOREIGN KEY(locked_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
                        FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_wh_carriers_barcode ON warehouse_carriers(barcode)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wh_carriers_tenant ON warehouse_carriers(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wh_carriers_loc ON warehouse_carriers(current_location_id)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS warehouse_carrier_items (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL,
                        carrier_id INTEGER NOT NULL,
                        warehouse_stock_id INTEGER,
                        product_id INTEGER NOT NULL,
                        batch_id INTEGER,
                        expiry_date DATE,
                        quantity REAL NOT NULL DEFAULT 0,
                        reserved_quantity REAL NOT NULL DEFAULT 0,
                        source_document_type VARCHAR(32),
                        source_document_id INTEGER,
                        created_at DATETIME NOT NULL,
                        FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                        FOREIGN KEY(carrier_id) REFERENCES warehouse_carriers(id) ON DELETE CASCADE,
                        FOREIGN KEY(warehouse_stock_id) REFERENCES inventory(id) ON DELETE SET NULL,
                        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wh_carrier_items_c ON warehouse_carrier_items(carrier_id)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS warehouse_carrier_logs (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL,
                        carrier_id INTEGER NOT NULL,
                        operation_type VARCHAR(64) NOT NULL,
                        performed_by_user_id INTEGER,
                        performed_by_name VARCHAR(256) NOT NULL DEFAULT '',
                        metadata_json TEXT,
                        created_at DATETIME NOT NULL,
                        FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                        FOREIGN KEY(carrier_id) REFERENCES warehouse_carriers(id) ON DELETE CASCADE,
                        FOREIGN KEY(performed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wh_carrier_logs_c ON warehouse_carrier_logs(carrier_id)"))
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS warehouse_carrier_groups (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        name VARCHAR(128) NOT NULL DEFAULT '',
                        code VARCHAR(32) NOT NULL DEFAULT '',
                        color VARCHAR(32),
                        default_weight DOUBLE PRECISION,
                        default_width DOUBLE PRECISION,
                        default_height DOUBLE PRECISION,
                        default_depth DOUBLE PRECISION,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS warehouse_carriers (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        code VARCHAR(64) NOT NULL DEFAULT '',
                        barcode VARCHAR(96) NOT NULL UNIQUE,
                        name VARCHAR(256),
                        carrier_group_id INTEGER REFERENCES warehouse_carrier_groups(id) ON DELETE SET NULL,
                        current_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
                        is_mixed BOOLEAN NOT NULL DEFAULT FALSE,
                        weight DOUBLE PRECISION,
                        width DOUBLE PRECISION,
                        height DOUBLE PRECISION,
                        depth DOUBLE PRECISION,
                        notes TEXT,
                        locked_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                        locked_at TIMESTAMPTZ,
                        created_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        deleted_at TIMESTAMPTZ
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wh_carriers_tenant ON warehouse_carriers(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wh_carriers_loc ON warehouse_carriers(current_location_id)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS warehouse_carrier_items (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        carrier_id INTEGER NOT NULL REFERENCES warehouse_carriers(id) ON DELETE CASCADE,
                        warehouse_stock_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        batch_id INTEGER,
                        expiry_date DATE,
                        quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
                        reserved_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
                        source_document_type VARCHAR(32),
                        source_document_id INTEGER,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wh_carrier_items_c ON warehouse_carrier_items(carrier_id)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS warehouse_carrier_logs (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        carrier_id INTEGER NOT NULL REFERENCES warehouse_carriers(id) ON DELETE CASCADE,
                        operation_type VARCHAR(64) NOT NULL,
                        performed_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                        performed_by_name VARCHAR(256) NOT NULL DEFAULT '',
                        metadata_json TEXT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wh_carrier_logs_c ON warehouse_carrier_logs(carrier_id)"))


def ensure_inventory_carrier_id_column(engine: Engine) -> None:
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            t = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='inventory' LIMIT 1")).fetchone()
            if not t:
                conn.commit()
                return
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(inventory)")).fetchall()}
            if "carrier_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE inventory ADD COLUMN carrier_id INTEGER "
                        "REFERENCES warehouse_carriers(id) ON DELETE SET NULL"
                    )
                )
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE inventory
                    ADD COLUMN IF NOT EXISTS carrier_id INTEGER REFERENCES warehouse_carriers(id) ON DELETE SET NULL
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_carrier_id ON inventory(carrier_id)"))


def ensure_inventory_carrier_unique_indexes(engine: Engine) -> None:
    """Zastępuje płaski UNIQUE na inventory indeksami częściowymi (luz vs nośnik)."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            t = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='inventory' LIMIT 1")).fetchone()
            if not t:
                conn.commit()
                return
            for name in ("uq_inventory_tenant_product_location_lot_disp", "uq_inventory_tenant_product_location_lot"):
                try:
                    conn.execute(text(f"DROP INDEX IF EXISTS {name}"))
                except Exception:
                    pass
            conn.execute(text("DROP INDEX IF EXISTS uq_inventory_tenant_product_location_lot_disp"))
            conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_loose_lot_disp
                    ON inventory(tenant_id, product_id, location_id, batch_number, expiry_date, stock_disposition)
                    WHERE carrier_id IS NULL
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_carrier_lot_disp
                    ON inventory(tenant_id, product_id, location_id, carrier_id, batch_number, expiry_date, stock_disposition)
                    WHERE carrier_id IS NOT NULL
                    """
                )
            )
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE inventory DROP CONSTRAINT IF EXISTS uq_inventory_tenant_product_location_lot_disp"))
            conn.execute(text("DROP INDEX IF EXISTS uq_inventory_tenant_product_location_lot_disp"))
            conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_loose_lot_disp
                    ON inventory(tenant_id, product_id, location_id, batch_number, expiry_date, stock_disposition)
                    WHERE carrier_id IS NULL
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_carrier_lot_disp
                    ON inventory(tenant_id, product_id, location_id, carrier_id, batch_number, expiry_date, stock_disposition)
                    WHERE carrier_id IS NOT NULL
                    """
                )
            )


def ensure_stock_document_item_suggested_carrier_column(engine: Engine) -> None:
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            t = conn.execute(
                text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
            ).fetchone()
            if not t:
                conn.commit()
                return
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
            if "suggested_warehouse_carrier_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE stock_document_items ADD COLUMN suggested_warehouse_carrier_id INTEGER "
                        "REFERENCES warehouse_carriers(id) ON DELETE SET NULL"
                    )
                )
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE stock_document_items
                    ADD COLUMN IF NOT EXISTS suggested_warehouse_carrier_id INTEGER
                    REFERENCES warehouse_carriers(id) ON DELETE SET NULL
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_stock_doc_items_sugg_carrier "
                    "ON stock_document_items(suggested_warehouse_carrier_id)"
                )
            )


def ensure_receiving_document_carriers_table(engine: Engine) -> None:
    """PZ ↔ lista nośników przypisanych do przyjęcia (WMS receiving)."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS receiving_document_carriers (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        document_id INTEGER NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
                        warehouse_carrier_id INTEGER NOT NULL REFERENCES warehouse_carriers(id) ON DELETE RESTRICT,
                        created_at DATETIME NOT NULL DEFAULT (datetime('now'))
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rdc_tenant ON receiving_document_carriers(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rdc_document ON receiving_document_carriers(document_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rdc_carrier ON receiving_document_carriers(warehouse_carrier_id)"))
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_receiving_doc_carrier "
                    "ON receiving_document_carriers(document_id, warehouse_carrier_id)"
                )
            )
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS receiving_document_carriers (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        document_id INTEGER NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
                        warehouse_carrier_id INTEGER NOT NULL REFERENCES warehouse_carriers(id) ON DELETE RESTRICT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()))
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rdc_tenant ON receiving_document_carriers(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rdc_document ON receiving_document_carriers(document_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rdc_carrier ON receiving_document_carriers(warehouse_carrier_id)"))
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_receiving_doc_carrier "
                    "ON receiving_document_carriers(document_id, warehouse_carrier_id)"
                )
            )


def ensure_stock_document_item_line_warehouse_carrier_column(engine: Engine) -> None:
    """Linia PZ: faktyczny nośnik przyjęcia (opcjonalnie)."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            t = conn.execute(
                text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_document_items' LIMIT 1")
            ).fetchone()
            if not t:
                conn.commit()
                return
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)")).fetchall()}
            if "warehouse_carrier_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE stock_document_items ADD COLUMN warehouse_carrier_id INTEGER "
                        "REFERENCES warehouse_carriers(id) ON DELETE SET NULL"
                    )
                )
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE stock_document_items
                    ADD COLUMN IF NOT EXISTS warehouse_carrier_id INTEGER
                    REFERENCES warehouse_carriers(id) ON DELETE SET NULL
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_stock_doc_items_line_carrier "
                    "ON stock_document_items(warehouse_carrier_id)"
                )
            )


def ensure_products_receiving_requirements_columns(engine: Engine) -> None:
    """WMS: per-product flags for required master data at receiving."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(products)"))
        columns = {row[1] for row in result}
        specs = [
            ("require_recv_height", "INTEGER NOT NULL DEFAULT 0"),
            ("require_recv_width", "INTEGER NOT NULL DEFAULT 0"),
            ("require_recv_length", "INTEGER NOT NULL DEFAULT 0"),
            ("require_recv_weight", "INTEGER NOT NULL DEFAULT 0"),
            ("require_recv_master_carton", "INTEGER NOT NULL DEFAULT 0"),
            ("require_recv_master_carton_ean", "INTEGER NOT NULL DEFAULT 0"),
            ("require_recv_master_carton_qty", "INTEGER NOT NULL DEFAULT 0"),
            ("require_recv_master_carton_dims", "INTEGER NOT NULL DEFAULT 0"),
            ("require_recv_master_carton_weight", "INTEGER NOT NULL DEFAULT 0"),
        ]
        for col_name, col_def in specs:
            if col_name not in columns:
                conn.execute(text(f"ALTER TABLE products ADD COLUMN {col_name} {col_def}"))
        conn.commit()


def ensure_order_item_pick_allocations_table(engine: Engine) -> None:
    """Normalized pick allocations (location + batch + expiry per order line)."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS order_item_pick_allocations (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        order_id INTEGER NOT NULL,
                        order_item_id INTEGER NOT NULL,
                        product_id INTEGER NOT NULL,
                        pick_id INTEGER,
                        location_id INTEGER NOT NULL,
                        batch_number VARCHAR(128) NOT NULL DEFAULT '',
                        expiry_date DATE NOT NULL DEFAULT '9999-12-31',
                        serial_number VARCHAR(128) NOT NULL DEFAULT '',
                        warehouse_carrier_id INTEGER,
                        quantity REAL NOT NULL,
                        picked_by INTEGER,
                        picked_at DATETIME NOT NULL,
                        created_at DATETIME,
                        updated_at DATETIME,
                        FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                        FOREIGN KEY(warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
                        FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
                        FOREIGN KEY(order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
                        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                        FOREIGN KEY(pick_id) REFERENCES picks(id) ON DELETE SET NULL,
                        FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE SET NULL,
                        FOREIGN KEY(warehouse_carrier_id) REFERENCES warehouse_carriers(id) ON DELETE SET NULL,
                        FOREIGN KEY(picked_by) REFERENCES app_users(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_oipa_order_item "
                    "ON order_item_pick_allocations(order_item_id, picked_at)"
                )
            )
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS order_item_pick_allocations (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                        order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        pick_id INTEGER REFERENCES picks(id) ON DELETE SET NULL,
                        location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE SET NULL,
                        batch_number VARCHAR(128) NOT NULL DEFAULT '',
                        expiry_date DATE NOT NULL DEFAULT '9999-12-31',
                        serial_number VARCHAR(128) NOT NULL DEFAULT '',
                        warehouse_carrier_id INTEGER REFERENCES warehouse_carriers(id) ON DELETE SET NULL,
                        quantity DOUBLE PRECISION NOT NULL,
                        picked_by INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                        picked_at TIMESTAMPTZ NOT NULL,
                        created_at TIMESTAMPTZ,
                        updated_at TIMESTAMPTZ
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_oipa_order_item "
                    "ON order_item_pick_allocations(order_item_id, picked_at)"
                )
            )


def ensure_wms_product_warehouse_operations_traceability_columns(engine: Engine) -> None:
    with engine.connect() as conn:
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wms_product_warehouse_operations' LIMIT 1")
        ).fetchone()
        if not r:
            conn.commit()
            return
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(wms_product_warehouse_operations)")).fetchall()}
        if "batch_number" not in cols:
            conn.execute(text("ALTER TABLE wms_product_warehouse_operations ADD COLUMN batch_number VARCHAR(128)"))
        if "expiry_date" not in cols:
            conn.execute(text("ALTER TABLE wms_product_warehouse_operations ADD COLUMN expiry_date DATE"))
        if "pick_id" not in cols:
            conn.execute(text("ALTER TABLE wms_product_warehouse_operations ADD COLUMN pick_id INTEGER REFERENCES picks(id) ON DELETE SET NULL"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wms_prod_wh_ops_pick ON wms_product_warehouse_operations(pick_id)"))
        conn.commit()


def ensure_warehouse_inventory_movements_table(engine: Engine) -> None:
    """Durable movement ledger for WMS traceability (dual-write with inventory)."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.connect() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS warehouse_inventory_movements (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        product_id INTEGER NOT NULL,
                        variant_id INTEGER,
                        source_document_type VARCHAR(32),
                        source_document_id INTEGER,
                        source_line_id INTEGER,
                        movement_type VARCHAR(32) NOT NULL,
                        quantity REAL NOT NULL,
                        from_location_id INTEGER,
                        to_location_id INTEGER,
                        from_carrier_id INTEGER,
                        to_carrier_id INTEGER,
                        lot_number VARCHAR(128),
                        serial_number VARCHAR(128),
                        expiry_date DATE,
                        inventory_bucket VARCHAR(32) NOT NULL DEFAULT 'sellable',
                        operator_admin_id INTEGER,
                        created_at DATETIME NOT NULL,
                        metadata_json TEXT,
                        FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                        FOREIGN KEY(warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
                        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                        FOREIGN KEY(from_location_id) REFERENCES locations(id) ON DELETE SET NULL,
                        FOREIGN KEY(to_location_id) REFERENCES locations(id) ON DELETE SET NULL,
                        FOREIGN KEY(from_carrier_id) REFERENCES warehouse_carriers(id) ON DELETE SET NULL,
                        FOREIGN KEY(to_carrier_id) REFERENCES warehouse_carriers(id) ON DELETE SET NULL,
                        FOREIGN KEY(operator_admin_id) REFERENCES app_users(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_wh_inv_mov_twp "
                    "ON warehouse_inventory_movements(tenant_id, warehouse_id, product_id, created_at)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_wh_inv_mov_line "
                    "ON warehouse_inventory_movements(source_document_id, source_line_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_wh_inv_mov_operator "
                    "ON warehouse_inventory_movements(tenant_id, operator_admin_id, created_at)"
                )
            )
            conn.commit()
        return
    if dialect == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS warehouse_inventory_movements (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        variant_id INTEGER,
                        source_document_type VARCHAR(32),
                        source_document_id INTEGER,
                        source_line_id INTEGER,
                        movement_type VARCHAR(32) NOT NULL,
                        quantity DOUBLE PRECISION NOT NULL,
                        from_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        to_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                        from_carrier_id INTEGER REFERENCES warehouse_carriers(id) ON DELETE SET NULL,
                        to_carrier_id INTEGER REFERENCES warehouse_carriers(id) ON DELETE SET NULL,
                        lot_number VARCHAR(128),
                        serial_number VARCHAR(128),
                        expiry_date DATE,
                        inventory_bucket VARCHAR(32) NOT NULL DEFAULT 'sellable',
                        operator_admin_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
                        metadata_json TEXT
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_wh_inv_mov_twp "
                    "ON warehouse_inventory_movements(tenant_id, warehouse_id, product_id, created_at)"
                )
            )
            conn.commit()

