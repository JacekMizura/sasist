#!/usr/bin/env python3
"""
Full development database reset.

Deletes SQLite DB (backend/test.db), rebuilds schema via FastAPI bootstrap,
seeds tenant/warehouse/admin/statuses/WMS defaults, clears uploads + pytest cache.

Usage (from repo root, API stopped):
  python scripts/reset_dev_db.py
  python scripts/reset_dev_db.py --keep-uploads
  python scripts/reset_dev_db.py --no-seed

PostgreSQL (optional):
  set DATABASE_URL=postgresql+psycopg2://user:pass@localhost/dbname
  python scripts/reset_dev_db.py
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset dev database and seed minimal data.")
    parser.add_argument(
        "--no-seed",
        action="store_true",
        help="Rebuild schema only (no seed_basic_data / admin / WMS defaults).",
    )
    parser.add_argument(
        "--keep-uploads",
        action="store_true",
        help="Do not clear backend/uploads.",
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="Override DATABASE_URL (PostgreSQL full schema drop). Default: SQLite backend/test.db",
    )
    parser.add_argument(
        "--force-in-place",
        action="store_true",
        help="If test.db is locked, DROP all SQLite tables instead of deleting the file (dev only).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    print("=" * 60)
    print("DEV DATABASE RESET")
    print("=" * 60)
    print(f"Project root: {ROOT}")
    print("Stop uvicorn/backend before reset if SQLite reports 'database is locked'.")
    print()

    try:
        from backend.db.dev_bootstrap import reset_dev_environment

        summary = reset_dev_environment(
            seed=not args.no_seed,
            clear_uploads=not args.keep_uploads,
            database_url=args.database_url,
            force_in_place=args.force_in_place,
        )
    except Exception as exc:
        logging.exception("Reset failed: %s", exc)
        return 1

    print()
    print("Reset complete.")
    print(f"  dialect: {summary.get('dialect')}")
    print(f"  tables OK: {summary.get('tables_ok')}")
    print(f"  tenant id=1: {summary.get('tenant_1')}")
    print(f"  admin login: {summary.get('admin_user') or '(none — run with seed)'}")
    print(f"  WMS packing settings: {summary.get('wms_packing_settings_rows')}")
    print()
    print("Default admin (when seeded): login=admin password=admin (change in production)")
    print("Start backend: uvicorn backend.main:app --reload")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
