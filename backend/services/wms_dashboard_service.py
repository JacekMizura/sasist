"""Aggregates for WMS operational dashboard (no sales / marketplace metrics)."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Set

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..models.inventory import Inventory
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.order_ui_status import OrderUiStatus
from ..models.pick import Pick
from ..models.picking_config import PickingConfig
from ..models.product import Product
from ..schemas.wms_dashboard import (
    WmsDashboardAlert,
    WmsDashboardSummaryOut,
    WmsDashboardTopProduct,
    WmsTenantPanelCountersOut,
)
from .wms_packing_service import _sum_inventory_for_product


def _utc_day_start() -> datetime:
    now = datetime.utcnow()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _iso_utc_z(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds") + "Z"
    return dt.isoformat(timespec="seconds") + "Z"


def build_wms_dashboard_summary(db: Session, *, tenant_id: int, warehouse_id: int) -> WmsDashboardSummaryOut:
    tid = int(tenant_id)
    wid = int(warehouse_id)
    day0 = _utc_day_start()

    # --- Orders today (created_at or order_date on UTC calendar day)
    orders_today = int(
        db.query(func.count(Order.id))
        .filter(
            Order.tenant_id == tid,
            Order.warehouse_id == wid,
            Order.deleted_at.is_(None),
            or_(
                Order.created_at >= day0,
                Order.order_date >= day0,
            ),
        )
        .scalar()
        or 0
    )

    # --- Picking: source / target status ids from config
    cfg_rows: List[PickingConfig] = (
        db.query(PickingConfig).filter(PickingConfig.tenant_id == tid, PickingConfig.warehouse_id == wid).all()
    )
    source_ids: Set[int] = {int(r.source_status_id) for r in cfg_rows}
    target_ids: Set[int] = {int(r.target_status_id) for r in cfg_rows}

    orders_to_collect = 0
    picking_to_collect = 0.0
    picking_collected = 0.0

    if source_ids:
        orders_to_collect = int(
            db.query(func.count(Order.id))
            .filter(
                Order.tenant_id == tid,
                Order.warehouse_id == wid,
                Order.deleted_at.is_(None),
                Order.order_ui_status_id.in_(list(source_ids)),
            )
            .scalar()
            or 0
        )

        src_order_ids = [
            int(x[0])
            for x in db.query(Order.id)
            .filter(
                Order.tenant_id == tid,
                Order.warehouse_id == wid,
                Order.deleted_at.is_(None),
                Order.order_ui_status_id.in_(list(source_ids)),
            )
            .limit(8000)
            .all()
        ]

        if src_order_ids:
            items = (
                db.query(OrderItem)
                .filter(
                    OrderItem.order_id.in_(src_order_ids),
                    OrderItem.is_bundle_parent.is_(False),
                )
                .options(joinedload(OrderItem.product))
                .all()
            )
            oi_ids = [int(it.id) for it in items]
            pick_map: Dict[int, float] = defaultdict(float)
            if oi_ids:
                for oid, sq in (
                    db.query(Pick.order_item_id, func.coalesce(func.sum(Pick.quantity), 0))
                    .filter(Pick.order_item_id.in_(oi_ids))
                    .group_by(Pick.order_item_id)
                    .all()
                ):
                    if oid is not None:
                        pick_map[int(oid)] = float(sq or 0)

            for it in items:
                qo = int(it.quantity or 0)
                pq = min(qo, pick_map.get(int(it.id), 0.0))
                picking_to_collect += max(0.0, float(qo) - float(pq))

        picking_collected = float(
            db.query(func.coalesce(func.sum(Pick.quantity), 0))
            .filter(
                Pick.warehouse_id == wid,
                Pick.tenant_id == tid,
                Pick.picked_at.isnot(None),
                Pick.picked_at >= day0,
            )
            .scalar()
            or 0
        )

    packing_spakowane = 0
    packing_do_spakowania = 0
    packing_w_trakcie = 0
    packing_braki = 0
    packing_packed = 0
    packing_to_pack = 0

    if target_ids:
        tgt_orders = (
            db.query(Order)
            .filter(
                Order.tenant_id == tid,
                Order.warehouse_id == wid,
                Order.deleted_at.is_(None),
                Order.order_ui_status_id.in_(list(target_ids)),
            )
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .limit(5000)
            .all()
        )

        product_ids: Set[int] = set()
        for o in tgt_orders:
            for it in o.items or []:
                if it.product_id:
                    product_ids.add(int(it.product_id))

        inv_map: Dict[int, int] = {}
        if product_ids:
            inv_rows = (
                db.query(Inventory.product_id, func.coalesce(func.sum(Inventory.quantity), 0))
                .filter(
                    Inventory.tenant_id == tid,
                    Inventory.warehouse_id == wid,
                    Inventory.product_id.in_(list(product_ids)),
                )
                .group_by(Inventory.product_id)
                .all()
            )
            inv_map = {int(pid): int(float(q or 0)) for pid, q in inv_rows}

        for o in tgt_orders:
            lines = list(o.items or [])
            if not lines:
                continue
            total_q = 0
            packed_q = 0
            has_shortage = False
            for it in lines:
                qo = int(it.quantity or 0)
                raw = int(getattr(it, "packing_quantity_packed", 0) or 0)
                qp = min(qo, max(0, raw))
                total_q += qo
                packed_q += qp
                pid = int(it.product_id) if it.product_id else 0
                if pid:
                    stock = inv_map.get(pid)
                    if stock is None:
                        stock = _sum_inventory_for_product(db, tid, wid, pid)
                        inv_map[pid] = stock
                    if stock < qo:
                        has_shortage = True

            packing_packed += packed_q
            packing_to_pack += max(0, total_q - packed_q)

            if total_q <= 0:
                continue
            if packed_q >= total_q:
                packing_spakowane += 1
                continue
            if has_shortage:
                packing_braki += 1
                continue
            if packed_q == 0:
                packing_do_spakowania += 1
            else:
                packing_w_trakcie += 1

    # --- Top picked products (last 14 days, operational picks — not sales)
    since = datetime.utcnow() - timedelta(days=14)
    top_picked_products: List[WmsDashboardTopProduct] = []
    sum_qty = func.sum(Pick.quantity)
    top_rows = (
        db.query(Pick.product_id, sum_qty)
        .filter(
            Pick.tenant_id == tid,
            Pick.warehouse_id == wid,
            Pick.picked_at.isnot(None),
            Pick.picked_at >= since,
        )
        .group_by(Pick.product_id)
        .order_by(sum_qty.desc())
        .limit(12)
        .all()
    )
    if not top_rows:
        sum_fallback = func.sum(Pick.quantity)
        top_rows = (
            db.query(Pick.product_id, sum_fallback)
            .filter(Pick.tenant_id == tid, Pick.warehouse_id == wid)
            .group_by(Pick.product_id)
            .having(sum_fallback > 0)
            .order_by(sum_fallback.desc())
            .limit(12)
            .all()
        )

    pids = [int(pid) for pid, _ in top_rows]
    if pids:
        products = {int(p.id): p for p in db.query(Product).filter(Product.id.in_(pids)).all()}
        qty_map = {int(pid): float(q or 0) for pid, q in top_rows}
        for pid in pids:
            p = products.get(pid)
            name = (p.name or "—") if p else "—"
            img = None
            if p is not None:
                iu = getattr(p, "image_url", None)
                img = str(iu).strip() if iu is not None and str(iu).strip() else None
            top_picked_products.append(
                WmsDashboardTopProduct(
                    product_id=pid,
                    name=name,
                    image_url=img,
                    pick_qty=round(qty_map.get(pid, 0.0), 3),
                )
            )

    alerts: List[WmsDashboardAlert] = []

    done_status_ids: Set[int] = {
        int(r[0])
        for r in db.query(OrderUiStatus.id)
        .filter(
            OrderUiStatus.tenant_id == tid,
            OrderUiStatus.warehouse_id == wid,
            OrderUiStatus.main_group == "DONE",
            OrderUiStatus.is_active.is_(True),
        )
        .all()
    }

    if done_status_ids:
        orders_closed_packed_today = int(
            db.query(func.count(Order.id))
            .filter(
                Order.tenant_id == tid,
                Order.warehouse_id == wid,
                Order.deleted_at.is_(None),
                Order.order_ui_status_id.in_(list(done_status_ids)),
                Order.packed_at.isnot(None),
                Order.packed_at >= day0,
            )
            .scalar()
            or 0
        )
    else:
        orders_closed_packed_today = 0

    cutoff_delay = datetime.utcnow() - timedelta(hours=48)
    delay_q = db.query(func.count(Order.id)).filter(
        Order.tenant_id == tid,
        Order.warehouse_id == wid,
        Order.deleted_at.is_(None),
        Order.order_date.isnot(None),
        Order.order_date < cutoff_delay,
    )
    if done_status_ids:
        delay_q = delay_q.filter(
            or_(Order.order_ui_status_id.is_(None), ~Order.order_ui_status_id.in_(list(done_status_ids)))
        )
    orders_delayed = int(delay_q.scalar() or 0)

    active_picking_sessions = int(
        db.query(func.count(func.distinct(Order.picking_session_id)))
        .filter(
            Order.tenant_id == tid,
            Order.warehouse_id == wid,
            Order.deleted_at.is_(None),
            Order.picking_session_id.isnot(None),
        )
        .scalar()
        or 0
    )

    mx_created = db.query(func.max(Order.created_at)).filter(Order.tenant_id == tid, Order.warehouse_id == wid).scalar()
    mx_pick_at = db.query(func.max(Pick.picked_at)).filter(Pick.tenant_id == tid, Pick.warehouse_id == wid).scalar()
    candidates_la = [x for x in (mx_created, mx_pick_at) if x is not None]
    last_activity_at = _iso_utc_z(max(candidates_la) if candidates_la else None)

    if packing_braki >= 15 or orders_delayed >= 50:
        operational_health = "critical"
    elif packing_braki > 0 or orders_delayed > 0 or orders_to_collect >= 80:
        operational_health = "attention"
    else:
        operational_health = "nominal"

    if packing_braki > 0:
        alerts.append(
            WmsDashboardAlert(
                kind="warning",
                message=f"Braki na magazynie: {packing_braki} zamówień w kolejce pakowania",
            )
        )
    if orders_delayed > 0:
        alerts.append(
            WmsDashboardAlert(
                kind="warning",
                message=f"Opóźnione zamówienia (>48 h, bez statusu DONE): {orders_delayed}",
            )
        )

    return WmsDashboardSummaryOut(
        orders_today=orders_today,
        orders_to_collect=orders_to_collect,
        packing_spakowane=packing_spakowane,
        packing_do_spakowania=packing_do_spakowania,
        packing_w_trakcie=packing_w_trakcie,
        packing_braki=packing_braki,
        picking_collected=picking_collected,
        picking_to_collect=round(picking_to_collect, 3),
        packing_packed=int(packing_packed),
        packing_to_pack=int(packing_to_pack),
        alerts=alerts,
        top_picked_products=top_picked_products,
        orders_delayed=orders_delayed,
        orders_closed_packed_today=orders_closed_packed_today,
        active_picking_sessions=active_picking_sessions,
        last_activity_at=last_activity_at,
        operational_health=operational_health,
    )


def _tenant_warehouse_ids(db: Session, tenant_id: int) -> list[int]:
    from ..models.tenant_warehouse import TenantWarehouse
    from ..models.warehouse import Warehouse

    rows = (
        db.query(TenantWarehouse.warehouse_id)
        .filter(TenantWarehouse.tenant_id == int(tenant_id))
        .order_by(TenantWarehouse.warehouse_id.asc())
        .all()
    )
    if rows:
        return [int(r[0]) for r in rows]
    return [int(r[0]) for r in db.query(Warehouse.id).order_by(Warehouse.id.asc()).all()]


def build_tenant_wms_panel_counters(db: Session, *, tenant_id: int) -> WmsTenantPanelCountersOut:
    """Sum Pilne/Opóźnione counters across all tenant warehouses (ERP top bar)."""
    delayed = 0
    braki = 0
    for wid in _tenant_warehouse_ids(db, tenant_id):
        summary = build_wms_dashboard_summary(db, tenant_id=int(tenant_id), warehouse_id=wid)
        delayed += int(summary.orders_delayed or 0)
        braki += int(summary.packing_braki or 0)
    return WmsTenantPanelCountersOut(orders_delayed=delayed, packing_braki=braki)
