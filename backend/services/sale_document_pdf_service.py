"""Sale documents (PA/FV) — HTML template → PDF."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models.customer import Customer
from ..models.document_series import DocumentSeries
from ..models.order import Order
from ..models.sale_document import SaleDocument
from .document_print_service import build_document_pdf_from_html
from .operational_labels import (
    document_subtype_label_pl,
    format_money_pl,
    payment_method_label_pl,
    payment_status_label_pl,
)
from .sale_document_mapper import map_sale_document

logger = logging.getLogger(__name__)


def _fmt_money(n: float | None) -> str:
    return format_money_pl(n)


def _fmt_date(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d.%m.%Y")
    except ValueError:
        return iso


def _build_sale_context(dto: dict[str, Any]) -> dict[str, Any]:
    fin = dto.get("financials") or {}
    payment = dto.get("payment") or {}
    buyer = dto.get("buyer") or {}
    seller = dto.get("seller") or {}
    return {
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
        "company": {
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
        "summary": {
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

    dto = map_sale_document(
        db,
        doc=doc,
        order=order,
        customer=customer,
        mode="detail",
        refresh_db=False,
    )
    series = (
        db.query(DocumentSeries)
        .filter(DocumentSeries.id == str(doc.document_series_id))
        .first()
    )
    ctx = _build_sale_context(dto)
    doc_subtype = str(dto.get("document_subtype") or "")

    from ..document_templates.adapters.legacy_render_bridge import render_document_with_legacy_fallback
    from ..document_templates.adapters.sale_document_adapter import sale_kind_for_subtype
    from ..document_templates.render.output_formats import DocumentOutputFormat

    def _legacy_pdf() -> bytes:
        return build_document_pdf_from_html(
            db,
            tenant_id=int(tenant_id),
            print_template_id=getattr(series, "print_template_id", None) if series else None,
            print_template_path=getattr(series, "print_template", None) if series else None,
            document_subtype=doc_subtype,
            context=ctx,
            log_label=f"sale_document_id={document_id}",
        )

    rendered = render_document_with_legacy_fallback(
        db,
        tenant_id=int(tenant_id),
        kind_code=sale_kind_for_subtype(doc_subtype),
        params={"sale_document_id": str(document_id), "document_id": str(document_id)},
        legacy_renderer=_legacy_pdf,
        output_format=DocumentOutputFormat.HTML,
        log_label=f"sale_document_id={document_id}",
    )
    if isinstance(rendered, bytes):
        return rendered
    from .structure_report_pdf_service import html_document_to_pdf_bytes

    return html_document_to_pdf_bytes(str(rendered))
