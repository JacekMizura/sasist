"""Published template options for ERP binding selectors."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .template_kind_assignment_service import list_published_templates_for_kind


def list_published_template_options(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str | None = None,
    variant_code: str | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    if not kind_code:
        return []
    return list_published_templates_for_kind(
        db,
        tenant_id=tenant_id,
        kind_code=kind_code,
        variant_code=variant_code,
        search=search,
    )


def get_published_version_thumbnail_bytes(
    db: Session,
    *,
    tenant_id: int,
    version_id: int,
) -> tuple[bytes, bool]:
    """Render sample preview HTML → PNG thumbnail for published template version."""
    import hashlib
    from pathlib import Path

    from ..constants import TEMPLATE_ROLE_DOCUMENT, VERSION_STATUS_PUBLISHED
    from ..models import DocumentTemplate, DocumentTemplateKind, DocumentTemplateVersion
    from ..render.output_formats import DocumentOutputFormat
    from ..services.document_render_service import preview_document
    from ...services.structure_report_pdf_service import BACKEND_ROOT, html_to_thumbnail_png_bytes

    THUMBNAIL_DIR = BACKEND_ROOT / "uploads" / "template_version_thumbnails"

    ver = (
        db.query(DocumentTemplateVersion)
        .join(DocumentTemplate, DocumentTemplate.id == DocumentTemplateVersion.template_id)
        .filter(
            DocumentTemplateVersion.id == int(version_id),
            DocumentTemplate.tenant_id == int(tenant_id),
            DocumentTemplate.template_role == TEMPLATE_ROLE_DOCUMENT,
            DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
        )
        .first()
    )
    if ver is None:
        raise ValueError("Published template version not found")

    tpl = ver.template
    kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(tpl.kind_id)).first()
    if kind is None:
        raise ValueError("Template kind not found")

    content_hash = hashlib.sha256(str(ver.twig_content or "").encode("utf-8")).hexdigest()[:16]
    THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = THUMBNAIL_DIR / f"version_{int(version_id)}_{content_hash}.png"
    if cache_path.is_file() and cache_path.stat().st_size > 0:
        return cache_path.read_bytes(), True

    html = preview_document(
        db,
        tenant_id=int(tenant_id),
        kind_code=str(kind.code),
        template="",
        output_format=DocumentOutputFormat.HTML,
        version_id=int(version_id),
        context_mode="sample",
    )
    png = html_to_thumbnail_png_bytes(str(html))
    cache_path.write_bytes(png)
    return png, False
