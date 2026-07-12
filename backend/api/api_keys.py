"""Integration API keys — admin settings CRUD."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..auth.api_key_deps import client_ip_from_request, user_agent_from_request
from ..auth.deps import require_permission
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.api_key import (
    API_KEY_SCOPE_LABELS,
    ApiKeyCreateBody,
    ApiKeyCreateResponse,
    ApiKeyListResponse,
    ApiKeyRead,
    ApiKeyRegenerateResponse,
    ApiKeyRotateResponse,
    ApiKeyScopeCatalogItem,
    ApiKeyTypeDefaults,
    ApiKeyUsageRead,
    default_scope_catalog,
)
from ..services.api_keys.api_key_service import (
    create_key,
    delete_key,
    get_key_usage,
    list_keys,
    regenerate_key,
    revoke_key,
    rotate_key,
)
from ..services.api_keys.constants import API_KEY_SCOPES
from ..services.api_keys.errors import ApiKeyError, ApiKeyNotFoundError

router = APIRouter(prefix="/settings/api-keys", tags=["API keys"])

_admin_perm = require_permission("settings.users")


def _to_read(row_dict: dict) -> ApiKeyRead:
    return ApiKeyRead(**row_dict)


@router.get("/scope-catalog")
def get_scope_catalog(_: AppUser = Depends(_admin_perm)) -> dict:
    return {
        "scopes": [
            ApiKeyScopeCatalogItem(scope=scope, label=API_KEY_SCOPE_LABELS.get(scope, scope))
            for scope in sorted(API_KEY_SCOPES)
        ],
        "defaults_by_type": default_scope_catalog(),
    }


@router.get("", response_model=ApiKeyListResponse)
def get_api_keys(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_admin_perm),
):
    items = [_to_read(row) for row in list_keys(db, tenant_id=tenant_id)]
    return ApiKeyListResponse(items=items)


@router.post("", response_model=ApiKeyCreateResponse)
def post_api_key(
    body: ApiKeyCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_admin_perm),
):
    try:
        row, plain = create_key(
            db,
            tenant_id=tenant_id,
            name=body.name,
            key_type=body.type,
            warehouse_id=body.warehouse_id,
            created_by=user.id,
            description=body.description,
            scopes=body.scopes,
            allowed_ips=body.allowed_ips,
            expires_at=body.expires_at,
        )
        db.commit()
        db.refresh(row)
    except ApiKeyError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    serialized = list_keys(db, tenant_id=tenant_id)
    created = next(item for item in serialized if item["id"] == row.id)
    return ApiKeyCreateResponse(key=_to_read(created), plain_key=plain)


@router.get("/{key_id}/usage", response_model=ApiKeyUsageRead)
def get_api_key_usage(
    key_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_admin_perm),
):
    try:
        return ApiKeyUsageRead(**get_key_usage(db, tenant_id=tenant_id, key_id=key_id))
    except ApiKeyNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{key_id}", status_code=204)
def delete_api_key(
    key_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_admin_perm),
):
    try:
        delete_key(db, tenant_id=tenant_id, key_id=key_id, user_id=user.id)
        db.commit()
    except ApiKeyNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/{key_id}/revoke", response_model=ApiKeyRead)
def patch_revoke_api_key(
    key_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_admin_perm),
):
    try:
        row = revoke_key(db, tenant_id=tenant_id, key_id=key_id, user_id=user.id)
        db.commit()
        db.refresh(row)
    except ApiKeyNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    serialized = next(item for item in list_keys(db, tenant_id=tenant_id) if item["id"] == row.id)
    return _to_read(serialized)


@router.post("/{key_id}/regenerate", response_model=ApiKeyRegenerateResponse)
def post_regenerate_api_key(
    key_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_admin_perm),
):
    try:
        row, plain = regenerate_key(db, tenant_id=tenant_id, key_id=key_id, user_id=user.id)
        db.commit()
        db.refresh(row)
    except ApiKeyNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ApiKeyError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    serialized = next(item for item in list_keys(db, tenant_id=tenant_id) if item["id"] == row.id)
    return ApiKeyRegenerateResponse(key=_to_read(serialized), plain_key=plain)


@router.post("/{key_id}/rotate", response_model=ApiKeyRotateResponse)
def post_rotate_api_key(
    key_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_admin_perm),
):
    try:
        old_id = key_id
        row, plain = rotate_key(db, tenant_id=tenant_id, key_id=key_id, user_id=user.id)
        db.commit()
        db.refresh(row)
    except ApiKeyNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ApiKeyError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    serialized = next(item for item in list_keys(db, tenant_id=tenant_id) if item["id"] == row.id)
    return ApiKeyRotateResponse(key=_to_read(serialized), plain_key=plain, rotated_from_id=old_id)

