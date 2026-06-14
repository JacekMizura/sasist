"""P4.18A — Bundle analytics KPIs and dashboard lists (read-only recommendations)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ....models.bundle import Bundle
from ....models.complaint import Complaint
from ....models.order import Order
from ....models.order_item import OrderItem
from ....models.order_line_bundle_component import OrderLineBundleComponent
from ....models.pick import Pick
from ....models.wms_order_return import WmsOrderReturn
from ....models.wms_packing_session import WmsPackingSession
from ....models.wms_rmz_line import RMZLine
from ....models.order_consolidation_plan import OrderConsolidationPlan


@dataclass
class BundleKpiRow:
    bundle_id: int
    bundle_name: str
    units_sold: int
    revenue_net: float
    margin_net: Optional[float]
    margin_percent: Optional[float]
    returns_count: int
    complaints_count: int
    avg_pick_seconds: Optional[float]
    avg_pack_seconds: Optional[float]
    avg_consolidation_seconds: Optional[float]
    growth_percent: Optional[float] = None


@dataclass
class BundleDashboard:
    top_bundles: list[BundleKpiRow] = field(default_factory=list)
    fastest_growing: list[BundleKpiRow] = field(default_factory=list)
    highest_margin: list[BundleKpiRow] = field(default_factory=list)
    most_returns: list[BundleKpiRow] = field(default_factory=list)
    period_days: int = 30


def _period_start(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=max(1, int(days)))


def _margin_for_parent(db: Session, parent: OrderItem) -> tuple[Optional[float], Optional[float]]:
    rev = float(parent.total_price or 0)
    if rev <= 0:
        qty = float(parent.quantity or 0)
        rev = float(parent.unit_price or 0) * qty
    rows = (
        db.query(OrderLineBundleComponent)
        .filter(OrderLineBundleComponent.order_line_id == int(parent.id))
        .all()
    )
    if not rows:
        return None, None
    cost = sum(float(r.purchase_price_net_snapshot or 0) * float(r.quantity_total or 0) for r in rows)
    margin = rev - cost
    pct = (margin / rev * 100.0) if rev > 1e-9 else None
    return round(margin, 2), round(pct, 2) if pct is not None else None


def _bundle_parent_rows(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    since: datetime,
    until: Optional[datetime] = None,
) -> list[tuple[OrderItem, Order]]:
    q = (
        db.query(OrderItem, Order)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            OrderItem.is_bundle_parent.is_(True),
            OrderItem.source_bundle_id.isnot(None),
        )
    )
    if since is not None:
        q = q.filter(func.coalesce(Order.created_at, Order.order_date) >= since)
    if until is not None:
        q = q.filter(func.coalesce(Order.created_at, Order.order_date) < until)
    return q.all()


def _aggregate_kpis(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    since: datetime,
    prev_since: Optional[datetime] = None,
    prev_until: Optional[datetime] = None,
) -> dict[int, BundleKpiRow]:
    bundles = {
        int(b.id): str(b.name or f"Bundle #{b.id}")
        for b in db.query(Bundle).filter(Bundle.tenant_id == int(tenant_id), Bundle.deleted_at.is_(None)).all()
    }
    out: dict[int, BundleKpiRow] = {}

    for oi, _order in _bundle_parent_rows(db, tenant_id=tenant_id, warehouse_id=warehouse_id, since=since):
        bid = int(oi.source_bundle_id)
        row = out.get(bid)
        if row is None:
            row = BundleKpiRow(
                bundle_id=bid,
                bundle_name=bundles.get(bid, f"Bundle #{bid}"),
                units_sold=0,
                revenue_net=0.0,
                margin_net=None,
                margin_percent=None,
                returns_count=0,
                complaints_count=0,
                avg_pick_seconds=None,
                avg_pack_seconds=None,
                avg_consolidation_seconds=None,
            )
            out[bid] = row
        qty = int(oi.quantity or 0)
        row.units_sold += qty
        rev = float(oi.total_price or 0) or float(oi.unit_price or 0) * qty
        row.revenue_net = round(row.revenue_net + rev, 2)
        m_amt, m_pct = _margin_for_parent(db, oi)
        if m_amt is not None:
            row.margin_net = round((row.margin_net or 0) + m_amt, 2)
        if m_pct is not None and row.units_sold > 0:
            row.margin_percent = m_pct

    # Returns per bundle
    ret_rows = (
        db.query(OrderItem.source_bundle_id, func.count(func.distinct(RMZLine.id)))
        .join(RMZLine, RMZLine.order_item_id == OrderItem.id)
        .join(WmsOrderReturn, WmsOrderReturn.id == RMZLine.rmz_id)
        .filter(
            WmsOrderReturn.tenant_id == int(tenant_id),
            WmsOrderReturn.warehouse_id == int(warehouse_id),
            OrderItem.is_bundle_parent.is_(True),
            OrderItem.source_bundle_id.isnot(None),
            WmsOrderReturn.created_at >= since,
        )
        .group_by(OrderItem.source_bundle_id)
        .all()
    )
    for bid, cnt in ret_rows:
        if bid is None:
            continue
        bid_i = int(bid)
        if bid_i not in out:
            out[bid_i] = BundleKpiRow(
                bundle_id=bid_i,
                bundle_name=bundles.get(bid_i, f"Bundle #{bid_i}"),
                units_sold=0,
                revenue_net=0.0,
                margin_net=None,
                margin_percent=None,
                returns_count=0,
                complaints_count=0,
                avg_pick_seconds=None,
                avg_pack_seconds=None,
                avg_consolidation_seconds=None,
            )
        out[bid_i].returns_count = int(cnt or 0)

    # Complaints on orders with bundle parent
    cmp_rows = (
        db.query(OrderItem.source_bundle_id, func.count(func.distinct(Complaint.id)))
        .join(Order, Order.id == OrderItem.order_id)
        .join(Complaint, Complaint.order_id == Order.id)
        .filter(
            Complaint.tenant_id == int(tenant_id),
            Complaint.warehouse_id == int(warehouse_id),
            OrderItem.is_bundle_parent.is_(True),
            OrderItem.source_bundle_id.isnot(None),
            Complaint.created_at >= since,
            Complaint.deleted_at.is_(None),
        )
        .group_by(OrderItem.source_bundle_id)
        .all()
    )
    for bid, cnt in cmp_rows:
        if bid is None:
            continue
        bid_i = int(bid)
        if bid_i in out:
            out[bid_i].complaints_count = int(cnt or 0)

    # Avg pick duration: min→max picked_at on component lines per bundle parent
    parent_rows = _bundle_parent_rows(db, tenant_id=tenant_id, warehouse_id=warehouse_id, since=since)
    parent_to_bundle = {int(oi.id): int(oi.source_bundle_id) for oi, _ in parent_rows if oi.source_bundle_id}
    parent_ids = list(parent_to_bundle.keys())
    pick_by_bundle: dict[int, list[float]] = {}
    if parent_ids:
        comp_items = (
            db.query(OrderItem.id, OrderItem.parent_bundle_order_item_id)
            .filter(OrderItem.parent_bundle_order_item_id.in_(parent_ids))
            .all()
        )
        comp_ids = [int(c.id) for c in comp_items]
        comp_to_parent = {int(c.id): int(c.parent_bundle_order_item_id) for c in comp_items}
        if comp_ids:
            picks = (
                db.query(Pick.order_item_id, Pick.picked_at)
                .filter(Pick.order_item_id.in_(comp_ids), Pick.picked_at.isnot(None))
                .all()
            )
            by_parent: dict[int, list[datetime]] = {}
            for oiid, ts in picks:
                pid = comp_to_parent.get(int(oiid))
                if pid is None:
                    continue
                by_parent.setdefault(pid, []).append(ts)
            for parent_id, times in by_parent.items():
                bid = parent_to_bundle.get(parent_id)
                if bid is None or len(times) < 2:
                    continue
                pick_by_bundle.setdefault(bid, []).append((max(times) - min(times)).total_seconds())
    for bid, secs in pick_by_bundle.items():
        if bid in out and secs:
            out[bid].avg_pick_seconds = round(sum(secs) / len(secs), 1)

    # Pack duration from WmsPackingSession
    pack_rows = (
        db.query(OrderItem.source_bundle_id, func.avg(WmsPackingSession.duration_seconds))
        .join(Order, Order.id == OrderItem.order_id)
        .join(WmsPackingSession, WmsPackingSession.order_id == Order.id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            OrderItem.is_bundle_parent.is_(True),
            WmsPackingSession.duration_seconds.isnot(None),
            WmsPackingSession.started_at >= since,
        )
        .group_by(OrderItem.source_bundle_id)
        .all()
    )
    for bid, avg_sec in pack_rows:
        if bid is None:
            continue
        bid_i = int(bid)
        if bid_i in out and avg_sec is not None:
            out[bid_i].avg_pack_seconds = round(float(avg_sec), 1)

    # Consolidation plan duration
    cons_rows = (
        db.query(
            OrderItem.source_bundle_id,
            func.avg(
                func.extract(
                    "epoch",
                    func.coalesce(OrderConsolidationPlan.updated_at, OrderConsolidationPlan.created_at)
                    - OrderConsolidationPlan.created_at,
                )
            ),
        )
        .join(OrderConsolidationPlan, OrderConsolidationPlan.order_id == OrderItem.order_id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            OrderItem.is_bundle_parent.is_(True),
            OrderConsolidationPlan.created_at >= since,
        )
        .group_by(OrderItem.source_bundle_id)
        .all()
    )
    for bid, avg_sec in cons_rows:
        if bid is None:
            continue
        bid_i = int(bid)
        if bid_i in out and avg_sec is not None:
            out[bid_i].avg_consolidation_seconds = round(float(avg_sec), 1)

    if prev_since is not None and prev_until is not None:
        prev = _aggregate_kpis(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            since=prev_since,
            prev_since=None,
            prev_until=None,
        )
        for bid, row in out.items():
            prev_units = prev.get(bid).units_sold if bid in prev else 0
            if prev_units > 0:
                row.growth_percent = round((row.units_sold - prev_units) / prev_units * 100.0, 1)
            elif row.units_sold > 0:
                row.growth_percent = 100.0

    return out


def build_bundle_dashboard(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    period_days: int = 30,
    list_limit: int = 10,
) -> BundleDashboard:
    since = _period_start(period_days)
    prev_until = since
    prev_since = since - timedelta(days=period_days)
    kpis = _aggregate_kpis(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        since=since,
        prev_since=prev_since,
        prev_until=prev_until,
    )
    rows = list(kpis.values())
    top = sorted(rows, key=lambda r: r.units_sold, reverse=True)[:list_limit]
    growing = sorted(
        [r for r in rows if r.growth_percent is not None],
        key=lambda r: float(r.growth_percent or 0),
        reverse=True,
    )[:list_limit]
    margin = sorted(
        [r for r in rows if r.margin_net is not None],
        key=lambda r: float(r.margin_net or 0),
        reverse=True,
    )[:list_limit]
    returns = sorted(rows, key=lambda r: r.returns_count, reverse=True)[:list_limit]
    return BundleDashboard(
        top_bundles=top,
        fastest_growing=growing,
        highest_margin=margin,
        most_returns=returns,
        period_days=period_days,
    )
