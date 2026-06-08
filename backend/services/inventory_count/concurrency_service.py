"""Optimistic locking and soft line locks for concurrent WMS counting."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.session import InventorySession
from .errors import InventoryConcurrentUpdateError, InventoryLineLockedError
from .observability import bump_metric, log_inventory_structured

LINE_LOCK_TTL_SECONDS = 300


def _lock_stale(lock_at: datetime | None) -> bool:
    if lock_at is None:
        return True
    return datetime.utcnow() - lock_at > timedelta(seconds=LINE_LOCK_TTL_SECONDS)


def acquire_line_count_lock(
    db: Session,
    *,
    line: InventoryDocumentLine,
    session_id: int | None,
    user_id: int | None,
    force: bool = False,
) -> None:
    if session_id is None:
        return
    holder = line.count_lock_session_id
    if holder is not None and int(holder) != int(session_id):
        if not force and not _lock_stale(line.count_lock_at):
            bump_metric("lock_conflicts", 1)
            log_inventory_structured(
                "line_lock_conflict",
                line_id=int(line.id),
                holder_session=int(holder),
                requester_session=int(session_id),
            )
            raise InventoryLineLockedError(
                f"Line {line.id} is being counted by another operator session"
            )
    line.count_lock_session_id = int(session_id)
    line.count_lock_user_id = user_id
    line.count_lock_at = datetime.utcnow()


def release_line_count_lock(
    db: Session,
    *,
    line: InventoryDocumentLine,
    session_id: int | None,
) -> None:
    if session_id is None:
        return
    if line.count_lock_session_id is not None and int(line.count_lock_session_id) == int(session_id):
        line.count_lock_session_id = None
        line.count_lock_user_id = None
        line.count_lock_at = None


def assert_line_version(line: InventoryDocumentLine, expected_version: int | None) -> None:
    if expected_version is None:
        return
    current = int(line.version or 0)
    if current != int(expected_version):
        bump_metric("concurrent_update_conflicts", 1)
        raise InventoryConcurrentUpdateError(
            f"Line {line.id} was modified concurrently (expected v{expected_version}, got v{current})"
        )


def touch_session_heartbeat(db: Session, session: InventorySession) -> None:
    session.touch_activity()
    session.last_activity_at = datetime.utcnow()
