"""Cooperation-history analytics from purchase orders (plan) and PZ (completed)."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inbound_delivery import InboundDelivery
from ..models.purchase_order import PurchaseOrder
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_operation import STOCK_OP_RECEIPT, StockOperation
from ..models.supplier import Supplier


def _days_late(received_at: datetime, expected: datetime) -> float:
    return max(0.0, (received_at - expected).total_seconds() / 86400.0)


def _weighted_price_change_percent(curr: Dict[int, Tuple[float, float]], prev: Dict[int, Tuple[float, float]]) -> Optional[float]:
    common = set(curr.keys()) & set(prev.keys())
    if not common:
        return None
    changes: List[float] = []
    for pid in common:
        cnum, cden = curr[pid]
        pnum, pden = prev[pid]
        if cden <= 1e-9 or pden <= 1e-9:
            continue
        ca = cnum / cden
        pb = pnum / pden
        if pb <= 1e-9:
            continue
        changes.append(abs((ca - pb) / pb) * 100.0)
    if not changes:
        return None
    return sum(changes) / len(changes)


def build_cooperation_history(
    db: Session,
    *,
    tenant_id: int,
    supplier_id: int,
    limit_docs: int = 20,
) -> Dict[str, Any]:
    sup = db.query(Supplier).filter(Supplier.tenant_id == tenant_id, Supplier.id == supplier_id).first()
    if not sup:
        return {
            "summary": {
                "supplier_id": supplier_id,
                "supplier_name": f"Supplier #{supplier_id}",
                "total_orders": 0,
                "total_receipts": 0,
                "first_order_date": None,
                "last_delivery_date": None,
                "avg_delivery_time": None,
                "on_time_percent": None,
                "total_net_spend": 0.0,
                "price_trend": None,
            },
            "recent_documents": [],
        }

    po_rows = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.tenant_id == tenant_id, PurchaseOrder.supplier_id == supplier_id)
        .order_by(PurchaseOrder.created_at.desc())
        .all()
    )
    pz_rows = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.supplier_id == supplier_id,
            StockDocument.document_type == "PZ",
        )
        .order_by(StockDocument.created_at.desc())
        .all()
    )
    pz_ids = [int(d.id) for d in pz_rows]
    pz_lines = (
        db.query(StockDocumentItem).filter(StockDocumentItem.document_id.in_(pz_ids)).all() if pz_ids else []
    )
    pz_receipts = (
        db.query(StockOperation)
        .filter(StockOperation.document_id.in_(pz_ids), StockOperation.type == STOCK_OP_RECEIPT)
        .all()
        if pz_ids
        else []
    )
    pz_lines_by_doc: Dict[int, List[StockDocumentItem]] = defaultdict(list)
    for li in pz_lines:
        pz_lines_by_doc[int(li.document_id)].append(li)
    pz_receipts_by_doc: Dict[int, List[StockOperation]] = defaultdict(list)
    for op in pz_receipts:
        pz_receipts_by_doc[int(op.document_id)].append(op)

    delivery_ids = sorted({int(d.delivery_id) for d in pz_rows if getattr(d, "delivery_id", None) is not None})
    deliveries = db.query(InboundDelivery).filter(InboundDelivery.id.in_(delivery_ids)).all() if delivery_ids else []
    delivery_by_id: Dict[int, InboundDelivery] = {int(d.id): d for d in deliveries}

    total_orders = len([po for po in po_rows if po.status != "Cancelled"])
    total_receipts = 0
    total_net_spend = 0.0
    receipt_dates: List[datetime] = []
    on_time_flags: List[bool] = []
    lead_samples: List[float] = []

    now = datetime.utcnow()
    half_start = now - timedelta(days=180)
    p_curr: Dict[int, Tuple[float, float]] = defaultdict(lambda: (0.0, 0.0))
    p_prev: Dict[int, Tuple[float, float]] = defaultdict(lambda: (0.0, 0.0))

    for doc in pz_rows:
        line_rows = pz_lines_by_doc.get(int(doc.id), [])
        op_rows = pz_receipts_by_doc.get(int(doc.id), [])
        has_qty = any(float(getattr(li, "received_quantity", 0) or 0) > 1e-9 for li in line_rows)
        has_ops = any(float(getattr(op, "qty", 0) or 0) > 1e-9 for op in op_rows)
        if not has_qty and not has_ops:
            continue
        total_receipts += 1

        rec_dt = max((op.created_at for op in op_rows if op.created_at is not None), default=None)
        if rec_dt is None:
            rec_dt = getattr(doc, "updated_at", None) or getattr(doc, "created_at", None)
        if rec_dt is not None:
            receipt_dates.append(rec_dt)

        if getattr(doc, "total_net", None) is not None:
            total_net_spend += float(doc.total_net or 0)
        else:
            for li in line_rows:
                q = float(getattr(li, "received_quantity", 0) or 0)
                if q <= 1e-9:
                    continue
                pn = float(getattr(li, "purchase_price_net", 0) or 0)
                total_net_spend += q * pn

        delivery = delivery_by_id.get(int(doc.delivery_id)) if getattr(doc, "delivery_id", None) is not None else None
        expected = None
        if delivery is not None and delivery.expected_date is not None:
            expected = delivery.expected_date
        elif delivery is not None and delivery.purchase_order_id is not None:
            po = next((x for x in po_rows if int(x.id) == int(delivery.purchase_order_id)), None)
            if po is not None and po.expected_date is not None:
                expected = po.expected_date
            if po is not None and po.created_at is not None and rec_dt is not None:
                lead_samples.append(max(0.0, (rec_dt - po.created_at).total_seconds() / 86400.0))
        if expected is not None and rec_dt is not None:
            on_time_flags.append(_days_late(rec_dt, expected) <= 1.0)

        for op in op_rows:
            if op.product_id is None or op.unit_price_net is None:
                continue
            q = float(op.qty or 0)
            up = float(op.unit_price_net or 0)
            if q <= 1e-9 or up <= 0:
                continue
            bucket = p_curr if (op.created_at is not None and op.created_at >= half_start) else p_prev
            num, den = bucket[int(op.product_id)]
            bucket[int(op.product_id)] = (num + q * up, den + q)

    first_order_date = min((po.created_at for po in po_rows if po.created_at is not None), default=None)
    last_delivery_date = max(receipt_dates, default=None)
    avg_delivery_time = (sum(lead_samples) / len(lead_samples)) if lead_samples else None
    on_time_percent = (100.0 * sum(1 for x in on_time_flags if x) / len(on_time_flags)) if on_time_flags else None
    price_trend = _weighted_price_change_percent(p_curr, p_prev)

    docs: List[Dict[str, Any]] = []
    for po in po_rows:
        docs.append(
            {
                "doc_type": "PO",
                "document_no": str(po.order_number or f"PO/{po.created_at.year if po.created_at else now.year}/{po.id}"),
                "date": po.created_at.isoformat() if po.created_at else None,
                "status": po.status,
                "supplier_name": (sup.name or "").strip() or f"Supplier #{sup.id}",
                "total_net": float(po.total_value or 0),
                "total_gross": None,
            }
        )
    for pz in pz_rows:
        docs.append(
            {
                "doc_type": "PZ",
                "document_no": f"PZ-{pz.id}",
                "date": pz.created_at.isoformat() if pz.created_at else None,
                "status": pz.status,
                "supplier_name": (sup.name or "").strip() or f"Supplier #{sup.id}",
                "total_net": float(pz.total_net) if pz.total_net is not None else None,
                "total_gross": float(pz.total_gross) if pz.total_gross is not None else None,
            }
        )
    docs.sort(key=lambda x: (x.get("date") or ""), reverse=True)

    return {
        "summary": {
            "supplier_id": int(sup.id),
            "supplier_name": (sup.name or "").strip() or f"Supplier #{sup.id}",
            "total_orders": int(total_orders),
            "total_receipts": int(total_receipts),
            "first_order_date": first_order_date.isoformat() if first_order_date else None,
            "last_delivery_date": last_delivery_date.isoformat() if last_delivery_date else None,
            "avg_delivery_time": None if avg_delivery_time is None else round(avg_delivery_time, 2),
            "on_time_percent": None if on_time_percent is None else round(on_time_percent, 1),
            "total_net_spend": round(total_net_spend, 2),
            "price_trend": None if price_trend is None else round(price_trend, 2),
        },
        "recent_documents": docs[: max(1, min(int(limit_docs), 100))],
    }
