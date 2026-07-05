"""Adapter — production card via Document Templates engine."""

from __future__ import annotations

import logging
import re

from sqlalchemy.orm import Session

from ..errors import DocumentRenderError, DocumentTemplateError
from ..render.output_formats import DocumentOutputFormat
from ..services.document_render_service import render_document

logger = logging.getLogger(__name__)

KIND_CODE = "production_card"


def render_batch_production_card_html(db: Session, *, tenant_id: int, batch_id: int) -> str:
    html = render_document(
        db,
        tenant_id=int(tenant_id),
        kind_code=KIND_CODE,
        params={"batch_id": int(batch_id)},
        output_format=DocumentOutputFormat.HTML,
        warehouse_id=_batch_warehouse_id(db, tenant_id=tenant_id, batch_id=batch_id),
    )
    return str(html)


def render_order_production_card_html(db: Session, *, tenant_id: int, order_id: int) -> str:
    html = render_document(
        db,
        tenant_id=int(tenant_id),
        kind_code=KIND_CODE,
        params={"order_id": int(order_id)},
        output_format=DocumentOutputFormat.HTML,
        warehouse_id=_order_warehouse_id(db, tenant_id=tenant_id, order_id=order_id),
    )
    return str(html)


def generate_batch_production_card_pdf_bytes(db: Session, *, tenant_id: int, batch_id: int) -> bytes:
    pdf = render_document(
        db,
        tenant_id=int(tenant_id),
        kind_code=KIND_CODE,
        params={"batch_id": int(batch_id)},
        output_format=DocumentOutputFormat.PDF,
        warehouse_id=_batch_warehouse_id(db, tenant_id=tenant_id, batch_id=batch_id),
    )
    return bytes(pdf)


def generate_order_production_card_pdf_bytes(db: Session, *, tenant_id: int, order_id: int) -> bytes:
    pdf = render_document(
        db,
        tenant_id=int(tenant_id),
        kind_code=KIND_CODE,
        params={"order_id": int(order_id)},
        output_format=DocumentOutputFormat.PDF,
        warehouse_id=_order_warehouse_id(db, tenant_id=tenant_id, order_id=order_id),
    )
    return bytes(pdf)


def generate_bulk_batch_production_cards_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    batch_ids: list[int],
) -> bytes:
    pages = [
        render_batch_production_card_html(db, tenant_id=int(tenant_id), batch_id=int(bid))
        for bid in batch_ids
    ]
    combined = _combine_card_html_documents(pages)
    from ...services.structure_report_pdf_service import html_document_to_pdf_bytes

    return html_document_to_pdf_bytes(combined)


def document_engine_available(db: Session, *, tenant_id: int) -> bool:
    try:
        from ..services.template_service import resolve_bound_template_content

        resolve_bound_template_content(db, tenant_id=int(tenant_id), kind_code=KIND_CODE)
        return True
    except DocumentTemplateError:
        return False


def _batch_warehouse_id(db: Session, *, tenant_id: int, batch_id: int) -> int | None:
    from ...services.production_batch_service import _load_batch_entity

    try:
        batch = _load_batch_entity(db, tenant_id=tenant_id, batch_id=batch_id)
        return int(batch.warehouse_id)
    except Exception:
        return None


def _order_warehouse_id(db: Session, *, tenant_id: int, order_id: int) -> int | None:
    from ...models.production import ProductionOrder

    row = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id))
        .first()
    )
    return int(row.warehouse_id) if row else None


def _extract_body_html(full_html: str) -> str:
    match = re.search(r"<body[^>]*>(.*)</body>", full_html, re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else full_html


def _extract_head_styles(full_html: str) -> str:
    match = re.search(r"<head[^>]*>(.*?)</head>", full_html, re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else ""


def _combine_card_html_documents(pages: list[str]) -> str:
    if not pages:
        raise DocumentRenderError("Brak kart do wydruku.", code="empty")
    head = _extract_head_styles(pages[0])
    bodies = []
    for i, page in enumerate(pages):
        if i > 0:
            bodies.append('<div class="page-break"></div>')
        bodies.append(_extract_body_html(page))
    return f'<!DOCTYPE html><html lang="pl"><head>{head}</head><body>{"".join(bodies)}</body></html>'
