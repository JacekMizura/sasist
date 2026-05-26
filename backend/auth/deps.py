from __future__ import annotations

from typing import Callable, Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.app_user import AppUser, UserPermission
from .permission_catalog import PERMISSION_KEYS, ROLE_PERMISSION_PRESETS

# Granular widoki zamówień — legacy ``orders.view`` w bazie nadal spełnia te kontrole.
ORDERS_VIEW_GRANULAR: frozenset[str] = frozenset(
    {
        "orders.list",
        "orders.detail",
        "orders.customer",
        "orders.history",
        "orders.documents",
    }
)
from .roles import is_super_role
from .tokens import decode_access_token

_http_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_http_bearer),
    db: Session = Depends(get_db),
) -> AppUser:
    if cred is None or cred.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_access_token(cred.credentials)
        if payload.get("typ") != "access":
            raise ValueError("wrong token type")
        uid = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(AppUser).filter(AppUser.id == uid).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User inactive or missing")
    return user


def get_optional_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_http_bearer),
    db: Session = Depends(get_db),
) -> Optional[AppUser]:
    """Authenticated office user when Bearer token is valid; otherwise None (no 401)."""
    if cred is None or cred.scheme.lower() != "bearer":
        return None
    try:
        payload = decode_access_token(cred.credentials)
        if payload.get("typ") != "access":
            raise ValueError("wrong token type")
        uid = int(payload["sub"])
    except Exception:
        return None
    user = db.query(AppUser).filter(AppUser.id == uid).first()
    if user is None or not user.is_active:
        return None
    return user


def effective_permission_keys(db: Session, user: AppUser) -> set[str]:
    """Role preset ∪ explicit UserPermission rows (super roles → full catalog)."""
    if is_super_role(user.role):
        return set(PERMISSION_KEYS)
    r = (user.role or "").strip().lower()
    if r == "superadmin":
        r = "super_admin"
    preset: set[str] = set()
    for rk, keys in ROLE_PERMISSION_PRESETS.items():
        if rk.lower() == r:
            preset = set(keys)
            break
    rows = db.query(UserPermission.permission_key).filter(UserPermission.user_id == user.id).all()
    explicit = {row[0] for row in rows}
    return preset | explicit


def list_permissions_for_user(db: Session, user: AppUser) -> list[str]:
    return sorted(effective_permission_keys(db, user))


def explicit_permission_keys(db: Session, user: AppUser) -> list[str]:
    """Keys stored in ``user_permissions`` (editable overrides), excluding role preset."""
    if is_super_role(user.role):
        return []
    rows = db.query(UserPermission.permission_key).filter(UserPermission.user_id == user.id).all()
    return sorted({str(row[0]) for row in rows if row[0] in PERMISSION_KEYS})


def normalize_stored_permission_keys(keys: list[str] | None) -> list[str] | None:
    """Drop unknown / empty keys before persisting user_permissions."""
    if keys is None:
        return None
    return sorted({str(p).strip() for p in keys if str(p).strip() in PERMISSION_KEYS})


def user_has_permission(db: Session, user: AppUser, permission_key: str) -> bool:
    eff = effective_permission_keys(db, user)
    if permission_key in eff:
        return True
    # Legacy: pojedynczy orders.view → wszystkie szczegółowe widoki
    if permission_key in ORDERS_VIEW_GRANULAR and "orders.view" in eff:
        return True
    # Szczegółowe widoki → kontrola „orders.view” (np. stare guardy)
    if permission_key == "orders.view" and (ORDERS_VIEW_GRANULAR & eff):
        return True
    # Anulowanie ↔ stare usuwanie
    if permission_key == "orders.cancel" and "orders.delete" in eff:
        return True
    if permission_key == "orders.delete" and "orders.cancel" in eff:
        return True
    return False


def require_permission(permission_key: str) -> Callable[..., AppUser]:
    def _dep(user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)) -> AppUser:
        if not user_has_permission(db, user, permission_key):
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission_key}")
        return user

    return _dep


def require_any_permission(*permission_keys: str) -> Callable[..., AppUser]:
    """Allow access if the user has any one of the listed permissions (or super role)."""

    def _dep(user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)) -> AppUser:
        if is_super_role(user.role):
            return user
        for k in permission_keys:
            if user_has_permission(db, user, k):
                return user
        raise HTTPException(
            status_code=403,
            detail="Missing permission: need one of " + ", ".join(permission_keys),
        )

    return _dep


def require_super_role(user: AppUser = Depends(get_current_user)) -> AppUser:
    """HTTP dependency — mutacja zestawów uprawnień/presetów tylko dla super administratora."""
    if not is_super_role(user.role):
        raise HTTPException(status_code=403, detail="Wymagana rola super administratora.")
    return user
