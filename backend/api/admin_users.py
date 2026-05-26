"""Admin API alias for user provisioning — same validation as ``/api/auth/users``."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.deps import require_permission
from ..auth.roles import SYSTEM_ROLE_VALUES
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.app_user import AppUserCreate, AppUserListItem
from ..services.app_user_admin_service import app_user_to_list_item, create_user_transaction
from ..services.audit_service import log_audit_entry

router = APIRouter(prefix="/admin", tags=["Admin"])


def _allowed_role(role: str) -> bool:
    return role.strip().lower() in {r.lower() for r in SYSTEM_ROLE_VALUES}


@router.post("/users", response_model=AppUserListItem)
def admin_create_user(
    body: AppUserCreate,
    db: Session = Depends(get_db),
    actor: AppUser = Depends(require_permission("settings.users")),
):
    if not _allowed_role(body.role):
        raise HTTPException(status_code=400, detail="Invalid role")
    try:
        u = create_user_transaction(db, body)
        log_audit_entry(
            db,
            user_id=actor.id,
            action="users.create",
            entity_type="app_user",
            entity_id=u.id,
            detail={"login": u.login, "via": "admin_api"},
        )
        db.commit()
        db.refresh(u)
        return app_user_to_list_item(db, u)
    except ValueError as e:
        db.rollback()
        msg = str(e)
        if msg == "LOGIN_EXISTS":
            raise HTTPException(status_code=400, detail="Login already exists") from e
        if msg == "EMAIL_EXISTS":
            raise HTTPException(status_code=400, detail="Email already exists") from e
        if msg == "EMAIL_REQUIRED":
            raise HTTPException(status_code=400, detail="Email is required") from e
        if msg.startswith("UNKNOWN_PERMISSIONS"):
            raise HTTPException(status_code=400, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
