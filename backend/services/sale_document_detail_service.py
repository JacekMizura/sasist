"""Full sale document detail — same financial pipeline as order detail."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session, joinedload

from ..models.commerce_operational import Payment, PaymentTransaction
from ..models.customer import Customer
from ..models.document_series import DocumentSeries
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.sale_document import SaleDocument
from ..models.tenant import Tenant
from ..models.warehouse import Warehouse
from .sale_document_financials import compute_sale_totals_from_order


def _customer_display(customer: Customer | None, order: Order | None) -> dict[str, Any]:
    if customer is not None:
        name = str(customer.company_name or "").strip()
        if not name:
            name = " ".join(p for p in (customer.first_name, customer.last_name) if p).strip()
        return {
            "id": int(customer.id),
            "name": name or "—",
            "nip": str(customer.nip or "").strip() or None,
            "email": str(customer.email or "").strip() or None,
            "phone": str(customer.phone or "").strip() or None,
            "address": None,
            "city": None,
            "zip": None,
            "country": str(customer.country_code or "").strip() or None,
        }
    if order is not None:
        return {
            "id": getattr(order, "customer_id", None),
            "name": str(getattr(order, "customer_name", None) or "").strip() or "—",
            "nip": None,
            "email": None,
            "phone": None,
            "address": None,
            "city": str(getattr(order, "city", None) or "").strip() or None,
            "zip": None,
            "country": str(getattr(order, "country", None) or "").strip() or None,
        }
    return {"id": None, "name": "—"}


def _seller_from_series(series: DocumentSeries | None, tenant: Tenant | None) -> dict[str, Any]:
    if series is not None and str(getattr(series, "company_name", None) or "").strip():
        return {
            "name": str(series.company_name or "").strip(),
            "nip": str(series.company_nip or "").strip() or None,
            "address": str(series.company_address or "").strip() or None,
            "city": str(series.company_city or "").strip() or None,
            "zip": str(series.company_zip or "").strip() or None,
            "country": str(series.company_country or "").strip() or None,
            "email": str(series.company_email or "").strip() or None,
            "bank": str(series.company_bank or "").strip() or None,
            "iban": str(series.company_iban or "").strip() or None,
        }
    if tenant is not None:
        return {
            "name": str(getattr(tenant, "company_name", None) or tenant.name or "").strip() or "—",
            "nip": str(getattr(tenant, "tax_id", None) or "").strip() or None,
            "address": None,
            "city": None,
            "zip": None,
            "country": None,
            "email": None,
            "bank": None,
            "iban": None,
        }
    return {"name": "—"}


def _payment_block(db: Session, doc: SaleDocument, order: Order) -> dict[str, Any]:
    pay: Payment | None = None
    if doc.payment_id:
        pay = db.query(Payment).filter(Payment.id == int(doc.payment_id)).first()
    if pay is None:
        pay = (
            db.query(Payment)
            .filter(Payment.order_id == int(order.id))
            .order_by(Payment.id.desc())
            .first()
        )
    if pay is None:
        return {
            "payment_id": None,
            "method": doc.payment_method,
            "status": doc.payment_status,
            "amount": float(doc.total_gross or order.value or 0),
            "currency": str(order.currency or "PLN"),
            "captured_at": doc.payment_captured_at.isoformat() if doc.payment_captured_at else None,
            "external_transaction_id": doc.payment_external_transaction_id,
            "transactions": [],
        }
    txns = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.payment_id == int(pay.id))
        .order_by(PaymentTransaction.id.asc())
        .all()
    )
    return {
        "payment_id": int(pay.id),
        "method": str(doc.payment_method or pay.method or "").strip().upper() or None,
        "status": str(doc.payment_status or pay.status or "").strip().upper() or None,
        "amount": float(pay.amount or 0),
        "currency": str(pay.currency or "PLN"),
        "captured_at": (
            doc.payment_captured_at or pay.captured_at
        ).isoformat()
        if (doc.payment_captured_at or pay.captured_at)
        else None,
        "external_transaction_id": str(
            doc.payment_external_transaction_id or pay.external_transaction_id or ""
        ).strip()
        or None,
        "authorization_reference": str(pay.authorization_reference or "").strip() or None,
        "transactions": [
            {
                "id": int(t.id),
                "method": str(t.method or ""),
                "amount": float(t.amount or 0),
                "status": str(t.status or ""),
                "external_ref": str(t.external_ref or "").strip() or None,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in txns
        ],
    }


def get_sale_document_detail(
    db: Session,
    *,
    tenant_id: int,
    document_id: str,
) -> dict[str, Any] | None:
    doc = (
        db.query(SaleDocument)
        .filter(
            SaleDocument.id == str(document_id).strip(),
            SaleDocument.tenant_id == int(tenant_id),
        )
        .first()
    )
    if doc is None:
        return None

    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == int(doc.order_id))
        .first()
    )
    if order is None:
        return None

    series = (
        db.query(DocumentSeries)
        .filter(DocumentSeries.id == str(doc.document_series_id))
        .first()
    )
    customer = None
    if order.customer_id:
        customer = db.query(Customer).filter(Customer.id == int(order.customer_id)).first()
    tenant = db.query(Tenant).filter(Tenant.id == int(doc.tenant_id)).first()
    warehouse = db.query(Warehouse).filter(Warehouse.id == int(doc.warehouse_id)).first()

    totals = compute_sale_totals_from_order(order)
    panel_type = str(doc.panel_document_type or "").upper()
    doc_type = "FV" if panel_type == "INVOICE" else "PA"

    return {
        "id": str(doc.id),
        "document_number": str(doc.document_number or ""),
        "document_type_id": str(doc.document_type_id or doc.document_series_id or ""),
        "document_series_id": str(doc.document_series_id or ""),
        "document_subtype": str(doc.document_subtype or "").strip().upper()
        or ("INVOICE" if panel_type == "INVOICE" else "RECEIPT"),
        "panel_document_type": panel_type,
        "doc_type": doc_type,
        "series_type": str(doc.series_type or "SALE"),
        "order_id": int(doc.order_id),
        "order_number": str(order.number or ""),
        "tenant_id": int(doc.tenant_id),
        "warehouse_id": int(doc.warehouse_id),
        "warehouse_name": str(getattr(warehouse, "name", None) or "").strip() or None,
        "source": str(order.source or "").strip() or None,
        "order_channel": str(getattr(order, "order_channel", None) or "").strip() or None,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "currency": str(order.currency or "PLN"),
        "total_net": float(doc.total_net if doc.total_net is not None else totals["total_net"]),
        "total_gross": float(doc.total_gross if doc.total_gross is not None else totals["total_gross"]),
        "total_vat": float(doc.total_vat if doc.total_vat is not None else totals["total_vat"]),
        "lines": totals["lines"],
        "vat_rows": totals["vat_rows"],
        "buyer": _customer_display(customer, order),
        "seller": _seller_from_series(series, tenant),
        "payment": _payment_block(db, doc, order),
        "series": {
            "id": str(series.id) if series else None,
            "name": str(series.name or "").strip() if series else None,
            "prefix": str(series.prefix or "").strip() if series else None,
            "subtype": str(series.subtype or "").strip() if series else None,
            "warehouse_effect": bool(getattr(series, "warehouse_effect", False)) if series else False,
        },
        "warehouse_effects": {
            "enabled": bool(getattr(series, "warehouse_effect", False)) if series else False,
            "order_fulfillment_mode": str(getattr(order, "fulfillment_mode", None) or "").strip() or None,
        },
        "history": [
            {
                "at": doc.created_at.isoformat() if doc.created_at else None,
                "action": "created",
                "source": str(order.source or "system"),
                "detail": f"Dokument {doc_type} {doc.document_number}",
            }
        ],
        "print": {
            "available": True,
            "template_id": getattr(series, "print_template_id", None) if series else None,
        },
        "export": {"available": True},
    }
