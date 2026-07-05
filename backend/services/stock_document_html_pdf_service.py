"""Warehouse documents — HTML template PDF (WZ and linked direct sales)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models.document_series import DocumentSeries
from ..models.stock_document import StockDocument
from .document_print_service import build_document_pdf_from_html
from .stock_document_service import get_stock_document_read


def _fmt_date(dt) -> str:
    if dt is None:
        return "—"
    if isinstance(dt, datetime):
        return dt.strftime("%d.%m.%Y")
    return str(dt)


def build_stock_document_html_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    template_version_id: int | None = None,
) -> bytes:
    read = get_stock_document_read(db, tenant_id, document_id)
    if not read:
        raise ValueError("Document not found")

    doc_type = str(getattr(read, "document_type", None) or "WZ").upper()

    items: list[dict[str, Any]] = []
    for ln in getattr(read, "items", None) or []:
        items.append(
            {
                "product_name": getattr(ln, "product_name", None) or getattr(ln, "name", None),
                "quantity": getattr(ln, "received_quantity", None) or getattr(ln, "quantity", None),
                "location_name": getattr(ln, "from_location_name", None)
                or getattr(ln, "mm_line_from_location_name", None),
            }
        )

    params = {
        "document_id": int(document_id),
        "document": {
            "number": getattr(read, "document_number", None) or f"#{document_id}",
            "date": _fmt_date(getattr(read, "created_at", None)),
        },
        "order_number": getattr(read, "order_number", None),
        "warehouse_id": getattr(read, "warehouse_id", None),
        "items": items,
    }

    from ..document_templates.adapters.warehouse_document_adapter import (
        binding_available,
        render_stock_document_html,
    )

    series = None
    stock_row = db.query(StockDocument).filter(StockDocument.id == int(document_id)).first()
    series_id = getattr(stock_row, "document_series_id", None) if stock_row else None
    if series_id:
        series = db.query(DocumentSeries).filter(DocumentSeries.id == str(series_id)).first()

    from ..document_templates.services.document_integration_service import series_template_render_kwargs

    wh_id = getattr(read, "warehouse_id", None)
    from ..document_templates.services.template_hierarchy_resolver import RenderTemplateContext, resolve_render_template_kwargs

    hierarchy_ctx = RenderTemplateContext(
        tenant_id=int(tenant_id),
        kind_code=doc_type.lower(),
        series=series,
        warehouse_id=int(wh_id) if wh_id else None,
        explicit_version_id=int(template_version_id) if template_version_id is not None else None,
    )
    render_kwargs = resolve_render_template_kwargs(db, ctx=hierarchy_ctx)
    if binding_available(db, tenant_id=int(tenant_id), document_type=doc_type, variant_code=render_kwargs.get("variant_code", "standard")) or render_kwargs.get("template_version_id"):
        html = render_stock_document_html(
            db,
            tenant_id=int(tenant_id),
            document_type=doc_type,
            params=params,
            warehouse_id=int(wh_id) if wh_id else None,
            **render_kwargs,
        )
        from .structure_report_pdf_service import html_document_to_pdf_bytes

        return html_document_to_pdf_bytes(html)

    import logging

    logging.getLogger(__name__).warning(
        "[document_templates] brak bindingu kind=%s tenant=%s — fallback legacy stock_document_id=%s",
        doc_type.lower(),
        tenant_id,
        document_id,
    )

    ctx = {
        "document": params["document"],
        "order_number": params["order_number"],
        "warehouse": {"name": getattr(read, "warehouse_name", None) or "—"},
        "items": items,
    }
    return build_document_pdf_from_html(
        db,
        tenant_id=int(tenant_id),
        print_template_id=getattr(series, "print_template_id", None) if series else None,
        print_template_path=getattr(series, "print_template", None) if series else None,
        document_subtype=doc_type,
        context=ctx,
        log_label=f"stock_document_id={document_id}",
    )
