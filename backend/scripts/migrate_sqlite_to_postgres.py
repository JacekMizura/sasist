"""One-time SQLite -> PostgreSQL data migration.

Copies data from ``backend/test.db`` into the current PostgreSQL
``DATABASE_URL`` used by the backend SQLAlchemy configuration.

Run manually from the repository root, for example:

    python -m backend.scripts.migrate_sqlite_to_postgres --yes

The script intentionally uses the existing ORM metadata/models for table
ordering and target table definitions. It does not modify application models
or business logic.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable

from sqlalchemy import MetaData, create_engine, func, inspect, select, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.schema import Table


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
SQLITE_DB_PATH = BACKEND_DIR / "test.db"
SQLITE_URL = f"sqlite:///{SQLITE_DB_PATH.as_posix()}"

# Keep migration/versioning tables untouched even if they exist in either DB.
SKIP_TABLE_NAMES = {
    "alembic_version",
    "schema_migrations",
    "migrations",
}

CHUNK_SIZE = 1_000


def _import_backend_metadata():
    """Import backend models so Base.metadata is fully populated."""
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))

    # Importing models registers all ORM tables on Base.metadata.
    import backend.models  # noqa: F401
    from backend.database import Base, DATABASE_URL

    return Base.metadata, DATABASE_URL


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def _iter_migration_tables(metadata: MetaData) -> list[Table]:
    return [table for table in metadata.sorted_tables if table.name not in SKIP_TABLE_NAMES]


def _table_label(table: Table) -> str:
    return f"{table.schema}.{table.name}" if table.schema else table.name


def _qualified_pg_table_name(table: Table) -> str:
    # pg_get_serial_sequence accepts schema-qualified names as text.
    return _table_label(table)


def _confirm_or_exit(source_url: str, target_url: str, assume_yes: bool) -> None:
    print("SQLite -> PostgreSQL one-time migration")
    print(f"Source: {source_url}")
    print(f"Target: {target_url}")
    print()
    print("WARNING: all ORM metadata tables in the PostgreSQL target will be cleared before import.")

    if assume_yes:
        print("Confirmation skipped because --yes was provided.")
        return

    answer = input("Type IMPORT to continue: ").strip()
    if answer != "IMPORT":
        raise SystemExit("Aborted.")


def _reflect_sqlite_metadata(source_engine: Engine) -> MetaData:
    source_metadata = MetaData()
    source_metadata.reflect(bind=source_engine)
    skipped = sorted(name for name in source_metadata.tables if name in SKIP_TABLE_NAMES)
    if skipped:
        print(f"Skipping migration tables found in SQLite: {', '.join(skipped)}")
    return source_metadata


def _check_target_tables(target_engine: Engine, tables: Iterable[Table]) -> None:
    inspector = inspect(target_engine)
    missing: list[str] = []
    for table in tables:
        if not inspector.has_table(table.name, schema=table.schema):
            missing.append(_table_label(table))
    if missing:
        joined = "\n  - ".join(missing)
        raise RuntimeError(
            "Target PostgreSQL database is missing ORM tables. "
            "Create/update the schema before running this migration:\n"
            f"  - {joined}"
        )


def _clear_postgres_tables(conn: Connection, tables: list[Table]) -> None:
    print("\nClearing PostgreSQL tables...")
    for table in reversed(tables):
        result = conn.execute(table.delete())
        count = result.rowcount if result.rowcount is not None and result.rowcount >= 0 else "unknown"
        print(f"  cleared {_table_label(table)} ({count} rows)")


def _source_select(source_table: Table):
    stmt = select(source_table)
    pk_columns = list(source_table.primary_key.columns)
    if pk_columns:
        stmt = stmt.order_by(*pk_columns)
    return stmt


def _copy_table(
    source_conn: Connection,
    target_conn: Connection,
    source_metadata: MetaData,
    target_table: Table,
) -> int:
    source_table = source_metadata.tables.get(target_table.name)
    if source_table is None:
        print(f"  skipped {_table_label(target_table)} (missing in SQLite)")
        return 0

    target_column_names = {column.name for column in target_table.columns}
    source_column_names = {column.name for column in source_table.columns}
    shared_columns = [name for name in source_table.columns.keys() if name in target_column_names]

    if not shared_columns:
        print(f"  skipped {_table_label(target_table)} (no shared columns)")
        return 0

    missing_in_source = sorted(target_column_names - source_column_names)
    if missing_in_source:
        print(
            f"  note {_table_label(target_table)}: SQLite missing target columns "
            f"{', '.join(missing_in_source)}; PostgreSQL defaults/nulls will be used"
        )

    total = 0
    batch: list[dict[str, object]] = []

    for row in source_conn.execute(_source_select(source_table)).mappings():
        batch.append({name: row[name] for name in shared_columns})
        if len(batch) >= CHUNK_SIZE:
            target_conn.execute(target_table.insert(), batch)
            total += len(batch)
            batch.clear()

    if batch:
        target_conn.execute(target_table.insert(), batch)
        total += len(batch)

    print(f"  imported {_table_label(target_table)} ({total} rows)")
    return total


def _reset_postgres_sequences(conn: Connection, tables: list[Table]) -> None:
    print("\nResetting PostgreSQL sequences...")
    for table in tables:
        single_pk = list(table.primary_key.columns)
        if len(single_pk) != 1:
            continue

        pk = single_pk[0]
        sequence_name = conn.execute(
            text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
            {
                "table_name": _qualified_pg_table_name(table),
                "column_name": pk.name,
            },
        ).scalar()
        if not sequence_name:
            continue

        max_id = conn.execute(select(func.max(table.c[pk.name]))).scalar()
        if max_id is None:
            conn.execute(
                text("SELECT setval(CAST(:sequence_name AS regclass), 1, false)"),
                {"sequence_name": sequence_name},
            )
            print(f"  reset {_table_label(table)}.{pk.name} sequence to empty")
        else:
            conn.execute(
                text("SELECT setval(CAST(:sequence_name AS regclass), :value, true)"),
                {"sequence_name": sequence_name, "value": int(max_id)},
            )
            print(f"  reset {_table_label(table)}.{pk.name} sequence to {max_id}")


def migrate(assume_yes: bool) -> None:
    if not SQLITE_DB_PATH.exists():
        raise FileNotFoundError(f"SQLite database not found: {SQLITE_DB_PATH}")

    metadata, raw_database_url = _import_backend_metadata()
    target_url = _normalize_database_url(raw_database_url)

    if target_url.startswith("sqlite"):
        raise RuntimeError(
            "DATABASE_URL points to SQLite. Set DATABASE_URL to the PostgreSQL target before running."
        )
    if not target_url.startswith("postgresql"):
        raise RuntimeError(f"DATABASE_URL must point to PostgreSQL, got: {target_url}")

    _confirm_or_exit(SQLITE_URL, target_url, assume_yes)

    source_engine = create_engine(SQLITE_URL)
    target_engine = create_engine(target_url)
    tables = _iter_migration_tables(metadata)

    source_metadata = _reflect_sqlite_metadata(source_engine)
    _check_target_tables(target_engine, tables)

    try:
        with source_engine.connect() as source_conn, target_engine.begin() as target_conn:
            _clear_postgres_tables(target_conn, tables)

            print("\nImporting tables...")
            total_rows = 0
            for table in tables:
                total_rows += _copy_table(source_conn, target_conn, source_metadata, table)

            _reset_postgres_sequences(target_conn, tables)

        print(f"\nDone. Imported {total_rows} rows into PostgreSQL.")
    except SQLAlchemyError as exc:
        raise RuntimeError(f"Migration failed and PostgreSQL transaction was rolled back: {exc}") from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy all ORM table data from backend/test.db into PostgreSQL DATABASE_URL."
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Run without interactive confirmation.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    migrate(assume_yes=args.yes)
