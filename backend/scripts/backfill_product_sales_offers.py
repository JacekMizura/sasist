"""
Idempotent backfill of default SALEABLE offers for products missing one (Etap 3A).

Run: python -m backend.scripts.backfill_product_sales_offers [--tenant-id N] [--dry-run]
"""

from __future__ import annotations

import argparse
import sys

from backend.database import SessionLocal, engine
from backend.db.product_sales_offers_schema import ensure_product_sales_offers_schema
from backend.models.product import Product
from backend.services.product_sales_offers.crud_service import ensure_default_offer_for_product
from backend.services.product_sales_offers.resolution_service import get_default_offer_for_product


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill default product sales offers")
    parser.add_argument("--tenant-id", type=int, default=None, help="Limit to one tenant")
    parser.add_argument("--dry-run", action="store_true", help="Count only, do not commit")
    args = parser.parse_args()

    ensure_product_sales_offers_schema(engine)
    db = SessionLocal()
    created = 0
    skipped = 0
    try:
        q = db.query(Product).filter(Product.deleted_at.is_(None))
        if args.tenant_id is not None:
            q = q.filter(Product.tenant_id == int(args.tenant_id))
        products = q.order_by(Product.id.asc()).all()
        for product in products:
            existing = get_default_offer_for_product(
                db, tenant_id=int(product.tenant_id), product_id=int(product.id)
            )
            if existing is not None:
                skipped += 1
                continue
            if args.dry_run:
                created += 1
                continue
            ensure_default_offer_for_product(db, product=product)
            created += 1
        if not args.dry_run:
            db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[backfill_product_sales_offers] FAILED: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    mode = "dry-run" if args.dry_run else "committed"
    print(
        f"[backfill_product_sales_offers] {mode} products_scanned={len(products)} "
        f"would_create_or_created={created} already_had_default={skipped}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
