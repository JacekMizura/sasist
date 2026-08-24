"""generate_document effect — create warehouse document from explicit series_id."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ....models.automation import StatusTransitionEvent
from ...documents.create_from_series_service import (
    DocumentCreationError,
    DocumentTriggerContext,
    create_document_from_series,
)
from ..constants import ENTITY_ORDER
from . import EffectResult


def execute_generate_document(
    db: Session,
    *,
    config: dict[str, Any],
    event: StatusTransitionEvent,
    actor_user_id: Optional[int],
    execution_id: Optional[int] = None,
    effect_id: Optional[int] = None,
) -> EffectResult:
    entity_type = str(event.entity_type or "").upper()
    if entity_type != ENTITY_ORDER:
        return EffectResult(
            ok=False,
            message=f"generate_document only supports ORDER (got {entity_type})",
            data={"error_code": "entity_mismatch"},
        )

    series_id = str(
        config.get("series_id")
        or config.get("document_series_id")
        or config.get("doc_series_id")
        or ""
    ).strip()
    if not series_id:
        return EffectResult(
            ok=False,
            message="generate_document requires series_id",
            data={"error_code": "series_id_required"},
        )

    rule_id = None
    try:
        rule_id = int(getattr(event, "matched_rule_id", None) or 0) or None
    except (TypeError, ValueError):
        rule_id = None

    ctx = DocumentTriggerContext(
        source="AUTOMATION",
        actor_label="Automatyzacja",
        automation_execution_id=int(execution_id) if execution_id else None,
        automation_rule_id=rule_id,
        automation_effect_id=int(effect_id) if effect_id else None,
        root_event_id=int(event.id) if getattr(event, "id", None) else None,
        metadata={
            "initiating_event_id": int(event.id) if getattr(event, "id", None) else None,
            "to_status_id": getattr(event, "to_status_id", None),
            "from_status_id": getattr(event, "from_status_id", None),
        },
    )

    try:
        result = create_document_from_series(
            db,
            tenant_id=int(event.tenant_id),
            series_id=series_id,
            order_id=int(event.entity_id),
            actor_user_id=actor_user_id,
            trigger_context=ctx,
        )
    except DocumentCreationError as exc:
        return EffectResult(
            ok=False,
            message=str(exc),
            data={"error_code": exc.code},
        )
    except Exception as exc:
        return EffectResult(
            ok=False,
            message=f"generate_document failed: {exc}",
            data={"error_code": "generate_document_failed"},
        )

    return EffectResult(
        ok=True,
        message="generate_document_ok",
        data={
            "stock_document_id": result.stock_document_id,
            "document_number": result.document_number,
            "document_type": result.document_type,
            "series_id": result.series_id,
            "created": result.created,
            "settlement_mode": result.settlement_mode,
            "metadata": result.metadata,
        },
    )
