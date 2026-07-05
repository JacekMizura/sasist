"""Published template options for ERP binding selectors."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session, joinedload

from ..constants import DEFAULT_VARIANT_CODE, TEMPLATE_ROLE_DOCUMENT, VERSION_STATUS_PUBLISHED
from ..models import DocumentTemplate, DocumentTemplateBinding, DocumentTemplateKind, DocumentTemplateVersion
from ..services.template_service import get_kind_by_code


def list_published_template_options(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str | None = None,
    variant_code: str | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    q = (
        db.query(DocumentTemplateVersion)
        .join(DocumentTemplate, DocumentTemplate.id == DocumentTemplateVersion.template_id)
        .filter(
            DocumentTemplate.tenant_id == int(tenant_id),
            DocumentTemplate.template_role == TEMPLATE_ROLE_DOCUMENT,
            DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
        )
        .options(joinedload(DocumentTemplateVersion.template))
    )
    if kind_code:
        kind = get_kind_by_code(db, kind_code=kind_code)
        q = q.filter(DocumentTemplate.kind_id == int(kind.id))
    rows = q.order_by(DocumentTemplate.name.asc(), DocumentTemplateVersion.version_number.desc()).all()
    needle = (search or "").strip().lower()
    out: list[dict[str, Any]] = []
    for ver in rows:
        tpl = ver.template
        kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(tpl.kind_id)).first()
        binding = (
            db.query(DocumentTemplateBinding)
            .filter(
                DocumentTemplateBinding.tenant_id == int(tenant_id),
                DocumentTemplateBinding.template_id == int(tpl.id),
                DocumentTemplateBinding.is_active.is_(True),
            )
            .order_by(DocumentTemplateBinding.priority.asc())
            .first()
        )
        variant = str(binding.variant_code if binding else DEFAULT_VARIANT_CODE)
        if variant_code and variant != str(variant_code):
            continue
        label = f"{tpl.name} — v{ver.version_number} ({variant})"
        if kind:
            label = f"{kind.name_pl}: {label}"
        if needle and needle not in label.lower() and needle not in str(tpl.name).lower():
            continue
        out.append(
            {
                "template_id": int(tpl.id),
                "version_id": int(ver.id),
                "version_number": int(ver.version_number),
                "template_name": tpl.name,
                "description": (tpl.description or "").strip() or None,
                "kind_code": kind.code if kind else None,
                "kind_name": kind.name_pl if kind else None,
                "variant_code": variant,
                "status": VERSION_STATUS_PUBLISHED,
                "status_label": "Opublikowana",
                "label": label,
                "published_at": ver.published_at.isoformat() if ver.published_at else None,
                "is_default_binding": bool(binding and binding.version_id == ver.id),
                "thumbnail_url": f"/api/document-templates/versions/{int(ver.id)}/thumbnail?tenant_id={int(tenant_id)}",
            }
        )
    return out


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
