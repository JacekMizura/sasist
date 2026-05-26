"""Supplier performance scorecard with PZ-first completed-delivery metrics."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..models.inbound_delivery import InboundDelivery
from ..models.purchase_order import PurchaseOrder, PurchaseOrderItem
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_operation import STOCK_OP_RECEIPT, StockOperation
from ..models.supplier import Supplier
from ..models.supplier_product import SupplierProduct
from .purchasing_order_service import PO_CANCELLED, PO_DRAFT

def _expected_for_pz(doc: StockDocument, delivery: Optional[InboundDelivery], po: Optional[PurchaseOrder]) -> Optional[datetime]:
    if delivery is not None and delivery.expected_date is not None:
        return delivery.expected_date
    if po is not None and po.expected_date is not None:
        return po.expected_date
    return None


def _days_late(received_at: datetime, expected: datetime) -> float:
    return max(0.0, (received_at - expected).total_seconds() / 86400.0)


def _vat_multiplier(vat_rate: Optional[float]) -> float:
    try:
        v = float(vat_rate if vat_rate is not None else 23.0)
    except (TypeError, ValueError):
        v = 23.0
    return 1.0 + max(-100.0, v) / 100.0


def _declared_lead_days(db: Session, supplier: Supplier) -> Optional[float]:
    if supplier.default_lead_time_days is not None and int(supplier.default_lead_time_days) > 0:
        return float(supplier.default_lead_time_days)
    rows = (
        db.query(SupplierProduct.lead_time_days)
        .filter(SupplierProduct.supplier_id == supplier.id)
        .all()
    )
    vals = [int(r[0]) for r in rows if r[0] is not None and int(r[0]) > 0]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _compute_subscores(
    *,
    on_time_percent: Optional[float],
    avg_buy_price_change_percent: Optional[float],
    avg_delay_days: Optional[float],
    partial_delivery_percent: Optional[float],
    days_since_last_delivery: Optional[float],
    range_days: int,
) -> Tuple[float, float, float, float, float, bool]:
    """
    Returns (s_on_time, s_price, s_delay, s_fulfill, s_fresh, used_fallback).
    Each subscore in [0, 100]; neutral 55 used only when a dimension has no data (partial analytics).
    """
    used_fallback = False

    if on_time_percent is not None:
        s_on = max(0.0, min(100.0, float(on_time_percent)))
    else:
        s_on = 55.0
        used_fallback = True

    # Price stability: lower abs % change vs previous window is better
    if avg_buy_price_change_percent is not None:
        ch = float(avg_buy_price_change_percent)
        s_price = max(0.0, min(100.0, 100.0 - min(ch, 100.0)))
    else:
        s_price = 55.0
        used_fallback = True

    # Low delay: map avg delay days to 0–100 (0 days -> 100)
    if avg_delay_days is not None:
        ad = float(avg_delay_days)
        s_delay = max(0.0, min(100.0, 100.0 - min(ad * 12.0, 100.0)))
    else:
        s_delay = 55.0
        used_fallback = True

    if partial_delivery_percent is not None:
        p = float(partial_delivery_percent)
        s_fulfill = max(0.0, min(100.0, 100.0 - min(p, 100.0)))
    else:
        s_fulfill = 55.0
        used_fallback = True

    # Freshness: decay from last delivery within range
    if days_since_last_delivery is not None:
        dsl = float(days_since_last_delivery)
        half = max(7.0, float(range_days) * 0.25)
        s_fresh = max(0.0, min(100.0, 100.0 * (1.0 - min(dsl / half, 1.0))))
    else:
        s_fresh = 35.0
        used_fallback = True

    return s_on, s_price, s_delay, s_fulfill, s_fresh, used_fallback


def _final_score(s_on: float, s_price: float, s_delay: float, s_fulfill: float, s_fresh: float) -> float:
    return 0.4 * s_on + 0.2 * s_price + 0.2 * s_delay + 0.1 * s_fulfill + 0.1 * s_fresh


def _risk_level(score: Optional[float], insufficient: bool) -> str:
    if insufficient:
        return "high"
    if score is None:
        return "high"
    if score >= 70.0:
        return "low"
    if score >= 50.0:
        return "medium"
    return "high"


def _weighted_price_change_percent(
    *,
    curr: Dict[int, Tuple[float, float]],
    prev: Dict[int, Tuple[float, float]],
) -> Optional[float]:
    common = set(curr.keys()) & set(prev.keys())
    if not common:
        return None
    changes: List[float] = []
    for pid in common:
        curr_num, curr_den = curr[pid]
        prev_num, prev_den = prev[pid]
        if curr_den <= 1e-9 or prev_den <= 1e-9:
            continue
        ca = curr_num / curr_den
        pb = prev_num / prev_den
        if pb <= 1e-9:
            continue
        changes.append(abs((ca - pb) / pb) * 100.0)
    if not changes:
        return None
    return sum(changes) / len(changes)


def _month_bucket_key(dt: datetime) -> str:
    return f"{dt.year:04d}-{dt.month:02d}"


def build_supplier_analytics(
    db: Session,
    *,
    tenant_id: int,
    supplier_id: Optional[int],
    range_days: int,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    if range_days not in (30, 90, 365):
        range_days = 90
    now = now or datetime.utcnow()
    window_start = now - timedelta(days=range_days)
    prev_start = window_start - timedelta(days=range_days)

    q = db.query(Supplier).filter(Supplier.tenant_id == tenant_id)
    if supplier_id is not None:
        q = q.filter(Supplier.id == int(supplier_id))
    suppliers = q.order_by(Supplier.name.asc()).all()
    if not suppliers:
        return {"range_days": range_days, "rows": [], "series": None}

    pz_docs = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.document_type == "PZ",
            StockDocument.created_at >= window_start,
            StockDocument.created_at <= now,
        )
        .all()
    )
    pz_doc_ids = [int(d.id) for d in pz_docs]
    pz_lines = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id.in_(pz_doc_ids))
        .all()
        if pz_doc_ids
        else []
    )
    pz_receipt_ops = (
        db.query(StockOperation)
        .filter(
            StockOperation.document_id.in_(pz_doc_ids),
            StockOperation.type == STOCK_OP_RECEIPT,
        )
        .all()
        if pz_doc_ids
        else []
    )
    pz_lines_by_doc: Dict[int, List[StockDocumentItem]] = defaultdict(list)
    for li in pz_lines:
        pz_lines_by_doc[int(li.document_id)].append(li)
    pz_receipts_by_doc: Dict[int, List[StockOperation]] = defaultdict(list)
    for op in pz_receipt_ops:
        pz_receipts_by_doc[int(op.document_id)].append(op)

    delivery_ids = sorted({int(d.delivery_id) for d in pz_docs if getattr(d, "delivery_id", None) is not None})
    linked_deliveries = (
        db.query(InboundDelivery)
        .options(joinedload(InboundDelivery.purchase_order))
        .filter(InboundDelivery.id.in_(delivery_ids))
        .all()
        if delivery_ids
        else []
    )
    delivery_by_id: Dict[int, InboundDelivery] = {int(d.id): d for d in linked_deliveries}

    pos = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items), joinedload(PurchaseOrder.linked_deliveries))
        .filter(
            PurchaseOrder.tenant_id == tenant_id,
            PurchaseOrder.created_at >= window_start,
            PurchaseOrder.created_at <= now,
        )
        .all()
    )

    sids = [int(s.id) for s in suppliers]
    catalog_counts: Dict[int, int] = {}
    if sids:
        for sid, cnt in (
            db.query(SupplierProduct.supplier_id, func.count(SupplierProduct.id))
            .filter(
                SupplierProduct.supplier_id.in_(sids),
                or_(SupplierProduct.tenant_id == tenant_id, SupplierProduct.tenant_id.is_(None)),
            )
            .group_by(SupplierProduct.supplier_id)
            .all()
        ):
            catalog_counts[int(sid)] = int(cnt)

    pz_by_supplier: Dict[int, List[StockDocument]] = defaultdict(list)
    for d in pz_docs:
        pz_by_supplier[int(d.supplier_id)].append(d)

    pos_by_supplier: Dict[int, List[PurchaseOrder]] = defaultdict(list)
    for p in pos:
        pos_by_supplier[int(p.supplier_id)].append(p)

    rows_out: List[Dict[str, Any]] = []

    for s in suppliers:
        sid = int(s.id)
        pz_list = pz_by_supplier.get(sid, [])
        plist = pos_by_supplier.get(sid, [])

        delays: List[float] = []
        on_flags: List[bool] = []
        receipt_dates: List[datetime] = []
        pz_value_net = 0.0
        pz_value_gross = 0.0
        deliveries_count = 0
        pz_price_curr: Dict[int, Tuple[float, float]] = defaultdict(lambda: (0.0, 0.0))
        pz_price_prev: Dict[int, Tuple[float, float]] = defaultdict(lambda: (0.0, 0.0))
        half_window_start = now - timedelta(days=max(1, range_days // 2))

        for doc in pz_list:
            line_rows = pz_lines_by_doc.get(int(doc.id), [])
            op_rows = pz_receipts_by_doc.get(int(doc.id), [])
            has_received_qty = any(float(getattr(li, "received_quantity", 0) or 0) > 1e-9 for li in line_rows)
            has_receipt_ops = any(float(getattr(op, "qty", 0) or 0) > 1e-9 for op in op_rows)
            if not has_received_qty and not has_receipt_ops:
                continue
            deliveries_count += 1
            receipt_dt = max((op.created_at for op in op_rows if op.created_at is not None), default=None)
            if receipt_dt is None:
                receipt_dt = getattr(doc, "updated_at", None) or getattr(doc, "created_at", None)
            if receipt_dt is not None:
                receipt_dates.append(receipt_dt)

            # Value from explicit doc totals if present; fallback to line-level computed values.
            if getattr(doc, "total_net", None) is not None:
                pz_value_net += float(doc.total_net or 0)
            if getattr(doc, "total_gross", None) is not None:
                pz_value_gross += float(doc.total_gross or 0)
            if getattr(doc, "total_net", None) is None or getattr(doc, "total_gross", None) is None:
                for li in line_rows:
                    q = float(getattr(li, "received_quantity", 0) or 0)
                    if q <= 1e-9:
                        continue
                    pn = float(getattr(li, "purchase_price_net", 0) or 0)
                    vm = _vat_multiplier(getattr(li, "vat_rate", None))
                    if getattr(doc, "total_net", None) is None:
                        pz_value_net += q * pn
                    if getattr(doc, "total_gross", None) is None:
                        pz_value_gross += q * pn * vm

            delivery = delivery_by_id.get(int(doc.delivery_id)) if getattr(doc, "delivery_id", None) is not None else None
            po = delivery.purchase_order if delivery is not None else None
            exp = _expected_for_pz(doc, delivery, po)
            if exp is not None and receipt_dt is not None:
                late = _days_late(receipt_dt, exp)
                delays.append(late)
                on_flags.append(late <= 1.0)

            # Price trend based on RECEIPT ledger (preferred) with line fallback.
            if op_rows:
                for op in op_rows:
                    if op.product_id is None:
                        continue
                    q = float(op.qty or 0)
                    up = float(op.unit_price_net) if op.unit_price_net is not None else None
                    if q <= 1e-9 or up is None:
                        continue
                    bucket = pz_price_curr if (op.created_at is not None and op.created_at >= half_window_start) else pz_price_prev
                    num, den = bucket[int(op.product_id)]
                    bucket[int(op.product_id)] = (num + q * up, den + q)
            else:
                for li in line_rows:
                    if li.product_id is None:
                        continue
                    q = float(getattr(li, "received_quantity", 0) or 0)
                    up = float(getattr(li, "purchase_price_net", 0) or 0)
                    if q <= 1e-9 or up <= 0:
                        continue
                    ts = receipt_dt or getattr(doc, "created_at", None) or now
                    bucket = pz_price_curr if ts >= half_window_start else pz_price_prev
                    num, den = bucket[int(li.product_id)]
                    bucket[int(li.product_id)] = (num + q * up, den + q)

        on_time_percent: Optional[float] = None
        if on_flags:
            on_time_percent = 100.0 * sum(1 for x in on_flags if x) / len(on_flags)

        avg_delay_days: Optional[float] = None
        if delays:
            avg_delay_days = sum(delays) / len(delays)

        partial_delivery_percent: Optional[float] = None

        lead_samples: List[float] = []
        for po in plist:
            if po.created_at is None:
                continue
            rec_dates = [ld.received_at for ld in (po.linked_deliveries or []) if ld.received_at is not None]
            if rec_dates:
                first = min(rec_dates)
                days = max(0.0, (first - po.created_at).total_seconds() / 86400.0)
                lead_samples.append(days)
            elif po.closed_at is not None and po.status != PO_CANCELLED:
                days = max(0.0, (po.closed_at - po.created_at).total_seconds() / 86400.0)
                lead_samples.append(days)

        avg_lead_time_days: Optional[float] = None
        if lead_samples:
            avg_lead_time_days = sum(lead_samples) / len(lead_samples)

        declared_lead_time_days = _declared_lead_days(db, s)

        submitted_pos = [po for po in plist if po.status != PO_DRAFT]
        planned_orders_count = len(submitted_pos)
        total_orders = deliveries_count  # backward-compatible field now represents real completed receipts (PZ)
        total_value = pz_value_net
        cancelled_orders_count = sum(1 for po in plist if po.status == PO_CANCELLED)

        distinct_po_products = set()
        for po in plist:
            for it in po.items or []:
                if it.product_id is not None:
                    distinct_po_products.add(int(it.product_id))
        active_products_count = max(catalog_counts.get(sid, 0), len(distinct_po_products))

        receipt_dates_sorted = sorted(receipt_dates)
        last_delivery_date: Optional[datetime] = receipt_dates_sorted[-1] if receipt_dates_sorted else None
        avg_delivery_interval: Optional[float] = None
        if len(receipt_dates_sorted) >= 2:
            gaps = [
                max(0.0, (receipt_dates_sorted[i] - receipt_dates_sorted[i - 1]).total_seconds() / 86400.0)
                for i in range(1, len(receipt_dates_sorted))
            ]
            if gaps:
                avg_delivery_interval = sum(gaps) / len(gaps)

        days_since_last_delivery: Optional[float] = None
        if last_delivery_date is not None:
            days_since_last_delivery = max(0.0, (now - last_delivery_date).total_seconds() / 86400.0)

        price_chg = _weighted_price_change_percent(curr=pz_price_curr, prev=pz_price_prev)

        insufficient = deliveries_count == 0

        s_on, s_price, s_delay, s_fulfill, s_fresh, _fb = _compute_subscores(
            on_time_percent=on_time_percent,
            avg_buy_price_change_percent=price_chg,
            avg_delay_days=avg_delay_days,
            partial_delivery_percent=partial_delivery_percent,
            days_since_last_delivery=days_since_last_delivery,
            range_days=range_days,
        )
        raw_score = _final_score(s_on, s_price, s_delay, s_fulfill, s_fresh)
        score: Optional[float] = None if insufficient else round(raw_score, 1)

        rows_out.append(
            {
                "supplier_id": sid,
                "supplier_name": (s.name or "").strip() or f"Supplier #{sid}",
                "score": score,
                "insufficient_data": insufficient,
                "active_products_count": int(active_products_count),
                "total_orders": int(total_orders),
                "total_value": round(total_value, 2),
                "deliveries_count": int(deliveries_count),
                "planned_orders_count": int(planned_orders_count),
                "total_purchase_value_net": round(float(pz_value_net), 2),
                "total_purchase_value_gross": round(float(pz_value_gross), 2),
                "avg_delivery_interval": None if avg_delivery_interval is None else round(avg_delivery_interval, 2),
                "avg_lead_time_days": None if avg_lead_time_days is None else round(avg_lead_time_days, 2),
                "declared_lead_time_days": None if declared_lead_time_days is None else round(declared_lead_time_days, 2),
                "on_time_rate": None if on_time_percent is None else round(on_time_percent, 1),
                "on_time_percent": None if on_time_percent is None else round(on_time_percent, 1),
                "avg_delay_days": None if avg_delay_days is None else round(avg_delay_days, 2),
                "partial_delivery_percent": None if partial_delivery_percent is None else round(partial_delivery_percent, 1),
                "cancelled_orders_count": int(cancelled_orders_count),
                "price_trend": None if price_chg is None else round(price_chg, 2),
                "avg_buy_price_change_percent": None if price_chg is None else round(price_chg, 2),
                "last_delivery_date": last_delivery_date.isoformat() if last_delivery_date else None,
                "risk_level": _risk_level(score, insufficient),
            }
        )

    # Rank: prioritize real completed deliveries (PZ), then score.
    def sort_key(r: Dict[str, Any]) -> Tuple[int, float, float]:
        sc = r.get("score")
        dcnt = int(r.get("deliveries_count") or 0)
        if sc is None:
            return (1, -float(dcnt), 0.0)
        return (0, -float(dcnt), -float(sc))

    rows_out.sort(key=sort_key)
    for i, row in enumerate(rows_out):
        row["rank"] = i + 1

    series: Optional[Dict[str, Any]] = None
    if supplier_id is not None and len(suppliers) == 1:
        series = _build_monthly_series(
            db=db,
            tenant_id=tenant_id,
            supplier_id=int(supplier_id),
            window_start=window_start,
            now=now,
            range_days=range_days,
        )

    return {"range_days": range_days, "rows": rows_out, "series": series}


def _build_monthly_series(
    db: Session,
    *,
    tenant_id: int,
    supplier_id: int,
    window_start: datetime,
    now: datetime,
    range_days: int,
) -> Dict[str, Any]:
    """Per-calendar-month buckets for charts (sparse months still listed)."""

    def month_iter(start: datetime, end: datetime) -> List[str]:
        keys: List[str] = []
        y, m = start.year, start.month
        if (y, m) > (end.year, end.month):
            return [_month_bucket_key(end)]
        while True:
            keys.append(f"{y:04d}-{m:02d}")
            if (y, m) >= (end.year, end.month):
                break
            m += 1
            if m > 12:
                m = 1
                y += 1
        return keys

    labels = month_iter(window_start.replace(day=1), now)
    if len(labels) > 18:
        labels = labels[-18:]

    deliveries = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.supplier_id == supplier_id,
            StockDocument.document_type == "PZ",
            StockDocument.created_at >= window_start,
            StockDocument.created_at <= now,
        )
        .all()
    )
    pos = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items), joinedload(PurchaseOrder.linked_deliveries))
        .filter(
            PurchaseOrder.tenant_id == tenant_id,
            PurchaseOrder.supplier_id == supplier_id,
            PurchaseOrder.created_at >= window_start,
            PurchaseOrder.created_at <= now,
        )
        .all()
    )

    pz_doc_ids = [int(d.id) for d in deliveries]
    pz_receipt_ops = (
        db.query(StockOperation)
        .filter(StockOperation.document_id.in_(pz_doc_ids), StockOperation.type == STOCK_OP_RECEIPT)
        .all()
        if pz_doc_ids
        else []
    )
    pz_receipts_by_doc: Dict[int, List[StockOperation]] = defaultdict(list)
    for op in pz_receipt_ops:
        pz_receipts_by_doc[int(op.document_id)].append(op)

    by_month_deliv: Dict[str, List[StockDocument]] = defaultdict(list)
    for d in deliveries:
        rec_dt = max((op.created_at for op in pz_receipts_by_doc.get(int(d.id), []) if op.created_at is not None), default=None)
        if rec_dt is None:
            rec_dt = getattr(d, "updated_at", None) or getattr(d, "created_at", None)
        if rec_dt:
            by_month_deliv[_month_bucket_key(rec_dt)].append(d)

    by_month_po: Dict[str, List[PurchaseOrder]] = defaultdict(list)
    for p in pos:
        if p.created_at:
            by_month_po[_month_bucket_key(p.created_at)].append(p)

    score_trend: List[Dict[str, Any]] = []
    punctuality_trend: List[Dict[str, Any]] = []
    order_history: List[Dict[str, Any]] = []

    sup = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.tenant_id == tenant_id).first()

    for label in labels:
        dlist = by_month_deliv.get(label, [])
        on_flags_m: List[bool] = []
        delays_m: List[float] = []
        for d in dlist:
            # Monthly punctuality stays available only when delivery/PO expectations are linked.
            if getattr(d, "delivery_id", None) is None:
                continue
        ot_m: Optional[float] = None
        if on_flags_m:
            ot_m = 100.0 * sum(1 for x in on_flags_m if x) / len(on_flags_m)
        ad_m: Optional[float] = None
        if delays_m:
            ad_m = sum(delays_m) / len(delays_m)
        pm: Optional[float] = None

        plist_m = by_month_po.get(label, [])
        total_val = sum(float(p.total_value or 0) for p in plist_m if p.status != PO_CANCELLED)
        n_sub = len([p for p in plist_m if p.status != PO_DRAFT])

        # Month-local price change vs previous month window is heavy; reuse global price_chg as None for monthly
        price_m: Optional[float] = None
        last_d = max(
            (
                max((op.created_at for op in pz_receipts_by_doc.get(int(d.id), []) if op.created_at is not None), default=None)
                or getattr(d, "updated_at", None)
                or getattr(d, "created_at", None)
                for d in dlist
            ),
            default=None,
        )
        dsl_m: Optional[float] = None
        if last_d is not None:
            dsl_m = max(0.0, (now - last_d).total_seconds() / 86400.0)

        s_on, s_price, s_delay, s_fulfill, s_fresh, _ = _compute_subscores(
            on_time_percent=ot_m,
            avg_buy_price_change_percent=price_m,
            avg_delay_days=ad_m,
            partial_delivery_percent=pm,
            days_since_last_delivery=dsl_m,
            range_days=max(30, range_days // max(1, len(labels))),
        )
        sc = round(_final_score(s_on, s_price, s_delay, s_fulfill, s_fresh), 1)

        score_trend.append({"period": label, "score": sc})
        punctuality_trend.append({"period": label, "on_time_percent": None if ot_m is None else round(ot_m, 1)})
        order_history.append({"period": label, "orders": n_sub, "value": round(total_val, 2)})

    return {
        "score_trend": score_trend,
        "punctuality_trend": punctuality_trend,
        "order_history": order_history,
        "supplier_id": supplier_id,
        "supplier_name": (sup.name or "").strip() if sup else "",
    }