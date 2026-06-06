"""
Direct SQL verification of Tier 0 columns — run against production DATABASE_URL.

  python -m backend.scripts.verify_tier0_schema
"""

from __future__ import annotations

import sys

from backend.database import engine
from backend.db.schema_introspection import (
    get_table_column_names,
    has_table,
    log_db_engine,
    verify_tier0_sql_probes,
)
from backend.db.schema_tiers import validate_core_schema


def main() -> int:
    log_db_engine(engine)
    print(f"[verify] dialect={engine.dialect.name}")

    probe_failures = verify_tier0_sql_probes(engine)
    if probe_failures:
        print("[verify] SQL PROBE FAILURES:")
        for f in probe_failures:
            print(f"  {f['table']}: {f['error']}")
    else:
        print("[verify] SQL probes OK")

    critical = (
        ("orders", ("order_channel", "fulfillment_mode")),
        ("order_items", ("source_location_id", "source_movement_id")),
        ("locations", ("operational_zone_type",)),
    )
    for table, cols in critical:
        if not has_table(engine, table):
            print(f"[verify] MISSING TABLE: {table}")
            continue
        db_cols = get_table_column_names(engine, table)
        missing = [c for c in cols if c not in db_cols]
        if missing:
            print(f"[verify] {table} missing columns: {missing}")
        else:
            print(f"[verify] {table} columns OK: {cols}")

    try:
        result = validate_core_schema(engine)
        print(
            f"[verify] ORM validation OK checked_tables={result.checked_tables} "
            f"duration_ms={result.duration_ms}"
        )
    except Exception as exc:
        print(f"[verify] ORM validation FAILED: {exc}")
        return 1

    if probe_failures:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
