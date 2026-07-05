"""Starter gallery — sample render, thumbnails, enriched metadata."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..errors import DocumentTemplateError
from ..models import (
    DocumentTemplate,
    DocumentTemplateBinding,
    DocumentTemplateFamily,
    DocumentTemplateKind,
    DocumentTemplateStarter,
    DocumentTemplateVersion,
)
from ..render.output_formats import DocumentOutputFormat
from ..render.render_pipeline import render_for_format
from ..services.context_pipeline_orchestrator import build_sample_context
from ..services.document_render_service import resolve_draft_template
from ..services.template_service import get_variable_tree
from ...services.structure_report_pdf_service import BACKEND_ROOT, html_to_thumbnail_png_bytes

THUMBNAIL_DIR = BACKEND_ROOT / "uploads" / "starter_thumbnails"
DEFAULT_TENANT_ID = 1


def _starter_row(db: Session, starter_id: int) -> DocumentTemplateStarter:
    row = db.query(DocumentTemplateStarter).filter(DocumentTemplateStarter.id == int(starter_id)).first()
    if row is None:
        raise DocumentTemplateError("Starter nie istnieje.", code="starter_not_found")
    return row


def _resolve_starter_html(db: Session, *, starter: DocumentTemplateStarter, tenant_id: int) -> str:
    from ..services.document_migration_service import _default_partial_pins, _system_base_published_version

    kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(starter.kind_id)).first()
    if kind is None:
        raise DocumentTemplateError("Typ startera nie istnieje.", code="kind_not_found")
    content = str(starter.twig_content or "")
    use_extends = "{% extends" in content
    base_version = _system_base_published_version(db, tenant_id=int(tenant_id)) if use_extends else None
    partial_pins = _default_partial_pins(db, tenant_id=int(tenant_id)) if use_extends else {}
    resolved = resolve_draft_template(
        db,
        template=content,
        extends_version_id=int(base_version.id) if base_version and use_extends else None,
        partial_pins_json=json.dumps(partial_pins) if partial_pins else None,
    )
    context = build_sample_context(db, tenant_id=int(tenant_id), kind_code=str(kind.code))
    html = render_for_format(resolved, context, DocumentOutputFormat.HTML)
    return str(html)


def _content_hash(starter: DocumentTemplateStarter) -> str:
    raw = str(starter.twig_content or "").encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


def _thumbnail_cache_path(starter_id: int, content_hash: str) -> Path:
    THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
    return THUMBNAIL_DIR / f"starter_{starter_id}_{content_hash}.png"


def get_starter_thumbnail_bytes(db: Session, *, starter_id: int, tenant_id: int = DEFAULT_TENANT_ID) -> tuple[bytes, bool]:
    """Return PNG bytes and whether result came from cache."""
    starter = _starter_row(db, starter_id)
    cache_path = _thumbnail_cache_path(int(starter.id), _content_hash(starter))
    if cache_path.is_file() and cache_path.stat().st_size > 0:
        return cache_path.read_bytes(), True
    html = _resolve_starter_html(db, starter=starter, tenant_id=int(tenant_id))
    png = html_to_thumbnail_png_bytes(html)
    cache_path.write_bytes(png)
    return png, False


def _binding_count_for_kind(db: Session, kind_id: int) -> int:
    return int(
        db.query(func.count(DocumentTemplateBinding.id))
        .filter(
            DocumentTemplateBinding.kind_id == int(kind_id),
            DocumentTemplateBinding.is_active.is_(True),
        )
        .scalar()
        or 0
    )


def list_starter_gallery_enriched(db: Session, *, tenant_id: int = DEFAULT_TENANT_ID) -> dict[str, Any]:
    rows = (
        db.query(DocumentTemplateStarter)
        .order_by(DocumentTemplateStarter.sort_order.asc(), DocumentTemplateStarter.id.asc())
        .all()
    )
    items: list[dict[str, Any]] = []
    for row in rows:
        kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(row.kind_id)).first()
        family = (
            db.query(DocumentTemplateFamily).filter(DocumentTemplateFamily.id == int(kind.family_id)).first()
            if kind
            else None
        )
        tags = []
        if family:
            tags.append(family.code)
        if kind:
            tags.append(kind.code)
        tags.append("system" if row.is_system else "tenant")
        items.append(
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
                "sort_order": int(row.sort_order or 0),
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                "author_label": "System" if row.is_system else "Własny",
                "tags": tags,
                "thumbnail_url": f"/api/document-templates/starters/{int(row.id)}/thumbnail?tenant_id={int(tenant_id)}",
                "usage_count": _binding_count_for_kind(db, int(kind.id)) if kind else 0,
            }
        )

    sorted_recent = sorted(items, key=lambda x: x.get("updated_at") or "", reverse=True)
    recent_ids = {i["id"] for i in sorted_recent[:6]}
    featured_ids = {i["id"] for i in items if i.get("is_system") and int(i.get("sort_order") or 99) <= 5}
    popular_ids = {i["id"] for i in sorted(items, key=lambda x: int(x.get("usage_count") or 0), reverse=True)[:6]}

    for item in items:
        categories: list[str] = []
        if item["id"] in featured_ids:
            categories.append("featured")
        if item["id"] in recent_ids:
            categories.append("recent")
        if item["id"] in popular_ids:
            categories.append("popular")
        item["categories"] = categories

    return {
        "items": items,
        "total": len(items),
        "families": sorted({i["family_name"] for i in items if i.get("family_name")}),
        "kinds": sorted({i["kind_name"] for i in items if i.get("kind_name")}),
        "tags": sorted({t for i in items for t in i.get("tags") or []}),
    }


def get_starter_gallery_detail(db: Session, *, starter_id: int, tenant_id: int = DEFAULT_TENANT_ID) -> dict[str, Any]:
    starter = _starter_row(db, starter_id)
    kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(starter.kind_id)).first()
    family = (
        db.query(DocumentTemplateFamily).filter(DocumentTemplateFamily.id == int(kind.family_id)).first()
        if kind
        else None
    )
    from ..services.document_migration_service import _default_partial_pins, _system_base_published_version

    content = str(starter.twig_content or "")
    use_extends = "{% extends" in content
    base_version = _system_base_published_version(db, tenant_id=int(tenant_id)) if use_extends else None
    partial_pins = _default_partial_pins(db, tenant_id=int(tenant_id)) if use_extends else {}
    partials_used = []
    for code, vid in partial_pins.items():
        ver = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(vid)).first()
        tpl = db.query(DocumentTemplate).filter(DocumentTemplate.id == int(ver.template_id)).first() if ver else None
        partials_used.append(
            {
                "partial_code": code,
                "template_name": tpl.name if tpl else code,
                "version_id": int(vid),
            }
        )
    base_info = None
    if base_version:
        base_tpl = db.query(DocumentTemplate).filter(DocumentTemplate.id == int(base_version.template_id)).first()
        base_info = {
            "template_name": base_tpl.name if base_tpl else "BASE",
            "version_id": int(base_version.id),
            "version_number": int(base_version.version_number),
        }
    variables = get_variable_tree(db, kind_code=str(kind.code)) if kind else []
    preview_html = _resolve_starter_html(db, starter=starter, tenant_id=int(tenant_id))
    return {
        "id": int(starter.id),
        "code": starter.code,
        "name_pl": starter.name_pl,
        "description": starter.description,
        "twig_content": content,
        "kind_code": kind.code if kind else None,
        "kind_name": kind.name_pl if kind else None,
        "family_code": family.code if family else None,
        "family_name": family.name_pl if family else None,
        "is_system": bool(starter.is_system),
        "author_label": "System" if starter.is_system else "Własny",
        "updated_at": starter.updated_at.isoformat() if starter.updated_at else None,
        "thumbnail_url": f"/api/document-templates/starters/{int(starter.id)}/thumbnail?tenant_id={int(tenant_id)}",
        "preview_html": preview_html,
        "base_template": base_info,
        "partials_used": partials_used,
        "variables": variables,
    }
