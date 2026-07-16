"""Guards for system / owner users (SUPER_ADMIN, first tenant ADMIN)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..auth.roles import is_super_role, normalize_role_for_storage
from ..models.app_user import AppUser


class UserProtectionError(ValueError):
    """Raised with a stable code for API mapping."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _flag(u: AppUser, name: str, default: bool) -> bool:
    return bool(getattr(u, name, default))


def is_protected_system_account(u: AppUser) -> bool:
    return is_super_role(u.role) or _flag(u, "is_system_user", False) or _flag(u, "is_system_seed", False)


def is_tenant_owner_admin(u: AppUser) -> bool:
    return _flag(u, "is_owner", False)


def apply_create_protection_flags(db: Session, u: AppUser) -> None:
    """Set protection flags for SUPER_ADMIN and first ADMIN (owner)."""
    role = normalize_role_for_storage(u.role or "")
    if is_super_role(role):
        u.is_system_user = True
        u.is_deletable = False
        u.is_role_changeable = False
        u.is_owner = False
        return

    if role == "admin":
        has_owner = (
            db.query(AppUser.id)
            .filter(AppUser.is_owner.is_(True))
            .limit(1)
            .first()
            is not None
        )
        if not has_owner:
            u.is_owner = True
            u.is_deletable = False
            u.is_role_changeable = False


def assert_user_deletable(u: AppUser) -> None:
    if is_protected_system_account(u):
        raise UserProtectionError(
            "SYSTEM_USER_NOT_DELETABLE",
            "Nie można usunąć konta SUPER_ADMIN / użytkownika systemowego.",
        )
    if is_tenant_owner_admin(u):
        raise UserProtectionError(
            "OWNER_NOT_DELETABLE",
            "Nie można usunąć właściciela (pierwszego ADMIN) tenanta.",
        )
    if not _flag(u, "is_deletable", True):
        raise UserProtectionError("USER_NOT_DELETABLE", "Tego użytkownika nie można usunąć.")


def assert_role_change_allowed(u: AppUser, new_role: str) -> None:
    target = normalize_role_for_storage(new_role)
    current = normalize_role_for_storage(u.role or "")
    if target == current:
        return

    if is_protected_system_account(u) or not _flag(u, "is_role_changeable", True):
        raise UserProtectionError(
            "ROLE_NOT_CHANGEABLE",
            "Nie można zmienić roli tego użytkownika.",
        )

    if is_tenant_owner_admin(u) and current == "admin" and target != "admin":
        raise UserProtectionError(
            "OWNER_ADMIN_ROLE_LOCKED",
            "Nie można odebrać roli ADMIN właścicielowi tenanta.",
        )


def assert_deactivate_allowed(u: AppUser, new_is_active: bool) -> None:
    if new_is_active is not False:
        return
    if is_protected_system_account(u):
        raise UserProtectionError(
            "SYSTEM_USER_NOT_DEACTIVATABLE",
            "Nie można dezaktywować konta SUPER_ADMIN / użytkownika systemowego.",
        )


def backfill_protection_flags(db: Session) -> None:
    """Idempotent: lock existing SUPER_ADMIN rows; assign owner to first ADMIN if missing."""
    supers = (
        db.query(AppUser)
        .filter(AppUser.role.in_(["super_admin", "superadmin"]))
        .all()
    )
    for u in supers:
        u.is_system_user = True
        u.is_deletable = False
        u.is_role_changeable = False

    owner = db.query(AppUser).filter(AppUser.is_owner.is_(True)).first()
    if owner is None:
        first_admin = (
            db.query(AppUser)
            .filter(AppUser.role == "admin")
            .order_by(AppUser.id.asc())
            .first()
        )
        if first_admin is not None:
            first_admin.is_owner = True
            first_admin.is_deletable = False
            first_admin.is_role_changeable = False

    db.commit()
