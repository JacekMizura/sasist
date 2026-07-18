"""
One-shot PostgreSQL migration: rebuild ``cartstatus`` to the clean lifecycle enum.

Target labels only:
  AVAILABLE | ASSIGNED | PICKING | READY_FOR_PACKING | PACKING

Does **not** ``ADD VALUE`` onto a legacy type — creates a new type, remaps rows,
swaps the column, drops the old type, renames the new type to ``cartstatus``.
"""

from __future__ import annotations

import logging
from typing import Sequence

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

logger = logging.getLogger(__name__)

CARTSTATUS_CANONICAL: tuple[str, ...] = (
    "AVAILABLE",
    "ASSIGNED",
    "PICKING",
    "READY_FOR_PACKING",
    "PACKING",
)

# Migration-only remap (never expose these as CartStatus members).
CARTSTATUS_LEGACY_TO_CANONICAL: dict[str, str] = {
    "pusty": "AVAILABLE",
    "AVAILABLE": "AVAILABLE",
    "FREE": "AVAILABLE",
    "ASSIGNED": "ASSIGNED",
    "w trakcie zbierania": "PICKING",
    "IN_PROGRESS": "PICKING",
    "PICKING": "PICKING",
    "READY_FOR_PACKING": "READY_FOR_PACKING",
    "PACKING": "PACKING",
    "pełny": "AVAILABLE",
    "FULL": "AVAILABLE",
    "w serwisie": "AVAILABLE",
    "SERVICE": "AVAILABLE",
}

_NEW_TYPE = "cartstatus_lifecycle_v2"
_FINAL_TYPE = "cartstatus"


def pg_enum_labels(conn: Connection, enum_name: str) -> list[str]:
    rows = conn.execute(
        text(
            """
            SELECT e.enumlabel
            FROM pg_catalog.pg_enum e
            JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = :enum_name
            ORDER BY e.enumsortorder
            """
        ),
        {"enum_name": enum_name},
    ).fetchall()
    return [str(r[0]) for r in rows]


def carts_status_column_meta(conn: Connection) -> tuple[str | None, str | None]:
    """Return (data_type, udt_name) for carts.status."""
    row = conn.execute(
        text(
            """
            SELECT data_type, udt_name
            FROM information_schema.columns
            WHERE table_schema = ANY (current_schemas(false))
              AND table_name = 'carts'
              AND column_name = 'status'
            LIMIT 1
            """
        )
    ).fetchone()
    if row is None:
        return None, None
    return str(row[0] or ""), str(row[1] or "")


def _type_exists(conn: Connection, typname: str) -> bool:
    row = conn.execute(
        text(
            """
            SELECT 1 FROM pg_catalog.pg_type t
            WHERE t.typname = :n AND t.typtype = 'e'
            LIMIT 1
            """
        ),
        {"n": typname},
    ).fetchone()
    return row is not None


def _canonical_case_sql() -> str:
    """CASE expression mapping status::text → canonical label (untyped)."""
    parts: list[str] = []
    for old, new in CARTSTATUS_LEGACY_TO_CANONICAL.items():
        safe_old = old.replace("'", "''")
        safe_new = new.replace("'", "''")
        parts.append(f"WHEN '{safe_old}' THEN '{safe_new}'")
    body = "\n            ".join(parts)
    return f"""
        CASE trim(both from status::text)
            {body}
            ELSE 'AVAILABLE'
        END
    """


def _labels_are_exactly_canonical(labels: Sequence[str]) -> bool:
    return set(labels) == set(CARTSTATUS_CANONICAL)


def migrate_cartstatus_enum_clean(engine: Engine) -> dict[str, object]:
    """
    Idempotent rebuild of ``cartstatus`` to the five lifecycle labels.

    Returns a report dict for logs / ops.
    """
    report: dict[str, object] = {
        "dialect": engine.dialect.name,
        "action": "none",
        "before": [],
        "after": [],
        "remapped_preview": {},
        "skipped": False,
    }
    if engine.dialect.name != "postgresql":
        # SQLite / others: string column — remap legacy strings only
        report["action"] = "sqlite_string_remap"
        with engine.begin() as conn:
            for old, new in CARTSTATUS_LEGACY_TO_CANONICAL.items():
                if old == new:
                    continue
                conn.execute(
                    text("UPDATE carts SET status = :new WHERE status = :old"),
                    {"new": new, "old": old},
                )
        report["after"] = list(CARTSTATUS_CANONICAL)
        return report

    with engine.connect() as conn:
        if not conn.execute(
            text(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = ANY (current_schemas(false))
                  AND table_name = 'carts'
                LIMIT 1
                """
            )
        ).fetchone():
            report["skipped"] = True
            report["reason"] = "no carts table"
            return report

        data_type, udt = carts_status_column_meta(conn)
        report["data_type"] = data_type
        report["udt_before"] = udt

        # Already on final type with exact lifecycle labels → noop
        if udt == _FINAL_TYPE and _type_exists(conn, _FINAL_TYPE):
            before = pg_enum_labels(conn, _FINAL_TYPE)
            report["before"] = before
            if _labels_are_exactly_canonical(before):
                report["skipped"] = True
                report["action"] = "already_clean"
                report["after"] = before
                logger.info("[cartstatus.enum] already clean labels=%s", before)
                return report

        # Partial previous run: column already on v2 with clean labels → rename only
        if udt == _NEW_TYPE and _type_exists(conn, _NEW_TYPE):
            before = pg_enum_labels(conn, _NEW_TYPE)
            report["before"] = before
            if _labels_are_exactly_canonical(before):
                with engine.begin() as conn2:
                    if _type_exists(conn2, _FINAL_TYPE):
                        conn2.execute(text(f'DROP TYPE IF EXISTS "{_FINAL_TYPE}" CASCADE'))
                    conn2.execute(text(f'ALTER TYPE "{_NEW_TYPE}" RENAME TO "{_FINAL_TYPE}"'))
                    conn2.execute(
                        text(
                            f"ALTER TABLE carts ALTER COLUMN status SET DEFAULT "
                            f"'AVAILABLE'::{_FINAL_TYPE}"
                        )
                    )
                report["action"] = "renamed_v2_to_cartstatus"
                report["after"] = list(CARTSTATUS_CANONICAL)
                report["udt_after"] = _FINAL_TYPE
                logger.info("[cartstatus.enum] renamed %s → %s", _NEW_TYPE, _FINAL_TYPE)
                return report

    # Count remaps for report (read-only)
    preview: dict[str, int] = {}
    with engine.connect() as conn:
        legacy_keys = {
            k
            for k, v in CARTSTATUS_LEGACY_TO_CANONICAL.items()
            if k != v and k not in CARTSTATUS_CANONICAL
        }
        for old in legacy_keys:
            try:
                n = conn.execute(
                    text("SELECT count(*) FROM carts WHERE status::text = :old"),
                    {"old": old},
                ).scalar()
                if n:
                    preview[old] = int(n)
            except Exception:
                pass
        report["remapped_preview"] = preview
        if not report.get("before") and report.get("udt_before"):
            udt_b = str(report["udt_before"])
            if _type_exists(conn, udt_b):
                report["before"] = pg_enum_labels(conn, udt_b)

    case_expr = _canonical_case_sql()

    with engine.begin() as conn:
        old_udt = report.get("udt_before")
        column_on_new = old_udt == _NEW_TYPE

        # Drop unused leftover v2 only when the column does not reference it
        if _type_exists(conn, _NEW_TYPE) and not column_on_new:
            try:
                conn.execute(text(f'DROP TYPE IF EXISTS "{_NEW_TYPE}" CASCADE'))
            except Exception:
                pass

        if not _type_exists(conn, _NEW_TYPE):
            labels_sql = ", ".join(f"'{lab}'" for lab in CARTSTATUS_CANONICAL)
            conn.execute(text(f'CREATE TYPE "{_NEW_TYPE}" AS ENUM ({labels_sql})'))

        conn.execute(text("ALTER TABLE carts ALTER COLUMN status DROP DEFAULT"))

        # Swap column type onto the new enum with remap in USING
        conn.execute(
            text(
                f"""
                ALTER TABLE carts
                ALTER COLUMN status TYPE "{_NEW_TYPE}"
                USING ({case_expr})::{_NEW_TYPE}
                """
            )
        )

        conn.execute(
            text(
                f"""
                ALTER TABLE carts
                ALTER COLUMN status SET DEFAULT 'AVAILABLE'::{_NEW_TYPE}
                """
            )
        )

        # Drop the previous enum bound to carts.status (typically ``cartstatus``)
        if isinstance(old_udt, str) and old_udt and old_udt not in (_NEW_TYPE,):
            if _type_exists(conn, old_udt):
                conn.execute(text(f'DROP TYPE IF EXISTS "{old_udt}" CASCADE'))

        # Orphaned final name (wrong labels) while column is on v2
        if _type_exists(conn, _FINAL_TYPE) and old_udt != _FINAL_TYPE:
            try:
                conn.execute(text(f'DROP TYPE IF EXISTS "{_FINAL_TYPE}" CASCADE'))
            except Exception:
                pass

        conn.execute(text(f'ALTER TYPE "{_NEW_TYPE}" RENAME TO "{_FINAL_TYPE}"'))

        conn.execute(text("ALTER TABLE carts ALTER COLUMN status SET NOT NULL"))
        conn.execute(
            text(
                f"ALTER TABLE carts ALTER COLUMN status SET DEFAULT "
                f"'AVAILABLE'::{_FINAL_TYPE}"
            )
        )

    with engine.connect() as conn:
        after = pg_enum_labels(conn, _FINAL_TYPE)
        report["after"] = after
        report["action"] = "rebuilt"
        report["udt_after"] = _FINAL_TYPE

    logger.info(
        "[cartstatus.enum] rebuilt before=%s after=%s preview=%s",
        report.get("before"),
        after,
        preview,
    )
    if not _labels_are_exactly_canonical(after):
        logger.error(
            "[cartstatus.enum] unexpected labels after rebuild: %s",
            after,
        )
    return report


# Back-compat name used by schema_upgrade
def ensure_cartstatus_enum(engine: Engine) -> dict[str, object]:
    return migrate_cartstatus_enum_clean(engine)
