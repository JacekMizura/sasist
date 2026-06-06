"""Read model for direct-sale completion — traceability, timeline, payment, document."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.app_user import AppUser
from ...models.commerce_operational import DirectSaleSession, Payment, PaymentTransaction
from ...models.document_generation_job import DocumentGenerationJob
from ...models.inventory import Inventory
from ...models.location import Location
from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.product import Product
from ...models.stock_reservation import StockReservation
from ...models.warehouse_inventory_movement import WarehouseInventoryMovement
from .session_service import get_session


def _operator_label(db: Session, user_id: int | None) -> str | None:
    if not user_id:
        return None
    user = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
    if not user:
        return None
    name = " ".join(p for p in (user.first_name, user.last_name) if p).strip()
    return name or str(user.login or f"#{user.id}")


def _sellable_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
) -> float:
    raw = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0))
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.location_id == int(location_id),
            Inventory.stock_disposition == "SALEABLE",
        )
        .scalar()
    )
    return round(float(raw or 0), 3)


def _loc_code(db: Session, location_id: int | None) -> str | None:
    if not location_id:
        return None
    loc = db.query(Location).filter(Location.id == int(location_id)).first()
    return str(loc.name or "") or None if loc else None


def _document_status_pl(status: str | None) -> str:
    s = str(status or "").upper()
    if s in ("PENDING", "RETRYING"):
        return "W kolejce"
    if s == "PROCESSING":
        return "Generowanie"
    if s in ("GENERATED", "COMPLETED", "DONE"):
        return "Gotowy"
    if s in ("FAILED", "CANCELLED"):
        return "Błąd"
    return s or "—"


def _timeline_label(event_type: str, *, qty: float | None = None, loc: str | None = None) -> str:
    if event_type == "reservation":
        return "Rezerwacja utworzona"
    if event_type == "issue":
        q = f"{qty:g}" if qty is not None else "?"
        loc_s = loc or "lokalizacji"
        return f"Wydano {q} szt. z {loc_s}"
    if event_type == "payment":
        return "Płatność zatwierdzona"
    if event_type == "document":
        return "Dokument wygenerowany"
    return event_type


def build_direct_sale_completion_read(
    db: Session,
    *,
    tenant_id: int,
    session_id: int,
) -> dict[str, Any] | None:
    sess = get_session(db, int(session_id), tenant_id=int(tenant_id))
    if sess is None or sess.status != "COMPLETED" or not sess.order_id:
        return None

    order = db.query(Order).filter(Order.id == int(sess.order_id), Order.tenant_id == int(tenant_id)).first()
    if order is None:
        return None

    payment = (
        db.query(Payment)
        .filter(Payment.direct_sale_session_id == int(sess.id), Payment.tenant_id == int(tenant_id))
        .order_by(Payment.id.desc())
        .first()
    )
    pay_txns: list[PaymentTransaction] = []
    if payment:
        pay_txns = (
            db.query(PaymentTransaction)
            .filter(PaymentTransaction.payment_id == int(payment.id))
            .order_by(PaymentTransaction.id.asc())
            .all()
        )

    doc_job = (
        db.query(DocumentGenerationJob)
        .filter(
            DocumentGenerationJob.session_id == int(sess.id),
            DocumentGenerationJob.tenant_id == int(tenant_id),
        )
        .order_by(DocumentGenerationJob.id.desc())
        .first()
    )

    movements = (
        db.query(WarehouseInventoryMovement)
        .filter(
            WarehouseInventoryMovement.tenant_id == int(tenant_id),
            WarehouseInventoryMovement.source_document_type == "DIRECT_SALE",
            WarehouseInventoryMovement.source_document_id == int(order.id),
        )
        .order_by(WarehouseInventoryMovement.id.asc())
        .all()
    )

    reservations = (
        db.query(StockReservation)
        .filter(StockReservation.direct_sale_session_id == int(sess.id))
        .all()
    )
    res_by_key = {(int(r.product_id), int(r.location_id)): int(r.id) for r in reservations if r.location_id}

    order_items = (
        db.query(OrderItem)
        .filter(OrderItem.order_id == int(order.id))
        .order_by(OrderItem.id.asc())
        .all()
    )
    product_ids = {int(oi.product_id) for oi in order_items if oi.product_id}
    products: dict[int, Product] = {}
    if product_ids:
        for p in db.query(Product).filter(Product.id.in_(product_ids)).all():
            products[int(p.id)] = p

    lines_trace: list[dict[str, Any]] = []
    stock_deltas: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []

    issue_movs = [m for m in movements if str(m.movement_type or "").upper() == "ISSUE"]
    res_movs = [m for m in movements if str(m.movement_type or "").upper() == "RESERVATION"]

    for mov in res_movs:
        loc_code = _loc_code(db, mov.from_location_id)
        timeline.append(
            {
                "at": mov.created_at.isoformat() if mov.created_at else None,
                "kind": "reservation",
                "label": _timeline_label("reservation"),
                "detail": loc_code,
            }
        )

    seen_delta: set[tuple[int, int]] = set()
    for mov in issue_movs:
        pid = int(mov.product_id)
        lid = int(mov.from_location_id or 0)
        qty = float(mov.quantity or 0)
        loc_code = _loc_code(db, mov.from_location_id) or f"#{lid}"
        prod = products.get(pid)
        stock_after = _sellable_qty(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(sess.warehouse_id),
            product_id=pid,
            location_id=lid,
        ) if lid else None
        stock_before = round(stock_after + qty, 3) if stock_after is not None else None
        res_id = res_by_key.get((pid, lid))
        meta = {}
        if mov.metadata_json:
            try:
                meta = json.loads(mov.metadata_json)
            except (json.JSONDecodeError, TypeError):
                meta = {}
        oi = next((x for x in order_items if int(x.product_id) == pid), None)
        lines_trace.append(
            {
                "product_id": pid,
                "product_name": str(prod.name) if prod else None,
                "sku": str(prod.sku or prod.symbol or "") if prod else None,
                "source_location_code": loc_code,
                "issued_qty": qty,
                "movement_id": int(mov.id),
                "reservation_id": int(meta.get("reservation_id") or res_id) if (meta.get("reservation_id") or res_id) else None,
                "stock_before": stock_before,
                "stock_after": stock_after,
                "issued_at": mov.created_at.isoformat() if mov.created_at else None,
            }
        )
        key = (pid, lid)
        if key not in seen_delta and stock_before is not None and stock_after is not None:
            seen_delta.add(key)
            stock_deltas.append(
                {
                    "location_code": loc_code,
                    "product_name": str(prod.name) if prod else f"Produkt #{pid}",
                    "qty_issued": qty,
                    "stock_before": stock_before,
                    "stock_after": stock_after,
                }
            )
        timeline.append(
            {
                "at": mov.created_at.isoformat() if mov.created_at else None,
                "kind": "issue",
                "label": _timeline_label("issue", qty=qty, loc=loc_code),
                "detail": None,
            }
        )

    if payment:
        timeline.append(
            {
                "at": (payment.captured_at or payment.created_at).isoformat()
                if (payment.captured_at or payment.created_at)
                else None,
                "kind": "payment",
                "label": _timeline_label("payment"),
                "detail": str(payment.method or ""),
            }
        )

    doc_subtype = str(doc_job.document_subtype or "") if doc_job else ""
    doc_num = order.sales_document_number
    if doc_job:
        from ...workers.document_generation_worker import get_job_document_number

        doc_num = doc_num or get_job_document_number(doc_job)
        timeline.append(
            {
                "at": (doc_job.completed_at or doc_job.created_at).isoformat()
                if (doc_job.completed_at or doc_job.created_at)
                else None,
                "kind": "document",
                "label": f"Dokument {doc_subtype or 'PA'} wygenerowany"
                if str(doc_job.status or "").upper() == "GENERATED"
                else f"Dokument {doc_subtype or 'PA'} — {_document_status_pl(doc_job.status)}",
                "detail": doc_num,
            }
        )

    completed_at = sess.completed_at or order.order_date or order.created_at
    operator = _operator_label(db, sess.operator_user_id or sess.created_by_user_id)

    return {
        "session_id": int(sess.id),
        "order_id": int(order.id),
        "order_number": str(order.number or "") or None,
        "payment_id": int(payment.id) if payment else None,
        "document_job_id": int(doc_job.id) if doc_job else None,
        "document_number": doc_num,
        "document_subtype": doc_subtype or None,
        "total_amount": float(order.value or 0),
        "payment_status": str(payment.status or "") if payment else None,
        "payment_method": str(payment.method or "") if payment else None,
        "completed_at": completed_at.isoformat() if completed_at else None,
        "operator_label": operator,
        "warehouse_id": int(sess.warehouse_id),
        "lines": lines_trace,
        "stock_deltas": stock_deltas,
        "timeline": timeline,
        "payment": {
            "payment_id": int(payment.id) if payment else None,
            "method": str(payment.method or "") if payment else None,
            "status": str(payment.status or "") if payment else None,
            "amount": float(payment.amount or 0) if payment else None,
            "authorization_reference": str(payment.authorization_reference or "") or None if payment else None,
            "external_transaction_id": str(payment.external_transaction_id or "") or None if payment else None,
            "settlement_state": str(payment.settlement_state or "") or None if payment else None,
            "transactions": [
                {
                    "id": int(t.id),
                    "method": str(t.method or ""),
                    "amount": float(t.amount or 0),
                    "status": str(t.status or ""),
                    "external_ref": str(t.external_ref or "") or None,
                }
                for t in pay_txns
            ],
        }
        if payment
        else None,
        "document": {
            "job_id": int(doc_job.id) if doc_job else None,
            "document_number": doc_num,
            "document_subtype": doc_subtype or None,
            "status": str(doc_job.status or "") if doc_job else None,
            "status_label": _document_status_pl(doc_job.status) if doc_job else None,
            "fiscal_status": str(doc_job.fiscal_status or "") or None if doc_job else None,
            "sale_document_id": doc_job.sale_document_id if doc_job else None,
            "error_message": str(doc_job.error_message or "") or None if doc_job else None,
        }
        if doc_job
        else None,
    }
