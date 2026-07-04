from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.user_list_view import (
    ListViewPayloadIn,
    ListViewPresetCreateIn,
    ListViewPresetUpdateIn,
    ListViewScreenBundleOut,
)
from ..services import user_list_view_service as svc

router = APIRouter(prefix="/ui/list-views", tags=["UI List Views"])


@router.get("/{screen_key}", response_model=ListViewScreenBundleOut)
def get_list_view_screen(
    screen_key: str,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    return svc.get_screen_bundle(db, tenant_id=tenant_id, user=user, screen_key=screen_key)


@router.put("/{screen_key}/autosave")
def put_list_view_autosave(
    screen_key: str,
    body: ListViewPayloadIn,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    return svc.upsert_autosave(
        db,
        tenant_id=tenant_id,
        user=user,
        screen_key=screen_key,
        payload=body.payload,
        schema_version=body.schema_version,
    )


@router.delete("/{screen_key}/autosave", status_code=204)
def delete_list_view_autosave(
    screen_key: str,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    svc.delete_autosave(db, tenant_id=tenant_id, user=user, screen_key=screen_key)


@router.post("/{screen_key}/presets")
def create_list_view_preset(
    screen_key: str,
    body: ListViewPresetCreateIn,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    return svc.create_preset(
        db,
        tenant_id=tenant_id,
        user=user,
        screen_key=screen_key,
        name=body.name,
        payload=body.payload,
        schema_version=body.schema_version,
        is_public=body.is_public,
        is_default=body.is_default,
    )


@router.patch("/{screen_key}/presets/{preset_id}")
def patch_list_view_preset(
    screen_key: str,
    preset_id: int,
    body: ListViewPresetUpdateIn,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    return svc.update_preset(
        db,
        tenant_id=tenant_id,
        user=user,
        screen_key=screen_key,
        preset_id=preset_id,
        name=body.name,
        payload=body.payload,
        schema_version=body.schema_version,
        is_default=body.is_default,
    )


@router.delete("/{screen_key}/presets/{preset_id}", status_code=204)
def delete_list_view_preset(
    screen_key: str,
    preset_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    svc.delete_preset(db, tenant_id=tenant_id, user=user, screen_key=screen_key, preset_id=preset_id)


@router.post("/{screen_key}/presets/{preset_id}/set-default")
def post_list_view_preset_default(
    screen_key: str,
    preset_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    return svc.set_default_preset(
        db,
        tenant_id=tenant_id,
        user=user,
        screen_key=screen_key,
        preset_id=preset_id,
    )
