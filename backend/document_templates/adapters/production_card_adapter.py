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
PICK_LIST_KIND_CODE = "production_material_pick_list"


def render_batch_production_card_html(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    template_version_id: int | None = None,
    kind_code: str = KIND_CODE,
) -> str:
    try:
        html = render_document(
            db,
            tenant_id=int(tenant_id),
            kind_code=kind_code,
            params={"batch_id": int(batch_id)},
            output_format=DocumentOutputFormat.HTML,
            warehouse_id=_batch_warehouse_id(db, tenant_id=tenant_id, batch_id=batch_id),
            template_version_id=template_version_id,
        )
        return str(html)
    except Exception:
        logger.exception(
            "render_batch_production_card_html failed tenant_id=%s batch_id=%s kind=%s",
            tenant_id,
            batch_id,
            kind_code,
        )
        raise


def render_order_production_card_html(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    template_version_id: int | None = None,
    kind_code: str = KIND_CODE,
) -> str:
    try:
        html = render_document(
            db,
            tenant_id=int(tenant_id),
            kind_code=kind_code,
            params={"order_id": int(order_id)},
            output_format=DocumentOutputFormat.HTML,
            warehouse_id=_order_warehouse_id(db, tenant_id=tenant_id, order_id=order_id),
            template_version_id=template_version_id,
        )
        return str(html)
    except Exception:
        logger.exception(
            "render_order_production_card_html failed tenant_id=%s order_id=%s kind=%s",
            tenant_id,
            order_id,
            kind_code,
        )
        raise


def generate_batch_material_pick_list_pdf_bytes(db: Session, *, tenant_id: int, batch_id: int) -> bytes:
    try:
        pdf = render_document(
            db,
            tenant_id=int(tenant_id),
            kind_code=PICK_LIST_KIND_CODE,
            params={"batch_id": int(batch_id)},
            output_format=DocumentOutputFormat.PDF,
            warehouse_id=_batch_warehouse_id(db, tenant_id=tenant_id, batch_id=batch_id),
        )
        return bytes(pdf)
    except Exception:
        logger.exception(
            "generate_batch_material_pick_list_pdf_bytes failed tenant_id=%s batch_id=%s",
            tenant_id,
            batch_id,
        )
        raise


def generate_order_material_pick_list_pdf_bytes(db: Session, *, tenant_id: int, order_id: int) -> bytes:
    try:
        pdf = render_document(
            db,
            tenant_id=int(tenant_id),
            kind_code=PICK_LIST_KIND_CODE,
            params={"order_id": int(order_id)},
            output_format=DocumentOutputFormat.PDF,
            warehouse_id=_order_warehouse_id(db, tenant_id=tenant_id, order_id=order_id),
        )
        return bytes(pdf)
    except Exception:
        logger.exception(
            "generate_order_material_pick_list_pdf_bytes failed tenant_id=%s order_id=%s",
            tenant_id,
            order_id,
        )
        raise


def generate_batch_production_card_pdf_bytes(db: Session, *, tenant_id: int, batch_id: int) -> bytes:
    try:
        pdf = render_document(
            db,
            tenant_id=int(tenant_id),
            kind_code=KIND_CODE,
            params={"batch_id": int(batch_id)},
            output_format=DocumentOutputFormat.PDF,
            warehouse_id=_batch_warehouse_id(db, tenant_id=tenant_id, batch_id=batch_id),
        )
        return bytes(pdf)
    except Exception:
        logger.exception(
            "generate_batch_production_card_pdf_bytes (DTE) failed tenant_id=%s batch_id=%s",
            tenant_id,
            batch_id,
        )
        raise


def generate_order_production_card_pdf_bytes(db: Session, *, tenant_id: int, order_id: int) -> bytes:
    try:
        pdf = render_document(
            db,
            tenant_id=int(tenant_id),
            kind_code=KIND_CODE,
            params={"order_id": int(order_id)},
            output_format=DocumentOutputFormat.PDF,
            warehouse_id=_order_warehouse_id(db, tenant_id=tenant_id, order_id=order_id),
        )
        return bytes(pdf)
    except Exception:
        logger.exception(
            "generate_order_production_card_pdf_bytes (DTE) failed tenant_id=%s order_id=%s",
            tenant_id,
            order_id,
        )
        raise


def generate_bulk_batch_production_cards_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    batch_ids: list[int],
) -> bytes:
    try:
        pages = [
            render_batch_production_card_html(db, tenant_id=int(tenant_id), batch_id=int(bid))
            for bid in batch_ids
        ]
        combined = _combine_card_html_documents(pages)
        from ...services.structure_report_pdf_service import html_document_to_pdf_bytes

        return html_document_to_pdf_bytes(combined)
    except Exception:
        logger.exception(
            "generate_bulk_batch_production_cards_pdf_bytes failed tenant_id=%s batch_ids=%s",
            tenant_id,
            batch_ids,
        )
        raise


def document_engine_available(db: Session, *, tenant_id: int) -> bool:
    """True when a production_card template (binding or system starter) can be resolved."""
    try:
        from ..services.template_service import resolve_bound_document_template

        resolve_bound_document_template(db, tenant_id=int(tenant_id), kind_code=KIND_CODE)
        return True
    except DocumentTemplateError as exc:
        logger.info(
            "production_card DTE unavailable for tenant_id=%s: %s",
            tenant_id,
            exc,
        )
        return False
    except Exception:
        logger.exception(
            "production_card document_engine_available check failed tenant_id=%s",
            tenant_id,
        )
        return False


def _batch_warehouse_id(db: Session, *, tenant_id: int, batch_id: int) -> int | None:
    from ...services.production_batch_service import ProductionBatchError, _load_batch_entity

    try:
        batch = _load_batch_entity(db, tenant_id=tenant_id, batch_id=batch_id)
        return int(batch.warehouse_id)
    except ProductionBatchError as exc:
        logger.warning(
            "production_card warehouse resolve failed batch_id=%s tenant_id=%s: %s",
            batch_id,
            tenant_id,
            exc,
        )
        return None
    except Exception:
        logger.exception(
            "production_card warehouse resolve unexpected error batch_id=%s tenant_id=%s",
            batch_id,
            tenant_id,
        )
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
