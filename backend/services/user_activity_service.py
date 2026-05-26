"""Append-only operational activity log for workforce analytics."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.user_activity_log import UserActivityLog


def log_user_activity(
    db: Session,
    *,
    user_id: Optional[int],
    action_type: str,
    module: str,
    tenant_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    metadata: Optional[dict[str, Any]] = None,
    commit: bool = False,
) -> UserActivityLog:
    row = UserActivityLog(
        user_id=user_id,
        tenant_id=tenant_id,
        action_type=action_type[:96],
        module=module[:64],
        entity_type=entity_type[:80] if entity_type else None,
        entity_id=entity_id,
        metadata_json=json.dumps(metadata, ensure_ascii=False) if metadata else None,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    if commit:
        db.commit()
    return row
