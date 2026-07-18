"""
Capacity Analytics service — persist & query engine run diagnostics.

Never dual-writes into Activity Log. Details are stored for lazy pagination only.
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Sequence

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ...models.capacity_analytics import (
    CapacityAnalyticsDetail,
    CapacityAnalyticsReasonAgg,
    CapacityAnalyticsRun,
)
from ...models.cart import Cart
from ...models.order import Order
from .reason_labels import reason_label_pl

logger = logging.getLogger(__name__)

# Cap Activity-facing order number lists elsewhere; analytics stores all details
# in a dedicated table and never dumps them into event metadata.


def _order_number(o: Order) -> str:
    num = getattr(o, "number", None)
    return str(num).strip() if num not in (None, "") else str(int(o.id))


def _cart_label(cart: Cart) -> str:
    return str(getattr(cart, "code", None) or getattr(cart, "name", None) or f"#{int(cart.id)}")


def persist_capacity_run(
    db: Session,
    *,
    cart: Cart,
    source: str,
    strategy: str | None,
    operator_user_id: int | None,
    assigned: Sequence[Order],
    rejected: Sequence[tuple[Order, str]],
    occurred_at: datetime | None = None,
) -> CapacityAnalyticsRun | None:
    """
    Persist one Capacity Engine run: aggregates + detail rows.
    ``rejected`` = list of (order, reason_code).
    Candidates count = assigned + rejected.
    Uses a SAVEPOINT so missing tables / flush errors never poison the caller transaction.
    """
    assigned_list = list(assigned)
    rejected_list = list(rejected)
    candidates_n = len(assigned_list) + len(rejected_list)
    if candidates_n <= 0:
        return None

    when = occurred_at or datetime.utcnow()
    label = _cart_label(cart)
    nested = db.begin_nested()
    try:
        run = CapacityAnalyticsRun(
            tenant_id=int(cart.tenant_id),
            warehouse_id=int(cart.warehouse_id),
            cart_id=int(cart.id),
            occurred_at=when,
            operator_user_id=int(operator_user_id) if operator_user_id else None,
            source=str(source or "start_picking")[:64],
            strategy=(str(strategy).strip()[:64] if strategy else None),
            candidates_count=candidates_n,
            assigned_count=len(assigned_list),
            rejected_count=len(rejected_list),
            cart_label=label[:128],
        )
        db.add(run)
        db.flush()

        reason_counts: Counter[str] = Counter()
        for _o, code in rejected_list:
            reason_counts[str(code or "capacity_reached")] += 1

        for code, cnt in reason_counts.items():
            db.add(
                CapacityAnalyticsReasonAgg(
                    run_id=int(run.id),
                    reason_code=code[:64],
                    reason_label=reason_label_pl(code)[:256],
                    count=int(cnt),
                )
            )

        details: list[CapacityAnalyticsDetail] = []
        for o in assigned_list:
            details.append(
                CapacityAnalyticsDetail(
                    run_id=int(run.id),
                    tenant_id=int(cart.tenant_id),
                    warehouse_id=int(cart.warehouse_id),
                    cart_id=int(cart.id),
                    order_id=int(o.id),
                    order_number=_order_number(o)[:64],
                    result="assigned",
                    reason_code=None,
                    reason_label=None,
                    occurred_at=when,
                    operator_user_id=int(operator_user_id) if operator_user_id else None,
                    cart_label=label[:128],
                )
            )
        for o, code in rejected_list:
            c = str(code or "capacity_reached")
            details.append(
                CapacityAnalyticsDetail(
                    run_id=int(run.id),
                    tenant_id=int(cart.tenant_id),
                    warehouse_id=int(cart.warehouse_id),
                    cart_id=int(cart.id),
                    order_id=int(o.id),
                    order_number=_order_number(o)[:64],
                    result="rejected",
                    reason_code=c[:64],
                    reason_label=reason_label_pl(c)[:256],
                    occurred_at=when,
                    operator_user_id=int(operator_user_id) if operator_user_id else None,
                    cart_label=label[:128],
                )
            )
        db.bulk_save_objects(details)
        db.flush()
        nested.commit()
        logger.info(
            "capacity_analytics.run id=%s cart=%s candidates=%s assigned=%s rejected=%s",
            int(run.id),
            int(cart.id),
            candidates_n,
            len(assigned_list),
            len(rejected_list),
        )
        return run
    except Exception:
        nested.rollback()
        logger.exception(
            "capacity_analytics.persist failed cart_id=%s",
            getattr(cart, "id", None),
        )
        return None


def get_latest_run_for_cart(db: Session, *, cart_id: int) -> dict[str, Any] | None:
    run = (
        db.query(CapacityAnalyticsRun)
        .filter(CapacityAnalyticsRun.cart_id == int(cart_id))
        .order_by(desc(CapacityAnalyticsRun.occurred_at), desc(CapacityAnalyticsRun.id))
        .first()
    )
    if run is None:
        return None
    return serialize_run(db, run)


def serialize_run(db: Session, run: CapacityAnalyticsRun) -> dict[str, Any]:
    aggs = (
        db.query(CapacityAnalyticsReasonAgg)
        .filter(CapacityAnalyticsReasonAgg.run_id == int(run.id))
        .order_by(desc(CapacityAnalyticsReasonAgg.count))
        .all()
    )
    return {
        "run_id": int(run.id),
        "cart_id": int(run.cart_id),
        "tenant_id": int(run.tenant_id),
        "warehouse_id": int(run.warehouse_id),
        "occurred_at": run.occurred_at.isoformat() if run.occurred_at else None,
        "operator_user_id": run.operator_user_id,
        "source": run.source,
        "strategy": run.strategy,
        "cart_label": run.cart_label,
        "candidates_count": int(run.candidates_count or 0),
        "assigned_count": int(run.assigned_count or 0),
        "rejected_count": int(run.rejected_count or 0),
        "reasons": [
            {
                "reason_code": a.reason_code,
                "reason_label": a.reason_label,
                "count": int(a.count or 0),
            }
            for a in aggs
        ],
    }


def list_reason_order_details(
    db: Session,
    *,
    run_id: int,
    reason_code: str,
    offset: int = 0,
    limit: int = 50,
) -> dict[str, Any]:
    code = str(reason_code or "").strip()
    lim = max(1, min(int(limit), 100))
    off = max(0, int(offset))
    q = db.query(CapacityAnalyticsDetail).filter(
        CapacityAnalyticsDetail.run_id == int(run_id),
        CapacityAnalyticsDetail.result == "rejected",
        CapacityAnalyticsDetail.reason_code == code,
    )
    total = int(q.count() or 0)
    rows = (
        q.order_by(CapacityAnalyticsDetail.id.asc())
        .offset(off)
        .limit(lim)
        .all()
    )
    return {
        "run_id": int(run_id),
        "reason_code": code,
        "reason_label": reason_label_pl(code),
        "total": total,
        "offset": off,
        "limit": lim,
        "has_more": off + len(rows) < total,
        "items": [
            {
                "order_id": int(r.order_id),
                "order_number": r.order_number or str(r.order_id),
            }
            for r in rows
        ],
    }


def warehouse_stats_24h(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    hours: int = 24,
) -> dict[str, Any]:
    hrs = max(1, min(int(hours), 168))
    since = datetime.utcnow() - timedelta(hours=hrs)
    runs = (
        db.query(CapacityAnalyticsRun)
        .filter(
            CapacityAnalyticsRun.tenant_id == int(tenant_id),
            CapacityAnalyticsRun.warehouse_id == int(warehouse_id),
            CapacityAnalyticsRun.occurred_at >= since,
        )
        .all()
    )
    assigned = sum(int(r.assigned_count or 0) for r in runs)
    rejected = sum(int(r.rejected_count or 0) for r in runs)
    run_ids = [int(r.id) for r in runs]
    top: list[dict[str, Any]] = []
    if run_ids:
        rows = (
            db.query(
                CapacityAnalyticsReasonAgg.reason_code,
                CapacityAnalyticsReasonAgg.reason_label,
                func.sum(CapacityAnalyticsReasonAgg.count).label("cnt"),
            )
            .filter(CapacityAnalyticsReasonAgg.run_id.in_(run_ids))
            .group_by(
                CapacityAnalyticsReasonAgg.reason_code,
                CapacityAnalyticsReasonAgg.reason_label,
            )
            .order_by(desc("cnt"))
            .limit(10)
            .all()
        )
        total_rej = rejected or 1
        for code, label, cnt in rows:
            c = int(cnt or 0)
            top.append(
                {
                    "reason_code": code,
                    "reason_label": label or reason_label_pl(code),
                    "count": c,
                    "percent": round(100.0 * c / total_rej, 1) if rejected else 0.0,
                }
            )
    return {
        "hours": hrs,
        "since": since.isoformat(),
        "runs_count": len(runs),
        "assigned_count": assigned,
        "rejected_count": rejected,
        "top_reasons": top,
    }


def list_order_capacity_history(
    db: Session,
    *,
    order_id: int,
    limit: int = 50,
) -> list[dict[str, Any]]:
    lim = max(1, min(int(limit), 100))
    rows = (
        db.query(CapacityAnalyticsDetail)
        .filter(CapacityAnalyticsDetail.order_id == int(order_id))
        .order_by(desc(CapacityAnalyticsDetail.occurred_at), desc(CapacityAnalyticsDetail.id))
        .limit(lim)
        .all()
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "id": int(r.id),
                "occurred_at": r.occurred_at.isoformat() if r.occurred_at else None,
                "cart_id": int(r.cart_id),
                "cart_label": r.cart_label,
                "result": r.result,
                "reason_code": r.reason_code,
                "reason_label": r.reason_label,
                "operator_user_id": r.operator_user_id,
                "run_id": int(r.run_id),
            }
        )
    return out
