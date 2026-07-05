"""CRUD for scope-level document template assignments."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..constants import DEFAULT_VARIANT_CODE, SCOPE_TYPE_LABELS
from ..errors import DocumentTemplateError
from ..models import DocumentTemplateScopeAssignment, DocumentTemplateVersion
from ..services.template_service import get_kind_by_code


def list_scope_assignments(
    db: Session,
    *,
    tenant_id: int,
    scope_type: str,
    scope_id: int,
) -> list[dict[str, Any]]:
    rows = (
        db.query(DocumentTemplateScopeAssignment)
        .filter(
            DocumentTemplateScopeAssignment.tenant_id == int(tenant_id),
            DocumentTemplateScopeAssignment.scope_type == str(scope_type),
            DocumentTemplateScopeAssignment.scope_id == int(scope_id),
        )
        .all()
    )
    return [_assignment_dict(db, row) for row in rows]


def upsert_scope_assignment(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    scope_type: str,
    scope_id: int,
    version_id: int | None,
    variant_code: str = DEFAULT_VARIANT_CODE,
) -> dict[str, Any] | None:
    kind = get_kind_by_code(db, kind_code=kind_code)
    row = (
        db.query(DocumentTemplateScopeAssignment)
        .filter(
            DocumentTemplateScopeAssignment.tenant_id == int(tenant_id),
            DocumentTemplateScopeAssignment.kind_id == int(kind.id),
            DocumentTemplateScopeAssignment.scope_type == str(scope_type),
            DocumentTemplateScopeAssignment.scope_id == int(scope_id),
        )
        .first()
    )
    if version_id is None:
        if row is not None:
            db.delete(row)
            db.commit()
        return None

    ver = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(version_id)).first()
    if ver is None:
        raise DocumentTemplateError("Wersja szablonu nie istnieje.", code="not_found")

    if row is None:
        row = DocumentTemplateScopeAssignment(
            tenant_id=int(tenant_id),
            kind_id=int(kind.id),
            scope_type=str(scope_type),
            scope_id=int(scope_id),
            version_id=int(version_id),
            variant_code=str(variant_code or DEFAULT_VARIANT_CODE),
        )
        db.add(row)
    else:
        row.version_id = int(version_id)
        row.variant_code = str(variant_code or DEFAULT_VARIANT_CODE)
    db.commit()
    db.refresh(row)
    return _assignment_dict(db, row)


def _assignment_dict(db: Session, row: DocumentTemplateScopeAssignment) -> dict[str, Any]:
    from ..models import DocumentTemplate, DocumentTemplateKind

    kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(row.kind_id)).first()
    ver = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(row.version_id)).first()
    tpl = db.query(DocumentTemplate).filter(DocumentTemplate.id == int(ver.template_id)).first() if ver else None
    return {
        "id": int(row.id),
        "tenant_id": int(row.tenant_id),
        "scope_type": row.scope_type,
        "scope_type_label": SCOPE_TYPE_LABELS.get(str(row.scope_type), row.scope_type),
        "scope_id": int(row.scope_id),
        "kind_code": kind.code if kind else None,
        "kind_name": kind.name_pl if kind else None,
        "variant_code": row.variant_code,
        "version_id": int(row.version_id),
        "version_number": int(ver.version_number) if ver else None,
        "template_id": int(tpl.id) if tpl else None,
        "template_name": tpl.name if tpl else None,
    }
