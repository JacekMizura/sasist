"""Ensure default document template bindings for tenant — migration to binding-based resolution."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from ..constants import (
    DEFAULT_VARIANT_CODE,
    SOURCE_STARTER,
    SYSTEM_BASE_TEMPLATE_CODE,
    TEMPLATE_ROLE_DOCUMENT,
    VERSION_STATUS_PUBLISHED,
)
from ..models import (
    DocumentTemplate,
    DocumentTemplateBinding,
    DocumentTemplateKind,
    DocumentTemplateStarter,
    DocumentTemplateVersion,
)
from ..services.template_service import publish_version, upsert_binding

logger = logging.getLogger(__name__)

MIGRATION_KIND_ORDER: tuple[str, ...] = (
    "production_card",
    "production_material_pick_list",
    "wz",
    "pz",
    "pw",
    "rw",
    "mm",
    "inventory_count",
    "stock_transfer",
    "relocation_document",
    "order_confirmation",
    "picking_list",
    "return_document",
    "complaint_document",
    "product_card",
    "product_catalog",
    "invoice",
    "receipt",
    "correction",
    "production_report",
    "quality_report",
)

STOCK_KINDS = frozenset({"wz", "pz", "pw", "rw", "mm"})


def ensure_default_binding(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    variant_code: str = DEFAULT_VARIANT_CODE,
) -> dict[str, Any] | None:
    """Create template from starter + binding if missing. Returns binding info or None if skipped."""
    kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.code == str(kind_code)).first()
    if kind is None:
        return None

    existing = (
        db.query(DocumentTemplateBinding)
        .filter(
            DocumentTemplateBinding.tenant_id == int(tenant_id),
            DocumentTemplateBinding.kind_id == int(kind.id),
            DocumentTemplateBinding.variant_code == str(variant_code),
            DocumentTemplateBinding.warehouse_id.is_(None),
            DocumentTemplateBinding.is_active.is_(True),
        )
        .first()
    )
    if existing is not None:
        return {"kind_code": kind_code, "binding_id": int(existing.id), "created": False}

    starter = (
        db.query(DocumentTemplateStarter)
        .filter(DocumentTemplateStarter.kind_id == int(kind.id), DocumentTemplateStarter.code == "default")
        .first()
    )
    if starter is None:
        logger.info("[document_migration] brak startera dla %s — pominięto", kind_code)
        return None

    base_version = _system_base_published_version(db, tenant_id=tenant_id)
    starter_content = str(starter.twig_content)
    use_extends = "{% extends" in starter_content
    partial_pins = _default_partial_pins(db, tenant_id=tenant_id) if use_extends else {}

    template = DocumentTemplate(
        tenant_id=int(tenant_id),
        kind_id=int(kind.id),
        template_role=TEMPLATE_ROLE_DOCUMENT,
        template_code=f"{kind_code}_{variant_code}",
        source=SOURCE_STARTER,
        name=f"{kind.name_pl} — {variant_code}",
        description="Domyślny szablon systemowy (migracja).",
        is_system=True,
    )
    db.add(template)
    db.flush()

    version = DocumentTemplateVersion(
        template_id=int(template.id),
        version_number=1,
        status="draft",
        twig_content=str(starter.twig_content),
        extends_version_id=int(base_version.id) if base_version and use_extends else None,
        partial_pins_json=json.dumps(partial_pins) if partial_pins else None,
        change_summary="Migracja domyślnego szablonu",
    )
    db.add(version)
    db.flush()
    db.commit()

    try:
        publish_version(
            db,
            tenant_id=int(tenant_id),
            template_id=int(template.id),
            version_id=int(version.id),
            skip_validation=True,
        )
    except Exception as exc:
        logger.warning("[document_migration] publish skip validation failed for %s: %s", kind_code, exc)
        db.rollback()
        return None

    published = (
        db.query(DocumentTemplateVersion)
        .filter(
            DocumentTemplateVersion.template_id == int(template.id),
            DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
        )
        .first()
    )
    binding = upsert_binding(
        db,
        tenant_id=int(tenant_id),
        kind_code=kind_code,
        template_id=int(template.id),
        version_id=int(published.id) if published else None,
        variant_code=variant_code,
    )
    logger.info("[document_migration] utworzono binding dla %s tenant=%s", kind_code, tenant_id)
    return {"kind_code": kind_code, "binding_id": binding.get("id"), "created": True}


def migrate_tenant_document_bindings(db: Session, *, tenant_id: int) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for kind_code in MIGRATION_KIND_ORDER:
        hit = ensure_default_binding(db, tenant_id=tenant_id, kind_code=kind_code)
        if hit:
            results.append(hit)
    return results


def _system_base_published_version(db: Session, *, tenant_id: int) -> DocumentTemplateVersion | None:
    base_tpl = (
        db.query(DocumentTemplate)
        .filter(
            DocumentTemplate.tenant_id == int(tenant_id),
            DocumentTemplate.template_code == SYSTEM_BASE_TEMPLATE_CODE,
        )
        .first()
    )
    if base_tpl is None:
        return None
    return (
        db.query(DocumentTemplateVersion)
        .filter(
            DocumentTemplateVersion.template_id == int(base_tpl.id),
            DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
        )
        .order_by(DocumentTemplateVersion.version_number.desc())
        .first()
    )


def _default_partial_pins(db: Session, *, tenant_id: int) -> dict[str, int]:
    from ..constants import SYSTEM_PARTIAL_CODES

    pins: dict[str, int] = {}
    for code in SYSTEM_PARTIAL_CODES:
        partial = (
            db.query(DocumentTemplate)
            .filter(
                DocumentTemplate.tenant_id == int(tenant_id),
                DocumentTemplate.template_code == code,
            )
            .first()
        )
        if partial is None:
            continue
        pv = (
            db.query(DocumentTemplateVersion)
            .filter(
                DocumentTemplateVersion.template_id == int(partial.id),
                DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
            )
            .order_by(DocumentTemplateVersion.version_number.desc())
            .first()
        )
        if pv is not None:
            pins[code] = int(pv.id)
    return pins
