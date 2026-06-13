"""user_warehouse_assignments + user_wms_profiles.active_warehouse_id."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

USER_WAREHOUSE_ASSIGNMENT_SCHEMA_VERSION = "2026.06.08.uwa"


def _add_nullable_column(engine: Engine, table: str, column: str, ddl_sqlite: str, ddl_pg: str) -> None:
    if not has_table(engine, table):
        return
    if column in get_table_column_names(engine, table):
        return
    ddl = ddl_pg if engine.dialect.name == "postgresql" else ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[user_warehouse_assignment] added %s.%s", table, column)


def ensure_user_warehouse_assignment_schema(engine: Engine) -> None:
    dialect = engine.dialect.name
    if not has_table(engine, "user_warehouse_assignments"):
        if dialect == "postgresql":
            ddl = """
            CREATE TABLE user_warehouse_assignments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
                warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                is_default BOOLEAN NOT NULL DEFAULT false,
                can_operate BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_user_warehouse_assignment UNIQUE (user_id, warehouse_id)
            )
            """
        else:
            ddl = """
            CREATE TABLE user_warehouse_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                warehouse_id INTEGER NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                can_operate INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES app_users(id) ON DELETE CASCADE,
                FOREIGN KEY(warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
                UNIQUE (user_id, warehouse_id)
            )
            """
        with engine.begin() as conn:
            conn.execute(text(ddl))
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_user_warehouse_assignments_user "
                    "ON user_warehouse_assignments(user_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_user_warehouse_assignments_warehouse "
                    "ON user_warehouse_assignments(warehouse_id)"
                )
            )
        logger.info("[user_warehouse_assignment] created user_warehouse_assignments")

    _add_nullable_column(
        engine,
        "user_wms_profiles",
        "active_warehouse_id",
        "ALTER TABLE user_wms_profiles ADD COLUMN active_warehouse_id INTEGER NULL",
        "ALTER TABLE user_wms_profiles ADD COLUMN active_warehouse_id INTEGER NULL",
    )

    if not has_table(engine, "user_warehouse_assignments"):
        return

    _backfill_from_legacy(engine)


def _backfill_from_legacy(engine: Engine) -> None:
    from ..database import SessionLocal
    from ..models.app_user import AppUserWarehouse, UserWmsProfile
    from ..models.user_warehouse_assignment import UserWarehouseAssignment

    db = SessionLocal()
    try:
        existing = db.query(UserWarehouseAssignment.id).limit(1).first()
        if existing is not None:
            return

        legacy_rows = db.query(AppUserWarehouse).all()
        if not legacy_rows:
            return

        profile_defaults: dict[int, int | None] = {}
        for p in db.query(UserWmsProfile.user_id, UserWmsProfile.default_warehouse_id).all():
            profile_defaults[int(p[0])] = int(p[1]) if p[1] is not None else None

        by_user: dict[int, list[int]] = {}
        for row in legacy_rows:
            by_user.setdefault(int(row.user_id), []).append(int(row.warehouse_id))

        for user_id, wh_ids in by_user.items():
            default_id = profile_defaults.get(user_id)
            if default_id is not None and default_id not in wh_ids:
                wh_ids = [*wh_ids, default_id]
            if default_id is None and wh_ids:
                default_id = wh_ids[0]
            for wid in sorted(set(wh_ids)):
                db.add(
                    UserWarehouseAssignment(
                        user_id=user_id,
                        warehouse_id=wid,
                        is_default=bool(default_id is not None and wid == default_id),
                        can_operate=True,
                    )
                )
        db.commit()
        logger.info("[user_warehouse_assignment] backfilled %s users from app_user_warehouses", len(by_user))
    except Exception:
        db.rollback()
        logger.exception("[user_warehouse_assignment] backfill failed")
    finally:
        db.close()
