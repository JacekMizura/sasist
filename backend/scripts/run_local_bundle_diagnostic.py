"""Local DB only — same queries as prod diagnostic. NOT production."""
from __future__ import annotations

import json
import os
from pathlib import Path

from sqlalchemy import create_engine, text

from backend.services.bundle_stock_product_service import shadow_bundle_id_from_product


def main() -> None:
    url = os.getenv("DATABASE_URL") or ("sqlite:///" + Path("backend/test.db").as_posix())
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    is_pg = url.startswith("postgresql")
    print(f"DATABASE: {'PostgreSQL' if is_pg else 'SQLite (LOCAL — not prod)'}")
    print(f"URL hint: {url.split('@')[-1] if '@' in url else url}\n")

    eng = create_engine(url)
    with eng.connect() as c:
        max_id = c.execute(text("SELECT MAX(id) FROM products")).scalar()
        print(f"MAX(id) FROM products = {max_id}")

        if is_pg:
            row = c.execute(text("SELECT last_value, is_called FROM products_id_seq")).fetchone()
            if row:
                lv, called = int(row[0]), bool(row[1])
                next_val = lv + 1 if called else lv
                print(f"products_id_seq last_value={lv} is_called={called} -> next INSERT id={next_val}")
                if max_id is not None and next_val <= int(max_id):
                    print(">>> SEQUENCE DESYNC: next INSERT id <= MAX(id)")
                else:
                    print(">>> sequence OK vs MAX(id)")
        else:
            print("products_id_seq: N/A (SQLite)")

        print("\n--- bundles id=1 ---")
        b = c.execute(
            text(
                "SELECT id, tenant_id, linked_product_id, bundle_fulfillment_mode "
                "FROM bundles WHERE id = 1"
            )
        ).fetchone()
        if b:
            print(dict(b._mapping))
            tenant_id = int(b[1])
            linked = b[2]
        else:
            print("(no bundle id=1)")
            tenant_id = None
            linked = None

        print("\n--- shadow products ---")
        if is_pg:
            q = text(
                """
                SELECT id, tenant_id, name, metadata_json
                FROM products
                WHERE metadata_json IS NOT NULL
                  AND metadata_json::text LIKE '%shadow_bundle_id%'
                ORDER BY id
                """
            )
        else:
            q = text(
                """
                SELECT id, tenant_id, name, metadata_json
                FROM products
                WHERE metadata_json IS NOT NULL
                  AND metadata_json LIKE '%shadow_bundle_id%'
                ORDER BY id
                """
            )
        shadows = c.execute(q).fetchall()
        for s in shadows:
            meta = s[3]
            bid = shadow_bundle_id_from_product(type("P", (), {"metadata_json": meta})())
            print(f"  product id={s[0]} tenant={s[1]} shadow_bundle_id={bid} name={s[2]!r}")

        if tenant_id is not None:
            print("\n--- _resolve_shadow_product simulation for bundle #1 ---")
            if linked is not None and int(linked) > 0:
                p = c.execute(
                    text("SELECT id FROM products WHERE id = :pid AND tenant_id = :tid"),
                    {"pid": int(linked), "tid": tenant_id},
                ).fetchone()
                if p:
                    print(f"  branch=UPDATE reason=linked_product_id_hit product_id={linked}")
                else:
                    print(f"  linked_product_id={linked} but product missing/wrong tenant -> fallback")
            else:
                print("  linked_product_id NULL/missing -> skip step 1")

            found = None
            for s in shadows:
                if int(s[1]) != tenant_id:
                    continue
                bid = shadow_bundle_id_from_product(type("P", (), {"metadata_json": s[3]})())
                if bid == 1:
                    found = int(s[0])
                    break
            if found:
                print(f"  branch=UPDATE reason=shadow_bundle_id_metadata_hit product_id={found}")
            elif linked is None or not c.execute(
                text("SELECT id FROM products WHERE id = :pid AND tenant_id = :tid"),
                {"pid": int(linked or 0), "tid": tenant_id},
            ).fetchone():
                print("  branch=CREATE reason=insert_new_no_linked_no_shadow")


if __name__ == "__main__":
    main()
