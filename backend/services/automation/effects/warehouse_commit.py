"""warehouse_commit effect — thin adapter to RMZ warehouse commit (Z-PZ path)."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ....models.automation import StatusTransitionEvent
from ....models.wms_order_return import WmsOrderReturn
from ...returns.errors import RmzFinalizeError
from ...returns.rmz_finalize_service import warehouse_commit_rmz_existing_lines
from ...returns.rmz_workflow_config_service import ensure_rmz_workflow_snapshot, resolve_returns_settings
from ..constants import ENTITY_RETURN
from . import EffectResult

_ALREADY_DONE_FRAGMENTS = (
    "already completed",
    "already finished",
    "awaiting office refund",
)


def _is_idempotent_already_done(message: str) -> bool:
    m = (message or "").lower()
    return any(f in m for f in _ALREADY_DONE_FRAGMENTS)


def execute_warehouse_commit(
    db: Session,
    *,
    config: dict[str, Any],
    event: StatusTransitionEvent,
    actor_user_id: Optional[int],
) -> EffectResult:
    """
    Business meaning: „Zatwierdź przyjęcie zwrotu w magazynie”.

    Always process_refund=False — refund is a separate domain stage / effect.
    No direct inventory writes; SSOT = warehouse_commit_rmz_existing_lines.
    """
    del config  # no config required; readiness is domain-gated
    entity_type = str(event.entity_type or "").upper()
    if entity_type != ENTITY_RETURN:
        return EffectResult(
            ok=False,
            message=f"warehouse_commit only supports RETURN (got {entity_type})",
            data={"error_code": "entity_mismatch"},
        )

    row = (
        db.query(WmsOrderReturn)
        .filter(
            WmsOrderReturn.id == int(event.entity_id),
            WmsOrderReturn.tenant_id == int(event.tenant_id),
        )
        .first()
    )
    if row is None:
        return EffectResult(
            ok=False,
            message="Return not found",
            data={"error_code": "return_not_found"},
        )

    wh_id = int(row.warehouse_id) if getattr(row, "warehouse_id", None) else None
    if wh_id is None:
        return EffectResult(
            ok=False,
            message="Return has no warehouse_id",
            data={"error_code": "warehouse_missing"},
        )

    try:
        snapshot = ensure_rmz_workflow_snapshot(db, row)
        settings = resolve_returns_settings(db, tenant_id=int(event.tenant_id), warehouse_id=wh_id)
        warehouse_commit_rmz_existing_lines(
            db,
            row,
            settings=settings,
            snapshot=snapshot,
            refund=None,
            process_refund=False,
            actor_user_id=actor_user_id,
        )
    except RmzFinalizeError as exc:
        msg = str(exc.message or exc)
        if _is_idempotent_already_done(msg):
            return EffectResult(
                ok=True,
                message="warehouse_commit_already_done",
                data={
                    "error_code": "already_committed",
                    "skipped": True,
                    "return_id": int(row.id),
                    "detail": msg,
                },
            )
        return EffectResult(
            ok=False,
            message=msg,
            data={"error_code": "rmz_not_ready", "detail": msg},
        )
    except Exception as exc:
        return EffectResult(
            ok=False,
            message=f"warehouse_commit failed: {exc}",
            data={"error_code": "warehouse_commit_failed"},
        )

    db.refresh(row)
    return EffectResult(
        ok=True,
        message="warehouse_commit_ok",
        data={
            "return_id": int(row.id),
            "warehouse_document_id": int(row.warehouse_document_id)
            if getattr(row, "warehouse_document_id", None)
            else None,
            "process_refund": False,
        },
    )
