"""Report inbound deliveries still missing warehouse_id after backfill (manual correction list)."""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text

from backend.db.database import engine


def main() -> int:
    parser = argparse.ArgumentParser(description="List deliveries with NULL warehouse_id")
    parser.add_argument("--csv", type=Path, help="Write CSV report to this path")
    args = parser.parse_args()

    with engine.connect() as conn:
        null_count = int(
            conn.execute(text("SELECT COUNT(*) FROM deliveries WHERE warehouse_id IS NULL")).scalar() or 0
        )
        rows = conn.execute(
            text(
                """
                SELECT
                    d.id AS delivery_id,
                    s.name AS supplier,
                    d.created_at,
                    d.purchase_order_id,
                    d.warehouse_id,
                    po.warehouse_id AS po_warehouse_id
                FROM deliveries d
                LEFT JOIN suppliers s ON s.id = d.supplier_id
                LEFT JOIN purchase_orders po ON po.id = d.purchase_order_id
                WHERE d.warehouse_id IS NULL
                ORDER BY d.id
                """
            )
        ).mappings().all()

    print(f"deliveries_null_warehouse_count={null_count}")
    if not rows:
        print("No deliveries require manual warehouse correction.")
        return 0

    print("\ndelivery_id\tsupplier\tcreated_at\tpurchase_order_id\twarehouse_id\tpo_warehouse_id")
    for r in rows:
        print(
            f"{r['delivery_id']}\t{r['supplier'] or '—'}\t{r['created_at']}\t"
            f"{r['purchase_order_id'] or '—'}\t{r['warehouse_id']}\t{r['po_warehouse_id'] or '—'}"
        )

    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with args.csv.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
                    "delivery_id",
                    "supplier",
                    "created_at",
                    "purchase_order_id",
                    "warehouse_id",
                    "po_warehouse_id",
                ],
            )
            w.writeheader()
            for r in rows:
                w.writerow(dict(r))
        print(f"\nCSV written: {args.csv}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
