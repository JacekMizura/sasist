"""Idempotent backfill — grant mail.* to full-access users missing new keys."""

from __future__ import annotations

import logging

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ...auth.roles import is_super_role
from ...models.app_user import AppUser, UserPermission

logger = logging.getLogger(__name__)

MAIL_MODULE_PERMISSIONS: tuple[str, ...] = (
    "mail.view",
    "mail.reply",
    "mail.manage_accounts",
    "mail.manage_templates",
    "mail.manage_conversations",
)


def backfill_mail_permissions_for_full_access_users(db: Session) -> int:
    """
    Grant mail module permissions to owner/admin users who should see Poczta.

    Idempotent: only inserts missing ``user_permissions`` rows.
    Super roles rely on runtime preset — skipped.
    """
    from ..app_user_admin_service import _grant_user_permissions_if_missing

    admin_user_ids = {
        int(row[0])
        for row in db.query(UserPermission.user_id)
        .filter(UserPermission.permission_key == "settings.users")
        .distinct()
        .all()
    }

    filters = [
        AppUser.is_owner.is_(True),
        AppUser.role.in_(("admin", "super_admin", "superadmin")),
    ]
    if admin_user_ids:
        filters.append(AppUser.id.in_(admin_user_ids))

    candidates = db.query(AppUser).filter(AppUser.is_active.is_(True)).filter(or_(*filters)).all()

    granted_users = 0
    for user in candidates:
        if is_super_role(user.role):
            continue
        before = (
            db.query(UserPermission.id)
            .filter(
                UserPermission.user_id == int(user.id),
                UserPermission.permission_key.in_(MAIL_MODULE_PERMISSIONS),
            )
            .count()
        )
        _grant_user_permissions_if_missing(db, int(user.id), MAIL_MODULE_PERMISSIONS)
        after = (
            db.query(UserPermission.id)
            .filter(
                UserPermission.user_id == int(user.id),
                UserPermission.permission_key.in_(MAIL_MODULE_PERMISSIONS),
            )
            .count()
        )
        if after > before:
            granted_users += 1

    if granted_users:
        db.commit()
        logger.info("[mail.permissions] backfill granted mail keys for %s users", granted_users)
    return granted_users
