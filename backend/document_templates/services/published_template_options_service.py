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
                "kind_code": kind.code if kind else None,
                "kind_name": kind.name_pl if kind else None,
                "variant_code": variant,
                "status": VERSION_STATUS_PUBLISHED,
                "status_label": "Opublikowana",
                "label": label,
                "published_at": ver.published_at.isoformat() if ver.published_at else None,
                "is_default_binding": bool(binding and binding.version_id == ver.id),
            }
        )
    return out
