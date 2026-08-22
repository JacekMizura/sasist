"""Google OAuth routes for Poczta mail accounts."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user, require_permission
from ..database import get_db
from ..models.app_user import AppUser
from ..services.mail.account_service import account_to_dict, get_account_for_tenant
from ..services.mail.google.config import google_oauth_configured
from ..services.mail.google.oauth_service import (
    build_google_authorization_url,
    handle_google_oauth_callback,
)

router = APIRouter(prefix="/google", tags=["Mail Google OAuth"])

_manage = require_permission("mail.manage_accounts")


class GoogleConnectBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    account_id: int | None = Field(None, ge=1)


@router.post("/connect")
def post_google_connect(
    body: GoogleConnectBody,
    db: Session = Depends(get_db),
    user: AppUser = Depends(_manage),
) -> dict[str, Any]:
    if not google_oauth_configured():
        raise HTTPException(status_code=503, detail="google_oauth_not_configured")
    if body.account_id is not None:
        from ..models.mail import PROVIDER_GOOGLE_OAUTH

        row = get_account_for_tenant(db, tenant_id=int(body.tenant_id), account_id=int(body.account_id))
        if row is None:
            raise HTTPException(status_code=404, detail="account_not_found")
        if row.provider_type not in (PROVIDER_GOOGLE_OAUTH, "MANUAL"):
            raise HTTPException(status_code=400, detail="invalid_account_type")
    try:
        url = build_google_authorization_url(
            tenant_id=int(body.tenant_id),
            user_id=int(user.id),
            account_id=int(body.account_id) if body.account_id else None,
        )
    except ValueError:
        raise HTTPException(status_code=503, detail="google_oauth_not_configured") from None
    return {"authorization_url": url}


@router.get("/callback")
def get_google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    redirect_url = handle_google_oauth_callback(db, code=code, state=state, error=error)
    db.commit()
    return RedirectResponse(url=redirect_url, status_code=302)
