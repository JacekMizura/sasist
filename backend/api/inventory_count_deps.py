"""Inventory count API permission dependencies."""

from __future__ import annotations

from typing import Annotated, Callable, Optional

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.roles import is_super_role
from ..auth.deps import get_current_user, get_optional_current_user, user_has_permission
from ..auth.warehouse_deps import (
    load_inventory_document_for_active_warehouse,
    load_inventory_task_for_active_warehouse,
    require_active_or_query_operable_warehouse,
)
from ..database import get_db
from ..models.app_user import AppUser
from ..services.inventory_count.permissions import LEGACY_PERMISSION_ALIASES


def scoped_inventory_document_id(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> int:
    """P2.2 gate — inventory document must match active warehouse context."""
    load_inventory_document_for_active_warehouse(
        db,
        user,
        tenant_id=tenant_id,
        document_id=document_id,
        active_warehouse_id=warehouse_id,
    )
    return int(document_id)


def scoped_inventory_task_id(
    task_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> int:
    """P2.2 gate — inventory task must match active warehouse context."""
    load_inventory_task_for_active_warehouse(
        db,
        user,
        tenant_id=tenant_id,
        task_id=task_id,
        active_warehouse_id=warehouse_id,
    )
    return int(task_id)


ScopedInventoryDocumentId = Annotated[int, Depends(scoped_inventory_document_id)]
ScopedInventoryTaskId = Annotated[int, Depends(scoped_inventory_task_id)]


def user_has_inventory_permission(db: Session, user: AppUser, permission_key: str) -> bool:
    if is_super_role(user.role):
        return True
    if user_has_permission(db, user, permission_key):
        return True
    for legacy in LEGACY_PERMISSION_ALIASES.get(permission_key, ()):
        if user_has_permission(db, user, legacy):
            return True
    return False


def require_inventory_permission(permission_key: str) -> Callable[..., AppUser]:
    def _dep(user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)) -> AppUser:
        if not user_has_inventory_permission(db, user, permission_key):
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission_key}")
        return user

    return _dep


def require_inventory_permission_optional(permission_key: str) -> Callable[..., Optional[AppUser]]:
    """Require permission when authenticated; allow anonymous for dev-only WMS if unauthenticated."""

    def _dep(user: AppUser | None = Depends(get_optional_current_user), db: Session = Depends(get_db)) -> Optional[AppUser]:
        if user is None:
            return None
        if not user_has_inventory_permission(db, user, permission_key):
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission_key}")
        return user

    return _dep
