"""Gmail API HTTP client with OAuth token refresh."""

from __future__ import annotations

import base64
import logging
from datetime import datetime, timedelta
from email.message import EmailMessage
from typing import Any

import httpx

from ....models.mail import MailAccount
from ...secrets.credential_cipher import decrypt_secret, encrypt_secret
from .config import google_oauth_client_id, google_oauth_client_secret
from .constants import GMAIL_API_BASE, GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0, connect=10.0, read=30.0)

_RECONNECT_MSG = "Połączenie z Google wygasło. Połącz konto ponownie."
_SCOPE_MSG = "Konto Google nie udzieliło wymaganych uprawnień."


class GmailApiError(Exception):
    def __init__(self, message: str, *, code: str = "gmail_api_error", transient: bool = False):
        super().__init__(message)
        self.code = code
        self.transient = transient


def _map_gmail_http_error(status: int, body: dict[str, Any] | None) -> GmailApiError:
    err = (body or {}).get("error") if isinstance(body, dict) else None
    if isinstance(err, dict):
        reason = str(err.get("message") or err.get("status") or "")
        code = str(err.get("status") or "")
    else:
        reason = str(err or "")
        code = ""
    low = reason.lower()
    if status == 401 or "invalid_grant" in low:
        return GmailApiError(_RECONNECT_MSG, code="oauth_revoked", transient=False)
    if status == 403:
        return GmailApiError(_SCOPE_MSG, code="oauth_scope_denied", transient=False)
    if status == 429:
        return GmailApiError("Gmail API rate limit", code="rate_limit", transient=True)
    if status >= 500:
        return GmailApiError(reason or f"HTTP {status}", code="gmail_server_error", transient=True)
    if 400 <= status < 500:
        return GmailApiError(reason or f"HTTP {status}", code="gmail_client_error", transient=False)
    return GmailApiError(reason or f"HTTP {status}", code="gmail_api_error", transient=False)


def exchange_authorization_code(*, code: str, redirect_uri: str) -> dict[str, Any]:
    data = {
        "code": code,
        "client_id": google_oauth_client_id(),
        "client_secret": google_oauth_client_secret(),
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = client.post(GOOGLE_TOKEN_URL, data=data)
    if resp.status_code >= 400:
        raise GmailApiError(
            "OAuth token exchange failed",
            code="oauth_exchange_failed",
            transient=False,
        )
    return resp.json()


def refresh_access_token(*, refresh_token: str) -> dict[str, Any]:
    data = {
        "client_id": google_oauth_client_id(),
        "client_secret": google_oauth_client_secret(),
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = client.post(GOOGLE_TOKEN_URL, data=data)
    if resp.status_code >= 400:
        body = {}
        try:
            body = resp.json()
        except Exception:
            pass
        raise _map_gmail_http_error(resp.status_code, body)
    return resp.json()


def revoke_refresh_token(refresh_token: str) -> None:
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            client.post(GOOGLE_REVOKE_URL, data={"token": refresh_token})
    except httpx.HTTPError:
        logger.warning("google token revoke request failed")


def fetch_google_userinfo(*, access_token: str) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {access_token}"}
    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = client.get(GOOGLE_USERINFO_URL, headers=headers)
    if resp.status_code >= 400:
        raise GmailApiError("Failed to fetch Google profile", code="profile_fetch_failed", transient=False)
    return resp.json()


def store_oauth_tokens(account: MailAccount, token_payload: dict[str, Any]) -> None:
    access = str(token_payload.get("access_token") or "")
    refresh = token_payload.get("refresh_token")
    expires_in = int(token_payload.get("expires_in") or 3600)
    scope = str(token_payload.get("scope") or "")
    if access:
        account.google_access_token_ciphertext = encrypt_secret(access)
        account.google_access_token_expires_at = datetime.utcnow() + timedelta(seconds=max(60, expires_in - 60))
    if refresh:
        account.google_refresh_token_ciphertext = encrypt_secret(str(refresh))
    if scope:
        account.google_granted_scopes = scope
    account.oauth_last_error = None


def get_refresh_token(account: MailAccount) -> str | None:
    return decrypt_secret(account.google_refresh_token_ciphertext)


def get_access_token(account: MailAccount) -> str | None:
    return decrypt_secret(account.google_access_token_ciphertext)


def ensure_valid_access_token(db, account: MailAccount) -> str:
    token = get_access_token(account)
    expires = account.google_access_token_expires_at
    if token and expires and expires > datetime.utcnow():
        return token
    refresh = get_refresh_token(account)
    if not refresh:
        account.oauth_last_error = _RECONNECT_MSG
        db.add(account)
        db.flush()
        raise GmailApiError(_RECONNECT_MSG, code="oauth_revoked", transient=False)
    payload = refresh_access_token(refresh_token=refresh)
    store_oauth_tokens(account, payload)
    db.add(account)
    db.flush()
    token = get_access_token(account)
    if not token:
        raise GmailApiError(_RECONNECT_MSG, code="oauth_revoked", transient=False)
    return token


def _gmail_request(
    *,
    access_token: str,
    method: str,
    path: str,
    json_body: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = f"{GMAIL_API_BASE}{path}"
    headers = {"Authorization": f"Bearer {access_token}"}
    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = client.request(method, url, headers=headers, json=json_body, params=params)
    if resp.status_code >= 400:
        body = {}
        try:
            body = resp.json()
        except Exception:
            pass
        raise _map_gmail_http_error(resp.status_code, body if isinstance(body, dict) else None)
    if resp.status_code == 204 or not resp.content:
        return {}
    data = resp.json()
    return data if isinstance(data, dict) else {}


def build_rfc822_mime(
    *,
    from_address: str,
    to_address: str,
    subject: str,
    body_text: str,
    message_id: str | None = None,
    in_reply_to: str | None = None,
    references: str | None = None,
) -> bytes:
    msg = EmailMessage()
    msg["From"] = from_address
    msg["To"] = to_address
    msg["Subject"] = subject or ""
    if message_id:
        msg["Message-ID"] = message_id
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references
    msg.set_content(body_text or "")
    return msg.as_bytes()


def send_gmail_message(*, access_token: str, raw_mime: bytes) -> str:
    encoded = base64.urlsafe_b64encode(raw_mime).decode("ascii")
    data = _gmail_request(
        access_token=access_token,
        method="POST",
        path="/users/me/messages/send",
        json_body={"raw": encoded},
    )
    msg_id = data.get("id")
    if not msg_id:
        raise GmailApiError("Gmail send missing message id", code="invalid_response", transient=True)
    return str(msg_id)


def get_gmail_profile(*, access_token: str) -> dict[str, Any]:
    return _gmail_request(access_token=access_token, method="GET", path="/users/me/profile")


def list_gmail_messages(*, access_token: str, max_results: int, page_token: str | None = None) -> dict[str, Any]:
    params: dict[str, Any] = {"maxResults": max(1, int(max_results)), "labelIds": "INBOX"}
    if page_token:
        params["pageToken"] = page_token
    return _gmail_request(access_token=access_token, method="GET", path="/users/me/messages", params=params)


def get_gmail_message(*, access_token: str, message_id: str, fmt: str = "raw") -> dict[str, Any]:
    return _gmail_request(
        access_token=access_token,
        method="GET",
        path=f"/users/me/messages/{message_id}",
        params={"format": fmt},
    )


def list_gmail_history(
    *,
    access_token: str,
    start_history_id: str,
    max_results: int = 50,
) -> dict[str, Any]:
    return _gmail_request(
        access_token=access_token,
        method="GET",
        path="/users/me/history",
        params={
            "startHistoryId": start_history_id,
            "maxResults": max(1, int(max_results)),
            "historyTypes": "messageAdded",
        },
    )


def decode_gmail_raw(raw_b64: str) -> bytes:
    padded = raw_b64 + "=" * (-len(raw_b64) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))
