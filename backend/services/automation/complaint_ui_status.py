"""Domain service: Complaint panel UI status (ComplaintUiStatus only)."""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.complaint import Complaint
from ...models.complaint_ui_status import ComplaintUiStatus

logger = logging.getLogger(__name__)


def apply_complaint_panel_ui_status(
    db: Session,
    *,
    row: Complaint,
    sub_status_id: Optional[int],
    tenant_id: int,
    actor_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """Set ``complaint_ui_status_id``. Emits Automation Engine when old != new."""
    previous_sid = (
        int(row.complaint_ui_status_id)
        if getattr(row, "complaint_ui_status_id", None) is not None
        else None
    )
    new_sid = int(sub_status_id) if sub_status_id is not None else None

    if new_sid is not None:
        us = (
            db.query(ComplaintUiStatus)
            .filter(ComplaintUiStatus.id == new_sid, ComplaintUiStatus.tenant_id == int(tenant_id))
            .first()
        )
        if us is None:
            raise ValueError("Unknown panel sub-status for this tenant")

    row.complaint_ui_status_id = new_sid
    db.add(row)
    db.flush()

    _emit_automation(
        db,
        row=row,
        previous_status_id=previous_sid,
        new_status_id=new_sid,
        actor_user_id=actor_user_id,
    )
    return {"status_updated": True, "previous_status_id": previous_sid, "new_status_id": new_sid}


def _emit_automation(
    db: Session,
    *,
    row: Complaint,
    previous_status_id: Optional[int],
    new_status_id: Optional[int],
    actor_user_id: Optional[int],
) -> None:
    try:
        nested = db.begin_nested()
        try:
            from .runner import emit_entity_status_entered_and_run
            from .constants import ENTITY_COMPLAINT

            wid = getattr(row, "warehouse_id", None)
            emit_entity_status_entered_and_run(
                db,
                entity_type=ENTITY_COMPLAINT,
                entity_id=int(row.id),
                tenant_id=int(row.tenant_id),
                warehouse_id=int(wid) if wid is not None else None,
                previous_status_id=previous_status_id,
                new_status_id=new_status_id,
                actor_user_id=actor_user_id,
            )
            nested.commit()
        except Exception:
            nested.rollback()
            raise
    except Exception:
        logger.exception(
            "automation trigger after complaint ui status id=%s prev=%s new=%s",
            getattr(row, "id", None),
            previous_status_id,
            new_status_id,
        )
