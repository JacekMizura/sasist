"""Warehouse document adapter — WZ/PZ/PW/RW/MM via Document Templates bindings."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..errors import DocumentTemplateError
from ..render.output_formats import DocumentOutputFormat
from ..render.render_pipeline import render_for_format
from ..services.context_pipeline_orchestrator import build_context_pipeline
from ..services.template_service import resolve_bound_document_template

KIND_BY_DOC_TYPE = {
    "WZ": "wz",
    "PZ": "pz",
    "PW": "pw",
    "RW": "rw",
    "MM": "mm",
}


def render_stock_document_html(
    db: Session,
    *,
    tenant_id: int,
    document_type: str,
    params: dict[str, Any],
    warehouse_id: int | None = None,
    variant_code: str = "standard",
    template_version_id: int | None = None,
) -> str:
    kind_code = KIND_BY_DOC_TYPE.get(str(document_type or "").upper())
    if not kind_code:
        raise DocumentTemplateError(f"Brak mapowania typu {document_type}.", code="unknown_type")

    context = build_context_pipeline(
        db,
        tenant_id=int(tenant_id),
        kind_code=kind_code,
        params=params,
        warehouse_id=warehouse_id,
    )
    for key, value in params.items():
        if key not in context or isinstance(value, (dict, list)):
            context[key] = value

    if template_version_id is not None:
        from ..services.template_resolution_service import resolve_version_to_document_template

        resolved = resolve_version_to_document_template(db, version_id=int(template_version_id))
    else:
        resolved, _ = resolve_bound_document_template(
            db,
            tenant_id=int(tenant_id),
            kind_code=kind_code,
            warehouse_id=warehouse_id,
            variant_code=variant_code,
        )
    html = render_for_format(resolved, context, DocumentOutputFormat.HTML)
    return str(html)


def binding_available(db: Session, *, tenant_id: int, document_type: str, variant_code: str = "standard") -> bool:
    kind_code = KIND_BY_DOC_TYPE.get(str(document_type or "").upper())
    if not kind_code:
        return False
    try:
        resolve_bound_document_template(
            db,
            tenant_id=int(tenant_id),
            kind_code=kind_code,
            variant_code=variant_code,
        )
        return True
    except DocumentTemplateError:
        return False
