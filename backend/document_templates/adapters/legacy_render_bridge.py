"""Legacy render fallback — binding-first, Jinja HTML templates as emergency path."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from ..constants import KIND_CODE_ALIASES
from ..errors import DocumentTemplateError
from ..render.output_formats import DocumentOutputFormat
from ..services.document_render_service import render_document
from ..services.template_service import resolve_bound_document_template

logger = logging.getLogger(__name__)


def normalize_kind_code(kind: str) -> str:
    raw = str(kind or "").strip()
    if not raw:
        return raw
    lower = raw.lower()
    if lower in KIND_CODE_ALIASES.values():
        return lower
    return KIND_CODE_ALIASES.get(raw.upper(), lower)


def binding_exists(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    warehouse_id: int | None = None,
    variant_code: str = "standard",
) -> bool:
    kind = normalize_kind_code(kind_code)
    try:
        resolve_bound_document_template(
            db,
            tenant_id=int(tenant_id),
            kind_code=kind,
            warehouse_id=warehouse_id,
            variant_code=variant_code,
        )
        return True
    except DocumentTemplateError:
        return False


def render_document_with_legacy_fallback(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    params: dict[str, Any],
    legacy_renderer: Callable[[], str | bytes],
    output_format: DocumentOutputFormat = DocumentOutputFormat.HTML,
    warehouse_id: int | None = None,
    variant_code: str = "standard",
    template_version_id: int | None = None,
    log_label: str = "",
) -> str | bytes:
    """Try Document Template Engine binding; on missing binding invoke legacy with warning."""
    kind = normalize_kind_code(kind_code)
    if template_version_id is not None or binding_exists(
        db,
        tenant_id=int(tenant_id),
        kind_code=kind,
        warehouse_id=warehouse_id,
        variant_code=variant_code,
    ):
        return render_document(
            db,
            tenant_id=int(tenant_id),
            kind_code=kind,
            params=params,
            output_format=output_format,
            warehouse_id=warehouse_id,
            variant_code=variant_code,
            template_version_id=template_version_id,
        )

    logger.warning(
        "[document_templates] brak bindingu kind=%s tenant=%s — fallback legacy %s",
        kind,
        tenant_id,
        log_label or "",
    )
    return legacy_renderer()
