"""Append-only audit trail for complaints (JSON on `complaints.audit_events_json`)."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, List, Optional

from sqlalchemy.orm import Session

from ..models.complaint import Complaint
from .complaint_event_log import record_from_legacy_audit_append

logger = logging.getLogger(__name__)

_MAX_EVENTS = 200


def append_complaint_audit_event(
    db: Session,
    complaint_id: int,
    event_type: str,
    message: str,
    *,
    user: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
) -> None:
    c = db.query(Complaint).filter(Complaint.id == int(complaint_id)).first()
    if c is None:
        return
    raw = getattr(c, "audit_events_json", None) or "[]"
    try:
        arr: List[Any] = json.loads(raw) if raw else []
    except Exception:
        arr = []
    if not isinstance(arr, list):
        arr = []
    ev: dict[str, Any] = {
        "type": str(event_type)[:64],
        "message": str(message)[:2000],
        "user": user,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    if meta:
        ev["meta"] = meta
    arr.append(ev)
    c.audit_events_json = json.dumps(arr[-_MAX_EVENTS:])
    db.add(c)
    # Structured, queryable log (no Polish message text — meta only).
    record_from_legacy_audit_append(db, complaint_id, str(event_type)[:64], meta, user)


def complaint_audit_events_from_db(raw: Optional[str]) -> List[dict[str, Any]]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            out: List[dict[str, Any]] = []
            for x in data[-_MAX_EVENTS:]:
                if isinstance(x, dict):
                    out.append(x)
            return out
    except Exception:
        pass
    return []


def notify_complaint_status_change_stub(
    complaint_id: int,
    old_status: str,
    new_status: str,
) -> None:
    """Placeholder for e-mail / webhook; log only until provider is wired."""
    logger.info(
        "complaint status notify (stub): id=%s %s -> %s",
        complaint_id,
        old_status,
        new_status,
    )
