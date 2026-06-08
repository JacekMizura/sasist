"""Inventory count API permission dependencies."""

from __future__ import annotations

from typing import Callable, Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.roles import is_super_role
from ..auth.deps import get_current_user, get_optional_current_user, user_has_permission
from ..database import get_db
from ..models.app_user import AppUser
from ..services.inventory_count.permissions import LEGACY_PERMISSION_ALIASES


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
