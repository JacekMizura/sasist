"""WMS global product validation settings + per-product skip overrides."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table


WMS_VALIDATION_COLUMNS: tuple[tuple[str, str], ...] = (
    ("validation_policy_migrated", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_require_dimensions", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_require_weight", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_require_batch", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_require_expiry", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_require_serial", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_require_master_carton", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_require_master_carton_ean", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_require_master_carton_qty", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_require_master_carton_dims", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_require_master_carton_weight", "BOOLEAN NOT NULL DEFAULT false"),
)

PRODUCT_SKIP_COLUMNS: tuple[tuple[str, str], ...] = (
    ("validation_skip_dimensions", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_skip_weight", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_skip_batch", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_skip_expiry", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_skip_serial", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_skip_master_carton", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_skip_master_carton_ean", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_skip_master_carton_qty", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_skip_master_carton_dims", "BOOLEAN NOT NULL DEFAULT false"),
    ("validation_skip_master_carton_weight", "BOOLEAN NOT NULL DEFAULT false"),
)


def _add_columns(engine: Engine, table: str, columns: tuple[tuple[str, str], ...]) -> None:
    if not has_table(engine, table):
        return
    existing = set(get_table_column_names(engine, table))
    with engine.begin() as conn:
        for name, ddl in columns:
            if name in existing:
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def _migrate_legacy_product_flags_to_global(engine: Engine) -> None:
    if not has_table(engine, "wms_settings") or not has_table(engine, "products"):
        return
    cols = set(get_table_column_names(engine, "wms_settings"))
    if "validation_policy_migrated" not in cols:
        return

    with engine.begin() as conn:
        already = conn.execute(
            text("SELECT COUNT(*) FROM wms_settings WHERE validation_policy_migrated = true")
        ).scalar()
        if int(already or 0) > 0:
            return

        settings_rows = conn.execute(
            text("SELECT id, tenant_id, warehouse_id FROM wms_settings ORDER BY tenant_id, warehouse_id")
        ).fetchall()
        if not settings_rows:
            tenant_ids = [
                int(r[0])
                for r in conn.execute(
                    text("SELECT DISTINCT tenant_id FROM products WHERE tenant_id IS NOT NULL")
                ).fetchall()
            ]
            for tid in tenant_ids:
                conn.execute(
                    text(
                        "INSERT INTO wms_settings (tenant_id, warehouse_id, returns_mode, require_photos, "
                        "require_condition, enable_refund, inventory_management_mode) "
                        "SELECT :tid, MIN(id), 'simple', false, false, false, 'HYBRID' FROM warehouses "
                        "WHERE tenant_id = :tid"
                    ),
                    {"tid": tid},
                )
            settings_rows = conn.execute(
                text("SELECT id, tenant_id, warehouse_id FROM wms_settings ORDER BY tenant_id, warehouse_id")
            ).fetchall()

        for row in settings_rows:
            sid, tenant_id = int(row[0]), int(row[1])
            agg = conn.execute(
                text(
                    """
                    SELECT
                      MAX(CASE WHEN require_recv_height OR require_recv_width OR require_recv_length THEN 1 ELSE 0 END),
                      MAX(CASE WHEN require_recv_weight THEN 1 ELSE 0 END),
                      MAX(CASE WHEN track_batch THEN 1 ELSE 0 END),
                      MAX(CASE WHEN track_expiry THEN 1 ELSE 0 END),
                      MAX(CASE WHEN track_serial THEN 1 ELSE 0 END),
                      MAX(CASE WHEN require_recv_master_carton THEN 1 ELSE 0 END),
                      MAX(CASE WHEN require_recv_master_carton_ean THEN 1 ELSE 0 END),
                      MAX(CASE WHEN require_recv_master_carton_qty THEN 1 ELSE 0 END),
                      MAX(CASE WHEN require_recv_master_carton_dims THEN 1 ELSE 0 END),
                      MAX(CASE WHEN require_recv_master_carton_weight THEN 1 ELSE 0 END)
                    FROM products
                    WHERE tenant_id = :tid AND (deleted_at IS NULL)
                    """
                ),
                {"tid": tenant_id},
            ).fetchone()
            if not agg:
                continue
            conn.execute(
                text(
                    """
                    UPDATE wms_settings SET
                      validation_require_dimensions = :dims,
                      validation_require_weight = :weight,
                      validation_require_batch = :batch,
                      validation_require_expiry = :expiry,
                      validation_require_serial = :serial,
                      validation_require_master_carton = :mc,
                      validation_require_master_carton_ean = :mc_ean,
                      validation_require_master_carton_qty = :mc_qty,
                      validation_require_master_carton_dims = :mc_dims,
                      validation_require_master_carton_weight = :mc_weight,
                      validation_policy_migrated = true
                    WHERE id = :sid
                    """
                ),
                {
                    "sid": sid,
                    "dims": bool(agg[0]),
                    "weight": bool(agg[1]),
                    "batch": bool(agg[2]),
                    "expiry": bool(agg[3]),
                    "serial": bool(agg[4]),
                    "mc": bool(agg[5]),
                    "mc_ean": bool(agg[6]),
                    "mc_qty": bool(agg[7]),
                    "mc_dims": bool(agg[8]),
                    "mc_weight": bool(agg[9]),
                },
            )

            if bool(agg[0]):
                conn.execute(
                    text(
                        """
                        UPDATE products SET validation_skip_dimensions = NOT (
                          require_recv_height OR require_recv_width OR require_recv_length
                        )
                        WHERE tenant_id = :tid AND (deleted_at IS NULL)
                        """
                    ),
                    {"tid": tenant_id},
                )
            if bool(agg[1]):
                conn.execute(
                    text(
                        "UPDATE products SET validation_skip_weight = NOT require_recv_weight "
                        "WHERE tenant_id = :tid AND (deleted_at IS NULL)"
                    ),
                    {"tid": tenant_id},
                )
            if bool(agg[2]):
                conn.execute(
                    text(
                        "UPDATE products SET validation_skip_batch = NOT track_batch "
                        "WHERE tenant_id = :tid AND (deleted_at IS NULL)"
                    ),
                    {"tid": tenant_id},
                )
            if bool(agg[3]):
                conn.execute(
                    text(
                        "UPDATE products SET validation_skip_expiry = NOT track_expiry "
                        "WHERE tenant_id = :tid AND (deleted_at IS NULL)"
                    ),
                    {"tid": tenant_id},
                )
            if bool(agg[4]):
                conn.execute(
                    text(
                        "UPDATE products SET validation_skip_serial = NOT track_serial "
                        "WHERE tenant_id = :tid AND (deleted_at IS NULL)"
                    ),
                    {"tid": tenant_id},
                )
            if bool(agg[5]):
                conn.execute(
                    text(
                        "UPDATE products SET validation_skip_master_carton = NOT require_recv_master_carton "
                        "WHERE tenant_id = :tid AND (deleted_at IS NULL)"
                    ),
                    {"tid": tenant_id},
                )
            if bool(agg[6]):
                conn.execute(
                    text(
                        "UPDATE products SET validation_skip_master_carton_ean = NOT require_recv_master_carton_ean "
                        "WHERE tenant_id = :tid AND (deleted_at IS NULL)"
                    ),
                    {"tid": tenant_id},
                )
            if bool(agg[7]):
                conn.execute(
                    text(
                        "UPDATE products SET validation_skip_master_carton_qty = NOT require_recv_master_carton_qty "
                        "WHERE tenant_id = :tid AND (deleted_at IS NULL)"
                    ),
                    {"tid": tenant_id},
                )
            if bool(agg[8]):
                conn.execute(
                    text(
                        "UPDATE products SET validation_skip_master_carton_dims = NOT require_recv_master_carton_dims "
                        "WHERE tenant_id = :tid AND (deleted_at IS NULL)"
                    ),
                    {"tid": tenant_id},
                )
            if bool(agg[9]):
                conn.execute(
                    text(
                        "UPDATE products SET validation_skip_master_carton_weight = NOT require_recv_master_carton_weight "
                        "WHERE tenant_id = :tid AND (deleted_at IS NULL)"
                    ),
                    {"tid": tenant_id},
                )


def ensure_wms_product_validation_schema(engine: Engine) -> None:
    _add_columns(engine, "wms_settings", WMS_VALIDATION_COLUMNS)
    _add_columns(engine, "products", PRODUCT_SKIP_COLUMNS)
    _migrate_legacy_product_flags_to_global(engine)
