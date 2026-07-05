"""Export / import document template packages — marketplace-ready manifest."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..constants import DEFAULT_VARIANT_CODE
from ..errors import DocumentTemplateError
from ..models import (
    DocumentTemplate,
    DocumentTemplateBinding,
    DocumentTemplateFamily,
    DocumentTemplateKind,
    DocumentTemplateVersion,
)
from ..services.editor_cache_service import invalidate_tenant_editor_cache
from ..services.template_service import get_kind_by_code

PACKAGE_FORMAT = "sasist_document_templates_v1"


def _manifest_header(*, name: str, description: str, templates: list[dict]) -> dict[str, Any]:
    return {
        "format": PACKAGE_FORMAT,
        "name": name,
        "author": "Sasist ERP",
        "version": "1.0.0",
        "description": description,
        "compatibility": {"min_engine": "2.1", "max_engine": "2.x"},
        "created_at": datetime.utcnow().isoformat(),
        "templates": templates,
        "partials": [],
        "helpers_required": [],
        "requirements": {"tenant_scoped": True},
    }


def _serialize_template(db: Session, tpl: DocumentTemplate) -> dict[str, Any]:
    kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(tpl.kind_id)).first() if tpl.kind_id else None
    family = (
        db.query(DocumentTemplateFamily).filter(DocumentTemplateFamily.id == int(kind.family_id)).first()
        if kind
        else None
    )
    published = (
        db.query(DocumentTemplateVersion)
        .filter(
            DocumentTemplateVersion.template_id == int(tpl.id),
            DocumentTemplateVersion.status == "published",
        )
        .order_by(DocumentTemplateVersion.version_number.desc())
        .first()
    )
    bindings = (
        db.query(DocumentTemplateBinding)
        .filter(
            DocumentTemplateBinding.template_id == int(tpl.id),
            DocumentTemplateBinding.is_active.is_(True),
        )
        .all()
    )
    return {
        "template_code": tpl.template_code,
        "name": tpl.name,
        "description": tpl.description,
        "template_role": tpl.template_role,
        "source": tpl.source,
        "family_code": family.code if family else None,
        "kind_code": kind.code if kind else None,
        "twig_content": published.twig_content if published else "",
        "extends_version_id": published.extends_version_id if published else None,
        "partial_pins_json": published.partial_pins_json if published else None,
        "bindings": [
            {
                "kind_code": kind.code if kind else None,
                "variant_code": b.variant_code,
                "warehouse_id": b.warehouse_id,
                "priority": b.priority,
            }
            for b in bindings
        ],
    }


def export_template_zip(db: Session, *, tenant_id: int, template_id: int) -> bytes:
    tpl = (
        db.query(DocumentTemplate)
        .filter(DocumentTemplate.id == int(template_id), DocumentTemplate.tenant_id == int(tenant_id))
        .first()
    )
    if tpl is None:
        raise DocumentTemplateError("Szablon nie istnieje.", code="not_found")
    payload = _serialize_template(db, tpl)
    manifest = _manifest_header(
        name=tpl.name,
        description=tpl.description or "",
        templates=[{"file": "templates/0.json", "kind_code": payload.get("kind_code")}],
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        zf.writestr("templates/0.json", json.dumps(payload, ensure_ascii=False, indent=2))
    return buf.getvalue()


def export_family_zip(db: Session, *, tenant_id: int, family_code: str) -> bytes:
    family = db.query(DocumentTemplateFamily).filter(DocumentTemplateFamily.code == str(family_code)).first()
    if family is None:
        raise DocumentTemplateError("Rodzina nie istnieje.", code="not_found")
    kinds = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.family_id == int(family.id)).all()
    kind_ids = {int(k.id) for k in kinds}
    templates = (
        db.query(DocumentTemplate)
        .filter(DocumentTemplate.tenant_id == int(tenant_id), DocumentTemplate.kind_id.in_(kind_ids))
        .all()
    )
    entries: list[dict[str, Any]] = []
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, tpl in enumerate(templates):
            payload = _serialize_template(db, tpl)
            fname = f"templates/{idx}.json"
            entries.append({"file": fname, "kind_code": payload.get("kind_code"), "name": tpl.name})
            zf.writestr(fname, json.dumps(payload, ensure_ascii=False, indent=2))
        manifest = _manifest_header(name=family.name_pl, description=f"Eksport rodziny {family.code}", templates=entries)
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return buf.getvalue()


def export_full_package_zip(db: Session, *, tenant_id: int) -> bytes:
    templates = db.query(DocumentTemplate).filter(DocumentTemplate.tenant_id == int(tenant_id)).all()
    entries: list[dict[str, Any]] = []
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, tpl in enumerate(templates):
            payload = _serialize_template(db, tpl)
            fname = f"templates/{idx}.json"
            entries.append({"file": fname, "kind_code": payload.get("kind_code"), "name": tpl.name})
            zf.writestr(fname, json.dumps(payload, ensure_ascii=False, indent=2))
        manifest = _manifest_header(
            name="Pełny pakiet szablonów",
            description="Eksport wszystkich szablonów tenant",
            templates=entries,
        )
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return buf.getvalue()


def analyze_import_conflicts(db: Session, *, tenant_id: int, manifest: dict, templates: list[dict]) -> list[dict[str, Any]]:
    conflicts: list[dict[str, Any]] = []
    for tpl in templates:
        code = tpl.get("template_code")
        kind_code = tpl.get("kind_code")
        existing = (
            db.query(DocumentTemplate)
            .filter(DocumentTemplate.tenant_id == int(tenant_id), DocumentTemplate.template_code == str(code))
            .first()
            if code
            else None
        )
        if existing:
            conflicts.append(
                {
                    "type": "template_code",
                    "template_code": code,
                    "existing_id": int(existing.id),
                    "message": f"Szablon o kodzie {code} już istnieje.",
                }
            )
        if kind_code:
            try:
                kind = get_kind_by_code(db, kind_code=str(kind_code))
                for b in tpl.get("bindings") or []:
                    variant = str(b.get("variant_code") or DEFAULT_VARIANT_CODE)
                    hit = (
                        db.query(DocumentTemplateBinding)
                        .filter(
                            DocumentTemplateBinding.tenant_id == int(tenant_id),
                            DocumentTemplateBinding.kind_id == int(kind.id),
                            DocumentTemplateBinding.variant_code == variant,
                            DocumentTemplateBinding.is_active.is_(True),
                        )
                        .first()
                    )
                    if hit:
                        conflicts.append(
                            {
                                "type": "binding",
                                "kind_code": kind_code,
                                "variant_code": variant,
                                "existing_binding_id": int(hit.id),
                                "message": f"Powiązanie {kind_code}/{variant} już istnieje.",
                            }
                        )
            except Exception:
                pass
    return conflicts


def apply_import(
    db: Session,
    *,
    tenant_id: int,
    templates: list[dict],
    resolutions: dict[str, str],
) -> dict[str, Any]:
    """resolutions keys: template_code or binding:kind:variant -> replace|copy|skip"""
    created = 0
    skipped = 0
    for tpl in templates:
        code = str(tpl.get("template_code") or "")
        mode = resolutions.get(code, resolutions.get("*", "copy"))
        if mode == "skip":
            skipped += 1
            continue
        existing = (
            db.query(DocumentTemplate)
            .filter(DocumentTemplate.tenant_id == int(tenant_id), DocumentTemplate.template_code == code)
            .first()
        )
        if existing and mode == "replace":
            target = existing
        elif existing and mode == "copy":
            code = f"{code}_import"
            target = None
        else:
            target = None

        kind = get_kind_by_code(db, kind_code=str(tpl["kind_code"])) if tpl.get("kind_code") else None
        if target is None:
            target = DocumentTemplate(
                tenant_id=int(tenant_id),
                kind_id=int(kind.id) if kind else None,
                template_role=str(tpl.get("template_role") or "DOCUMENT"),
                template_code=code or None,
                source="TENANT",
                name=str(tpl.get("name") or code),
                description=tpl.get("description"),
            )
            db.add(target)
            db.flush()
        ver = DocumentTemplateVersion(
            template_id=int(target.id),
            version_number=1,
            status="draft",
            twig_content=str(tpl.get("twig_content") or ""),
            extends_version_id=tpl.get("extends_version_id"),
            partial_pins_json=tpl.get("partial_pins_json"),
            change_summary="Import pakietu",
        )
        db.add(ver)
        created += 1
    db.commit()
    invalidate_tenant_editor_cache(tenant_id)
    return {"created": created, "skipped": skipped}
