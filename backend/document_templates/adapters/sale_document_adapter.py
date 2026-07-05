"""Sale document adapter — FV/PA/korekty via Document Template bindings."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..constants import DEFAULT_VARIANT_CODE
from ..render.output_formats import DocumentOutputFormat
from .legacy_render_bridge import binding_exists, normalize_kind_code, render_document_with_legacy_fallback

_SUBTYPE_TO_KIND = {
    "FV": "invoice",
    "PA": "receipt",
    "KOR": "correction",
    "CORRECTION": "correction",
    "INVOICE": "invoice",
    "RECEIPT": "receipt",
}


def sale_kind_for_subtype(document_subtype: str | None) -> str:
    sub = str(document_subtype or "").strip().upper()
    return _SUBTYPE_TO_KIND.get(sub, "invoice")


def render_sale_document_html(
    db: Session,
    *,
    tenant_id: int,
    document_id: str,
    document_subtype: str | None,
    legacy_renderer,
    variant_code: str = DEFAULT_VARIANT_CODE,
    template_version_id: int | None = None,
) -> str:
    kind_code = sale_kind_for_subtype(document_subtype)
    html = render_document_with_legacy_fallback(
        db,
        tenant_id=int(tenant_id),
        kind_code=kind_code,
        params={"sale_document_id": str(document_id), "document_id": str(document_id)},
        legacy_renderer=legacy_renderer,
        output_format=DocumentOutputFormat.HTML,
        variant_code=variant_code,
        template_version_id=template_version_id,
        log_label=f"sale_document_id={document_id}",
    )
    return str(html)


def sale_binding_available(
    db: Session,
    *,
    tenant_id: int,
    document_subtype: str | None,
    variant_code: str = DEFAULT_VARIANT_CODE,
) -> bool:
    kind_code = sale_kind_for_subtype(document_subtype)
    return binding_exists(
        db,
        tenant_id=int(tenant_id),
        kind_code=normalize_kind_code(kind_code),
        variant_code=variant_code,
    )
