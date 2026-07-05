"""Editor-facing services — enriched list, layout templates, editor context."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ..constants import (
    DEFAULT_VARIANT_CODE,
    SOURCE_MARKETPLACE,
    SOURCE_STARTER,
    SOURCE_SYSTEM,
    SOURCE_TENANT,
    TEMPLATE_ROLE_BASE,
    TEMPLATE_ROLE_DOCUMENT,
    TEMPLATE_ROLE_PARTIAL,
    VERSION_STATUS_ARCHIVED,
    VERSION_STATUS_DRAFT,
    VERSION_STATUS_PUBLISHED,
)
from ..errors import DocumentTemplateError, DocumentTemplateNotFoundError
from ..models import (
    DocumentTemplate,
    DocumentTemplateBinding,
    DocumentTemplateFamily,
    DocumentTemplateKind,
    DocumentTemplateVersion,
    DocumentTemplateVersionPartialPin,
)
from ..render.helper_registry import get_twig_helper_registry
from ..render.tag_registry import get_twig_tag_registry
from ..services.change_impact_service import ChangeImpactAnalysisService
from ..services.dependency_graph_service import DependencyGraphService
from ..services.twig_parse_service import extract_include_document_codes
from ..services.template_service import (
    _kind_dict,
    _parse_partial_pins_json,
    _version_dict,
    get_kind_by_code,
    get_template_detail,
    get_variable_tree,
)
from ...models.app_user import AppUser

SOURCE_LABELS = {
    SOURCE_SYSTEM: "System",
    SOURCE_STARTER: "Starter",
    SOURCE_MARKETPLACE: "Marketplace",
    SOURCE_TENANT: "Tenant",
}

STATUS_LABELS = {
    VERSION_STATUS_DRAFT: "Robocza",
    VERSION_STATUS_PUBLISHED: "Opublikowana",
    VERSION_STATUS_ARCHIVED: "Archiwum",
}

ROLE_LABELS = {
    TEMPLATE_ROLE_BASE: "Szablon bazowy",
    TEMPLATE_ROLE_DOCUMENT: "Dokument",
    TEMPLATE_ROLE_PARTIAL: "Fragment",
}


def list_templates_enriched(
    db: Session,
    *,
    tenant_id: int,
    family_code: str | None = None,
    kind_code: str | None = None,
    variant_code: str | None = None,
    status: str | None = None,
    source: str | None = None,
    template_role: str | None = None,
) -> list[dict[str, Any]]:
    q = db.query(DocumentTemplate).filter(DocumentTemplate.tenant_id == int(tenant_id))
    if template_role:
        q = q.filter(DocumentTemplate.template_role == str(template_role))
    if source:
        q = q.filter(DocumentTemplate.source == str(source))
    if kind_code:
        kind = get_kind_by_code(db, kind_code=kind_code)
        q = q.filter(DocumentTemplate.kind_id == int(kind.id))
    elif family_code:
        kinds = (
            db.query(DocumentTemplateKind)
            .join(DocumentTemplateFamily, DocumentTemplateFamily.id == DocumentTemplateKind.family_id)
            .filter(DocumentTemplateFamily.code == str(family_code))
            .all()
        )
        kind_ids = [int(k.id) for k in kinds]
        q = q.filter(DocumentTemplate.kind_id.in_(kind_ids) if kind_ids else DocumentTemplate.kind_id.is_(None))

    rows = q.order_by(DocumentTemplate.updated_at.desc()).all()
    out: list[dict[str, Any]] = []
    for row in rows:
        summary = _template_list_row(db, row)
        if variant_code and summary.get("variants") and variant_code not in summary["variants"]:
            continue
        if status and summary.get("display_status") != status:
            continue
        out.append(summary)
    return out


def _template_list_row(db: Session, row: DocumentTemplate) -> dict[str, Any]:
    kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(row.kind_id)).first() if row.kind_id else None
    family = None
    if kind:
        family = db.query(DocumentTemplateFamily).filter(DocumentTemplateFamily.id == int(kind.family_id)).first()

    versions = (
        db.query(DocumentTemplateVersion)
        .filter(DocumentTemplateVersion.template_id == int(row.id))
        .order_by(DocumentTemplateVersion.version_number.desc())
        .all()
    )
    published = next((v for v in versions if v.status == VERSION_STATUS_PUBLISHED), None)
    draft = next((v for v in versions if v.status == VERSION_STATUS_DRAFT), None)
    display_status = VERSION_STATUS_DRAFT if draft else (VERSION_STATUS_PUBLISHED if published else VERSION_STATUS_ARCHIVED)

    bindings = (
        db.query(DocumentTemplateBinding)
        .filter(
            DocumentTemplateBinding.template_id == int(row.id),
            DocumentTemplateBinding.is_active.is_(True),
        )
        .all()
    )
    binding_labels = []
    variants: set[str] = set()
    for b in bindings:
        variants.add(str(b.variant_code or DEFAULT_VARIANT_CODE))
        kind_row = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(b.kind_id)).first()
        wh = f" · mag.{b.warehouse_id}" if b.warehouse_id else ""
        binding_labels.append(f"{kind_row.name_pl if kind_row else b.kind_id} ({b.variant_code}){wh}")

    author_name = None
    if row.created_by_user_id:
        user = db.query(AppUser).filter(AppUser.id == int(row.created_by_user_id)).first()
        if user:
            author_name = str(getattr(user, "display_name", None) or getattr(user, "username", None) or "")

    return {
        "id": int(row.id),
        "name": row.name,
        "template_role": row.template_role,
        "template_role_label": ROLE_LABELS.get(str(row.template_role), row.template_role),
        "template_code": row.template_code,
        "source": row.source,
        "source_label": SOURCE_LABELS.get(str(row.source), row.source),
        "family": {"code": family.code, "name_pl": family.name_pl} if family else None,
        "kind": _kind_dict(kind) if kind else None,
        "variants": sorted(variants),
        "display_status": display_status,
        "display_status_label": STATUS_LABELS.get(display_status, display_status),
        "published_version": _version_dict(published),
        "draft_version": _version_dict(draft),
        "binding_summary": ", ".join(binding_labels) if binding_labels else None,
        "last_published_at": published.published_at.isoformat() if published and published.published_at else None,
        "author_name": author_name or "—",
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def list_layout_templates(
    db: Session,
    *,
    tenant_id: int,
    role: str,
) -> list[dict[str, Any]]:
    rows = (
        db.query(DocumentTemplate)
        .filter(
            DocumentTemplate.tenant_id == int(tenant_id),
            DocumentTemplate.template_role == str(role),
        )
        .order_by(DocumentTemplate.name.asc())
        .all()
    )
    out = []
    for row in rows:
        published_versions = (
            db.query(DocumentTemplateVersion)
            .filter(
                DocumentTemplateVersion.template_id == int(row.id),
                DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
            )
            .order_by(DocumentTemplateVersion.version_number.desc())
            .all()
        )
        out.append(
            {
                "id": int(row.id),
                "template_code": row.template_code,
                "name": row.name,
                "source": row.source,
                "published_versions": [_version_summary(v) for v in published_versions],
            }
        )
    return out


def list_published_versions(db: Session, *, tenant_id: int, template_id: int) -> list[dict[str, Any]]:
    row = (
        db.query(DocumentTemplate)
        .filter(DocumentTemplate.id == int(template_id), DocumentTemplate.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise DocumentTemplateNotFoundError()
    versions = (
        db.query(DocumentTemplateVersion)
        .filter(
            DocumentTemplateVersion.template_id == int(row.id),
            DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
        )
        .order_by(DocumentTemplateVersion.version_number.desc())
        .all()
    )
    return [_version_summary(v) for v in versions]


def get_editor_catalog() -> dict[str, Any]:
    helpers = sorted(get_twig_helper_registry().functions().keys())
    tags = sorted(get_twig_tag_registry().known_tags())
    return {
        "helpers": [{"name": h, "insert": f"{h}()" if h not in {"company_logo"} else "company_logo()"} for h in helpers],
        "tags": [{"name": t, "insert": f"{{% {t} %}}" if t in {"extends", "block", "endblock"} else f'{{% {t} "..." %}}'} for t in tags],
    }


def get_editor_context(db: Session, *, tenant_id: int, template_id: int) -> dict[str, Any]:
    detail = get_template_detail(db, tenant_id=tenant_id, template_id=template_id)
    template = (
        db.query(DocumentTemplate)
        .filter(DocumentTemplate.id == int(template_id), DocumentTemplate.tenant_id == int(tenant_id))
        .first()
    )
    if template is None:
        raise DocumentTemplateNotFoundError()

    active_version_id = detail.get("active_version_id")
    active_version = None
    if active_version_id:
        active_version = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(active_version_id)).first()

    extends_base = _resolve_extends_base(db, active_version)
    partials_used = _resolve_partials_used(db, active_version, tenant_id=tenant_id)
    bindings = _list_template_bindings(db, tenant_id=tenant_id, template_id=template_id)
    versions_history = _versions_history(db, template_id=int(template_id))

    kind_code = detail.get("kind", {}).get("code") if detail.get("kind") else None
    variable_schema = None
    if kind_code:
        from ..services.variable_schema_service import build_variable_schema

        variable_schema = build_variable_schema(db, tenant_id=tenant_id, kind_code=str(kind_code))
        variable_tree = variable_schema.get("tree") or get_variable_tree(db, kind_code=kind_code)
    else:
        variable_tree = get_variable_tree(db, kind_code=kind_code) if kind_code else []

    graph = None
    impact = None
    if active_version_id:
        graph = DependencyGraphService(db).build_dependency_graph(int(active_version_id))
        impact = get_document_editor_impact(db, version_id=int(active_version_id))

    base_templates = list_layout_templates(db, tenant_id=tenant_id, role=TEMPLATE_ROLE_BASE)
    partial_templates = list_layout_templates(db, tenant_id=tenant_id, role=TEMPLATE_ROLE_PARTIAL)

    return {
        "detail": detail,
        "extends_base": extends_base,
        "partials_used": partials_used,
        "bindings": bindings,
        "versions_history": versions_history,
        "variable_tree": variable_tree,
        "variable_fields": (variable_schema or {}).get("fields") or [],
        "catalog": get_editor_catalog(),
        "base_templates": base_templates,
        "partial_templates": partial_templates,
        "dependencies": graph,
        "impact": impact,
    }


def get_document_editor_impact(db: Session, *, version_id: int) -> dict[str, Any]:
    version = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(version_id)).first()
    if version is None:
        raise DocumentTemplateError("Wersja nie istnieje.", code="not_found")

    impact_service = ChangeImpactAnalysisService(db)
    base_info = None
    if version.extends_version_id:
        base_version = db.query(DocumentTemplateVersion).filter(
            DocumentTemplateVersion.id == int(version.extends_version_id)
        ).first()
        if base_version:
            base_tpl = base_version.template
            latest = (
                db.query(DocumentTemplateVersion)
                .filter(
                    DocumentTemplateVersion.template_id == int(base_tpl.id),
                    DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
                )
                .order_by(DocumentTemplateVersion.version_number.desc())
                .first()
            )
            base_info = {
                "template_code": base_tpl.template_code,
                "template_name": base_tpl.name,
                "pinned_version_id": int(base_version.id),
                "pinned_version_number": int(base_version.version_number),
                "latest_version_id": int(latest.id) if latest else None,
                "latest_version_number": int(latest.version_number) if latest else None,
                "has_newer_version": bool(latest and int(latest.id) != int(base_version.id)),
            }

    partials: list[dict[str, Any]] = []
    pins = _load_version_pins(db, version)
    for code, pin_vid in pins.items():
        pin_v = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(pin_vid)).first()
        if pin_v is None:
            continue
        pin_tpl = pin_v.template
        latest = (
            db.query(DocumentTemplateVersion)
            .filter(
                DocumentTemplateVersion.template_id == int(pin_tpl.id),
                DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
            )
            .order_by(DocumentTemplateVersion.version_number.desc())
            .first()
        )
        partials.append(
            {
                "partial_code": code,
                "template_name": pin_tpl.name,
                "pinned_version_id": int(pin_v.id),
                "pinned_version_number": int(pin_v.version_number),
                "pinned_status": pin_v.status,
                "latest_version_id": int(latest.id) if latest else None,
                "latest_version_number": int(latest.version_number) if latest else None,
                "has_newer_version": bool(latest and int(latest.id) != int(pin_v.id)),
            }
        )

    dependents = []
    if str(version.template.template_role) == TEMPLATE_ROLE_DOCUMENT:
        pass
    elif str(version.template.template_role) == TEMPLATE_ROLE_BASE:
        dependents = impact_service.analyze_base_publish(int(version_id)).get("dependents", [])
    elif str(version.template.template_role) == TEMPLATE_ROLE_PARTIAL:
        dependents = impact_service.analyze_partial_publish(int(version_id)).get("dependents", [])

    return {
        "uses_base": base_info,
        "uses_partials": partials,
        "dependents": dependents,
        "messages": _impact_messages(base_info, partials),
    }


def _impact_messages(base_info: dict | None, partials: list[dict]) -> list[str]:
    msgs: list[str] = []
    if base_info and base_info.get("has_newer_version"):
        msgs.append(
            f"Dostępna nowsza wersja szablonu bazowego "
            f"(v{base_info['latest_version_number']}, przypięto v{base_info['pinned_version_number']})."
        )
    for p in partials:
        if p.get("has_newer_version"):
            msgs.append(
                f"Fragment {p['partial_code']}: dostępna v{p['latest_version_number']}, "
                f"przypięto v{p['pinned_version_number']}."
            )
    return msgs


def _resolve_extends_base(db: Session, version: DocumentTemplateVersion | None) -> dict[str, Any] | None:
    if version is None or not version.extends_version_id:
        return None
    base_version = (
        db.query(DocumentTemplateVersion)
        .options(joinedload(DocumentTemplateVersion.template))
        .filter(DocumentTemplateVersion.id == int(version.extends_version_id))
        .first()
    )
    if base_version is None:
        return None
    tpl = base_version.template
    return {
        "template_id": int(tpl.id),
        "template_code": tpl.template_code,
        "template_name": tpl.name,
        "pinned_version": _version_summary(base_version),
    }


def _resolve_partials_used(
    db: Session,
    version: DocumentTemplateVersion | None,
    *,
    tenant_id: int,
) -> list[dict[str, Any]]:
    if version is None:
        return []
    pins = _load_version_pins(db, version)
    content_codes = extract_include_document_codes(str(version.twig_content or ""))
    all_codes = list(dict.fromkeys([*content_codes, *pins.keys()]))
    out: list[dict[str, Any]] = []
    for code in all_codes:
        pin_vid = pins.get(code)
        partial_tpl = (
            db.query(DocumentTemplate)
            .filter(
                DocumentTemplate.tenant_id == int(tenant_id),
                DocumentTemplate.template_code == code,
                DocumentTemplate.template_role == TEMPLATE_ROLE_PARTIAL,
            )
            .first()
        )
        latest = None
        if partial_tpl:
            latest = (
                db.query(DocumentTemplateVersion)
                .filter(
                    DocumentTemplateVersion.template_id == int(partial_tpl.id),
                    DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
                )
                .order_by(DocumentTemplateVersion.version_number.desc())
                .first()
            )
        pinned = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(pin_vid)).first() if pin_vid else None
        out.append(
            {
                "partial_code": code,
                "is_pinned": pin_vid is not None,
                "pinned_version": _version_summary(pinned) if pinned else None,
                "latest_published": _version_summary(latest) if latest else None,
                "has_newer_version": bool(
                    pinned and latest and int(latest.id) != int(pinned.id)
                ),
            }
        )
    return out


def _load_version_pins(db: Session, version: DocumentTemplateVersion) -> dict[str, int]:
    if version.partial_pins:
        return {p.partial_code: int(p.partial_version_id) for p in version.partial_pins}
    return _parse_partial_pins_json(version.partial_pins_json)


def _list_template_bindings(db: Session, *, tenant_id: int, template_id: int) -> list[dict[str, Any]]:
    rows = (
        db.query(DocumentTemplateBinding)
        .filter(
            DocumentTemplateBinding.tenant_id == int(tenant_id),
            DocumentTemplateBinding.template_id == int(template_id),
            DocumentTemplateBinding.is_active.is_(True),
        )
        .all()
    )
    out = []
    for b in rows:
        kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(b.kind_id)).first()
        out.append(
            {
                "id": int(b.id),
                "kind_code": kind.code if kind else None,
                "kind_name": kind.name_pl if kind else None,
                "variant_code": b.variant_code,
                "warehouse_id": int(b.warehouse_id) if b.warehouse_id else None,
                "version_id": int(b.version_id) if b.version_id else None,
                "priority": int(b.priority),
            }
        )
    return out


def _versions_history(db: Session, *, template_id: int) -> list[dict[str, Any]]:
    from ...models.app_user import AppUser

    versions = (
        db.query(DocumentTemplateVersion)
        .filter(DocumentTemplateVersion.template_id == int(template_id))
        .order_by(DocumentTemplateVersion.version_number.desc())
        .all()
    )
    out = []
    for v in versions:
        summary = _version_summary(v)
        if v.created_by_user_id:
            author = db.query(AppUser).filter(AppUser.id == int(v.created_by_user_id)).first()
            summary["author_name"] = _user_label(author)
        if v.published_by_user_id:
            pub = db.query(AppUser).filter(AppUser.id == int(v.published_by_user_id)).first()
            summary["published_by_name"] = _user_label(pub)
        out.append(summary)
    return out


def _user_label(user) -> str:
    if user is None:
        return "—"
    return str(getattr(user, "display_name", None) or getattr(user, "username", None) or "—")


def compare_versions(db: Session, *, left_version_id: int, right_version_id: int) -> dict[str, Any]:
    left = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(left_version_id)).first()
    right = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(right_version_id)).first()
    if left is None or right is None:
        raise DocumentTemplateError("Wersja nie istnieje.", code="not_found")
    return {
        "left": {
            **_version_summary(left),
            "twig_content": str(left.twig_content or ""),
        },
        "right": {
            **_version_summary(right),
            "twig_content": str(right.twig_content or ""),
        },
    }


def get_version_content(db: Session, *, version_id: int) -> dict[str, Any]:
    ver = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(version_id)).first()
    if ver is None:
        raise DocumentTemplateError("Wersja nie istnieje.", code="not_found")
    return {**_version_summary(ver), "twig_content": str(ver.twig_content or "")}


def list_starter_gallery(db: Session) -> list[dict[str, Any]]:
    from ..models import DocumentTemplateStarter

    rows = (
        db.query(DocumentTemplateStarter)
        .order_by(DocumentTemplateStarter.sort_order.asc(), DocumentTemplateStarter.id.asc())
        .all()
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(row.kind_id)).first()
        family = (
            db.query(DocumentTemplateFamily).filter(DocumentTemplateFamily.id == int(kind.family_id)).first()
            if kind
            else None
        )
        out.append(
            {
                "id": int(row.id),
                "code": row.code,
                "name_pl": row.name_pl,
                "description": row.description,
                "kind_code": kind.code if kind else None,
                "kind_name": kind.name_pl if kind else None,
                "family_code": family.code if family else None,
                "family_name": family.name_pl if family else None,
                "is_system": bool(row.is_system),
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                "preview_html": _starter_preview_snippet(str(row.twig_content or "")),
            }
        )
    return out


def _starter_preview_snippet(content: str) -> str:
    text = content.strip()
    if len(text) > 280:
        return text[:280] + "…"
    return text


def _version_summary(v: DocumentTemplateVersion) -> dict[str, Any]:
    return {
        "id": int(v.id),
        "version_number": int(v.version_number),
        "status": v.status,
        "status_label": STATUS_LABELS.get(str(v.status), v.status),
        "extends_version_id": int(v.extends_version_id) if v.extends_version_id else None,
        "change_summary": v.change_summary,
        "published_at": v.published_at.isoformat() if v.published_at else None,
        "updated_at": v.updated_at.isoformat() if v.updated_at else None,
    }
