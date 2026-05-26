"""CRUD for operational workforce user groups (teams) — mounted under ``/api/auth``."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import require_permission
from ..auth.permission_catalog import PERMISSION_KEYS
from ..database import get_db
from ..models.app_user import AppUser
from ..models.workforce_user_group import WorkforceUserGroup
from ..schemas.workforce_groups import WorkforceUserGroupCreate, WorkforceUserGroupRead, WorkforceUserGroupUpdate
from ..wms_operational_modes import is_valid_wms_mode

workforce_user_groups_router = APIRouter(prefix="/workforce-user-groups", tags=["Workforce user groups"])


def _parse_keys(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x) for x in data]
    except json.JSONDecodeError:
        return []
    return []


def _parse_modes(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x) for x in data if is_valid_wms_mode(str(x))]
    except json.JSONDecodeError:
        return []
    return []


def _to_read(g: WorkforceUserGroup) -> WorkforceUserGroupRead:
    return WorkforceUserGroupRead(
        id=g.id,
        name=g.name,
        color=g.color or "#64748b",
        icon_key=g.icon_key or "Users",
        archived_at=g.archived_at,
        default_permission_keys=_parse_keys(g.default_permission_keys_json),
        default_wms_modes=_parse_modes(g.default_wms_modes_json),
        created_at=g.created_at,
        updated_at=g.updated_at,
    )


def _validate_perm_keys(keys: list[str]) -> None:
    bad = sorted({k for k in keys if k not in PERMISSION_KEYS})
    if bad:
        raise HTTPException(status_code=400, detail=f"Nieznane uprawnienia w grupie: {bad[:20]}")


@workforce_user_groups_router.get("", response_model=list[WorkforceUserGroupRead])
def list_workforce_user_groups(
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_permission("settings.users")),
):
    q = db.query(WorkforceUserGroup).order_by(WorkforceUserGroup.name.asc())
    if not include_archived:
        q = q.filter(WorkforceUserGroup.archived_at.is_(None))
    return [_to_read(g) for g in q.all()]


@workforce_user_groups_router.post("", response_model=WorkforceUserGroupRead)
def create_workforce_user_group(
    body: WorkforceUserGroupCreate,
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_permission("settings.users")),
):
    _validate_perm_keys(body.default_permission_keys)
    modes = [m for m in body.default_wms_modes if is_valid_wms_mode(str(m))]
    g = WorkforceUserGroup(
        name=body.name.strip(),
        color=(body.color or "#64748b").strip()[:32],
        icon_key=(body.icon_key or "Users").strip()[:64],
        default_permission_keys_json=json.dumps(body.default_permission_keys, ensure_ascii=False)
        if body.default_permission_keys
        else None,
        default_wms_modes_json=json.dumps(modes, ensure_ascii=False) if modes else None,
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return _to_read(g)


@workforce_user_groups_router.patch("/{group_id}", response_model=WorkforceUserGroupRead)
def update_workforce_user_group(
    group_id: int,
    body: WorkforceUserGroupUpdate,
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_permission("settings.users")),
):
    g = db.query(WorkforceUserGroup).filter(WorkforceUserGroup.id == group_id).first()
    if g is None:
        raise HTTPException(status_code=404, detail="Group not found")
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        g.name = data["name"].strip()
    if "color" in data and data["color"] is not None:
        g.color = str(data["color"]).strip()[:32]
    if "icon_key" in data and data["icon_key"] is not None:
        g.icon_key = str(data["icon_key"]).strip()[:64]
    if "archived_at" in data:
        g.archived_at = data["archived_at"]
    if "default_permission_keys" in data and data["default_permission_keys"] is not None:
        _validate_perm_keys(data["default_permission_keys"])
        pk = data["default_permission_keys"]
        g.default_permission_keys_json = json.dumps(pk, ensure_ascii=False) if pk else None
    if "default_wms_modes" in data and data["default_wms_modes"] is not None:
        modes = [m for m in data["default_wms_modes"] if is_valid_wms_mode(str(m))]
        g.default_wms_modes_json = json.dumps(modes, ensure_ascii=False) if modes else None
    db.commit()
    db.refresh(g)
    return _to_read(g)
