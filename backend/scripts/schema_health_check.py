"""Full ORM vs DB schema health check (read-only).

Usage:
  set DATABASE_URL=postgresql://...
  python -m backend.scripts.schema_health_check

Defaults to backend/database.py engine (often sqlite:///backend/test.db).
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

# Ensure repo root on path
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

FOCUS_TABLES = frozenset(
    {
        "carts",
        "cart_lifecycle_events",
        "activity_events",
        "activity_event_links",
        "wms_operation_sessions",
        "cart_baskets",
        "orders",
        "picks",
        "wms_packing_sessions",
        "packing_sessions",  # alias check — may be missing
    }
)


def _load_models():
    import backend.models  # noqa: F401
    from backend.database import Base, engine

    return Base, engine


def _audit_all(engine) -> dict[str, Any]:
    from sqlalchemy import inspect

    from backend.db.schema_introspection import audit_model_schema, list_user_tables
    from backend.database import Base

    insp = inspect(engine)
    db_tables = set(list_user_tables(engine))
    orm_by_table: dict[str, Any] = {}
    for mapper in Base.registry.mappers:
        cls = mapper.class_
        if hasattr(cls, "__tablename__"):
            orm_by_table[cls.__tablename__] = cls

    report = {
        "dialect": engine.dialect.name,
        "url_hint": str(engine.url).split("@")[-1] if "@" in str(engine.url) else str(engine.url),
        "orm_table_count": len(orm_by_table),
        "db_table_count": len(db_tables),
        "missing_tables": sorted(set(orm_by_table) - db_tables),
        "extra_tables": sorted(db_tables - set(orm_by_table)),
        "tables": {},
        "focus": {},
        "severity": {"KRYTYCZNE": [], "WYSOKIE": [], "ŚREDNIE": [], "NISKIE": []},
    }

    for table, model in sorted(orm_by_table.items()):
        audit = audit_model_schema(engine, model)
        extra_cols = audit.get("extra_columns") or audit.get("extra_db_columns") or []
        # audit_orm_table_columns may use different keys
        missing_cols = audit.get("missing_columns") or []
        entry = {
            "exists": audit.get("exists", True),
            "missing_columns": missing_cols,
            "extra_db_columns": extra_cols if isinstance(extra_cols, list) else list(extra_cols),
            "type_mismatches": audit.get("type_mismatches") or [],
            "nullable_mismatches": audit.get("nullable_mismatches") or [],
            "fk_mismatches": audit.get("fk_mismatches") or [],
            "missing_indexes": audit.get("missing_indexes") or [],
        }
        # Reflect extras via inspector if not in audit
        if audit.get("exists") and table in db_tables:
            db_cols = {c["name"] for c in insp.get_columns(table)}
            orm_cols = {c.name for c in model.__table__.columns}
            entry["extra_db_columns"] = sorted(db_cols - orm_cols)
            entry["missing_columns"] = sorted(orm_cols - db_cols)

        report["tables"][table] = entry
        if table in FOCUS_TABLES:
            report["focus"][table] = entry

    # packing_sessions alias
    if "packing_sessions" not in orm_by_table:
        report["focus"]["packing_sessions"] = {
            "note": "No ORM table packing_sessions — canonical is wms_packing_sessions",
            "exists_in_db": "packing_sessions" in db_tables,
        }

    # Classify
    for table, entry in report["tables"].items():
        focus = table in FOCUS_TABLES or table == "wms_packing_sessions"
        for col in entry.get("missing_columns") or []:
            sev = "KRYTYCZNE" if focus else "WYSOKIE"
            report["severity"][sev].append(
                {
                    "table": table,
                    "issue": "missing_column",
                    "column": col,
                    "used": True,
                    "legacy": False,
                    "action": "ADD COLUMN via ensure_* / sync",
                }
            )
        for col in entry.get("extra_db_columns") or []:
            legacy_known = col in {
                "capacity_mode",
                "max_orders",
                "event_type",
                "task_type",
                "task_id",
            }
            sev = "KRYTYCZNE" if (focus and legacy_known and col == "event_type") else (
                "WYSOKIE" if focus and legacy_known else ("ŚREDNIE" if focus else "NISKIE")
            )
            report["severity"][sev].append(
                {
                    "table": table,
                    "issue": "extra_db_column",
                    "column": col,
                    "used": False if legacy_known else "unknown",
                    "legacy": legacy_known,
                    "action": "DROP after backfill" if legacy_known else "review before DROP",
                }
            )
        for m in entry.get("nullable_mismatches") or []:
            sev = "WYSOKIE" if focus else "ŚREDNIE"
            report["severity"][sev].append(
                {
                    "table": table,
                    "issue": "nullable_mismatch",
                    "detail": m,
                    "action": "ALTER nullability carefully",
                }
            )
        for m in entry.get("type_mismatches") or []:
            # Enum/String noise often low
            sev = "ŚREDNIE" if focus else "NISKIE"
            report["severity"][sev].append(
                {
                    "table": table,
                    "issue": "type_mismatch",
                    "detail": m,
                    "action": "review; often ENUM vs VARCHAR noise",
                }
            )
        for m in entry.get("fk_mismatches") or []:
            report["severity"]["ŚREDNIE"].append(
                {"table": table, "issue": "fk_mismatch", "detail": m, "action": "review FK"}
            )
        for m in entry.get("missing_indexes") or []:
            report["severity"]["NISKIE"].append(
                {"table": table, "issue": "missing_index", "detail": m, "action": "CREATE INDEX IF NOT EXISTS"}
            )

    return report


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if url:
        from sqlalchemy import create_engine

        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        engine = create_engine(url)
        import backend.models  # noqa: F401
    else:
        _, engine = _load_models()

    report = _audit_all(engine)
    out = Path(_ROOT) / "memory" / "schema-health-check.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    print(f"dialect={report['dialect']} url={report['url_hint']}")
    print(f"orm_tables={report['orm_table_count']} db_tables={report['db_table_count']}")
    print(f"missing_tables={report['missing_tables'][:20]}")
    print("--- FOCUS ---")
    for t, e in report["focus"].items():
        print(t, json.dumps(e, ensure_ascii=False, default=str)[:500])
    print("--- SEVERITY COUNTS ---")
    for sev, items in report["severity"].items():
        print(f"{sev}: {len(items)}")
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
