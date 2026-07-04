from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..auth.roles import is_super_role
from ..models.app_user import AppUser
from ..models.user_list_view import UserListView

AUTOSAVE_TYPE = "autosave"
PRESET_TYPE = "preset"


def _parse_payload(raw: str | None) -> dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _dump_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload or {}, ensure_ascii=False, separators=(",", ":"))


def _row_to_autosave(row: UserListView) -> dict[str, Any]:
    return {
        "id": row.id,
        "payload": _parse_payload(row.payload_json),
        "schema_version": row.schema_version,
        "updated_at": row.updated_at,
    }


def _row_to_preset(row: UserListView) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name or "",
        "is_default": bool(row.is_default),
        "is_public": bool(row.is_public),
        "user_id": row.user_id,
        "payload": _parse_payload(row.payload_json),
        "schema_version": row.schema_version,
        "updated_at": row.updated_at,
        "created_at": row.created_at,
    }


def _is_admin(user: AppUser) -> bool:
    role = (user.role or "").strip().lower()
    return is_super_role(user.role) or role in {"admin", "super_admin", "superadmin"}


def get_screen_bundle(db: Session, *, tenant_id: int, user: AppUser, screen_key: str) -> dict[str, Any]:
    sk = screen_key.strip()
    if not sk:
        raise HTTPException(status_code=400, detail="screen_key required")

    autosave = (
        db.query(UserListView)
        .filter(
            UserListView.tenant_id == tenant_id,
            UserListView.user_id == user.id,
            UserListView.screen_key == sk,
            UserListView.type == AUTOSAVE_TYPE,
        )
        .first()
    )

    presets = (
        db.query(UserListView)
        .filter(
            UserListView.tenant_id == tenant_id,
            UserListView.screen_key == sk,
            UserListView.type == PRESET_TYPE,
            or_(
                and_(UserListView.user_id == user.id, UserListView.is_public.is_(False)),
                and_(UserListView.user_id.is_(None), UserListView.is_public.is_(True)),
            ),
        )
        .order_by(UserListView.is_default.desc(), UserListView.name.asc(), UserListView.id.asc())
        .all()
    )

    return {
        "screen_key": sk,
        "autosave": _row_to_autosave(autosave) if autosave else None,
        "presets": [_row_to_preset(p) for p in presets],
    }


def upsert_autosave(
    db: Session,
    *,
    tenant_id: int,
    user: AppUser,
    screen_key: str,
    payload: dict[str, Any],
    schema_version: int,
) -> dict[str, Any]:
    sk = screen_key.strip()
    row = (
        db.query(UserListView)
        .filter(
            UserListView.tenant_id == tenant_id,
            UserListView.user_id == user.id,
            UserListView.screen_key == sk,
            UserListView.type == AUTOSAVE_TYPE,
        )
        .first()
    )
    if row is None:
        row = UserListView(
            tenant_id=tenant_id,
            user_id=user.id,
            screen_key=sk,
            type=AUTOSAVE_TYPE,
            name=None,
            is_default=False,
            is_public=False,
            payload_json=_dump_payload(payload),
            schema_version=schema_version,
        )
        db.add(row)
    else:
        row.payload_json = _dump_payload(payload)
        row.schema_version = schema_version
    db.commit()
    db.refresh(row)
    return _row_to_autosave(row)


def delete_autosave(db: Session, *, tenant_id: int, user: AppUser, screen_key: str) -> None:
    sk = screen_key.strip()
    row = (
        db.query(UserListView)
        .filter(
            UserListView.tenant_id == tenant_id,
            UserListView.user_id == user.id,
            UserListView.screen_key == sk,
            UserListView.type == AUTOSAVE_TYPE,
        )
        .first()
    )
    if row:
        db.delete(row)
        db.commit()


def _get_preset_for_user(
    db: Session,
    *,
    tenant_id: int,
    user: AppUser,
    screen_key: str,
    preset_id: int,
) -> UserListView:
    row = (
        db.query(UserListView)
        .filter(
            UserListView.id == preset_id,
            UserListView.tenant_id == tenant_id,
            UserListView.screen_key == screen_key.strip(),
            UserListView.type == PRESET_TYPE,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Preset not found")
    if row.is_public:
        return row
    if row.user_id != user.id:
        raise HTTPException(status_code=403, detail="Brak dostępu do presetu")
    return row


def _clear_default_flags(
    db: Session,
    *,
    tenant_id: int,
    screen_key: str,
    user: AppUser,
    public_only: bool,
    private_only: bool,
) -> None:
    q = db.query(UserListView).filter(
        UserListView.tenant_id == tenant_id,
        UserListView.screen_key == screen_key.strip(),
        UserListView.type == PRESET_TYPE,
        UserListView.is_default.is_(True),
    )
    if public_only:
        q = q.filter(UserListView.is_public.is_(True), UserListView.user_id.is_(None))
    elif private_only:
        q = q.filter(UserListView.is_public.is_(False), UserListView.user_id == user.id)
    else:
        q = q.filter(
            ((UserListView.user_id == user.id) & (UserListView.is_public.is_(False)))
            | ((UserListView.user_id.is_(None)) & (UserListView.is_public.is_(True)))
        )
    for row in q.all():
        row.is_default = False


def create_preset(
    db: Session,
    *,
    tenant_id: int,
    user: AppUser,
    screen_key: str,
    name: str,
    payload: dict[str, Any],
    schema_version: int,
    is_public: bool,
    is_default: bool,
) -> dict[str, Any]:
    sk = screen_key.strip()
    nm = name.strip()
    if not nm:
        raise HTTPException(status_code=400, detail="name required")

    if is_public and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Tylko administrator może tworzyć presety publiczne")

    if is_default:
        _clear_default_flags(
            db,
            tenant_id=tenant_id,
            screen_key=sk,
            user=user,
            public_only=is_public,
            private_only=not is_public,
        )

    row = UserListView(
        tenant_id=tenant_id,
        user_id=None if is_public else user.id,
        screen_key=sk,
        type=PRESET_TYPE,
        name=nm,
        is_default=is_default,
        is_public=is_public,
        payload_json=_dump_payload(payload),
        schema_version=schema_version,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_preset(row)


def update_preset(
    db: Session,
    *,
    tenant_id: int,
    user: AppUser,
    screen_key: str,
    preset_id: int,
    name: str | None,
    payload: dict[str, Any] | None,
    schema_version: int | None,
    is_default: bool | None,
) -> dict[str, Any]:
    row = _get_preset_for_user(db, tenant_id=tenant_id, user=user, screen_key=screen_key, preset_id=preset_id)
    if row.is_public and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Tylko administrator może edytować presety publiczne")
    if not row.is_public and row.user_id != user.id:
        raise HTTPException(status_code=403, detail="Brak dostępu do presetu")

    if name is not None:
        nm = name.strip()
        if not nm:
            raise HTTPException(status_code=400, detail="name required")
        row.name = nm
    if payload is not None:
        row.payload_json = _dump_payload(payload)
    if schema_version is not None:
        row.schema_version = schema_version
    if is_default is not None:
        if is_default:
            _clear_default_flags(
                db,
                tenant_id=tenant_id,
                screen_key=screen_key,
                user=user,
                public_only=row.is_public,
                private_only=not row.is_public,
            )
        row.is_default = is_default

    db.commit()
    db.refresh(row)
    return _row_to_preset(row)


def delete_preset(
    db: Session,
    *,
    tenant_id: int,
    user: AppUser,
    screen_key: str,
    preset_id: int,
) -> None:
    row = _get_preset_for_user(db, tenant_id=tenant_id, user=user, screen_key=screen_key, preset_id=preset_id)
    if row.is_public and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Tylko administrator może usuwać presety publiczne")
    if not row.is_public and row.user_id != user.id:
        raise HTTPException(status_code=403, detail="Brak dostępu do presetu")
    db.delete(row)
    db.commit()


def set_default_preset(
    db: Session,
    *,
    tenant_id: int,
    user: AppUser,
    screen_key: str,
    preset_id: int,
) -> dict[str, Any]:
    row = _get_preset_for_user(db, tenant_id=tenant_id, user=user, screen_key=screen_key, preset_id=preset_id)
    if row.is_public and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Tylko administrator może ustawiać domyślny preset publiczny")
    _clear_default_flags(
        db,
        tenant_id=tenant_id,
        screen_key=screen_key,
        user=user,
        public_only=row.is_public,
        private_only=not row.is_public,
    )
    row.is_default = True
    db.commit()
    db.refresh(row)
    return _row_to_preset(row)
