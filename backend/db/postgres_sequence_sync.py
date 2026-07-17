"""
Idempotent PostgreSQL SERIAL/IDENTITY sequence sync vs MAX(primary key).

After SQLite→PostgreSQL migration or bulk import with explicit PK values, sequences
can lag behind MAX(id). Next INSERT then collides on the primary key.

Startup and migration scripts call ``ensure_postgres_sequences_synced(engine)``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy import BigInteger, Integer, SmallInteger, func, select, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.schema import Column, Table
from sqlalchemy.sql.schema import MetaData

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SequenceSyncResult:
    table: str
    column: str
    sequence: str
    max_id: int | None
    last_value: int | None
    is_called: bool | None
    next_value: int | None
    action: str  # ok | fixed | skipped_no_sequence | skipped_composite_pk | error


@dataclass
class SequenceSyncReport:
    dialect: str
    checked: int = 0
    fixed: int = 0
    ok: int = 0
    skipped: int = 0
    errors: int = 0
    results: list[SequenceSyncResult] = field(default_factory=list)


def _qualified_table_name(table: Table) -> str:
    if table.schema:
        return f"{table.schema}.{table.name}"
    return table.name


def _parse_pg_sequence_name(sequence_fq: str) -> tuple[str, str]:
    raw = sequence_fq.strip().strip('"')
    if "." in raw:
        schema, name = raw.rsplit(".", 1)
        return schema.strip('"'), name.strip('"')
    return "public", raw


def _is_integer_pk_column(column: Column) -> bool:
    return isinstance(column.type, (Integer, BigInteger, SmallInteger))


def next_sequence_value(last_value: int, *, is_called: bool) -> int:
    return int(last_value) + 1 if is_called else int(last_value)


def sequence_needs_fix(
    max_id: int | None,
    last_value: int | None,
    *,
    is_called: bool | None,
) -> bool:
    if last_value is None or is_called is None:
        return False
    if max_id is None or int(max_id) <= 0:
        return next_sequence_value(int(last_value), is_called=is_called) != 1
    return next_sequence_value(int(last_value), is_called=is_called) <= int(max_id)


def _read_sequence_state(conn: Connection, sequence_fq: str) -> tuple[int, bool] | None:
    """
    Odczyt last_value + is_called.

    ``pg_catalog.pg_sequences`` (PG 10+) ma ``last_value``, ale **nie** ma ``is_called``.
    Flaga ``is_called`` jest wyłącznie w relacji sekwencji:
    ``SELECT last_value, is_called FROM schema.seq_name``.
    """
    schema, name = _parse_pg_sequence_name(sequence_fq)
    # Bezpieczne identyfikatory: tylko znaki dozwolone w nazwach PG
    if not all(c.isalnum() or c == "_" for c in schema) or not all(
        c.isalnum() or c == "_" for c in name
    ):
        logger.error(
            "[postgres_sequence_sync] unsafe sequence identifier schema=%r name=%r",
            schema,
            name,
        )
        return None
    row = conn.execute(
        text(f'SELECT last_value, is_called FROM "{schema}"."{name}"'),
    ).fetchone()
    if row is None:
        return None
    return int(row[0]), bool(row[1])


def _apply_sequence_fix(conn: Connection, sequence_fq: str, max_id: int | None) -> None:
    if max_id is None or int(max_id) <= 0:
        conn.execute(
            text("SELECT setval(CAST(:sequence_name AS regclass), 1, false)"),
            {"sequence_name": sequence_fq},
        )
        return
    conn.execute(
        text("SELECT setval(CAST(:sequence_name AS regclass), :value, true)"),
        {"sequence_name": sequence_fq, "value": int(max_id)},
    )


def _sync_table_sequence(conn: Connection, table: Table) -> SequenceSyncResult:
    table_label = _qualified_table_name(table)
    pk_columns = list(table.primary_key.columns)
    if len(pk_columns) != 1:
        return SequenceSyncResult(
            table=table_label,
            column="",
            sequence="",
            max_id=None,
            last_value=None,
            is_called=None,
            next_value=None,
            action="skipped_composite_pk",
        )

    pk = pk_columns[0]
    if not _is_integer_pk_column(pk):
        return SequenceSyncResult(
            table=table_label,
            column=pk.name,
            sequence="",
            max_id=None,
            last_value=None,
            is_called=None,
            next_value=None,
            action="skipped_non_integer_pk",
        )

    sequence_fq = conn.execute(
        text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
        {"table_name": table_label, "column_name": pk.name},
    ).scalar()
    if not sequence_fq:
        return SequenceSyncResult(
            table=table_label,
            column=pk.name,
            sequence="",
            max_id=None,
            last_value=None,
            is_called=None,
            next_value=None,
            action="skipped_no_sequence",
        )

    max_id = conn.execute(select(func.max(table.c[pk.name]))).scalar()
    max_id_int = int(max_id) if max_id is not None else None
    seq_state = _read_sequence_state(conn, str(sequence_fq))
    if seq_state is None:
        return SequenceSyncResult(
            table=table_label,
            column=pk.name,
            sequence=str(sequence_fq),
            max_id=max_id_int,
            last_value=None,
            is_called=None,
            next_value=None,
            action="error",
        )

    last_value, is_called = seq_state
    next_val = next_sequence_value(last_value, is_called=is_called)
    needs_fix = sequence_needs_fix(max_id_int, last_value, is_called=is_called)
    action = "ok"
    if needs_fix:
        _apply_sequence_fix(conn, str(sequence_fq), max_id_int)
        action = "fixed"
        if max_id_int is None or max_id_int <= 0:
            next_val = 1
        else:
            next_val = max_id_int + 1
        logger.info(
            "[postgres_sequence_sync] fixed table=%s column=%s sequence=%s max_id=%s next_value=%s",
            table_label,
            pk.name,
            sequence_fq,
            max_id_int if max_id_int is not None else "NULL",
            next_val,
        )

    return SequenceSyncResult(
        table=table_label,
        column=pk.name,
        sequence=str(sequence_fq),
        max_id=max_id_int,
        last_value=last_value,
        is_called=is_called,
        next_value=next_val,
        action=action,
    )


def ensure_postgres_sequences_synced(
    engine: Engine,
    *,
    metadata: MetaData | None = None,
    table_names: list[str] | None = None,
) -> SequenceSyncReport:
    """
    Sync every ORM table with a single integer PK backed by a PostgreSQL sequence.

    Idempotent: safe to run on every startup and after data migration.
    No-op on SQLite and other non-PostgreSQL dialects.
    """
    dialect = engine.dialect.name
    report = SequenceSyncReport(dialect=dialect)
    if dialect != "postgresql":
        return report

    if metadata is None:
        from ..database import Base
        from .. import models as _orm_models  # noqa: F401 — register all tables

        metadata = Base.metadata

    names = sorted(table_names if table_names is not None else metadata.tables.keys())
    for name in names:
        table = metadata.tables.get(name)
        if table is None:
            continue
        try:
            with engine.begin() as conn:
                result = _sync_table_sequence(conn, table)
        except Exception as exc:
            logger.error(
                "[postgres_sequence_sync] table=%s error=%s",
                name,
                exc,
            )
            report.errors += 1
            report.results.append(
                SequenceSyncResult(
                    table=name,
                    column="",
                    sequence="",
                    max_id=None,
                    last_value=None,
                    is_called=None,
                    next_value=None,
                    action="error",
                )
            )
            continue

        report.results.append(result)
        if result.action in ("skipped_no_sequence", "skipped_composite_pk", "skipped_non_integer_pk"):
            report.skipped += 1
            continue
        if result.action == "error":
            report.errors += 1
            continue

        report.checked += 1
        if result.action == "fixed":
            report.fixed += 1
        else:
            report.ok += 1

    if report.fixed:
        logger.info(
            "[postgres_sequence_sync] summary checked=%s fixed=%s ok=%s skipped=%s errors=%s",
            report.checked,
            report.fixed,
            report.ok,
            report.skipped,
            report.errors,
        )
    return report
