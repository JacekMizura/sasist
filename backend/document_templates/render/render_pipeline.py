"""Render pipeline — Twig → HTML (+ optional PDF). No ORM, no providers."""

from __future__ import annotations

from typing import Any

from ...services.structure_report_pdf_service import html_document_to_pdf_bytes
from ..dto.resolved_document_template import ResolvedDocumentTemplate
from ..errors import DocumentRenderError
from .output_formats import DocumentOutputFormat
from .template_renderer import render


def render_html(resolved: ResolvedDocumentTemplate | str, context: dict[str, Any]) -> str:
    return render(resolved, context)


def render_pdf(resolved: ResolvedDocumentTemplate | str, context: dict[str, Any]) -> bytes:
    html = render_html(resolved, context)
    try:
        return html_document_to_pdf_bytes(html)
    except FileNotFoundError as exc:
        raise DocumentRenderError(str(exc), code="pdf_engine_missing") from exc
    except RuntimeError as exc:
        raise DocumentRenderError(str(exc), code="pdf_render_failed") from exc


def render_for_format(
    resolved: ResolvedDocumentTemplate | str,
    context: dict[str, Any],
    output_format: DocumentOutputFormat,
) -> str | bytes:
    if output_format == DocumentOutputFormat.PDF:
        return render_pdf(resolved, context)
    return render_html(resolved, context)
