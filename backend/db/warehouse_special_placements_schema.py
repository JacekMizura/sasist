"""Schema ensure + data migration for warehouse_special_placements."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import ensure_model_table_from_orm, has_table, sync_model_schema

logger = logging.getLogger(__name__)

WAREHOUSE_SPECIAL_PLACEMENTS_SCHEMA_VERSION = "2026.07.26.special_placements.1"

_SPECIAL_ROLES = ("PICK_START", "PACKING", "DOCK")
_PREFERRED_NAMES = {
    "PICK_START": ("START",),
    "PACKING": ("PACK", "PACKING"),
    "DOCK": ("DOCK",),
}


def ensure_warehouse_special_placements_schema(engine: Engine) -> None:
    from ..models.warehouse_special_placement import WarehouseSpecialPlacement

    ensure_model_table_from_orm(
        engine, WarehouseSpecialPlacement, log_prefix="schema.special_placements"
    )
    sync_model_schema(
        engine,
        WarehouseSpecialPlacement,
        log_prefix="schema.special_placements",
        sync_indexes=True,
        sync_foreign_keys=True,
    )
    _migrate_special_locations_to_placements(engine)
    logger.info(
        "[schema.special_placements] ensured version=%s dialect=%s",
        WAREHOUSE_SPECIAL_PLACEMENTS_SCHEMA_VERSION,
        engine.dialect.name,
    )


def _migrate_special_locations_to_placements(engine: Engine) -> None:
    """Copy map markers from locations → placements; clear special geometry on locations."""
    if not has_table(engine, "locations") or not has_table(engine, "warehouse_special_placements"):
        return

    with engine.begin() as conn:
        already = {
            (int(r[0]), str(r[1]))
            for r in conn.execute(
                text("SELECT warehouse_id, role FROM warehouse_special_placements")
            ).fetchall()
        }

        rows = conn.execute(
            text(
                """
                SELECT id, warehouse_id, location_type, name, x, y
                FROM locations
                WHERE location_type IN ('PICK_START', 'PACKING', 'DOCK')
                ORDER BY warehouse_id, location_type, id
                """
            )
        ).fetchall()

        # Pick one location per (warehouse_id, role): prefer designer names, then coords, then lowest id.
        best: dict[tuple[int, str], tuple] = {}
        for row in rows:
            loc_id, wid, role, name, x, y = row
            role_s = str(role or "").strip().upper()
            if role_s not in _SPECIAL_ROLES:
                continue
            key = (int(wid), role_s)
            if key in already:
                continue
            name_u = str(name or "").strip().upper()
            preferred = name_u in _PREFERRED_NAMES.get(role_s, ())
            has_xy = x is not None or y is not None
            score = (1 if preferred else 0, 1 if has_xy else 0, -int(loc_id))
            prev = best.get(key)
            if prev is None or score > prev[0]:
                best[key] = (score, loc_id, wid, role_s, x, y)

        now = datetime.utcnow()
        inserted = 0
        for (_score, loc_id, wid, role_s, x, y) in best.values():
            conn.execute(
                text(
                    """
                    INSERT INTO warehouse_special_placements
                        (warehouse_id, role, x_cm, y_cm, rotation, location_id, metadata_json, created_at, updated_at)
                    VALUES
                        (:warehouse_id, :role, :x_cm, :y_cm, 0, :location_id, NULL, :created_at, :updated_at)
                    """
                ),
                {
                    "warehouse_id": int(wid),
                    "role": role_s,
                    "x_cm": float(x if x is not None else 0),
                    "y_cm": float(y if y is not None else 0),
                    "location_id": int(loc_id),
                    "created_at": now,
                    "updated_at": now,
                },
            )
            inserted += 1

        _clear_special_geometry_on_locations(conn)
        if inserted:
            logger.info(
                "[schema.special_placements] migrated %s placements from locations",
                inserted,
            )


def _clear_special_geometry_on_locations(conn) -> None:
    """Map geometry for specials lives only on placements — null out locations.x/y/z."""
    conn.execute(
        text(
            """
            UPDATE locations
            SET x = NULL, y = NULL, z = NULL
            WHERE location_type IN ('PICK_START', 'PACKING', 'DOCK')
              AND (x IS NOT NULL OR y IS NOT NULL OR z IS NOT NULL)
            """
        )
    )
