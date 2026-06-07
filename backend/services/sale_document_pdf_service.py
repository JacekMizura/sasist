"""Sale documents (PA/FV) — HTML template → PDF."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from ..models.customer import Customer
from ..models.document_series import DocumentSeries
from ..models.order import Order
from ..models.sale_document import SaleDocument
from .document_print_template_catalog import TEMPLATES_DIR, resolve_template_filename
from .operational_labels import (
    document_subtype_label_pl,
    format_money_pl,
    payment_method_label_pl,
    payment_status_label_pl,
)
from .sale_document_mapper import map_sale_document
from .structure_report_pdf_service import html_document_to_pdf_bytes

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "j2"]),
)


def _fmt_money(n: float | None) -> str:
    return format_money_pl(n)


def _fmt_date(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d.%m.%Y")
    except ValueError:
        return iso


def build_sale_document_pdf_bytes(db: Session, *, tenant_id: int, document_id: str) -> bytes:
    doc = (
        db.query(SaleDocument)
        .filter(SaleDocument.id == str(document_id), SaleDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise ValueError("Document not found")

    order = db.query(Order).filter(Order.id == int(doc.order_id)).first()
    if order is None:
        raise ValueError("Order not found")

    customer = None
    if getattr(order, "customer_id", None):
        customer = db.query(Customer).filter(Customer.id == int(order.customer_id)).first()

    dto = map_sale_document(db, doc, order, customer=customer, mode="detail", refresh_db=False)
    series = (
        db.query(DocumentSeries)
        .filter(DocumentSeries.id == str(doc.document_series_id))
        .first()
    )
    tpl = resolve_template_filename(
        print_template_id=getattr(series, "print_template_id", None) if series else None,
        print_template_path=getattr(series, "print_template", None) if series else None,
        document_subtype=str(dto.get("document_subtype") or ""),
    )
    template = _env.get_template(tpl)

    fin = dto.get("financials") or {}
    payment = dto.get("payment") or {}
    buyer = dto.get("buyer") or {}
    seller = dto.get("seller") or {}

    ctx: dict[str, Any] = {
        "document": {
            "number": dto.get("document_number"),
            "date": _fmt_date(dto.get("created_at")),
            "type_label": document_subtype_label_pl(dto.get("document_subtype")),
            "subtype": dto.get("document_subtype"),
        },
        "customer": {
            "name": buyer.get("name") or dto.get("client") or "—",
            "address": buyer.get("address") or "—",
        },
        "seller": {
            "name": seller.get("name") or "—",
            "address": seller.get("address") or "—",
            "nip": seller.get("nip") or "—",
        },
        "items": fin.get("lines") or dto.get("lines") or [],
        "totals": {
            "net": _fmt_money(fin.get("total_net")),
            "vat": _fmt_money(fin.get("total_vat")),
            "gross": _fmt_money(fin.get("total_gross")),
        },
        "vat_rows": fin.get("vat_rows") or dto.get("vat_rows") or [],
        "payment": {
            "method": payment_method_label_pl(payment.get("payment_method")),
            "status": payment_status_label_pl(payment.get("payment_status")),
            "amount": _fmt_money(payment.get("amount")),
        },
        "currency": dto.get("currency") or "PLN",
    }
    html = template.render(**ctx)
    return html_document_to_pdf_bytes(html)
