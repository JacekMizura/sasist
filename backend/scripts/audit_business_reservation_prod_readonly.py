"""
Read-only production audit: business reservations / RZ / legacy SALES_ORDER holds.

Usage (production Postgres — READ ONLY):
  set DATABASE_URL=postgresql://...
  python backend/scripts/audit_business_reservation_prod_readonly.py

Never writes except dry_run backfill (no commit).
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from backend.database import DATABASE_URL, SessionLocal, engine
from backend.models.inventory import Inventory
from backend.models.order import Order
from backend.models.order_warehouse_reservation import OrderWarehouseReservation
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_reservation import StockReservation
from backend.services.order_reservations.availability import (
    warehouse_business_available_qty,
    warehouse_business_reserved_qty,
    warehouse_physical_qty,
)
from backend.services.order_reservations.backfill_service import (
    backfill_sales_order_location_holds_to_business,
)
from backend.services.order_reservations.constants import OWR_ACTIVE_STATUSES
from backend.services.product_inventory_snapshot_service import get_product_inventory_snapshot
from backend.services.reservations.constants import (
    RESERVATION_KIND_SALES_ORDER,
    RESERVATION_STATUS_RESERVED,
)
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


def _dialect() -> str:
    return (getattr(engine.dialect, "name", None) or "").lower()


def _table_exists(name: str) -> bool:
    try:
        from sqlalchemy import inspect as sa_inspect

        return bool(sa_inspect(engine).has_table(name))
    except Exception:
        return False


def _legacy_sales_order_groups(db: Session) -> dict[tuple[int, int, int, int], float]:
    rows = (
        db.query(StockReservation)
        .filter(
            StockReservation.reservation_kind == RESERVATION_KIND_SALES_ORDER,
            StockReservation.status == RESERVATION_STATUS_RESERVED,
        )
        .all()
    )
    groups: dict[tuple[int, int, int, int], float] = defaultdict(float)
    skipped = 0
    for r in rows:
        wid = int(getattr(r, "warehouse_id", 0) or 0)
        if wid <= 0 and r.location_id:
            from backend.models.location import Location

            loc = db.query(Location).filter(Location.id == int(r.location_id)).first()
            wid = int(loc.warehouse_id) if loc is not None else 0
        if wid <= 0 or not r.order_id:
            skipped += 1
            continue
        key = (int(r.tenant_id), wid, int(r.order_id), int(r.product_id))
        groups[key] += float(r.quantity or 0)
    return groups, len(rows), skipped


def _owr_active_map(db: Session) -> dict[tuple[int, int, int, int], OrderWarehouseReservation]:
    rows = (
        db.query(OrderWarehouseReservation)
        .filter(OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)))
        .all()
    )
    out: dict[tuple[int, int, int, int], OrderWarehouseReservation] = {}
    for r in rows:
        key = (int(r.tenant_id), int(r.warehouse_id), int(r.order_id), int(r.product_id))
        out[key] = r
    return out


def section_counts(db: Session) -> dict:
    legacy_rows = (
        db.query(func.count(StockReservation.id))
        .filter(
            StockReservation.reservation_kind == RESERVATION_KIND_SALES_ORDER,
            StockReservation.status == RESERVATION_STATUS_RESERVED,
        )
        .scalar()
    )
    owr_total = db.query(func.count(OrderWarehouseReservation.id)).scalar() if _table_exists(
        "order_warehouse_reservations"
    ) else None
    owr_active = (
        db.query(func.count(OrderWarehouseReservation.id))
        .filter(OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)))
        .scalar()
        if _table_exists("order_warehouse_reservations")
        else None
    )
    rz_docs = (
        db.query(func.count(StockDocument.id))
        .filter(StockDocument.document_type == "RESERVATION")
        .scalar()
        if _table_exists("stock_documents")
        else None
    )
    rz_open = (
        db.query(func.count(StockDocument.id))
        .filter(
            StockDocument.document_type == "RESERVATION",
            StockDocument.status.in_(("open", "partial", "draft")),
        )
        .scalar()
        if _table_exists("stock_documents")
        else None
    )
    return {
        "database_url_prefix": DATABASE_URL.split("@")[-1][:80] if "@" in DATABASE_URL else DATABASE_URL[:80],
        "dialect": _dialect(),
        "active_sales_order_location_holds": int(legacy_rows or 0),
        "order_warehouse_reservations_total": int(owr_total or 0) if owr_total is not None else None,
        "order_warehouse_reservations_active": int(owr_active or 0) if owr_active is not None else None,
        "stock_documents_reservation_total": int(rz_docs or 0) if rz_docs is not None else None,
        "stock_documents_reservation_open": int(rz_open or 0) if rz_open is not None else None,
    }


def section_overlap(db: Session) -> dict:
    groups, legacy_row_count, skipped_groups = _legacy_sales_order_groups(db)
    owr_map = _owr_active_map(db)

    legacy_only_orders: set[int] = set()
    owr_only_orders: set[int] = set()
    both_orders: set[int] = set()
    qty_mismatch: list[dict] = []
    legacy_only_groups = 0
    owr_only_groups = 0
    both_groups = 0

    for key, legacy_qty in groups.items():
        tid, wid, oid, pid = key
        owr = owr_map.get(key)
        if owr is None:
            legacy_only_groups += 1
            legacy_only_orders.add(oid)
        else:
            both_groups += 1
            both_orders.add(oid)
            owr_qty = float(owr.quantity or 0)
            if abs(owr_qty - legacy_qty) > 1e-6:
                qty_mismatch.append(
                    {
                        "order_id": oid,
                        "product_id": pid,
                        "warehouse_id": wid,
                        "legacy_qty": legacy_qty,
                        "owr_qty": owr_qty,
                        "delta": round(owr_qty - legacy_qty, 6),
                    }
                )

    for key, owr in owr_map.items():
        if key not in groups:
            owr_only_groups += 1
            owr_only_orders.add(int(owr.order_id))

    # OWR without RZ document
    owr_no_rz = (
        db.query(OrderWarehouseReservation)
        .filter(
            OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)),
            or_(
                OrderWarehouseReservation.stock_document_id.is_(None),
                OrderWarehouseReservation.quantity > 0,
            ),
        )
        .all()
    )
    owr_active_no_rz = [
        {
            "id": int(r.id),
            "order_id": int(r.order_id),
            "product_id": int(r.product_id),
            "warehouse_id": int(r.warehouse_id),
            "quantity": float(r.quantity or 0),
            "stock_document_id": r.stock_document_id,
        }
        for r in owr_no_rz
        if float(r.quantity or 0) > 1e-9 and not r.stock_document_id
    ]

    # Orphan OWR: order missing or cancelled-like
    terminal_statuses = ("CANCELLED", "cancelled", "DONE", "done", "CLOSED", "closed", "COMPLETED", "completed")
    owr_on_terminal_orders = []
    orphan_owr_no_order = []
    for r in db.query(OrderWarehouseReservation).filter(
        OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)),
        OrderWarehouseReservation.quantity > 0,
    ):
        order = db.query(Order).filter(Order.id == int(r.order_id)).first()
        if order is None:
            orphan_owr_no_order.append({"owr_id": int(r.id), "order_id": int(r.order_id)})
            continue
        st = str(getattr(order, "status", "") or "")
        if st.upper() in {s.upper() for s in terminal_statuses}:
            owr_on_terminal_orders.append(
                {
                    "owr_id": int(r.id),
                    "order_id": int(r.order_id),
                    "order_status": st,
                    "quantity": float(r.quantity or 0),
                }
            )

    # Orphan RZ: no active OWR for order+warehouse
    orphan_rz: list[dict] = []
    if _table_exists("stock_documents"):
        rz_rows = (
            db.query(StockDocument)
            .filter(
                StockDocument.document_type == "RESERVATION",
                StockDocument.status.in_(("open", "partial", "draft")),
            )
            .all()
        )
        for doc in rz_rows:
            active_for_order = (
                db.query(func.count(OrderWarehouseReservation.id))
                .filter(
                    OrderWarehouseReservation.tenant_id == int(doc.tenant_id),
                    OrderWarehouseReservation.warehouse_id == int(doc.warehouse_id),
                    OrderWarehouseReservation.order_id == int(doc.order_id or 0),
                    OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)),
                    OrderWarehouseReservation.quantity > 0,
                )
                .scalar()
            )
            if int(active_for_order or 0) == 0:
                orphan_rz.append(
                    {
                        "stock_document_id": int(doc.id),
                        "document_number": doc.document_number,
                        "order_id": doc.order_id,
                        "status": doc.status,
                    }
                )

    return {
        "legacy_hold_row_count": legacy_row_count,
        "legacy_skipped_unmapped_groups": skipped_groups,
        "legacy_group_count": len(groups),
        "legacy_only_groups": legacy_only_groups,
        "legacy_only_orders": len(legacy_only_orders),
        "legacy_only_order_ids_sample": sorted(legacy_only_orders)[:20],
        "owr_only_groups": owr_only_groups,
        "owr_only_orders": len(owr_only_orders),
        "owr_only_order_ids_sample": sorted(owr_only_orders)[:20],
        "both_legacy_and_owr_groups": both_groups,
        "both_orders": len(both_orders),
        "both_order_ids_sample": sorted(both_orders)[:20],
        "qty_mismatch_legacy_vs_owr_count": len(qty_mismatch),
        "qty_mismatch_sample": qty_mismatch[:15],
        "owr_active_without_rz_count": len(owr_active_no_rz),
        "owr_active_without_rz_sample": owr_active_no_rz[:15],
        "owr_on_terminal_order_count": len(owr_on_terminal_orders),
        "owr_on_terminal_order_sample": owr_on_terminal_orders[:15],
        "orphan_owr_missing_order_count": len(orphan_owr_no_order),
        "orphan_open_rz_without_active_owr_count": len(orphan_rz),
        "orphan_open_rz_sample": orphan_rz[:15],
    }


def section_dry_run(db: Session) -> dict:
    report = backfill_sales_order_location_holds_to_business(db, dry_run=True)
    groups, _, _ = _legacy_sales_order_groups(db)
    owr_map = _owr_active_map(db)

    would_create = 0
    would_increase = 0
    would_skip_already_covered = 0
    would_skip_zero = 0
    conflicts: list[dict] = []
    skipped_reasons: dict[str, int] = defaultdict(int)
    before_after: list[dict] = []

    for key, legacy_qty in groups.items():
        tid, wid, oid, pid = key
        if legacy_qty <= 1e-9:
            would_skip_zero += 1
            skipped_reasons["zero_legacy_qty"] += 1
            continue
        owr = owr_map.get(key)
        if owr is None:
            would_create += 1
            before_after.append(
                {
                    "order_id": oid,
                    "product_id": pid,
                    "warehouse_id": wid,
                    "legacy_qty": legacy_qty,
                    "owr_before": 0.0,
                    "owr_after_would_be": legacy_qty,
                    "action": "create_owr_and_rz",
                }
            )
        else:
            cur = float(owr.quantity or 0)
            if abs(cur - legacy_qty) <= 1e-6:
                would_skip_already_covered += 1
                skipped_reasons["owr_already_matches_legacy_sum"] += 1
            elif cur > legacy_qty + 1e-6:
                conflicts.append(
                    {
                        "order_id": oid,
                        "product_id": pid,
                        "legacy_qty": legacy_qty,
                        "owr_qty": cur,
                        "reason": "owr_exceeds_legacy_backfill_would_not_decrease",
                    }
                )
                skipped_reasons["owr_gt_legacy_no_decrease_in_backfill"] += 1
            else:
                would_increase += 1
                before_after.append(
                    {
                        "order_id": oid,
                        "product_id": pid,
                        "warehouse_id": wid,
                        "legacy_qty": legacy_qty,
                        "owr_before": cur,
                        "owr_after_would_be": legacy_qty,
                        "action": "increase_owr_to_legacy_sum",
                    }
                )

    return {
        "backfill_report_raw": report,
        "would_create_new_owr_groups": would_create,
        "would_increase_existing_owr_groups": would_increase,
        "would_skip_already_covered": would_skip_already_covered,
        "would_skip_zero_qty": would_skip_zero,
        "would_create_rz_documents_approx": would_create + would_increase,
        "conflicts_count": len(conflicts),
        "conflicts_sample": conflicts[:20],
        "skipped_reasons": dict(skipped_reasons),
        "before_after_sample": before_after[:25],
        "legacy_qty_total": round(sum(groups.values()), 6),
    }


def _legacy_location_reserved(
    db: Session, *, tenant_id: int, warehouse_id: int, product_id: int
) -> float:
    rows = (
        db.query(func.coalesce(func.sum(StockReservation.quantity), 0.0))
        .filter(
            StockReservation.tenant_id == int(tenant_id),
            StockReservation.product_id == int(product_id),
            StockReservation.reservation_kind == RESERVATION_KIND_SALES_ORDER,
            StockReservation.status == RESERVATION_STATUS_RESERVED,
            or_(
                StockReservation.warehouse_id == int(warehouse_id),
                StockReservation.warehouse_id.is_(None),
            ),
        )
        .scalar()
    )
    return float(rows or 0)


def section_anti_double_count(db: Session, limit: int = 8) -> dict:
    """Products with physical + (OWR or legacy holds)."""
    # Find candidate product/warehouse pairs
    owr_pairs = (
        db.query(
            OrderWarehouseReservation.tenant_id,
            OrderWarehouseReservation.warehouse_id,
            OrderWarehouseReservation.product_id,
        )
        .filter(
            OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)),
            OrderWarehouseReservation.quantity > 0,
        )
        .distinct()
        .limit(limit * 3)
        .all()
    )
    examples: list[dict] = []
    for tid, wid, pid in owr_pairs:
        if len(examples) >= limit:
            break
        physical = warehouse_physical_qty(db, tenant_id=int(tid), warehouse_id=int(wid), product_id=int(pid))
        business = warehouse_business_reserved_qty(
            db, tenant_id=int(tid), warehouse_id=int(wid), product_id=int(pid)
        )
        legacy_loc = _legacy_location_reserved(
            db, tenant_id=int(tid), warehouse_id=int(wid), product_id=int(pid)
        )
        if physical <= 0 and business <= 0 and legacy_loc <= 0:
            continue
        expected = max(0.0, round(physical - business, 6))
        try:
            snap = get_product_inventory_snapshot(
                db, product_id=int(pid), tenant_id=int(tid), warehouse_id=int(wid)
            )
            snap_avail = float(snap.get("available", snap.get("warehouses", [{}])[0].get("available_quantity", 0)))
            snap_reserved = float(snap.get("reserved", snap.get("warehouses", [{}])[0].get("reserved_quantity", 0)))
        except Exception as exc:
            snap_avail = None
            snap_reserved = None
            snap_err = str(exc)
        else:
            snap_err = None
        prod = db.query(Product).filter(Product.id == int(pid)).first()
        examples.append(
            {
                "product_id": int(pid),
                "product_name": getattr(prod, "name", None),
                "warehouse_id": int(wid),
                "physical": physical,
                "business_reserved": business,
                "legacy_location_reserved": legacy_loc,
                "expected_available": expected,
                "snapshot_available": snap_avail,
                "snapshot_reserved": snap_reserved,
                "snapshot_matches_expected": (
                    snap_avail is not None and abs(snap_avail - expected) <= 1e-4
                ),
                "double_count_risk": (
                    snap_avail is not None
                    and legacy_loc > 0
                    and business > 0
                    and snap_avail < expected - 1e-4
                ),
                "snapshot_error": snap_err,
            }
        )
    return {"examples": examples, "formula": "expected_available = physical - business_reserved"}


def section_rz_samples(db: Session, limit: int = 15) -> dict:
    rows = (
        db.query(OrderWarehouseReservation)
        .filter(OrderWarehouseReservation.quantity > 0)
        .order_by(OrderWarehouseReservation.updated_at.desc())
        .limit(limit)
        .all()
    )
    samples = []
    mismatches = []
    for r in rows:
        doc = (
            db.query(StockDocument).filter(StockDocument.id == int(r.stock_document_id)).first()
            if r.stock_document_id
            else None
        )
        line = None
        if doc:
            line = (
                db.query(StockDocumentItem)
                .filter(
                    StockDocumentItem.document_id == int(doc.id),
                    StockDocumentItem.product_id == int(r.product_id),
                )
                .first()
            )
        order = db.query(Order).filter(Order.id == int(r.order_id)).first()
        wh_name = None
        if r.warehouse_id:
            from backend.models.warehouse import Warehouse

            wh = db.query(Warehouse).filter(Warehouse.id == int(r.warehouse_id)).first()
            wh_name = wh.name if wh else None
        entry = {
            "order_id": int(r.order_id),
            "order_number": getattr(order, "number", None),
            "warehouse_id": int(r.warehouse_id),
            "warehouse_name": wh_name,
            "product_id": int(r.product_id),
            "owr_qty_remaining": float(r.quantity or 0),
            "owr_qty_original": float(r.quantity_original or 0),
            "owr_status": str(r.status),
            "rz_document_id": int(r.stock_document_id) if r.stock_document_id else None,
            "rz_number": doc.document_number if doc else None,
            "rz_status": doc.status if doc else None,
            "rz_line_qty": float(line.quantity or 0) if line else None,
            "rz_line_ordered": float(line.ordered_quantity or 0) if line else None,
        }
        samples.append(entry)
        if doc and line:
            line_qty = float(line.quantity or 0)
            orig = float(r.quantity_original or 0)
            if abs(line_qty - orig) > 1e-4 and float(r.quantity or 0) > 1e-9:
                mismatches.append(
                    {
                        "owr_id": int(r.id),
                        "owr_original": orig,
                        "owr_remaining": float(r.quantity or 0),
                        "rz_line_qty": line_qty,
                    }
                )
    return {"samples": samples, "owr_rz_mismatch_count": len(mismatches), "mismatch_sample": mismatches[:10]}


def section_soft_compat(db: Session) -> dict:
    """Orders that could pick without OWR row (assert_pick_within skips)."""
    # Active legacy SALES_ORDER holds grouped by order+product+warehouse
    groups, _, _ = _legacy_sales_order_groups(db)
    owr_map = _owr_active_map(db)

    pick_without_owr_groups = []
    for key in groups:
        if key not in owr_map:
            tid, wid, oid, pid = key
            pick_without_owr_groups.append(
                {"tenant_id": tid, "warehouse_id": wid, "order_id": oid, "product_id": pid, "legacy_qty": groups[key]}
            )

    # Orders in non-terminal status with legacy holds but no OWR
    active_orders_no_owr = []
    terminal = {"CANCELLED", "DONE", "CLOSED", "COMPLETED"}
    for item in pick_without_owr_groups:
        order = db.query(Order).filter(Order.id == int(item["order_id"])).first()
        if order is None:
            continue
        st = str(getattr(order, "status", "") or "").upper()
        if st not in terminal:
            active_orders_no_owr.append({**item, "order_status": st})

    return {
        "legacy_groups_without_owr": len(pick_without_owr_groups),
        "legacy_groups_without_owr_sample": pick_without_owr_groups[:20],
        "active_orders_with_legacy_hold_but_no_owr": len(active_orders_no_owr),
        "active_orders_sample": active_orders_no_owr[:20],
        "soft_compat_code_path": (
            "assert_pick_within_business_reservation returns early when get_active_reservation() is None"
        ),
        "recommended_target_failure": "HTTP 409 / OrderWarehouseReservationError code=missing_business_reservation",
        "safe_to_remove_after_backfill": (
            len(pick_without_owr_groups) == 0
            or len(active_orders_no_owr) == 0
        ),
    }


def main() -> None:
    db: Session = SessionLocal()
    try:
        out = {
            "mode": "READ_ONLY_AUDIT",
            "counts": section_counts(db),
            "overlap_and_orphans": section_overlap(db),
            "dry_run_backfill": section_dry_run(db),
            "anti_double_count": section_anti_double_count(db),
            "rz_samples": section_rz_samples(db),
            "soft_compat": section_soft_compat(db),
            "wms_code_notes": {
                "owr_has_location_id": False,
                "rz_lines_have_location_id": False,
                "reserve_sales_order_fg_creates_location_holds": False,
                "pick_assertion": "assert_pick_within_business_reservation caps WMS allocation to OWR remaining",
            },
        }
        print(json.dumps(out, indent=2, ensure_ascii=False, default=str))
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
