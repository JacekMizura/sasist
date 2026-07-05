"""Assemble PrintContext — delegates to ContextPipelineOrchestrator."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import GlobalPrintContext, PrintContext, dto_to_dict
from ..providers.global_context_provider import build_global_print_context_dto
from ..providers.registry import build_domain_print_context
from .context_pipeline_orchestrator import build_context_pipeline, build_sample_context
from .template_service import get_kind_by_code


def merge_print_context(global_ctx: GlobalPrintContext, domain_ctx: PrintContext) -> dict[str, Any]:
    global_dict = dto_to_dict(global_ctx)
    domain_dict = dto_to_dict(domain_ctx)
    return {**global_dict, **domain_dict}


def build_print_context(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    params: dict[str, Any],
    warehouse_id: int | None = None,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    return build_context_pipeline(
        db,
        tenant_id=tenant_id,
        kind_code=kind_code,
        params=params,
        warehouse_id=warehouse_id,
        operator_user_id=operator_user_id,
    )


__all__ = [
    "build_print_context",
    "build_sample_context",
    "merge_print_context",
    "get_kind_by_code",
    "build_domain_print_context",
    "build_global_print_context_dto",
]
