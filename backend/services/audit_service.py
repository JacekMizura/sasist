"""Central audit logging — call from services when performing sensitive mutations."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ..models.app_user import AuditLog


def log_audit_entry(
    db: Session,
    *,
    user_id: int | None,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    row = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail_json=json.dumps(detail, ensure_ascii=False) if detail else None,
    )
    db.add(row)
