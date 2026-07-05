"""Unified ERP document rendering — hierarchy resolver + legacy fallback."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from ..adapters.legacy_render_bridge import normalize_kind_code, render_document_with_legacy_fallback
from ..render.output_formats import DocumentOutputFormat
from ..services.template_hierarchy_resolver import RenderTemplateContext, resolve_render_template_kwargs
from ...services.structure_report_pdf_service import html_document_to_pdf_bytes

logger = logging.getLogger(__name__)


def render_erp_document_html(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    params: dict[str, Any],
    legacy_renderer: Callable[[], str],
    ctx: RenderTemplateContext | None = None,
    warehouse_id: int | None = None,
    log_label: str = "",
) -> str:
    kind = normalize_kind_code(kind_code)
    base_ctx = ctx or RenderTemplateContext(
        tenant_id=int(tenant_id),
        kind_code=kind,
        warehouse_id=warehouse_id,
    )
    kwargs = resolve_render_template_kwargs(db, ctx=base_ctx)
    rendered = render_document_with_legacy_fallback(
        db,
        tenant_id=int(tenant_id),
        kind_code=kind,
        params=params,
        legacy_renderer=legacy_renderer,
        output_format=DocumentOutputFormat.HTML,
        warehouse_id=kwargs.get("warehouse_id"),
        variant_code=str(kwargs.get("variant_code") or "standard"),
        template_version_id=kwargs.get("template_version_id"),
        log_label=log_label,
    )
    return str(rendered)


def render_erp_document_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    params: dict[str, Any],
    legacy_renderer: Callable[[], str],
    ctx: RenderTemplateContext | None = None,
    warehouse_id: int | None = None,
    log_label: str = "",
) -> bytes:
    kind = normalize_kind_code(kind_code)
    base_ctx = ctx or RenderTemplateContext(
        tenant_id=int(tenant_id),
        kind_code=kind,
        warehouse_id=warehouse_id,
    )
    kwargs = resolve_render_template_kwargs(db, ctx=base_ctx)
    rendered = render_document_with_legacy_fallback(
        db,
        tenant_id=int(tenant_id),
        kind_code=kind,
        params=params,
        legacy_renderer=legacy_renderer,
        output_format=DocumentOutputFormat.PDF,
        warehouse_id=kwargs.get("warehouse_id"),
        variant_code=str(kwargs.get("variant_code") or "standard"),
        template_version_id=kwargs.get("template_version_id"),
        log_label=log_label,
    )
    if isinstance(rendered, bytes):
        return rendered
    return html_document_to_pdf_bytes(str(rendered))
