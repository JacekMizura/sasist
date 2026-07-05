"""Context provider pipeline — replaces monolithic PrintContextService."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import GlobalPrintContext, PrintContext, dto_to_dict
from ..providers.global_context_provider import build_global_print_context_dto
from ..providers.registry import build_domain_print_context
from .template_service import get_kind_by_code


def merge_context_fragments(*fragments: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for fragment in fragments:
        for key, value in fragment.items():
            if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
                merged[key] = {**merged[key], **value}
            else:
                merged[key] = value
    return merged


def build_context_pipeline(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    params: dict[str, Any],
    warehouse_id: int | None = None,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    kind = get_kind_by_code(db, kind_code=kind_code)
    wh_id = warehouse_id if warehouse_id is not None else params.get("warehouse_id")

    domain_ctx: PrintContext = build_domain_print_context(
        db,
        provider_key=str(kind.provider_key),
        kind_code=str(kind.code),
        tenant_id=int(tenant_id),
        params=dict(params or {}),
    )
    global_ctx: GlobalPrintContext = build_global_print_context_dto(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(wh_id) if wh_id is not None else None,
        operator_user_id=operator_user_id,
    )

    return merge_context_fragments(
        dto_to_dict(domain_ctx),
        dto_to_dict(global_ctx),
    )


def build_sample_context(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    variant_code: str = "standard",
) -> dict[str, Any]:
    _ = variant_code
    return build_context_pipeline(
        db,
        tenant_id=tenant_id,
        kind_code=kind_code,
        params={"sample": True},
        warehouse_id=None,
        operator_user_id=None,
    )
