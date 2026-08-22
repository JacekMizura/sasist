"""Google OAuth connect / callback / disconnect orchestration."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from urllib.parse import urlencode

from sqlalchemy.orm import Session

from ....models.mail import PROVIDER_GOOGLE_OAUTH, MailAccount
from ..account_service import get_account_for_tenant
from .config import (
    frontend_base_url,
    google_oauth_client_id,
    google_oauth_configured,
    google_oauth_redirect_uri,
)
from .constants import GOOGLE_AUTH_URL, GOOGLE_OAUTH_SCOPES
from .gmail_client import (
    GmailApiError,
    exchange_authorization_code,
    fetch_google_userinfo,
    get_refresh_token,
    revoke_refresh_token,
    store_oauth_tokens,
)
from .oauth_state import OAuthStateError, create_oauth_state, verify_oauth_state
from ...secrets.credential_cipher import encrypt_secret

logger = logging.getLogger(__name__)


def build_google_authorization_url(*, tenant_id: int, user_id: int, account_id: int | None = None) -> str:
    if not google_oauth_configured():
        raise ValueError("google_oauth_not_configured")
    state = create_oauth_state(tenant_id=tenant_id, user_id=user_id, account_id=account_id)
    params = {
        "client_id": google_oauth_client_id(),
        "redirect_uri": google_oauth_redirect_uri(),
        "response_type": "code",
        "scope": GOOGLE_OAUTH_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "include_granted_scopes": "true",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def _frontend_accounts_url(*, success: bool, reason: str | None = None) -> str:
    base = f"{frontend_base_url()}/poczta/konta"
    if success:
        return f"{base}?google=connected"
    q = urlencode({"google": "error", "reason": reason or "unknown"})
    return f"{base}?{q}"


def _apply_google_profile(account: MailAccount, profile: dict[str, Any]) -> None:
    email = str(profile.get("email") or "").strip()
    sub = str(profile.get("sub") or "").strip() or None
    if email:
        account.email_address = email
        account.google_email = email
    if sub:
        account.google_subject = sub
    if not account.name.strip():
        account.name = email.split("@", 1)[0] if email else "Google"


def handle_google_oauth_callback(
    db: Session,
    *,
    code: str | None,
    state: str | None,
    error: str | None = None,
) -> str:
    if error:
        return _frontend_accounts_url(success=False, reason=error)
    if not code or not state:
        return _frontend_accounts_url(success=False, reason="missing_code")
    try:
        state_payload = verify_oauth_state(state)
    except OAuthStateError as exc:
        return _frontend_accounts_url(success=False, reason=str(exc))

    tenant_id = int(state_payload["tenant_id"])
    user_id = int(state_payload["user_id"])
    account_id = state_payload.get("account_id")

    try:
        token_payload = exchange_authorization_code(code=code, redirect_uri=google_oauth_redirect_uri())
        access_token = str(token_payload.get("access_token") or "")
        if not access_token:
            return _frontend_accounts_url(success=False, reason="token_missing")
        profile = fetch_google_userinfo(access_token=access_token)
    except GmailApiError as exc:
        logger.warning("google oauth callback failed tenant=%s user=%s code=%s", tenant_id, user_id, exc.code)
        return _frontend_accounts_url(success=False, reason=exc.code)

    now = datetime.utcnow()
    if account_id is not None:
        account = get_account_for_tenant(db, tenant_id=tenant_id, account_id=int(account_id))
        if account is None:
            return _frontend_accounts_url(success=False, reason="account_not_found")
    else:
        account = MailAccount(
            tenant_id=tenant_id,
            name="Google",
            email_address="",
            provider_type=PROVIDER_GOOGLE_OAUTH,
            is_send_only=False,
            is_active=True,
            last_sync_uid=0,
            created_at=now,
            updated_at=now,
        )
        db.add(account)
        db.flush()

    account.provider_type = PROVIDER_GOOGLE_OAUTH
    _apply_google_profile(account, profile)
    store_oauth_tokens(account, token_payload)
    account.oauth_connected_at = now
    account.oauth_last_error = None
    account.is_active = True
    account.updated_at = now
    db.add(account)
    db.flush()
    return _frontend_accounts_url(success=True)


def disconnect_google_account(db: Session, *, tenant_id: int, account_id: int) -> MailAccount:
    account = get_account_for_tenant(db, tenant_id=tenant_id, account_id=account_id)
    if account is None:
        raise ValueError("account_not_found")
    if account.provider_type != PROVIDER_GOOGLE_OAUTH:
        raise ValueError("not_google_account")
    refresh = get_refresh_token(account)
    if refresh:
        revoke_refresh_token(refresh)
    account.google_refresh_token_ciphertext = None
    account.google_access_token_ciphertext = None
    account.google_access_token_expires_at = None
    account.oauth_last_error = "disconnected"
    account.is_active = False
    account.updated_at = datetime.utcnow()
    db.add(account)
    db.flush()
    return account
