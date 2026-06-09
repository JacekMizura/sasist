"""Append-only operational activity log for workforce analytics."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.user_activity_log import UserActivityLog
from .activity_session_service import resolve_session_id


def track_user_activity(
    db: Session,
    *,
    user_id: Optional[int],
    module: str,
    action: str,
    tenant_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    metadata: Optional[dict[str, Any]] = None,
    session_id: Optional[str] = None,
    at: Optional[datetime] = None,
    commit: bool = False,
) -> UserActivityLog:
    """Central telemetry entry — assigns session_id when user_id is present."""
    now = at or datetime.utcnow()
    sid = session_id
    if sid is None and user_id is not None:
        sid = resolve_session_id(db, user_id=int(user_id), at=now, tenant_id=tenant_id)

    row = UserActivityLog(
        user_id=user_id,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        session_id=sid,
        action_type=(action or "operation")[:96],
        module=(module or "SYSTEM")[:64],
        entity_type=entity_type[:80] if entity_type else None,
        entity_id=entity_id,
        metadata_json=json.dumps(metadata, ensure_ascii=False) if metadata else None,
        created_at=now,
    )
    db.add(row)
    if commit:
        db.commit()
    return row


def log_user_activity(
    db: Session,
    *,
    user_id: Optional[int],
    action_type: str,
    module: str,
    tenant_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    metadata: Optional[dict[str, Any]] = None,
    commit: bool = False,
) -> UserActivityLog:
    """Backward-compatible alias for explicit service / auth logging."""
    return track_user_activity(
        db,
        user_id=user_id,
        module=module,
        action=action_type,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=metadata,
        commit=commit,
    )
