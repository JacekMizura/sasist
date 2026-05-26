"""Authentication and administrator (app user) management."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth.config import APP_ENV
from ..auth.deps import (
    explicit_permission_keys,
    get_current_user,
    list_permissions_for_user,
    require_any_permission,
    require_permission,
    require_super_role,
)
from ..auth.passwords import hash_password, verify_password
from ..auth.permission_catalog import PERMISSION_KEYS, PERMISSION_TREE, ROLE_PERMISSION_PRESETS
from ..auth.roles import SYSTEM_ROLE_VALUES
from ..auth.tokens import create_access_token, hash_refresh_token, new_refresh_token_values
from ..database import get_db
from ..models.app_user import AppUser, AppUserWarehouse, AuditLog, UserPermission, UserSession
from ..models.permission_preset import PermissionPreset
from ..schemas.app_user import (
    AdminResetPasswordBody,
    AppUserCreate,
    AppUserListItem,
    AppUserUpdate,
    AuditLogItem,
    ChangePasswordRequest,
    LoginRequest,
    MeResponse,
    RefreshRequest,
    TokenResponse,
    WmsProfileResponse,
)
from ..schemas.permission_preset import (
    AvatarUploadResponse,
    PermissionPresetCreate,
    PermissionPresetRead,
    PermissionPresetUpdate,
)
from ..services.avatar_upload import save_user_avatar_file, try_delete_stored_avatar
from ..services.app_user_admin_service import (
    app_user_to_list_item,
    create_user_transaction,
    primary_workforce_group_badge,
    sort_app_users_list_items,
    update_user_transaction,
    wms_profile_response,
)
from ..services.audit_service import log_audit_entry
from ..services.user_activity_service import log_user_activity

router = APIRouter(prefix="/auth", tags=["Auth"])
logger = logging.getLogger(__name__)


def _allowed_role(role: str) -> bool:
    return role.strip().lower() in {r.lower() for r in SYSTEM_ROLE_VALUES}


def _me_response(db: Session, user: AppUser) -> MeResponse:
    must = bool(getattr(user, "password_must_change", False))
    seed = bool(getattr(user, "is_system_seed", False))
    show_dev = APP_ENV != "production" and seed and must
    wp = wms_profile_response(db, user.id)
    perms = list_permissions_for_user(db, user)
    explicit_perms = explicit_permission_keys(db, user)
    wms_lang_flat = getattr(user, "wms_language", None) or wp.get("language")
    gid = getattr(user, "primary_workforce_group_id", None)
    grp = primary_workforce_group_badge(db, gid)
    return MeResponse(
        id=user.id,
        login=user.login,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        is_active=user.is_active,
        language=user.language,
        permissions=perms,
        explicit_permissions=explicit_perms,
        last_login_at=user.last_login_at,
        password_must_change=must,
        is_system_seed=seed,
        show_dev_credentials_warning=show_dev,
        phone=user.phone,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        wms_profile=WmsProfileResponse(**wp),
        wms_language=wms_lang_flat,
        barcode_login_code=wp.get("barcode_login_code"),
        default_warehouse_id=wp.get("default_warehouse_id"),
        warehouse_ids=wp.get("warehouse_ids") or [],
        primary_workforce_group_id=gid,
        primary_workforce_group=grp,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    ident = body.login.strip()
    user = db.query(AppUser).filter(AppUser.login == ident).first()
    if user is None and "@" in ident:
        user = db.query(AppUser).filter(AppUser.email == ident).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    raw_refresh, refresh_hash, exp = new_refresh_token_values()
    db.add(UserSession(user_id=user.id, refresh_token_hash=refresh_hash, expires_at=exp))
    log_audit_entry(db, user_id=user.id, action="auth.login", detail={"login": user.login})
    log_user_activity(
        db,
        user_id=user.id,
        action_type="login",
        module="auth",
        metadata={"login": user.login},
    )
    db.commit()

    return TokenResponse(access_token=create_access_token(user.id), refresh_token=raw_refresh)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    h = hash_refresh_token(body.refresh_token.strip())
    sess = db.query(UserSession).filter(UserSession.refresh_token_hash == h).first()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if sess is None or sess.expires_at < now:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.query(AppUser).filter(AppUser.id == sess.user_id).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    db.delete(sess)
    raw_refresh, refresh_hash, exp = new_refresh_token_values()
    db.add(UserSession(user_id=user.id, refresh_token_hash=refresh_hash, expires_at=exp))
    db.commit()

    return TokenResponse(access_token=create_access_token(user.id), refresh_token=raw_refresh)


@router.post("/logout")
def logout(body: RefreshRequest, db: Session = Depends(get_db)):
    h = hash_refresh_token(body.refresh_token.strip())
    sess = db.query(UserSession).filter(UserSession.refresh_token_hash == h).first()
    if sess is not None:
        uid = sess.user_id
        db.delete(sess)
        log_user_activity(db, user_id=uid, action_type="logout", module="auth", metadata=None)
        log_audit_entry(db, user_id=uid, action="auth.logout", detail=None)
        db.commit()
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(current: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return _me_response(db, current)


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.password_must_change = False
    log_audit_entry(db, user_id=user.id, action="auth.change_password", detail={"login": user.login})
    db.commit()
    return {"ok": True}


@router.get("/permissions/catalog")
def permission_catalog(_: AppUser = Depends(get_current_user)):
    presets = {k: list(v) for k, v in ROLE_PERMISSION_PRESETS.items()}
    return {"keys": list(PERMISSION_KEYS), "tree": PERMISSION_TREE, "presets": presets}


def _preset_row_to_read(row: PermissionPreset) -> PermissionPresetRead:
    try:
        keys = json.loads(row.permission_keys_json or "[]")
    except json.JSONDecodeError:
        keys = []
    if not isinstance(keys, list):
        keys = []
    return PermissionPresetRead(
        id=row.id,
        name=row.name,
        description=row.description,
        visibility=row.visibility,
        permission_keys=[str(k) for k in keys],
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at,
    )


def _validate_permission_keys_subset(keys: list[str]) -> None:
    bad = sorted({k for k in keys if k not in PERMISSION_KEYS})
    if bad:
        raise HTTPException(
            status_code=400,
            detail=f"Nieznane klucze uprawnień ({len(bad)}): " + ", ".join(bad[:30]),
        )


def _actor_can_manage_preset(actor: AppUser, row: PermissionPreset) -> bool:
    if row.visibility == "organization":
        return True
    return row.created_by_user_id == actor.id


@router.get("/permissions/custom-presets", response_model=list[PermissionPresetRead])
def list_custom_permission_presets(
    db: Session = Depends(get_db),
    actor: AppUser = Depends(require_super_role),
):
    rows = db.query(PermissionPreset).order_by(PermissionPreset.created_at.desc()).all()
    out: list[PermissionPresetRead] = []
    for r in rows:
        if r.visibility == "organization" or r.created_by_user_id == actor.id:
            out.append(_preset_row_to_read(r))
    return out


@router.post("/permissions/custom-presets", response_model=PermissionPresetRead)
def create_custom_permission_preset(
    body: PermissionPresetCreate,
    db: Session = Depends(get_db),
    actor: AppUser = Depends(require_super_role),
):
    _validate_permission_keys_subset(body.permission_keys)
    row = PermissionPreset(
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        visibility=body.visibility,
        permission_keys_json=json.dumps(body.permission_keys, ensure_ascii=False),
        created_by_user_id=actor.id,
    )
    db.add(row)
    db.flush()
    log_audit_entry(
        db,
        user_id=actor.id,
        action="permission_presets.create",
        entity_type="permission_preset",
        entity_id=row.id,
        detail={"name": row.name},
    )
    db.commit()
    db.refresh(row)
    return _preset_row_to_read(row)


@router.patch("/permissions/custom-presets/{preset_id}", response_model=PermissionPresetRead)
def update_custom_permission_preset(
    preset_id: int,
    body: PermissionPresetUpdate,
    db: Session = Depends(get_db),
    actor: AppUser = Depends(require_super_role),
):
    row = db.query(PermissionPreset).filter(PermissionPreset.id == preset_id).first()
    if row is None:
        raise HTTPException(status_code=404)
    if not _actor_can_manage_preset(actor, row):
        raise HTTPException(status_code=403, detail="Brak uprawnień do edycji tego presetu.")
    if body.name is not None:
        row.name = body.name.strip()
    if body.description is not None:
        row.description = (body.description or "").strip() or None
    if body.visibility is not None:
        row.visibility = body.visibility
    if body.permission_keys is not None:
        _validate_permission_keys_subset(body.permission_keys)
        row.permission_keys_json = json.dumps(body.permission_keys, ensure_ascii=False)
    log_audit_entry(
        db,
        user_id=actor.id,
        action="permission_presets.update",
        entity_type="permission_preset",
        entity_id=row.id,
        detail={"name": row.name},
    )
    db.commit()
    db.refresh(row)
    return _preset_row_to_read(row)


@router.delete("/permissions/custom-presets/{preset_id}")
def delete_custom_permission_preset(
    preset_id: int,
    db: Session = Depends(get_db),
    actor: AppUser = Depends(require_super_role),
):
    row = db.query(PermissionPreset).filter(PermissionPreset.id == preset_id).first()
    if row is None:
        raise HTTPException(status_code=404)
    if not _actor_can_manage_preset(actor, row):
        raise HTTPException(status_code=403, detail="Brak uprawnień do usunięcia tego presetu.")
    log_audit_entry(
        db,
        user_id=actor.id,
        action="permission_presets.delete",
        entity_type="permission_preset",
        entity_id=row.id,
        detail={"name": row.name},
    )
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/audit-logs", response_model=list[AuditLogItem])
def list_audit_logs(
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_permission("audit.view")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    q: str | None = Query(None, description="Search action / entity"),
):
    query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(AuditLog.action.ilike(term))
    rows = query.offset(skip).limit(limit).all()
    uids = {r.user_id for r in rows if r.user_id}
    logins: dict[int, str] = {}
    if uids:
        for uid, login in db.query(AppUser.id, AppUser.login).filter(AppUser.id.in_(uids)).all():
            logins[int(uid)] = login
    out: list[AuditLogItem] = []
    for r in rows:
        detail_obj: dict | None = None
        if r.detail_json:
            try:
                detail_obj = json.loads(r.detail_json)
            except json.JSONDecodeError:
                detail_obj = {"_raw": r.detail_json}
        mod = None
        if r.action:
            mod = r.action.split(".")[0] if "." in r.action else r.action
        out.append(
            AuditLogItem(
                id=r.id,
                created_at=r.created_at,
                user_id=r.user_id,
                login=logins.get(r.user_id) if r.user_id else None,
                action=r.action,
                module=mod,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                detail=detail_obj,
            )
        )
    return out


@router.get("/users", response_model=list[AppUserListItem])
def list_users(
    db: Session = Depends(get_db),
    actor: AppUser = Depends(
        require_any_permission(
            "settings.users",
            "workforce.dashboard",
            "workforce.activity.read",
        )
    ),
):
    if APP_ENV != "production":
        logger.info(
            "auth_debug list_users requester_id=%s login=%s role=%s",
            actor.id,
            actor.login,
            actor.role,
        )
    users = db.query(AppUser).all()
    return sort_app_users_list_items([app_user_to_list_item(db, u) for u in users])


@router.post("/users", response_model=AppUserListItem)
def create_user(
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
            detail={"login": u.login},
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


@router.patch("/users/{user_id}", response_model=AppUserListItem)
def update_user(
    user_id: int,
    body: AppUserUpdate,
    db: Session = Depends(get_db),
    actor: AppUser = Depends(require_permission("settings.users")),
):
    u = db.query(AppUser).filter(AppUser.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404)
    if body.role is not None and not _allowed_role(body.role):
        raise HTTPException(status_code=400, detail="Invalid role")
    try:
        if APP_ENV != "production":
            logger.info(
                "auth_debug update_user user_id=%s patch=%s",
                user_id,
                body.model_dump(exclude_unset=True, exclude={"password"}),
            )
        update_user_transaction(db, u, body)
        log_audit_entry(
            db,
            user_id=actor.id,
            action="users.update",
            entity_type="app_user",
            entity_id=u.id,
            detail={"login": u.login},
        )
        db.commit()
        db.refresh(u)
        return app_user_to_list_item(db, u)
    except ValueError as e:
        db.rollback()
        msg = str(e)
        if msg == "EMAIL_EXISTS":
            raise HTTPException(status_code=400, detail="Email already exists") from e
        if msg == "EMAIL_REQUIRED":
            raise HTTPException(status_code=400, detail="Email is required") from e
        if msg.startswith("UNKNOWN_PERMISSIONS"):
            raise HTTPException(status_code=400, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
    except IntegrityError as e:
        db.rollback()
        logger.exception("update_user integrity error user_id=%s", user_id)
        orig = getattr(e, "orig", e)
        raise HTTPException(status_code=400, detail=f"Błąd integralności danych: {orig}") from e
    except Exception as e:
        db.rollback()
        logger.exception("update_user failed user_id=%s", user_id)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/users/{user_id}/avatar", response_model=AvatarUploadResponse)
async def upload_user_avatar(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: AppUser = Depends(require_permission("settings.users")),
):
    u = db.query(AppUser).filter(AppUser.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404)
    content = await file.read()
    prev = u.avatar_url
    url = save_user_avatar_file(content, file.content_type, user_id)
    try_delete_stored_avatar(prev if isinstance(prev, str) else None)
    u.avatar_url = url
    log_audit_entry(
        db,
        user_id=actor.id,
        action="users.avatar_upload",
        entity_type="app_user",
        entity_id=u.id,
        detail={"login": u.login},
    )
    db.commit()
    db.refresh(u)
    return AvatarUploadResponse(avatar_url=url)


@router.post("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    body: AdminResetPasswordBody,
    db: Session = Depends(get_db),
    actor: AppUser = Depends(require_permission("settings.users")),
):
    u = db.query(AppUser).filter(AppUser.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404)
    u.password_hash = hash_password(body.password)
    u.password_must_change = True
    log_audit_entry(
        db,
        user_id=actor.id,
        action="users.reset_password",
        entity_type="app_user",
        entity_id=u.id,
        detail={"login": u.login},
    )
    db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    actor: AppUser = Depends(require_permission("settings.users")),
):
    u = db.query(AppUser).filter(AppUser.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404)
    if bool(getattr(u, "is_system_seed", False)):
        raise HTTPException(status_code=400, detail="Cannot delete seeded system administrator")
    if actor.id == u.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    db.query(UserSession).filter(UserSession.user_id == u.id).delete()
    db.query(AppUserWarehouse).filter(AppUserWarehouse.user_id == u.id).delete()
    db.query(UserPermission).filter(UserPermission.user_id == u.id).delete()
    log_audit_entry(
        db,
        user_id=actor.id,
        action="users.delete",
        entity_type="app_user",
        entity_id=u.id,
        detail={"login": u.login},
    )
    db.delete(u)
    db.commit()
    return {"ok": True}


@router.get("/users/{user_id}", response_model=MeResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    actor: AppUser = Depends(require_permission("settings.users")),
):
    u = db.query(AppUser).filter(AppUser.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404)
    return _me_response(db, u)


from .auth_workforce_groups import workforce_user_groups_router as _workforce_user_groups_router

router.include_router(_workforce_user_groups_router)
