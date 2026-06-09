"""WMS operational activity → workforce logs + admin audit (Historia aktywności)."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from .audit_service import log_audit_entry
from .user_activity_service import track_user_activity

MODULE_RECEIVING = "WMS_RECEIVING"
MODULE_PUTAWAY = "WMS_PUTAWAY"
MODULE_MOVEMENTS = "WMS_MOVEMENTS"
MODULE_CARRIERS = "WMS_CARRIERS"


def log_wms_workforce_activity(
    db: Session,
    *,
    user: AppUser | None,
    tenant_id: int | None,
    module: str,
    action_type: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    metadata: dict[str, Any] | None = None,
    write_audit: bool = True,
) -> None:
    """
    Dual-write: user_activity_logs (Czas pracy) + audit_logs (Historia aktywności).
    action_type should include 'scan' / 'pick' / 'pack' substrings when relevant for dashboard buckets.
    """
    uid = int(user.id) if user is not None else None
    mod = (module or "").strip()[:64] or MODULE_RECEIVING
    act = (action_type or "").strip()[:96] or "operation"
    meta = metadata or {}

    track_user_activity(
        db,
        user_id=uid,
        action=act,
        module=mod,
        tenant_id=tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=meta if meta else None,
    )
    if write_audit:
        log_audit_entry(
            db,
            user_id=uid,
            action=f"{mod}.{act}",
            entity_type=entity_type,
            entity_id=entity_id,
            detail=meta if meta else None,
        )
