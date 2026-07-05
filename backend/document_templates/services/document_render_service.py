"""Document render orchestration — template resolution + PrintContext + output formats."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..dto.resolved_document_template import ResolvedDocumentTemplate
from ..render.output_formats import DocumentOutputFormat
from ..render.render_pipeline import render_for_format
from ..services.context_pipeline_orchestrator import build_context_pipeline, build_sample_context
from ..services.template_resolution_service import resolve_plain_twig, resolve_version_to_document_template
from ..services.template_service import resolve_bound_document_template


def render_document(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    params: dict[str, Any],
    output_format: DocumentOutputFormat = DocumentOutputFormat.HTML,
    template: str | None = None,
    resolved_template: ResolvedDocumentTemplate | None = None,
    warehouse_id: int | None = None,
    operator_user_id: int | None = None,
    variant_code: str = "standard",
) -> str | bytes:
    context = build_context_pipeline(
        db,
        tenant_id=tenant_id,
        kind_code=kind_code,
        params=params,
        warehouse_id=warehouse_id,
        operator_user_id=operator_user_id,
    )
    resolved: ResolvedDocumentTemplate | str
    if resolved_template is not None:
        resolved = resolved_template
    elif template is not None:
        resolved = resolve_plain_twig(template)
    else:
        resolved, _ = resolve_bound_document_template(
            db,
            tenant_id=tenant_id,
            kind_code=kind_code,
            warehouse_id=warehouse_id or params.get("warehouse_id"),
            variant_code=variant_code,
        )
    return render_for_format(resolved, context, output_format)


def preview_document(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    template: str,
    params: dict[str, Any] | None = None,
    output_format: DocumentOutputFormat = DocumentOutputFormat.HTML,
    warehouse_id: int | None = None,
    version_id: int | None = None,
    context_mode: str = "sample",
    extends_version_id: int | None = None,
    partial_pins_json: str | None = None,
) -> str | bytes:
    context = (
        build_sample_context(db, tenant_id=tenant_id, kind_code=kind_code)
        if context_mode == "sample"
        else build_context_pipeline(
            db,
            tenant_id=tenant_id,
            kind_code=kind_code,
            params=params or {},
            warehouse_id=warehouse_id,
        )
    )

    if version_id is not None:
        resolved = resolve_version_to_document_template(db, version_id=int(version_id))
    else:
        resolved = _resolve_draft_preview(
            db,
            tenant_id=int(tenant_id),
            template=template,
            extends_version_id=extends_version_id,
            partial_pins_json=partial_pins_json,
        )

    return render_for_format(resolved, context, output_format)


def _resolve_draft_preview(
    db: Session,
    *,
    tenant_id: int,
    template: str,
    extends_version_id: int | None,
    partial_pins_json: str | None,
) -> ResolvedDocumentTemplate:
    import json

    from ..models import DocumentTemplateVersion
    from ..services.document_migration_service import _default_partial_pins, _system_base_published_version
    from ..services.template_resolution_service import _load_base_chain, _load_pin_map
    from ..services.twig_parse_service import collect_all_include_codes, extract_extends_target

    content = str(template)
    base_chain: list[tuple[str, str]] = []
    partials: dict[str, str] = {}

    base_version_id = extends_version_id
    if base_version_id is None:
        extends_target = extract_extends_target(content)
        if extends_target:
            base_version = _system_base_published_version(db, tenant_id=int(tenant_id))
            if base_version is not None:
                base_tpl_code = str(base_version.template.template_code or "")
                if base_tpl_code == extends_target or extends_target == "base_document":
                    base_version_id = int(base_version.id)

    if base_version_id:
        chain, chain_partials = _load_base_chain(db, int(base_version_id))
        base_chain.extend(chain)
        partials.update(chain_partials)

    if partial_pins_json:
        fake_version = DocumentTemplateVersion(
            template_id=0,
            version_number=0,
            status="draft",
            twig_content=content,
            partial_pins_json=partial_pins_json,
        )
        partials.update(_load_pin_map(db, fake_version))

    needed_codes = collect_all_include_codes(content, *[c for _, c in base_chain], *partials.values())
    default_pins = _default_partial_pins(db, tenant_id=int(tenant_id))
    missing_pins = {
        code: int(default_pins[code])
        for code in needed_codes
        if code not in partials and code in default_pins
    }
    if missing_pins:
        auto_version = DocumentTemplateVersion(
            template_id=0,
            version_number=0,
            status="draft",
            twig_content=content,
            partial_pins_json=json.dumps(missing_pins),
        )
        partials.update(_load_pin_map(db, auto_version))

    return ResolvedDocumentTemplate(
        main_template_name="__document__",
        main_twig_content=content,
        base_chain=tuple(base_chain),
        partials=partials,
    )
