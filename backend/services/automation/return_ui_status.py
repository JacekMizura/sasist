"""Domain service: Return panel UI status (ReturnUiStatus only — not RMZ workflow)."""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.return_ui_status import ReturnUiStatus
from ...models.wms_order_return import WmsOrderReturn

logger = logging.getLogger(__name__)


def apply_return_panel_ui_status(
    db: Session,
    *,
    row: WmsOrderReturn,
    sub_status_id: Optional[int],
    tenant_id: int,
    warehouse_id: int,
    actor_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Set ``ui_status_id`` on RMZ. Does not touch ReturnStatus / warehouse commit / refund.
    Emits Automation Engine status-enter when old != new.
    """
    previous_sid = (
        int(row.ui_status_id) if getattr(row, "ui_status_id", None) is not None else None
    )
    new_sid = int(sub_status_id) if sub_status_id is not None else None

    if new_sid is not None:
        us = (
            db.query(ReturnUiStatus)
            .filter(
                ReturnUiStatus.id == new_sid,
                ReturnUiStatus.tenant_id == int(tenant_id),
                ReturnUiStatus.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        if us is None:
            raise ValueError("Unknown panel sub-status for this warehouse")
        if not bool(getattr(us, "is_active", True)):
            raise ValueError("Ten status panelu jest nieaktywny")

    row.ui_status_id = new_sid
    db.add(row)
    db.flush()

    try:
        from ..returns.return_domain_activity import emit_return_status_changed

        old_name = None
        new_name = None
        if previous_sid is not None:
            prev_us = (
                db.query(ReturnUiStatus)
                .filter(ReturnUiStatus.id == int(previous_sid))
                .first()
            )
            old_name = str(getattr(prev_us, "name", None) or "").strip() or None if prev_us else None
        if new_sid is not None:
            new_us = (
                db.query(ReturnUiStatus)
                .filter(ReturnUiStatus.id == int(new_sid))
                .first()
            )
            new_name = str(getattr(new_us, "name", None) or "").strip() or None if new_us else None
        emit_return_status_changed(
            db,
            rmz=row,
            old_status_id=previous_sid,
            new_status_id=new_sid,
            old_status_name=old_name,
            new_status_name=new_name,
            status_kind="panel",
            actor_user_id=actor_user_id,
        )
    except Exception:
        logger.exception("return activity RETURN_STATUS_CHANGED failed rmz_id=%s", getattr(row, "id", None))

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
    row: WmsOrderReturn,
    previous_status_id: Optional[int],
    new_status_id: Optional[int],
    actor_user_id: Optional[int],
) -> None:
    try:
        nested = db.begin_nested()
        try:
            from .runner import emit_entity_status_entered_and_run
            from .constants import ENTITY_RETURN

            emit_entity_status_entered_and_run(
                db,
                entity_type=ENTITY_RETURN,
                entity_id=int(row.id),
                tenant_id=int(row.tenant_id),
                warehouse_id=int(row.warehouse_id) if row.warehouse_id is not None else None,
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
            "automation trigger after return ui status rmz_id=%s prev=%s new=%s",
            getattr(row, "id", None),
            previous_status_id,
            new_status_id,
        )
