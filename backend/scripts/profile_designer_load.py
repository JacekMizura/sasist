"""
Profile WarehouseDesigner + ProductEdit hot endpoints (SQL count + wall time).

Run: python -m backend.scripts.profile_designer_load --warehouse-id 1
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from contextlib import contextmanager
from typing import Any, Callable

from sqlalchemy import event

from backend.database import SessionLocal, engine


@contextmanager
def count_sql(counter: list[int]):
    def _before(_conn, _cursor, _statement, _parameters, _context, _executemany):
        counter[0] += 1

    event.listen(engine, "before_cursor_execute", _before)
    try:
        yield
    finally:
        event.remove(engine, "before_cursor_execute", _before)


def _payload_size(obj: Any) -> int:
    return len(json.dumps(obj, default=str).encode("utf-8"))


def _record_count(result: Any) -> int | None:
    if isinstance(result, list):
        return len(result)
    if isinstance(result, dict):
        if "items" in result and isinstance(result["items"], list):
            return len(result["items"])
        if "layout" in result:
            racks = (result.get("layout") or {}).get("racks") or []
            return len(racks)
        if "inventory" in result:
            return len(result.get("inventory") or [])
    return None


def profile_endpoint(label: str, fn: Callable[[], Any]) -> dict:
    db = SessionLocal()
    counter = [0]
    try:
        t0 = time.perf_counter()
        with count_sql(counter):
            result = fn(db)
        ms = (time.perf_counter() - t0) * 1000
        return {
            "endpoint": label,
            "backend_ms": round(ms, 1),
            "sql_queries": counter[0],
            "records": _record_count(result),
            "payload_bytes": _payload_size(result),
        }
    except Exception as exc:
        return {"endpoint": label, "error": str(exc)}
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant-id", type=int, default=1)
    parser.add_argument("--warehouse-id", type=int, default=1)
    parser.add_argument("--product-limit", type=int, default=5000)
    parser.add_argument("--product-id", type=int, default=1)
    args = parser.parse_args()
    tid, wid = args.tenant_id, args.warehouse_id

    rows: list[dict] = []

    def layout_fn(db):
        from backend.services.warehouse_layout_service import WarehouseLayoutService

        svc = WarehouseLayoutService(db)
        layout = svc.get_layout(tid, wid)
        from backend.api.warehouse_layout import _get_special_locations_payload

        return {"layout": layout, "special_locations": _get_special_locations_payload(db, wid)}

    rows.append(profile_endpoint("GET /warehouse/layout", layout_fn))

    def products_fn(db):
        from backend.api.product import get_products

        return get_products(
            tenant_id=tid,
            warehouse_id=wid,
            manufacturer_id=None,
            ean=None,
            name=None,
            symbol=None,
            search=None,
            volume_min=None,
            volume_max=None,
            weight_min=None,
            weight_max=None,
            limit=args.product_limit,
            offset=None,
            sort_by=None,
            sort_dir=None,
            default_supplier_id=None,
            db=db,
        )

    rows.append(
        profile_endpoint(
            f"GET /products/?limit={args.product_limit}&warehouse_id={wid}",
            products_fn,
        )
    )

    def inventory_fn(db):
        from backend.api.inventory_api import list_inventory

        return list_inventory(
            tenant_id=tid,
            warehouse_id=wid,
            product_id=None,
            location_id=None,
            hide_empty=True,
            include_deleted_products=False,
            include_inactive_locations=False,
            inventory_debug=False,
            hide_technical_locations=False,
            db=db,
        )

    rows.append(profile_endpoint("GET /inventory/?hide_technical_locations=false", inventory_fn))

    def occupancy_fn(db):
        from backend.services.warehouse_occupancy_service import get_occupancy_metrics

        return get_occupancy_metrics(db, tenant_id=tid, warehouse_id=wid)

    rows.append(profile_endpoint("GET /warehouse/occupancy-metrics", occupancy_fn))

    def detail_fn(db):
        from backend.services.product_detail_service import build_product_detail_payload

        return build_product_detail_payload(
            db, product_id=args.product_id, tenant_id=tid, warehouse_id=wid
        )

    rows.append(profile_endpoint(f"GET /products/{args.product_id}/", detail_fn))

    # N+1 isolation: products list WITHOUT per-row inventory display
    def products_no_inv_fn(db):
        from collections import defaultdict
        from datetime import datetime, timedelta

        from sqlalchemy import func, or_

        from backend.api.product import (
            SORT_FIELDS,
            _enrich_product_default_supplier,
            _enrich_product_last_supplier,
            _enrich_product_manufacturer,
            _product_to_dict,
            _receipt_weighted_avg_price_by_product,
        )
        from backend.models.order import Order
        from backend.models.order_item import OrderItem
        from backend.models.product import Product

        q = db.query(Product).filter(Product.deleted_at.is_(None), Product.tenant_id == tid)
        q = q.limit(args.product_limit)
        product_rows = q.all()
        items = []
        for p in product_rows:
            d = _product_to_dict(p)
            _enrich_product_manufacturer(db, d, p)
            _enrich_product_default_supplier(db, d, p)
            _enrich_product_last_supplier(db, d, p)
            items.append(d)
        return {"items": items, "count": len(items)}

    rows.append(
        profile_endpoint(
            "BASELINE products (no inventory enrich)",
            products_no_inv_fn,
        )
    )

    print(json.dumps(rows, indent=2, ensure_ascii=False))
    return 0 if all("error" not in r for r in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
