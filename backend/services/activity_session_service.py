"""Operational work-session boundaries for workforce telemetry (not HR / payroll)."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..models.user_activity_log import UserActivityLog

SESSION_GAP_MINUTES = 15


def resolve_session_id(
    db: Session,
    *,
    user_id: int,
    at: datetime,
    tenant_id: int | None = None,
    gap_minutes: int = SESSION_GAP_MINUTES,
) -> str:
    """Continue last session when gap <= gap_minutes; otherwise start a new session."""
    q = db.query(UserActivityLog).filter(UserActivityLog.user_id == user_id)
    if tenant_id is not None:
        q = q.filter(UserActivityLog.tenant_id == tenant_id)
    last = q.order_by(desc(UserActivityLog.created_at)).first()
    gap = timedelta(minutes=gap_minutes)
    if (
        last is not None
        and last.session_id
        and last.created_at is not None
        and (at - last.created_at) <= gap
    ):
        return str(last.session_id)
    return str(uuid4())
