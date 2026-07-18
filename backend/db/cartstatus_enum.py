"""PostgreSQL cartstatus enum ↔ CartStatus lifecycle values."""

from __future__ import annotations

import logging
from typing import Sequence

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

logger = logging.getLogger(__name__)

# Canonical lifecycle + legacy operational labels (SQLAlchemy CartStatus values).
CARTSTATUS_REQUIRED_LABELS: tuple[str, ...] = (
    "AVAILABLE",
    "ASSIGNED",
    "PICKING",
    "READY_FOR_PACKING",
    "PACKING",
    "FULL",
    "SERVICE",
)

# Legacy labels that may exist on production (old Enum values / PL).
CARTSTATUS_LEGACY_TO_CANONICAL: tuple[tuple[str, str], ...] = (
    ("pusty", "AVAILABLE"),
    ("w trakcie zbierania", "PICKING"),
    ("pełny", "FULL"),
    ("w serwisie", "SERVICE"),
    ("IN_PROGRESS", "PICKING"),  # old English member name if present as label
)


def pg_enum_labels(conn: Connection, enum_name: str) -> list[str]:
    rows = conn.execute(
        text(
            """
            SELECT e.enumlabel
            FROM pg_catalog.pg_enum e
            JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
            JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = :enum_name
              AND n.nspname = ANY (current_schemas(false))
            ORDER BY e.enumsortorder
            """
        ),
        {"enum_name": enum_name},
    ).fetchall()
    if rows:
        return [str(r[0]) for r in rows]
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


def carts_status_udt_name(conn: Connection) -> str | None:
    """Return PostgreSQL udt_name for carts.status (e.g. cartstatus), or None if not enum."""
    row = conn.execute(
        text(
            """
            SELECT udt_name, data_type
            FROM information_schema.columns
            WHERE table_schema = ANY (current_schemas(false))
              AND table_name = 'carts'
              AND column_name = 'status'
            """
        )
    ).fetchone()
    if row is None:
        return None
    data_type = str(row[1] or "")
    udt = str(row[0] or "")
    if data_type == "USER-DEFINED" or (
        udt
        and udt
        not in (
            "varchar",
            "text",
            "bpchar",
            "int4",
            "int8",
            "bool",
            "timestamp",
            "timestamptz",
        )
    ):
        is_enum = conn.execute(
            text(
                """
                SELECT 1
                FROM pg_catalog.pg_type t
                WHERE t.typname = :udt AND t.typtype = 'e'
                LIMIT 1
                """
            ),
            {"udt": udt},
        ).fetchone()
        if is_enum:
            return udt
    return None


def missing_cartstatus_labels(
    existing: Sequence[str],
    *,
    required: Sequence[str] = CARTSTATUS_REQUIRED_LABELS,
) -> list[str]:
    have = set(existing)
    return [lab for lab in required if lab not in have]


def _add_enum_label(engine: Engine, udt: str, label: str) -> bool:
    """ADD VALUE for one label. Returns True if added or already present."""
    safe = label.replace("'", "''")
    if not all(c.isalnum() or c == "_" for c in label):
        logger.error("[cartstatus.enum] refusing unsafe label=%r", label)
        return False
    try:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TYPE \"{udt}\" ADD VALUE IF NOT EXISTS '{safe}'"))
        return True
    except Exception:
        try:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TYPE \"{udt}\" ADD VALUE '{safe}'"))
            return True
        except Exception as exc:
            # Concurrent / already exists
            msg = str(exc).lower()
            if "already exists" in msg or "duplicate" in msg:
                return True
            logger.exception(
                "[cartstatus.enum] ADD VALUE failed enum=%s label=%s",
                udt,
                label,
            )
            return False


def ensure_cartstatus_enum(engine: Engine) -> dict[str, object]:
    """
    Align PostgreSQL enum ``cartstatus`` with CartStatus lifecycle values.

    Does **not** convert the column to TEXT/VARCHAR.
    Adds missing enum labels via ``ALTER TYPE ... ADD VALUE``, then remaps
    legacy row values (PL / IN_PROGRESS) to canonical English labels.
    """
    report: dict[str, object] = {
        "dialect": engine.dialect.name,
        "enum_name": None,
        "before": [],
        "added": [],
        "after": [],
        "remapped": [],
        "skipped": False,
    }
    if engine.dialect.name != "postgresql":
        report["skipped"] = True
        return report

    with engine.connect() as conn:
        udt = carts_status_udt_name(conn)
        if not udt:
            report["skipped"] = True
            report["reason"] = "carts.status is not a PostgreSQL enum (already varchar/text or missing)"
            return report
        report["enum_name"] = udt
        before = pg_enum_labels(conn, udt)
        report["before"] = list(before)

    added: list[str] = []
    for label in missing_cartstatus_labels(before):
        ok = _add_enum_label(engine, udt, label)
        with engine.connect() as conn:
            now = set(pg_enum_labels(conn, udt))
        if label in now and label not in before:
            added.append(label)
        elif not ok:
            logger.error("[cartstatus.enum] label still missing after ADD VALUE: %s", label)
    report["added"] = added

    remapped: list[str] = []
    with engine.begin() as conn:
        current = set(pg_enum_labels(conn, udt))
        for old, new in CARTSTATUS_LEGACY_TO_CANONICAL:
            if new not in current:
                continue
            try:
                result = conn.execute(
                    text(
                        f"""
                        UPDATE carts
                        SET status = CAST(:new AS "{udt}")
                        WHERE status::text = :old
                        """
                    ),
                    {"new": new, "old": old},
                )
                rc = int(result.rowcount or 0)
                if rc > 0:
                    remapped.append(f"{old}→{new}:{rc}")
            except Exception as exc:
                logger.warning(
                    "[cartstatus.enum] remap skipped old=%s new=%s err=%s",
                    old,
                    new,
                    exc,
                )

    with engine.connect() as conn:
        after = pg_enum_labels(conn, udt)
        report["after"] = list(after)
        report["remapped"] = remapped

    logger.info(
        "[cartstatus.enum] enum=%s before=%s added=%s after=%s remapped=%s",
        udt,
        report["before"],
        report["added"],
        report["after"],
        remapped,
    )
    missing_after = missing_cartstatus_labels(after)
    if missing_after:
        logger.error(
            "[cartstatus.enum] still missing labels after ensure: %s",
            missing_after,
        )
    return report
