"""P2.3 — report legacy rows missing warehouse_id (PO, delivery, stock document)."""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.database import SessionLocal
from backend.services.warehouse_ownership_audit_service import (
    count_missing_warehouse_ownership,
    missing_ownership_rows,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Report entities with NULL warehouse_id")
    parser.add_argument(
        "--csv",
        type=Path,
        default=Path("memory/missing-warehouse-ownership.csv"),
        help="CSV output path (default: memory/missing-warehouse-ownership.csv)",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        counts = count_missing_warehouse_ownership(db)
        print(
            "[WAREHOUSE_OWNERSHIP_AUDIT] "
            f"purchase_orders_without_warehouse={counts['purchase_orders_without_warehouse']} "
            f"deliveries_without_warehouse={counts['deliveries_without_warehouse']} "
            f"stock_documents_without_warehouse={counts['stock_documents_without_warehouse']}"
        )
        rows = missing_ownership_rows(db)
        if not rows:
            print("No legacy rows require manual warehouse correction.")
            return 0

        args.csv.parent.mkdir(parents=True, exist_ok=True)
        fieldnames = [
            "entity_type",
            "entity_id",
            "tenant_id",
            "warehouse_id",
            "linked_po_id",
            "linked_delivery_id",
            "document_type",
            "created_at",
        ]
        with args.csv.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for row in rows:
                w.writerow(row)
        print(f"CSV written: {args.csv} ({len(rows)} rows)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
