"""Many templates per document kind — assignments + single default per kind."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..constants import DEFAULT_VARIANT_CODE, VERSION_STATUS_PUBLISHED
from ..errors import DocumentTemplateError, DocumentTemplateNotFoundError
from ..models import (
    DocumentTemplate,
    DocumentTemplateBinding,
    DocumentTemplateKind,
    DocumentTemplateVersion,
)
from .template_service import get_kind_by_code

ASSIGNABLE_KIND_CODES: tuple[str, ...] = (
    "product_card",
    "product_catalog",
    "picking_list",
    "order_confirmation",
    "return_document",
    "complaint_document",
    "invoice",
    "receipt",
    "correction",
    "wz",
    "pz",
    "pw",
    "rw",
    "mm",
    "production_card",
    "production_material_pick_list",
    "production_report",
    "quality_report",
    "inventory_count",
    "stock_transfer",
    "relocation_document",
)


def _published_version_id(db: Session, template_id: int) -> int | None:
    row = (
        db.query(DocumentTemplateVersion)
        .filter(
            DocumentTemplateVersion.template_id == int(template_id),
            DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
        )
        .order_by(DocumentTemplateVersion.version_number.desc())
        .first()
    )
    return int(row.id) if row else None


def _binding_scope_filter(
    q,
    *,
    tenant_id: int,
    kind_id: int,
    variant_code: str,
    warehouse_id: int | None,
):
    q = q.filter(
        DocumentTemplateBinding.tenant_id == int(tenant_id),
        DocumentTemplateBinding.kind_id == int(kind_id),
        DocumentTemplateBinding.variant_code == str(variant_code),
        DocumentTemplateBinding.is_active.is_(True),
    )
    if warehouse_id is None:
        return q.filter(DocumentTemplateBinding.warehouse_id.is_(None))
    return q.filter(DocumentTemplateBinding.warehouse_id == int(warehouse_id))


def clear_default_for_kind(
    db: Session,
    *,
    tenant_id: int,
    kind_id: int,
    variant_code: str = DEFAULT_VARIANT_CODE,
    warehouse_id: int | None = None,
    except_binding_id: int | None = None,
) -> None:
    q = _binding_scope_filter(
        db.query(DocumentTemplateBinding),
        tenant_id=tenant_id,
        kind_id=kind_id,
        variant_code=variant_code,
        warehouse_id=warehouse_id,
    ).filter(DocumentTemplateBinding.is_default.is_(True))
    if except_binding_id is not None:
        q = q.filter(DocumentTemplateBinding.id != int(except_binding_id))
    for row in q.all():
        row.is_default = False
        row.updated_at = datetime.utcnow()


def upsert_template_kind_assignment(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    template_id: int,
    version_id: int | None = None,
    warehouse_id: int | None = None,
    variant_code: str = DEFAULT_VARIANT_CODE,
    priority: int = 100,
    is_default: bool = False,
    is_active: bool = True,
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

    resolved_version_id = version_id or _published_version_id(db, int(template_id))
    row = (
        db.query(DocumentTemplateBinding)
        .filter(
            DocumentTemplateBinding.tenant_id == int(tenant_id),
            DocumentTemplateBinding.kind_id == int(kind.id),
            DocumentTemplateBinding.template_id == int(template_id),
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
            version_id=resolved_version_id,
            warehouse_id=int(warehouse_id) if warehouse_id else None,
            priority=int(priority),
            is_active=is_active,
            is_default=False,
        )
        db.add(row)
    else:
        row.version_id = resolved_version_id
        row.priority = int(priority)
        row.is_active = is_active
        row.updated_at = datetime.utcnow()

    if is_default:
        clear_default_for_kind(
            db,
            tenant_id=tenant_id,
            kind_id=int(kind.id),
            variant_code=variant,
            warehouse_id=warehouse_id,
            except_binding_id=int(row.id) if row.id else None,
        )
        row.is_default = True
    elif not is_active:
        row.is_default = False

    db.flush()
    # If kind has assignments but no default, make this one default when it's the only active assignment.
    if is_active and not is_default:
        has_default = (
            _binding_scope_filter(
                db.query(DocumentTemplateBinding),
                tenant_id=tenant_id,
                kind_id=int(kind.id),
                variant_code=variant,
                warehouse_id=warehouse_id,
            )
            .filter(DocumentTemplateBinding.is_default.is_(True))
            .first()
        )
        if has_default is None:
            row.is_default = True

    db.commit()
    return {
        "id": int(row.id),
        "kind_code": kind.code,
        "variant_code": row.variant_code,
        "template_id": int(row.template_id),
        "version_id": int(row.version_id) if row.version_id else None,
        "warehouse_id": int(row.warehouse_id) if row.warehouse_id else None,
        "is_default": bool(row.is_default),
    }


def deactivate_template_kind_assignment(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    template_id: int,
    variant_code: str = DEFAULT_VARIANT_CODE,
    warehouse_id: int | None = None,
) -> None:
    kind = get_kind_by_code(db, kind_code=kind_code)
    variant = str(variant_code or DEFAULT_VARIANT_CODE)
    row = (
        db.query(DocumentTemplateBinding)
        .filter(
            DocumentTemplateBinding.tenant_id == int(tenant_id),
            DocumentTemplateBinding.kind_id == int(kind.id),
            DocumentTemplateBinding.template_id == int(template_id),
            DocumentTemplateBinding.variant_code == variant,
            DocumentTemplateBinding.warehouse_id == (int(warehouse_id) if warehouse_id else None),
        )
        .first()
    )
    if row is None:
        return
    was_default = bool(row.is_default)
    row.is_active = False
    row.is_default = False
    row.updated_at = datetime.utcnow()
    db.flush()
    if was_default:
        replacement = (
            _binding_scope_filter(
                db.query(DocumentTemplateBinding),
                tenant_id=tenant_id,
                kind_id=int(kind.id),
                variant_code=variant,
                warehouse_id=warehouse_id,
            )
            .order_by(DocumentTemplateBinding.priority.asc(), DocumentTemplateBinding.id.desc())
            .first()
        )
        if replacement is not None:
            replacement.is_default = True
    db.commit()


def list_template_kind_assignments(
    db: Session,
    *,
    tenant_id: int,
    template_id: int,
) -> list[dict[str, Any]]:
    active_bindings = {
        str(b.kind_id): b
        for b in db.query(DocumentTemplateBinding)
        .filter(
            DocumentTemplateBinding.tenant_id == int(tenant_id),
            DocumentTemplateBinding.template_id == int(template_id),
            DocumentTemplateBinding.is_active.is_(True),
            DocumentTemplateBinding.warehouse_id.is_(None),
        )
        .all()
    }
    kinds = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.code.in_(ASSIGNABLE_KIND_CODES)).all()
    kinds_by_code = {k.code: k for k in kinds}
    out: list[dict[str, Any]] = []
    for code in ASSIGNABLE_KIND_CODES:
        kind = kinds_by_code.get(code)
        if kind is None:
            continue
        binding = active_bindings.get(str(int(kind.id)))
        out.append(
            {
                "kind_code": kind.code,
                "kind_name": kind.name_pl,
                "assigned": binding is not None,
                "is_default": bool(binding.is_default) if binding else False,
            }
        )
    return out


def save_template_kind_assignments(
    db: Session,
    *,
    tenant_id: int,
    template_id: int,
    assignments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    published_version_id = _published_version_id(db, int(template_id))
    if published_version_id is None:
        raise DocumentTemplateError(
            "Opublikuj szablon, aby zarządzać przypisaniami.",
            code="validation_error",
        )

    for item in assignments:
        kind_code = str(item.get("kind_code") or "")
        if not kind_code:
            continue
        assigned = bool(item.get("assigned"))
        is_default = bool(item.get("is_default"))
        if assigned:
            upsert_template_kind_assignment(
                db,
                tenant_id=tenant_id,
                kind_code=kind_code,
                template_id=int(template_id),
                version_id=int(published_version_id),
                is_default=is_default,
                is_active=True,
            )
        else:
            deactivate_template_kind_assignment(
                db,
                tenant_id=tenant_id,
                kind_code=kind_code,
                template_id=int(template_id),
            )

    return list_template_kind_assignments(db, tenant_id=tenant_id, template_id=int(template_id))


def used_as_labels_for_template(db: Session, *, tenant_id: int, template_id: int) -> list[str]:
    rows = (
        db.query(DocumentTemplateBinding, DocumentTemplateKind)
        .join(DocumentTemplateKind, DocumentTemplateKind.id == DocumentTemplateBinding.kind_id)
        .filter(
            DocumentTemplateBinding.tenant_id == int(tenant_id),
            DocumentTemplateBinding.template_id == int(template_id),
            DocumentTemplateBinding.is_active.is_(True),
        )
        .order_by(DocumentTemplateKind.name_pl.asc())
        .all()
    )
    seen: set[str] = set()
    labels: list[str] = []
    for _binding, kind in rows:
        label = str(kind.name_pl)
        if label in seen:
            continue
        seen.add(label)
        labels.append(label)
    return labels


def list_published_templates_for_kind(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    variant_code: str | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    from ..constants import TEMPLATE_ROLE_DOCUMENT

    kind = get_kind_by_code(db, kind_code=kind_code)
    variant = str(variant_code or DEFAULT_VARIANT_CODE)
    bindings = (
        _binding_scope_filter(
            db.query(DocumentTemplateBinding),
            tenant_id=tenant_id,
            kind_id=int(kind.id),
            variant_code=variant,
            warehouse_id=None,
        )
        .order_by(DocumentTemplateBinding.is_default.desc(), DocumentTemplateBinding.priority.asc())
        .all()
    )
    needle = (search or "").strip().lower()
    out: list[dict[str, Any]] = []
    seen_template_ids: set[int] = set()

    for binding in bindings:
        template_id = int(binding.template_id)
        if template_id in seen_template_ids:
            continue
        tpl = db.query(DocumentTemplate).filter(DocumentTemplate.id == template_id).first()
        if tpl is None or str(tpl.template_role) != TEMPLATE_ROLE_DOCUMENT:
            continue
        published = (
            db.query(DocumentTemplateVersion)
            .filter(
                DocumentTemplateVersion.template_id == template_id,
                DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
            )
            .order_by(DocumentTemplateVersion.version_number.desc())
            .first()
        )
        if published is None:
            continue
        seen_template_ids.add(template_id)
        label = tpl.name
        if needle and needle not in label.lower():
            continue
        out.append(
            {
                "template_id": template_id,
                "version_id": int(published.id),
                "version_number": int(published.version_number),
                "template_name": tpl.name,
                "description": (tpl.description or "").strip() or None,
                "kind_code": kind.code,
                "kind_name": kind.name_pl,
                "variant_code": str(binding.variant_code or DEFAULT_VARIANT_CODE),
                "status": VERSION_STATUS_PUBLISHED,
                "status_label": "Opublikowana",
                "label": label,
                "published_at": published.published_at.isoformat() if published.published_at else None,
                "is_default_binding": bool(binding.is_default),
                "thumbnail_url": f"/api/document-templates/versions/{int(published.id)}/thumbnail?tenant_id={int(tenant_id)}",
            }
        )
    return out


def resolve_default_binding(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    variant_code: str = DEFAULT_VARIANT_CODE,
    warehouse_id: int | None = None,
) -> DocumentTemplateBinding | None:
    kind = get_kind_by_code(db, kind_code=kind_code)
    variant = str(variant_code or DEFAULT_VARIANT_CODE)
    q = _binding_scope_filter(
        db.query(DocumentTemplateBinding),
        tenant_id=tenant_id,
        kind_id=int(kind.id),
        variant_code=variant,
        warehouse_id=warehouse_id,
    )
    binding = q.filter(DocumentTemplateBinding.is_default.is_(True)).order_by(DocumentTemplateBinding.priority.asc()).first()
    if binding is not None:
        return binding
    return q.order_by(DocumentTemplateBinding.priority.asc(), DocumentTemplateBinding.id.desc()).first()
