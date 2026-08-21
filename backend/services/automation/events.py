"""Status transition event identity + automation depth context."""

from __future__ import annotations

import uuid
from contextvars import ContextVar
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ...models.automation import StatusTransitionEvent
from .constants import MAX_AUTOMATION_DEPTH

#: Nesting depth of automation runners for the current call stack.
automation_depth_var: ContextVar[int] = ContextVar("automation_depth", default=0)
#: Root transition event id for the current automation chain.
automation_root_event_var: ContextVar[Optional[str]] = ContextVar("automation_root_event", default=None)


def create_status_transition_event(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    entity_type: str,
    entity_id: int,
    old_status_key: Optional[str],
    new_status_key: str,
    actor_user_id: Optional[int] = None,
) -> StatusTransitionEvent:
    """Persist a new transition event. Caller must ensure old != new."""
    depth = automation_depth_var.get()
    root = automation_root_event_var.get()
    event_id = str(uuid.uuid4())
    if root is None:
        root = event_id
    row = StatusTransitionEvent(
        id=event_id,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
        entity_type=str(entity_type).strip().upper(),
        entity_id=int(entity_id),
        old_status_key=str(old_status_key) if old_status_key is not None else None,
        new_status_key=str(new_status_key),
        actor_user_id=int(actor_user_id) if actor_user_id is not None else None,
        root_event_id=root,
        depth=int(depth),
        occurred_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def can_enter_automation_depth() -> bool:
    return automation_depth_var.get() < MAX_AUTOMATION_DEPTH


def push_automation_depth() -> int:
    """Increment depth; returns token depth value after increment."""
    d = automation_depth_var.get() + 1
    automation_depth_var.set(d)
    return d


def set_root_event_if_needed(event_id: str) -> None:
    if automation_root_event_var.get() is None:
        automation_root_event_var.set(event_id)
