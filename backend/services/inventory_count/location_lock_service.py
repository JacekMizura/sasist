"""Location locking during active inventory."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import AUDIT_LOCK, AUDIT_UNLOCK
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.location_lock import InventoryLocationLock
from .audit_service import log_inventory_audit
from .movement_policy_service import (
    movement_policy_blocks_all_movements,
    movement_policy_blocks_picking,
    movement_policy_creates_locks,
    normalize_movement_policy,
)


def apply_location_locks_for_document(
    db: Session,
    *,
    document: InventoryDocument,
    user_id: int | None = None,
) -> int:
    policy = normalize_movement_policy(document.lock_mode)
    if not movement_policy_creates_locks(policy):
        return 0

    loc_ids = {
        int(r[0])
        for r in db.query(InventoryDocumentLine.location_id)
        .filter(InventoryDocumentLine.inventory_document_id == int(document.id))
        .distinct()
        .all()
    }
    created = 0
    for loc_id in loc_ids:
        existing = (
            db.query(InventoryLocationLock)
            .filter(
                InventoryLocationLock.inventory_document_id == int(document.id),
                InventoryLocationLock.location_id == loc_id,
                InventoryLocationLock.released_at.is_(None),
            )
            .first()
        )
        if existing:
            continue
        db.add(
            InventoryLocationLock(
                inventory_document_id=int(document.id),
                location_id=loc_id,
                lock_mode=policy,
                locked_by_user_id=user_id,
            )
        )
        created += 1
        log_inventory_audit(
            db,
            tenant_id=int(document.tenant_id),
            inventory_document_id=int(document.id),
            user_id=user_id,
            action=AUDIT_LOCK,
            entity_type="location",
            entity_id=loc_id,
            detail={
                "movement_policy": policy,
                "blocks_picking": movement_policy_blocks_picking(policy),
                "blocks_all_movements": movement_policy_blocks_all_movements(policy),
            },
        )
    return created


def release_location_locks_for_document(
    db: Session,
    *,
    document: InventoryDocument,
    user_id: int | None = None,
) -> int:
    from datetime import datetime

    locks = (
        db.query(InventoryLocationLock)
        .filter(
            InventoryLocationLock.inventory_document_id == int(document.id),
            InventoryLocationLock.released_at.is_(None),
        )
        .all()
    )
    for lock in locks:
        lock.released_at = datetime.utcnow()
        log_inventory_audit(
            db,
            tenant_id=int(document.tenant_id),
            inventory_document_id=int(document.id),
            user_id=user_id,
            action=AUDIT_UNLOCK,
            entity_type="location",
            entity_id=int(lock.location_id),
        )
    return len(locks)
