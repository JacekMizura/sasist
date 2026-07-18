"""
Read-only audit: RAW SUM(FE_MISSING) vs EFFECTIVE (capped) missing.

Nie mutuje danych. Użycie:

  python -m backend.scripts.audit_fe_missing_duplicates
  python -m backend.scripts.audit_fe_missing_duplicates --tenant-id 1 --warehouse-id 1
  python -m backend.scripts.audit_fe_missing_duplicates --order-number 1214

Exit 0 zawsze (raport); kod 2 gdy wykryto overcount (--fail-on-find).
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from sqlalchemy import create_engine, func, text
from sqlalchemy.orm import Session, sessionmaker

from backend.database import SessionLocal
from backend.models.fulfillment_event import FE_MISSING, FulfillmentEvent
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.services.fulfillment_event_service import (
    line_picked_sum_for_order,
    sum_line_events,
    sum_pick_events_for_line_cart,
)


def audit_fe_missing_overcount(
    db: Session,
    *,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    order_number: str | None = None,
    limit: int = 500,
) -> dict[str, Any]:
    """
    Wykrywa linie gdzie RAW SUM(FE_MISSING) > allowed_missing (ordered − picked).

    Raportuje raw vs effective; nie nadpisuje danych.
    """
    q = (
        db.query(OrderItem, Order, Product)
        .join(Order, Order.id == OrderItem.order_id)
        .outerjoin(Product, Product.id == OrderItem.product_id)
    )
    if tenant_id is not None:
        q = q.filter(Order.tenant_id == int(tenant_id))
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == int(warehouse_id))
    if order_number is not None and str(order_number).strip():
        want = str(order_number).strip().lstrip("#")
        q = q.filter(Order.number == want)

    has_missing = (
        db.query(FulfillmentEvent.order_item_id)
        .filter(FulfillmentEvent.type == FE_MISSING)
        .group_by(FulfillmentEvent.order_item_id)
        .having(func.sum(FulfillmentEvent.quantity) > 1e-9)
        .subquery()
    )
    q = q.filter(OrderItem.id.in_(db.query(has_missing.c.order_item_id)))

    rows_out: list[dict[str, Any]] = []
    scanned = 0
    for oi, order, pr in q.yield_per(200):
        scanned += 1
        required = float(oi.quantity or 0)
        if required <= 1e-12:
            continue
        cid = int(order.cart_id) if getattr(order, "cart_id", None) else None
        if cid is not None and cid > 0:
            picked = float(sum_pick_events_for_line_cart(db, int(oi.id), cid))
        else:
            picked = float(line_picked_sum_for_order(db, int(oi.id), order))
        allowed = max(0.0, required - min(picked, required))
        raw_missing = float(sum_line_events(db, int(oi.id), FE_MISSING))
        col = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0)
        declared = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
        effective_missing = min(max(0.0, raw_missing), allowed) if allowed > 1e-12 else 0.0
        overcount = max(0.0, raw_missing - allowed)
        corrupted = overcount > 1e-6 or col > allowed + 1e-6
        if not corrupted:
            continue
        rows_out.append(
            {
                "order_id": int(order.id),
                "order_number": str(order.number or f"#{order.id}"),
                "order_item_id": int(oi.id),
                "product_id": int(oi.product_id) if oi.product_id else None,
                "ean": (str(pr.ean).strip() if pr is not None and pr.ean else None),
                "product_name": (pr.name if pr is not None else None),
                "required": round(required, 6),
                "picked": round(picked, 6),
                "allowed_missing": round(allowed, 6),
                "raw_missing": round(raw_missing, 6),
                "effective_missing": round(effective_missing, 6),
                "overcount": round(overcount, 6),
                "corrupted": True,
                "sum_fe_missing": round(raw_missing, 6),  # alias for older readers
                "wms_picking_line_missing_qty": round(col, 6),
                "wms_shortage_declared_qty": round(declared, 6),
                "overage_events": round(overcount, 6),
            }
        )
        if len(rows_out) >= int(limit):
            break

    return {
        "scanned_lines_with_fe_missing": scanned,
        "overcount_lines": len(rows_out),
        "rows": rows_out,
        "mutated": False,
        "note": (
            "Read-only. RAW event sum preserved in audit; runtime uses effective_missing "
            "= min(raw, allowed). No automatic DELETE."
        ),
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Audit FE_MISSING overcount (read-only)")
    p.add_argument("--tenant-id", type=int, default=None)
    p.add_argument("--warehouse-id", type=int, default=None)
    p.add_argument("--order-number", type=str, default=None)
    p.add_argument("--limit", type=int, default=500)
    p.add_argument("--fail-on-find", action="store_true", help="Exit 2 when overcount_lines > 0")
    p.add_argument("--database-url", type=str, default=None, help="Optional override (else SessionLocal)")
    args = p.parse_args(argv)

    if args.database_url:
        engine = create_engine(args.database_url)
        SessionFactory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        db = SessionFactory()
    else:
        db = SessionLocal()
    try:
        try:
            db.execute(text("SELECT 1"))
        except Exception:
            pass
        report = audit_fe_missing_overcount(
            db,
            tenant_id=args.tenant_id,
            warehouse_id=args.warehouse_id,
            order_number=args.order_number,
            limit=args.limit,
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if args.fail_on_find and int(report["overcount_lines"]) > 0:
            return 2
        return 0
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    sys.exit(main())
