"""Hierarchical template resolution — explicit → series → warehouse → company → binding."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from ..constants import DEFAULT_VARIANT_CODE, SCOPE_TYPE_COMPANY, SCOPE_TYPE_WAREHOUSE
from ..models import DocumentTemplateScopeAssignment
from ..services.document_integration_service import series_template_render_kwargs
from ..services.template_service import get_kind_by_code


@dataclass(frozen=True)
class RenderTemplateContext:
    tenant_id: int
    kind_code: str
    variant_code: str = DEFAULT_VARIANT_CODE
    warehouse_id: int | None = None
    series: Any | None = None
    scope_type: str | None = None
    scope_id: int | None = None
    explicit_version_id: int | None = None


def resolve_render_template_kwargs(
    db: Session,
    *,
    ctx: RenderTemplateContext,
) -> dict[str, Any]:
    """Return kwargs for render_document / legacy bridge: template_version_id, variant_code, warehouse_id."""
    variant = str(ctx.variant_code or DEFAULT_VARIANT_CODE)
    if ctx.explicit_version_id is not None:
        return {
            "template_version_id": int(ctx.explicit_version_id),
            "variant_code": variant,
            "warehouse_id": ctx.warehouse_id,
        }

    if ctx.scope_type and ctx.scope_id is not None:
        row = _scope_assignment(db, tenant_id=ctx.tenant_id, kind_code=ctx.kind_code, scope_type=ctx.scope_type, scope_id=ctx.scope_id)
        if row is not None:
            return {
                "template_version_id": int(row.version_id),
                "variant_code": str(row.variant_code or variant),
                "warehouse_id": ctx.warehouse_id,
            }

    series_kwargs = series_template_render_kwargs(ctx.series)
    if series_kwargs.get("template_version_id") is not None:
        return {
            "template_version_id": int(series_kwargs["template_version_id"]),
            "variant_code": str(series_kwargs.get("variant_code") or variant),
            "warehouse_id": ctx.warehouse_id,
        }

    if ctx.warehouse_id is not None:
        row = _scope_assignment(
            db,
            tenant_id=ctx.tenant_id,
            kind_code=ctx.kind_code,
            scope_type=SCOPE_TYPE_WAREHOUSE,
            scope_id=int(ctx.warehouse_id),
        )
        if row is not None:
            return {
                "template_version_id": int(row.version_id),
                "variant_code": str(row.variant_code or variant),
                "warehouse_id": ctx.warehouse_id,
            }

    row = _scope_assignment(
        db,
        tenant_id=ctx.tenant_id,
        kind_code=ctx.kind_code,
        scope_type=SCOPE_TYPE_COMPANY,
        scope_id=int(ctx.tenant_id),
    )
    if row is not None:
        return {
            "template_version_id": int(row.version_id),
            "variant_code": str(row.variant_code or variant),
            "warehouse_id": ctx.warehouse_id,
        }

    return {"variant_code": variant, "warehouse_id": ctx.warehouse_id}


def _scope_assignment(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    scope_type: str,
    scope_id: int,
) -> DocumentTemplateScopeAssignment | None:
    kind = get_kind_by_code(db, kind_code=kind_code)
    return (
        db.query(DocumentTemplateScopeAssignment)
        .filter(
            DocumentTemplateScopeAssignment.tenant_id == int(tenant_id),
            DocumentTemplateScopeAssignment.kind_id == int(kind.id),
            DocumentTemplateScopeAssignment.scope_type == str(scope_type),
            DocumentTemplateScopeAssignment.scope_id == int(scope_id),
        )
        .first()
    )
