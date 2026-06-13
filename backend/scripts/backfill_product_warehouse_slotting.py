"""
Idempotent backfill: products.assigned_locations -> product_warehouse_slotting.

Run: python -m backend.scripts.backfill_product_warehouse_slotting [--tenant-id N] [--dry-run]
"""

from __future__ import annotations

import argparse
import sys

from backend.database import SessionLocal, engine
from backend.db.product_warehouse_slotting_schema import ensure_product_warehouse_slotting_schema
from backend.services.product_warehouse_slotting_service import backfill_slotting_from_assigned_locations


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill product_warehouse_slotting from assigned_locations JSON")
    parser.add_argument("--tenant-id", type=int, default=None, help="Limit to one tenant")
    parser.add_argument("--dry-run", action="store_true", help="Count only, do not commit")
    args = parser.parse_args()

    ensure_product_warehouse_slotting_schema(engine)
    db = SessionLocal()
    try:
        stats = backfill_slotting_from_assigned_locations(
            db, tenant_id=args.tenant_id, dry_run=args.dry_run
        )
        if not args.dry_run:
            db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[backfill_product_warehouse_slotting] FAILED: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    mode = "dry-run" if args.dry_run else "committed"
    print(f"[backfill_product_warehouse_slotting] {mode} {stats}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
