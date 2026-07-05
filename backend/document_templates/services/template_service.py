"""Document template CRUD, versioning, bindings."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ..constants import (
    DEFAULT_VARIANT_CODE,
    SOURCE_TENANT,
    TEMPLATE_ROLE_DOCUMENT,
    VERSION_STATUS_ARCHIVED,
    VERSION_STATUS_DRAFT,
    VERSION_STATUS_PUBLISHED,
)
from ..errors import DocumentKindNotFoundError, DocumentTemplateError, DocumentTemplateNotFoundError
from ..models import (
    DocumentContextSchema,
    DocumentTemplate,
    DocumentTemplateBinding,
    DocumentTemplateKind,
    DocumentTemplateStarter,
    DocumentTemplateVersion,
    DocumentTemplateVersionPartialPin,
)


def list_families_with_kinds(db: Session) -> list[dict[str, Any]]:
    from ..models import DocumentTemplateFamily

    rows = (
        db.query(DocumentTemplateFamily)
        .order_by(DocumentTemplateFamily.sort_order.asc(), DocumentTemplateFamily.name_pl.asc())
        .all()
    )
    out: list[dict[str, Any]] = []
    for fam in rows:
        kinds = (
            db.query(DocumentTemplateKind)
            .filter(DocumentTemplateKind.family_id == int(fam.id))
            .order_by(DocumentTemplateKind.sort_order.asc())
            .all()
        )
        out.append(
            {
                "id": int(fam.id),
                "code": fam.code,
                "name_pl": fam.name_pl,
                "icon": fam.icon,
                "kinds": [_kind_dict(k) for k in kinds],
            }
        )
    return out


def _kind_dict(kind: DocumentTemplateKind) -> dict[str, Any]:
    return {
        "id": int(kind.id),
        "code": kind.code,
        "name_pl": kind.name_pl,
        "provider_key": kind.provider_key,
        "schema_key": kind.schema_key,
    }


def get_kind_by_code(db: Session, *, kind_code: str) -> DocumentTemplateKind:
    row = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.code == str(kind_code)).first()
    if row is None:
        raise DocumentKindNotFoundError(f"Typ dokumentu '{kind_code}' nie istnieje.")
    return row


def list_templates(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str | None = None,
) -> list[dict[str, Any]]:
    q = db.query(DocumentTemplate).filter(DocumentTemplate.tenant_id == int(tenant_id))
    if kind_code:
        kind = get_kind_by_code(db, kind_code=kind_code)
        q = q.filter(DocumentTemplate.kind_id == int(kind.id))
    rows = q.order_by(DocumentTemplate.updated_at.desc()).all()
    return [_template_summary(db, row) for row in rows]


def _template_summary(db: Session, row: DocumentTemplate) -> dict[str, Any]:
    published = (
        db.query(DocumentTemplateVersion)
        .filter(
            DocumentTemplateVersion.template_id == int(row.id),
            DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
        )
        .order_by(DocumentTemplateVersion.version_number.desc())
        .first()
    )
    draft = (
        db.query(DocumentTemplateVersion)
        .filter(
            DocumentTemplateVersion.template_id == int(row.id),
            DocumentTemplateVersion.status == VERSION_STATUS_DRAFT,
        )
        .order_by(DocumentTemplateVersion.version_number.desc())
        .first()
    )
    kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(row.kind_id)).first()
    return {
        "id": int(row.id),
        "tenant_id": int(row.tenant_id),
        "name": row.name,
        "description": row.description,
        "is_system": bool(row.is_system),
        "template_role": row.template_role,
        "template_code": row.template_code,
        "source": row.source,
        "kind": _kind_dict(kind) if kind else None,
        "published_version": _version_dict(published) if published else None,
        "draft_version": _version_dict(draft) if draft else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _version_dict(row: DocumentTemplateVersion | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": int(row.id),
        "version_number": int(row.version_number),
        "status": row.status,
        "extends_version_id": int(row.extends_version_id) if row.extends_version_id else None,
        "partial_pins_json": row.partial_pins_json,
        "change_summary": row.change_summary,
        "published_at": row.published_at.isoformat() if row.published_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def get_template_detail(db: Session, *, tenant_id: int, template_id: int) -> dict[str, Any]:
    row = (
        db.query(DocumentTemplate)
        .filter(DocumentTemplate.id == int(template_id), DocumentTemplate.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise DocumentTemplateNotFoundError()
    versions = (
        db.query(DocumentTemplateVersion)
        .filter(DocumentTemplateVersion.template_id == int(row.id))
        .order_by(DocumentTemplateVersion.version_number.desc())
        .all()
    )
    summary = _template_summary(db, row)
    summary["versions"] = [_version_dict(v) for v in versions if v]
    latest = versions[0] if versions else None
    if latest:
        summary["twig_content"] = latest.twig_content
        summary["active_version_id"] = int(latest.id)
    return summary


def _unique_template_code(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    variant_code: str,
) -> str:
    base = f"{kind_code}_{variant_code or DEFAULT_VARIANT_CODE}"
    code = base
    suffix = 2
    while (
        db.query(DocumentTemplate)
        .filter(DocumentTemplate.tenant_id == int(tenant_id), DocumentTemplate.template_code == code)
        .first()
    ):
        code = f"{base}_{suffix}"
        suffix += 1
    return code


def create_template_from_starter(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    name: str,
    starter_code: str = "default",
    variant_code: str = DEFAULT_VARIANT_CODE,
    user_id: int | None = None,
) -> dict[str, Any]:
    kind = get_kind_by_code(db, kind_code=kind_code)
    starter = (
        db.query(DocumentTemplateStarter)
        .filter(
            DocumentTemplateStarter.kind_id == int(kind.id),
            DocumentTemplateStarter.code == str(starter_code),
        )
        .first()
    )
    if starter is None:
        raise DocumentTemplateError("Starter nie istnieje.", code="starter_not_found")
    starter_content = str(starter.twig_content)
    use_extends = "{% extends" in starter_content
    from .document_migration_service import _default_partial_pins, _system_base_published_version

    base_version = _system_base_published_version(db, tenant_id=int(tenant_id)) if use_extends else None
    partial_pins = _default_partial_pins(db, tenant_id=int(tenant_id)) if use_extends else {}
    template = DocumentTemplate(
        tenant_id=int(tenant_id),
        kind_id=int(kind.id),
        template_role=TEMPLATE_ROLE_DOCUMENT,
        template_code=_unique_template_code(
            db,
            tenant_id=int(tenant_id),
            kind_code=str(kind.code),
            variant_code=str(variant_code or DEFAULT_VARIANT_CODE),
        ),
        source=SOURCE_TENANT,
        name=str(name).strip() or starter.name_pl,
        description=starter.description,
        is_system=False,
        created_by_user_id=user_id,
    )
    db.add(template)
    db.flush()
    version = DocumentTemplateVersion(
        template_id=int(template.id),
        version_number=1,
        status=VERSION_STATUS_DRAFT,
        twig_content=starter_content,
        extends_version_id=int(base_version.id) if base_version and use_extends else None,
        partial_pins_json=json.dumps(partial_pins) if partial_pins else None,
        change_summary="Utworzono ze startera",
        created_by_user_id=user_id,
    )
    db.add(version)
    db.commit()
    db.refresh(template)
    return get_template_detail(db, tenant_id=tenant_id, template_id=int(template.id))


def save_draft_version(
    db: Session,
    *,
    tenant_id: int,
    template_id: int,
    twig_content: str,
    change_summary: str | None = None,
    extends_version_id: int | None = None,
    partial_pins_json: str | None = None,
    user_id: int | None = None,
) -> dict[str, Any]:
    row = (
        db.query(DocumentTemplate)
        .filter(DocumentTemplate.id == int(template_id), DocumentTemplate.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise DocumentTemplateNotFoundError()
    draft = (
        db.query(DocumentTemplateVersion)
        .filter(
            DocumentTemplateVersion.template_id == int(row.id),
            DocumentTemplateVersion.status == VERSION_STATUS_DRAFT,
        )
        .order_by(DocumentTemplateVersion.version_number.desc())
        .first()
    )
    if draft is not None:
        draft.twig_content = str(twig_content)
        draft.change_summary = change_summary
        if extends_version_id is not None:
            draft.extends_version_id = int(extends_version_id)
        if partial_pins_json is not None:
            draft.partial_pins_json = partial_pins_json
        draft.updated_at = datetime.utcnow()
    else:
        last_num = (
            db.query(DocumentTemplateVersion.version_number)
            .filter(DocumentTemplateVersion.template_id == int(row.id))
            .order_by(DocumentTemplateVersion.version_number.desc())
            .first()
        )
        next_num = int(last_num[0] if last_num else 0) + 1
        draft = DocumentTemplateVersion(
            template_id=int(row.id),
            version_number=next_num,
            status=VERSION_STATUS_DRAFT,
            twig_content=str(twig_content),
            extends_version_id=int(extends_version_id) if extends_version_id else None,
            partial_pins_json=partial_pins_json,
            change_summary=change_summary or "Nowa wersja robocza",
            created_by_user_id=user_id,
        )
        db.add(draft)
    row.updated_at = datetime.utcnow()
    db.commit()
    return get_template_detail(db, tenant_id=tenant_id, template_id=int(template_id))


def publish_version(
    db: Session,
    *,
    tenant_id: int,
    template_id: int,
    version_id: int | None = None,
    user_id: int | None = None,
    skip_validation: bool = False,
    change_summary: str | None = None,
) -> dict[str, Any]:
    from .publication_validation_service import validate_publication

    row = (
        db.query(DocumentTemplate)
        .filter(DocumentTemplate.id == int(template_id), DocumentTemplate.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise DocumentTemplateNotFoundError()
    if version_id is not None:
        version = (
            db.query(DocumentTemplateVersion)
            .filter(
                DocumentTemplateVersion.id == int(version_id),
                DocumentTemplateVersion.template_id == int(row.id),
            )
            .first()
        )
    else:
        version = (
            db.query(DocumentTemplateVersion)
            .filter(
                DocumentTemplateVersion.template_id == int(row.id),
                DocumentTemplateVersion.status == VERSION_STATUS_DRAFT,
            )
            .order_by(DocumentTemplateVersion.version_number.desc())
            .first()
        )
    if version is None:
        raise DocumentTemplateError("Brak wersji do opublikowania.", code="no_version")

    kind_code = None
    if row.kind_id is not None:
        kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(row.kind_id)).first()
        kind_code = kind.code if kind else None

    if not skip_validation:
        report = validate_publication(
            db,
            version_id=int(version.id),
            kind_code=kind_code,
            run_render=bool(kind_code),
        )
        if not report.ok:
            raise DocumentTemplateError(
                "Publikacja zablokowana — walidacja nie powiodła się.",
                code="publication_blocked",
            )

    db.query(DocumentTemplateVersion).filter(
        DocumentTemplateVersion.template_id == int(row.id),
        DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
    ).update({DocumentTemplateVersion.status: VERSION_STATUS_ARCHIVED})

    _snapshot_partial_pins(db, version)
    if change_summary:
        version.change_summary = str(change_summary).strip()[:512]
    version.status = VERSION_STATUS_PUBLISHED
    version.published_at = datetime.utcnow()
    version.published_by_user_id = user_id
    row.updated_at = datetime.utcnow()
    db.commit()
    from .editor_cache_service import invalidate_tenant_editor_cache

    invalidate_tenant_editor_cache(tenant_id)
    result = get_template_detail(db, tenant_id=tenant_id, template_id=int(template_id))
    if kind_code and not skip_validation:
        result["validation"] = validate_publication(
            db, version_id=int(version.id), kind_code=kind_code, run_render=False
        ).to_dict()
    return result


def _snapshot_partial_pins(db: Session, version: DocumentTemplateVersion) -> None:
    db.query(DocumentTemplateVersionPartialPin).filter(
        DocumentTemplateVersionPartialPin.document_version_id == int(version.id)
    ).delete()
    pins = _parse_partial_pins_json(version.partial_pins_json)
    for code, partial_version_id in pins.items():
        partial_version = (
            db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(partial_version_id)).first()
        )
        if partial_version is None:
            continue
        db.add(
            DocumentTemplateVersionPartialPin(
                document_version_id=int(version.id),
                partial_template_id=int(partial_version.template_id),
                partial_version_id=int(partial_version_id),
                partial_code=str(code),
            )
        )


def _parse_partial_pins_json(raw: str | None) -> dict[str, int]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return {str(k): int(v) for k, v in data.items()}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def list_starters(db: Session, *, kind_code: str) -> list[dict[str, Any]]:
    kind = get_kind_by_code(db, kind_code=kind_code)
    rows = (
        db.query(DocumentTemplateStarter)
        .filter(DocumentTemplateStarter.kind_id == int(kind.id))
        .order_by(DocumentTemplateStarter.sort_order.asc())
        .all()
    )
    return [
        {
            "id": int(r.id),
            "code": r.code,
            "name_pl": r.name_pl,
            "description": r.description,
            "kind_code": kind.code,
        }
        for r in rows
    ]


def get_variable_tree(db: Session, *, kind_code: str) -> list[dict[str, Any]]:
    kind = get_kind_by_code(db, kind_code=kind_code)
    row = (
        db.query(DocumentContextSchema)
        .filter(
            DocumentContextSchema.kind_id == int(kind.id),
            DocumentContextSchema.schema_key == str(kind.schema_key),
        )
        .first()
    )
    if row is None:
        from .variable_tree_service import build_variable_tree_for_kind

        return build_variable_tree_for_kind(str(kind.schema_key))
    try:
        return json.loads(row.schema_json or "[]")
    except (TypeError, ValueError, json.JSONDecodeError):
        from .variable_tree_service import build_variable_tree_for_kind

        return build_variable_tree_for_kind(str(kind.schema_key))


def resolve_bound_template_content(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    warehouse_id: int | None = None,
    variant_code: str = DEFAULT_VARIANT_CODE,
) -> tuple[str, int | None]:
    resolved, template_id = resolve_bound_document_template(
        db,
        tenant_id=tenant_id,
        kind_code=kind_code,
        warehouse_id=warehouse_id,
        variant_code=variant_code,
    )
    if isinstance(resolved, str):
        return resolved, template_id
    return resolved.main_twig_content, template_id


def resolve_bound_document_template(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    warehouse_id: int | None = None,
    variant_code: str = DEFAULT_VARIANT_CODE,
):
    from ..dto.resolved_document_template import ResolvedDocumentTemplate
    from .template_resolution_service import resolve_plain_twig, resolve_published_template_version

    kind = get_kind_by_code(db, kind_code=kind_code)
    variant = str(variant_code or DEFAULT_VARIANT_CODE)
    binding_q = (
        db.query(DocumentTemplateBinding)
        .options(joinedload(DocumentTemplateBinding.version), joinedload(DocumentTemplateBinding.template))
        .filter(
            DocumentTemplateBinding.tenant_id == int(tenant_id),
            DocumentTemplateBinding.kind_id == int(kind.id),
            DocumentTemplateBinding.variant_code == variant,
            DocumentTemplateBinding.is_active.is_(True),
        )
        .order_by(DocumentTemplateBinding.priority.asc(), DocumentTemplateBinding.id.desc())
    )
    binding: DocumentTemplateBinding | None = None
    if warehouse_id is not None:
        binding = binding_q.filter(DocumentTemplateBinding.warehouse_id == int(warehouse_id)).first()
        if binding is None:
            binding = binding_q.filter(DocumentTemplateBinding.warehouse_id.is_(None)).first()
    else:
        binding = binding_q.filter(DocumentTemplateBinding.warehouse_id.is_(None)).first()

    if binding is not None:
        return _binding_resolved(db, binding)

    starter = (
        db.query(DocumentTemplateStarter)
        .filter(DocumentTemplateStarter.kind_id == int(kind.id), DocumentTemplateStarter.code == "default")
        .first()
    )
    if starter is not None:
        return resolve_plain_twig(str(starter.twig_content)), None
    raise DocumentTemplateError(f"Brak szablonu dla typu {kind_code}.", code="no_template")


def _binding_resolved(db: Session, binding: DocumentTemplateBinding):
    from .template_resolution_service import resolve_published_template_version

    version_id = int(binding.version_id) if binding.version_id else None
    resolved = resolve_published_template_version(
        db,
        template_id=int(binding.template_id),
        version_id=version_id,
    )
    return resolved, int(binding.template_id)


def upsert_binding(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    template_id: int,
    version_id: int | None = None,
    warehouse_id: int | None = None,
    variant_code: str = DEFAULT_VARIANT_CODE,
    priority: int = 100,
) -> dict[str, Any]:
    kind = get_kind_by_code(db, kind_code=kind_code)
    variant = str(variant_code or DEFAULT_VARIANT_CODE)
    template = (
        db.query(DocumentTemplate)
        .filter(DocumentTemplate.id == int(template_id), DocumentTemplate.tenant_id == int(tenant_id))
        .first()
    )
    if template is None:
        raise DocumentTemplateNotFoundError()
    if int(template.kind_id) != int(kind.id):
        raise DocumentTemplateError("Szablon nie pasuje do typu dokumentu.", code="kind_mismatch")
    row = (
        db.query(DocumentTemplateBinding)
        .filter(
            DocumentTemplateBinding.tenant_id == int(tenant_id),
            DocumentTemplateBinding.kind_id == int(kind.id),
            DocumentTemplateBinding.variant_code == variant,
            DocumentTemplateBinding.warehouse_id == (int(warehouse_id) if warehouse_id else None),
        )
        .first()
    )
    if row is None:
        row = DocumentTemplateBinding(
            tenant_id=int(tenant_id),
            kind_id=int(kind.id),
            variant_code=variant,
            template_id=int(template_id),
            version_id=version_id,
            warehouse_id=int(warehouse_id) if warehouse_id else None,
            priority=int(priority),
            is_active=True,
        )
        db.add(row)
    else:
        row.template_id = int(template_id)
        row.version_id = version_id
        row.priority = int(priority)
        row.is_active = True
        row.updated_at = datetime.utcnow()
    db.commit()
    return {
        "id": int(row.id),
        "kind_code": kind.code,
        "variant_code": row.variant_code,
        "template_id": int(row.template_id),
        "version_id": int(row.version_id) if row.version_id else None,
        "warehouse_id": int(row.warehouse_id) if row.warehouse_id else None,
        "priority": int(row.priority),
        "is_active": bool(row.is_active),
    }
