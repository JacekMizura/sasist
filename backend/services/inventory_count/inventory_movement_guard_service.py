"""Enforce inventory movement policies on warehouse operations."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import INV_STATUS_IN_PROGRESS
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.location_lock import InventoryLocationLock
from .errors import InventoryLocationMovementBlockedError
from .movement_policy_service import (
    movement_policy_blocks_all_movements,
    movement_policy_blocks_picking,
    normalize_movement_policy,
)

MOVEMENT_PICK = "pick"
MOVEMENT_PUTAWAY = "putaway"
MOVEMENT_RELOCATE = "relocate"
MOVEMENT_REPLENISH = "replenish"
MOVEMENT_MANUAL = "manual"


def get_active_inventory_lock(
    db: Session,
    *,
    location_id: int,
    tenant_id: int | None = None,
) -> tuple[InventoryLocationLock, InventoryDocument] | None:
    q = (
        db.query(InventoryLocationLock, InventoryDocument)
        .join(InventoryDocument, InventoryDocument.id == InventoryLocationLock.inventory_document_id)
        .filter(
            InventoryLocationLock.location_id == int(location_id),
            InventoryLocationLock.released_at.is_(None),
            InventoryDocument.status == INV_STATUS_IN_PROGRESS,
        )
    )
    if tenant_id is not None:
        q = q.filter(InventoryDocument.tenant_id == int(tenant_id))
    row = q.order_by(InventoryLocationLock.id.desc()).first()
    return row if row else None


def locked_location_ids_for_picking(
    db: Session,
    *,
    tenant_id: int,
    location_ids: set[int] | list[int],
) -> set[int]:
    if not location_ids:
        return set()
    ids = {int(x) for x in location_ids}
    rows = (
        db.query(InventoryLocationLock.location_id, InventoryLocationLock.lock_mode)
        .join(InventoryDocument, InventoryDocument.id == InventoryLocationLock.inventory_document_id)
        .filter(
            InventoryLocationLock.location_id.in_(ids),
            InventoryLocationLock.released_at.is_(None),
            InventoryDocument.status == INV_STATUS_IN_PROGRESS,
            InventoryDocument.tenant_id == int(tenant_id),
        )
        .all()
    )
    blocked: set[int] = set()
    for loc_id, lock_mode in rows:
        if movement_policy_blocks_picking(normalize_movement_policy(lock_mode)):
            blocked.add(int(loc_id))
    return blocked


def assert_location_movement_allowed(
    db: Session,
    *,
    location_id: int,
    movement_kind: str,
    tenant_id: int | None = None,
) -> None:
    row = get_active_inventory_lock(db, location_id=int(location_id), tenant_id=tenant_id)
    if row is None:
        return
    lock, doc = row
    policy = normalize_movement_policy(lock.lock_mode)
    blocked = False
    if movement_kind == MOVEMENT_PICK:
        blocked = movement_policy_blocks_picking(policy)
    else:
        blocked = movement_policy_blocks_all_movements(policy)

    if not blocked:
        return

    message = "Lokalizacja objęta aktywną inwentaryzacją"
    if movement_kind == MOVEMENT_PICK:
        message = f"{message} — zbieranie zablokowane"
    elif movement_kind == MOVEMENT_PUTAWAY:
        message = f"{message} — rozlokowanie zablokowane"
    elif movement_kind == MOVEMENT_RELOCATE:
        message = f"{message} — przesunięcia zablokowane"
    elif movement_kind == MOVEMENT_REPLENISH:
        message = f"{message} — uzupełnienia zablokowane"
    else:
        message = f"{message} — ruch magazynowy zablokowany"

    details: dict[str, Any] = {
        "location_id": int(location_id),
        "movement_kind": movement_kind,
        "movement_policy": policy,
        "inventory_document_id": int(doc.id),
        "inventory_document_number": doc.number,
    }
    raise InventoryLocationMovementBlockedError(message, details=details)
