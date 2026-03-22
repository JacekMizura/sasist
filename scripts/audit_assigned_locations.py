#!/usr/bin/env python3
"""
Detect product assigned_locations UUIDs that point to inactive or missing bins.

Compares JSON on products.assigned_locations against warehouse_bins (+ rack active flags).

Usage:
  python scripts/audit_assigned_locations.py [--db PATH] [--dry-run]
  python scripts/audit_assigned_locations.py [--db PATH] --fix   # remove invalid entries

Does not refactor the app; local DB maintenance only.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path


def entry_uuid(ent: dict) -> str | None:
    if not isinstance(ent, dict):
        return None
    u = ent.get("locationUUID") or ent.get("location_uuid")
    if isinstance(u, str) and u.strip():
        return u.strip()
    return None


@dataclass
class BinInfo:
    warehouse_id: int
    is_bin_active: bool
    is_rack_active: bool
    label: str

    @property
    def is_layout_active(self) -> bool:
        return bool(self.is_bin_active and self.is_rack_active)


def load_bin_maps(conn: sqlite3.Connection) -> tuple[dict[str, BinInfo], set[str]]:
    """UUID -> BinInfo for any bin row; set of all UUIDs seen (including null-skip)."""
    rows = conn.execute(
        """
        SELECT b.location_uuid, b.is_active, r.is_active, l.warehouse_id, b.label
        FROM warehouse_bins b
        JOIN warehouse_layout_racks r ON b.rack_id = r.id
        JOIN warehouse_layouts l ON r.layout_id = l.id
        WHERE b.location_uuid IS NOT NULL AND TRIM(b.location_uuid) != ''
        """
    ).fetchall()
    by_uuid: dict[str, BinInfo] = {}
    all_uuids: set[str] = set()
    for loc_uuid, b_active, r_active, wh_id, label in rows:
        u = str(loc_uuid).strip()
        if not u:
            continue
        all_uuids.add(u)
        ba = bool(b_active) if b_active is not None else True
        ra = bool(r_active) if r_active is not None else True
        # Last write wins if duplicate UUID (should not happen)
        by_uuid[u] = BinInfo(
            warehouse_id=int(wh_id),
            is_bin_active=ba,
            is_rack_active=ra,
            label=(label or "")[:80],
        )
    return by_uuid, all_uuids


def classify_uuid(u: str, by_uuid: dict[str, BinInfo]) -> str:
    if u not in by_uuid:
        return "missing"
    info = by_uuid[u]
    if info.is_layout_active:
        return "active"
    return "inactive"


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit product assigned_locations vs layout bins.")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "test.db",
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Only report (default)",
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Remove invalid assignment entries and UPDATE products (writes DB)",
    )
    args = parser.parse_args()
    dry_run = not args.fix

    if not args.db.is_file():
        print(f"Database not found: {args.db}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    by_uuid, _ = load_bin_maps(conn)

    products = conn.execute(
        """
        SELECT id, tenant_id, name, assigned_locations
        FROM products
        WHERE assigned_locations IS NOT NULL AND TRIM(assigned_locations) != ''
        """
    ).fetchall()

    total_invalid_entries = 0
    products_touched = 0

    for row in products:
        pid = row["id"]
        raw = row["assigned_locations"]
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            print(f"[BAD_JSON] product_id={pid} name={row['name']!r}")
            continue
        if not isinstance(data, list):
            print(f"[NOT_LIST] product_id={pid} name={row['name']!r}")
            continue

        invalid_reports: list[tuple[str, str]] = []  # (uuid, reason)
        kept: list[dict] = []

        for ent in data:
            if not isinstance(ent, dict):
                kept.append(ent)
                continue
            u = entry_uuid(ent)
            if u is None:
                kept.append(ent)
                continue
            status = classify_uuid(u, by_uuid)
            if status == "active":
                kept.append(ent)
                continue
            if status == "inactive":
                info = by_uuid[u]
                invalid_reports.append(
                    (
                        u,
                        f"inactive_bin(bin_active={info.is_bin_active},rack_active={info.is_rack_active},wh={info.warehouse_id},label={info.label!r})",
                    )
                )
            else:
                invalid_reports.append((u, "missing_bin"))

        if not invalid_reports:
            continue

        products_touched += 1
        total_invalid_entries += len(invalid_reports)
        print(f"\nproduct_id={pid} tenant_id={row['tenant_id']} name={row['name']!r}")
        for u, reason in invalid_reports:
            print(f"  INVALID uuid={u} -> {reason}")

        if dry_run:
            print(f"  (dry-run) would remove {len(invalid_reports)} entr(y/ies); {len(kept)} kept")
        else:
            new_json = json.dumps(kept, ensure_ascii=False) if kept else None
            conn.execute(
                "UPDATE products SET assigned_locations = ? WHERE id = ?",
                (new_json, pid),
            )
            print(f"  FIXED: removed {len(invalid_reports)} entr(y/ies); {len(kept)} kept")

    if not dry_run:
        conn.commit()

    conn.close()

    print(
        f"\nSummary: products_with_invalid_assignments={products_touched} "
        f"invalid_entries={total_invalid_entries} dry_run={dry_run}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
