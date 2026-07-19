#!/usr/bin/env python3
"""
Read-only audit: orders.shipping_method_id orphans (missing shipping_methods row).

  python -m backend.scripts.audit_orphan_shipping_method_fk
  python -m backend.scripts.audit_orphan_shipping_method_fk --order-ids 1198,1202,1203,1205,1214

Does NOT mutate data.
"""

from __future__ import annotations

import argparse
import json
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit orphan orders.shipping_method_id FK")
    parser.add_argument(
        "--order-ids",
        default="",
        help="Optional CSV of order primary keys to focus the report",
    )
    parser.add_argument("--limit", type=int, default=2000)
    parser.add_argument("--json", action="store_true", help="Print JSON only")
    args = parser.parse_args(argv)

    from backend.database import SessionLocal
    from backend.services.order_shipping_fk_service import audit_orphan_order_shipping_method_ids

    order_ids: list[int] | None = None
    raw = (args.order_ids or "").strip()
    if raw:
        order_ids = [int(x.strip()) for x in raw.split(",") if x.strip()]

    db = SessionLocal()
    try:
        report = audit_orphan_order_shipping_method_ids(db, order_ids=order_ids, limit=int(args.limit))
    finally:
        db.close()

    if args.json:
        print(json.dumps(report, default=str, ensure_ascii=False, indent=2))
        return 0

    print(f"TOTAL ORPHAN ORDERS: {report['total']}")
    for row in report["rows"]:
        print(
            f"  order_id={row['order_id']} number={row['order_number']!r} "
            f"tenant_id={row['tenant_id']} warehouse_id={row['warehouse_id']} "
            f"shipping_method_id={row['shipping_method_id']} "
            f"label={row['shipping_method_label']!r} source={row['source']!r} "
            f"created_at={row['created_at']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
