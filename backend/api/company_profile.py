"""Company profile (Firma) — branding and legal data per tenant."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..auth.deps import require_any_permission
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.company_profile import CompanyProfileRead, CompanyProfileUpdate
from ..services.company_logo_upload import save_company_logo_file, try_delete_stored_company_logo
from ..services.company_profile_service import apply_update, get_or_create_profile, profile_to_read

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/company-profile", tags=["Company profile"])

_company_perm = require_any_permission("settings.users", "settings.company")


@router.get("", response_model=CompanyProfileRead)
def get_profile(
    tenant_id: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_company_perm),
):
    try:
        row = get_or_create_profile(db, tenant_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Tenant not found") from None
    return profile_to_read(row)


@router.put("", response_model=CompanyProfileRead)
def put_profile(
    body: CompanyProfileUpdate,
    tenant_id: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_company_perm),
):
    try:
        row = get_or_create_profile(db, tenant_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Tenant not found") from None
    apply_update(row, body)
    db.commit()
    db.refresh(row)
    return profile_to_read(row)


@router.post("/logo", response_model=CompanyProfileRead)
async def upload_logo(
    tenant_id: int = Query(1, ge=1),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_company_perm),
):
    try:
        row = get_or_create_profile(db, tenant_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Tenant not found") from None
    content = await file.read()
    try:
        if row.logo_url:
            try_delete_stored_company_logo(row.logo_url)
        url = save_company_logo_file(content, file.content_type, tenant_id)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception("company logo upload failed")
        raise HTTPException(status_code=400, detail="Nie udało się zapisać logo.") from e
    row.logo_url = url
    db.commit()
    db.refresh(row)
    return profile_to_read(row)


@router.delete("/logo", response_model=CompanyProfileRead)
def delete_logo(
    tenant_id: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_company_perm),
):
    try:
        row = get_or_create_profile(db, tenant_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Tenant not found") from None
    if row.logo_url:
        try_delete_stored_company_logo(row.logo_url)
    row.logo_url = None
    db.commit()
    db.refresh(row)
    return profile_to_read(row)
