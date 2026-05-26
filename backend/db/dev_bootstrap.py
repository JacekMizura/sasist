"""
Full development database reset: drop all data, rebuild schema, seed minimal panel + WMS defaults.

SQLite (default): deletes ``backend/test.db`` (+ WAL/SHM).
PostgreSQL: optional when ``DATABASE_URL`` points at Postgres — ``DROP SCHEMA public CASCADE``.
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Iterable, List

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[2]


def project_root() -> Path:
    return _PROJECT_ROOT


def sqlite_db_paths() -> List[Path]:
    """``backend/test.db`` (+ WAL/SHM) — same path as ``database.py``, without opening a connection."""
    base = _PROJECT_ROOT / "backend" / "test.db"
    return [
        base,
        base.parent / f"{base.name}-wal",
        base.parent / f"{base.name}-shm",
        base.parent / f"{base.name}-journal",
    ]


def _dispose_sqlite_engine_pool() -> None:
    try:
        from ..database import engine

        engine.dispose()
    except Exception:
        pass


def delete_sqlite_files(paths: Iterable[Path] | None = None) -> List[Path]:
    """Remove SQLite database file and sidecar files. Returns paths that were removed."""
    _dispose_sqlite_engine_pool()
    removed: List[Path] = []
    targets = list(paths or sqlite_db_paths())
    errors: List[str] = []
    for path in targets:
        if not path.exists():
            continue
        try:
            path.unlink()
            removed.append(path)
            logger.info("Removed %s", path)
        except OSError as exc:
            errors.append(f"{path}: {exc}")
    if errors:
        raise PermissionError(
            "Could not delete SQLite file(s) — stop uvicorn/backend and close DB browsers, then retry.\n"
            + "\n".join(errors)
        )
    return removed


def wipe_sqlite_all_tables(engine: Engine) -> None:
    """
    Drop every user table in SQLite (full data wipe when the .db file cannot be unlinked).

    Use only for dev reset when uvicorn still holds the file open; prefer delete_sqlite_files().
    """
    if engine.dialect.name != "sqlite":
        raise ValueError(f"wipe_sqlite_all_tables requires SQLite, got {engine.dialect.name}")
    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        table_rows = conn.execute(
            text(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        ).fetchall()
        for (name,) in table_rows:
            conn.execute(text(f'DROP TABLE IF EXISTS "{name}"'))
        try:
            conn.execute(text("DELETE FROM sqlite_sequence"))
        except Exception:
            pass
    with engine.begin() as conn:
        conn.execute(text("VACUUM"))
    logger.warning(
        "SQLite: dropped all tables in-place (%d tables). Schema will be recreated by bootstrap.",
        len(table_rows),
    )


def drop_postgresql_public_schema(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        raise ValueError(f"Expected PostgreSQL engine, got {engine.dialect.name}")
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO CURRENT_USER"))
    logger.info("PostgreSQL: recreated empty public schema")


def clear_dev_artifacts(*, clear_uploads: bool = True) -> None:
    """Remove local uploads and pytest caches (no business DB data)."""
    if clear_uploads:
        uploads = _PROJECT_ROOT / "backend" / "uploads"
        if uploads.is_dir():
            for child in uploads.iterdir():
                if child.name == ".gitkeep":
                    continue
                if child.is_dir():
                    shutil.rmtree(child, ignore_errors=True)
                elif child.is_file():
                    child.unlink(missing_ok=True)
            logger.info("Cleared uploads under %s", uploads)

    for cache_dir in (_PROJECT_ROOT / ".pytest_cache", _PROJECT_ROOT / "backend" / ".pytest_cache"):
        if cache_dir.is_dir():
            shutil.rmtree(cache_dir, ignore_errors=True)
            logger.info("Removed %s", cache_dir)


def bootstrap_database(*, seed: bool = True) -> None:
    """
    Create tables + run the same schema upgrades and seeds as FastAPI startup.

    Call only after the database file was removed (SQLite) or schema dropped (Postgres).
    """
    from ..main import upgrade_schema

    logger.info("Running schema upgrade + seed (upgrade_schema)…")
    upgrade_schema()
    if seed:
        from ..database import SessionLocal
        from .seed_basic_data import seed_wms_panel_defaults

        db = SessionLocal()
        try:
            seed_wms_panel_defaults(db)
        finally:
            db.close()
    logger.info("Bootstrap finished")


def verify_dev_database() -> dict[str, int | str | bool]:
    """Sanity checks after reset — tables exist, panel tenant and admin present."""
    from ..database import SessionLocal, engine
    from ..models.app_user import AppUser
    from ..models.tenant import Tenant
    from ..models.tenant_warehouse import TenantWarehouse
    from ..models.wms_packing_settings import WmsPackingSettings

    insp = inspect(engine)
    table_names = set(insp.get_table_names())
    required_tables = {
        "tenants",
        "warehouses",
        "tenant_warehouses",
        "app_users",
        "wms_operational_tasks",
        "order_ui_statuses",
        "return_statuses",
        "wms_packing_settings",
    }
    missing = sorted(required_tables - table_names)

    db = SessionLocal()
    try:
        tenant_ok = db.query(Tenant).filter(Tenant.id == 1).first() is not None
        tw_count = db.query(TenantWarehouse).filter(TenantWarehouse.tenant_id == 1).count()
        admin = db.query(AppUser).filter(AppUser.role.in_(["super_admin", "superadmin"])).first()
        packing = (
            db.query(WmsPackingSettings)
            .filter(WmsPackingSettings.tenant_id == 1)
            .count()
        )
    finally:
        db.close()

    return {
        "dialect": engine.dialect.name,
        "tables_ok": len(missing) == 0,
        "missing_tables": ", ".join(missing) if missing else "",
        "tenant_1": bool(tenant_ok),
        "tenant_warehouses": int(tw_count),
        "admin_user": admin.login if admin else "",
        "wms_packing_settings_rows": int(packing),
    }


def reset_dev_environment(
    *,
    seed: bool = True,
    clear_uploads: bool = True,
    database_url: str | None = None,
    force_in_place: bool = False,
) -> dict[str, int | str | bool]:
    """
    Full dev reset: wipe DB, rebuild schema, seed, clear local artifacts.

    Stop the running API process first so SQLite files are not locked.
    """
    url = (database_url or os.environ.get("DATABASE_URL") or "").strip()

    if url.startswith("postgresql"):
        from sqlalchemy import create_engine

        pg_engine = create_engine(url)
        try:
            drop_postgresql_public_schema(pg_engine)
        finally:
            pg_engine.dispose()
        os.environ["DATABASE_URL"] = url
        logger.warning(
            "PostgreSQL reset: set DATABASE_URL before starting the app; "
            "backend/database.py defaults to SQLite unless you wire env URL."
        )
    else:
        try:
            delete_sqlite_files()
        except PermissionError:
            if not force_in_place:
                raise PermissionError(
                    "SQLite database file is locked. Stop the API process, then rerun.\n"
                    "If the API must stay up briefly, use: python scripts/reset_dev_db.py --force-in-place"
                ) from None
            from ..database import engine

            wipe_sqlite_all_tables(engine)
            engine.dispose()

    clear_dev_artifacts(clear_uploads=clear_uploads)
    bootstrap_database(seed=seed)
    summary = verify_dev_database()
    logger.info("Verification: %s", summary)
    if not summary.get("tables_ok") or not summary.get("tenant_1"):
        raise RuntimeError(f"Dev DB verification failed: {summary}")
    return summary
