"""
Dry-run / apply backfill: legacy location SALES_ORDER holds → business reservations + RZ.

Does NOT run automatically on production startup.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from ...models.stock_reservation import StockReservation
from ..reservations.constants import RESERVATION_KIND_SALES_ORDER, RESERVATION_STATUS_RESERVED
from .constants import OWR_STATUS_RELEASED
from .reservation_service import sync_order_warehouse_reservation_to_target
from .rz_document_service import ensure_rz_document_for_order

logger = logging.getLogger(__name__)


def backfill_sales_order_location_holds_to_business(
    db: Session,
    *,
    tenant_id: int | None = None,
    dry_run: bool = True,
    release_location_holds: bool = True,
) -> dict[str, Any]:
    """
    Group active SALES_ORDER location holds by (tenant, warehouse, order, product)
    and create business reservations with qty = SUM.

    When ``release_location_holds`` and not dry_run: mark location holds released
    so product snapshot / ATP are not double-counted.
    """
    q = db.query(StockReservation).filter(
        StockReservation.reservation_kind == RESERVATION_KIND_SALES_ORDER,
        StockReservation.status == RESERVATION_STATUS_RESERVED,
    )
    if tenant_id is not None:
        q = q.filter(StockReservation.tenant_id == int(tenant_id))
    rows = q.all()

    groups: dict[tuple[int, int, int, int], float] = defaultdict(float)
    group_rows: dict[tuple[int, int, int, int], list[StockReservation]] = defaultdict(list)
    for r in rows:
        wid = int(getattr(r, "warehouse_id", 0) or 0)
        if wid <= 0 and r.location_id:
            from ...models.location import Location

            loc = db.query(Location).filter(Location.id == int(r.location_id)).first()
            wid = int(loc.warehouse_id) if loc is not None else 0
        if wid <= 0 or not r.order_id:
            continue
        key = (int(r.tenant_id), wid, int(r.order_id), int(r.product_id))
        groups[key] += float(r.quantity or 0)
        group_rows[key].append(r)

    report: dict[str, Any] = {
        "dry_run": dry_run,
        "location_hold_rows": len(rows),
        "groups": len(groups),
        "created_or_increased": 0,
        "released_location_holds": 0,
        "errors": [],
        "totals_qty": round(sum(groups.values()), 6),
    }

    for (tid, wid, oid, pid), qty in groups.items():
        if qty <= 1e-9:
            continue
        if dry_run:
            report["created_or_increased"] += 1
            continue
        try:
            sync_order_warehouse_reservation_to_target(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                order_id=oid,
                product_id=pid,
                target_qty=round(qty, 6),
            )
            ensure_rz_document_for_order(db, tenant_id=tid, warehouse_id=wid, order_id=oid)
            report["created_or_increased"] += 1
            if release_location_holds:
                for r in group_rows[(tid, wid, oid, pid)]:
                    r.status = "released"
                    report["released_location_holds"] += 1
        except Exception as exc:
            report["errors"].append(
                {"tenant_id": tid, "warehouse_id": wid, "order_id": oid, "product_id": pid, "error": str(exc)}
            )
            logger.exception("backfill failed order=%s product=%s", oid, pid)

    if not dry_run:
        db.flush()
    return report
