"""Mail account CRUD — tenant-scoped, credentials encrypted at rest."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.mail import (
    IMAP_SECURITY_SSL,
    MailAccount,
    PROVIDER_GOOGLE_OAUTH,
    PROVIDER_MANUAL,
    SMTP_SECURITY_TLS,
)
from ..secrets.credential_cipher import decrypt_secret, encrypt_secret


def _has_secret(ciphertext: str | None) -> bool:
    return bool(ciphertext and str(ciphertext).strip())


def account_to_dict(row: MailAccount, *, include_sync: bool = True) -> dict[str, Any]:
    is_google = row.provider_type == PROVIDER_GOOGLE_OAUTH
    oauth_connected = is_google and _has_secret(row.google_refresh_token_ciphertext)
    out: dict[str, Any] = {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "name": row.name,
        "email_address": row.email_address,
        "provider_type": row.provider_type or PROVIDER_MANUAL,
        "google_connected": oauth_connected,
        "google_email": row.google_email,
        "oauth_connected_at": row.oauth_connected_at.isoformat() if row.oauth_connected_at else None,
        "oauth_last_error": row.oauth_last_error,
        "google_granted_scopes": row.google_granted_scopes,
        "imap_host": None if is_google else row.imap_host,
        "imap_port": None if is_google else row.imap_port,
        "imap_security": None if is_google else row.imap_security,
        "imap_username": None if is_google else row.imap_username,
        "has_imap_password": False if is_google else _has_secret(row.imap_password_ciphertext),
        "smtp_host": None if is_google else row.smtp_host,
        "smtp_port": None if is_google else row.smtp_port,
        "smtp_security": None if is_google else row.smtp_security,
        "smtp_username": None if is_google else row.smtp_username,
        "has_smtp_password": False if is_google else _has_secret(row.smtp_password_ciphertext),
        "is_send_only": bool(row.is_send_only),
        "is_active": bool(row.is_active),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
    if include_sync:
        out.update(
            {
                "last_sync_at": row.last_sync_at.isoformat() if row.last_sync_at else None,
                "last_sync_uid": int(row.last_sync_uid or 0),
                "last_sync_error": row.last_sync_error,
            }
        )
    return out


def get_account_for_tenant(db: Session, *, tenant_id: int, account_id: int) -> MailAccount | None:
    return (
        db.query(MailAccount)
        .filter(MailAccount.id == int(account_id), MailAccount.tenant_id == int(tenant_id))
        .first()
    )


def list_accounts(db: Session, *, tenant_id: int, active_only: bool = False) -> list[MailAccount]:
    q = db.query(MailAccount).filter(MailAccount.tenant_id == int(tenant_id))
    if active_only:
        q = q.filter(MailAccount.is_active.is_(True))
    return q.order_by(MailAccount.name.asc(), MailAccount.id.asc()).all()


def create_account(
    db: Session,
    *,
    tenant_id: int,
    name: str,
    email_address: str,
    imap_host: str | None,
    imap_port: int | None,
    imap_security: str | None,
    imap_username: str | None,
    imap_password: str | None,
    smtp_host: str | None,
    smtp_port: int | None,
    smtp_security: str | None,
    smtp_username: str | None,
    smtp_password: str | None,
    is_send_only: bool,
    is_active: bool = True,
) -> MailAccount:
    now = datetime.utcnow()
    row = MailAccount(
        tenant_id=int(tenant_id),
        name=str(name).strip(),
        email_address=str(email_address).strip(),
        provider_type=PROVIDER_MANUAL,
        imap_host=(imap_host or "").strip() or None,
        imap_port=int(imap_port) if imap_port is not None else None,
        imap_security=(imap_security or IMAP_SECURITY_SSL).strip().upper(),
        imap_username=(imap_username or "").strip() or None,
        imap_password_ciphertext=encrypt_secret(imap_password),
        smtp_host=(smtp_host or "").strip() or None,
        smtp_port=int(smtp_port) if smtp_port is not None else None,
        smtp_security=(smtp_security or SMTP_SECURITY_TLS).strip().upper(),
        smtp_username=(smtp_username or "").strip() or None,
        smtp_password_ciphertext=encrypt_secret(smtp_password),
        is_send_only=bool(is_send_only),
        is_active=bool(is_active),
        last_sync_uid=0,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row


def update_account(
    db: Session,
    row: MailAccount,
    *,
    name: str | None = None,
    email_address: str | None = None,
    imap_host: str | None = None,
    imap_port: int | None = None,
    imap_security: str | None = None,
    imap_username: str | None = None,
    imap_password: str | None = None,
    smtp_host: str | None = None,
    smtp_port: int | None = None,
    smtp_security: str | None = None,
    smtp_username: str | None = None,
    smtp_password: str | None = None,
    is_send_only: bool | None = None,
    is_active: bool | None = None,
    clear_imap_password: bool = False,
    clear_smtp_password: bool = False,
) -> MailAccount:
    if name is not None:
        row.name = str(name).strip()
    if email_address is not None:
        row.email_address = str(email_address).strip()
    if imap_host is not None:
        row.imap_host = str(imap_host).strip() or None
    if imap_port is not None:
        row.imap_port = int(imap_port) if imap_port else None
    if imap_security is not None:
        row.imap_security = str(imap_security).strip().upper()
    if imap_username is not None:
        row.imap_username = str(imap_username).strip() or None
    if clear_imap_password:
        row.imap_password_ciphertext = None
    elif imap_password is not None and imap_password != "":
        row.imap_password_ciphertext = encrypt_secret(imap_password)
    if smtp_host is not None:
        row.smtp_host = str(smtp_host).strip() or None
    if smtp_port is not None:
        row.smtp_port = int(smtp_port) if smtp_port else None
    if smtp_security is not None:
        row.smtp_security = str(smtp_security).strip().upper()
    if smtp_username is not None:
        row.smtp_username = str(smtp_username).strip() or None
    if clear_smtp_password:
        row.smtp_password_ciphertext = None
    elif smtp_password is not None and smtp_password != "":
        row.smtp_password_ciphertext = encrypt_secret(smtp_password)
    if is_send_only is not None:
        row.is_send_only = bool(is_send_only)
    if is_active is not None:
        row.is_active = bool(is_active)
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.flush()
    return row


def deactivate_account(db: Session, row: MailAccount) -> MailAccount:
    row.is_active = False
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.flush()
    return row


def get_imap_password(row: MailAccount) -> str | None:
    return decrypt_secret(row.imap_password_ciphertext)


def get_smtp_password(row: MailAccount) -> str | None:
    return decrypt_secret(row.smtp_password_ciphertext)


def validate_account_config(row: MailAccount) -> tuple[bool, str | None]:
    """Basic required-field validation before save."""
    if not row.name.strip():
        return False, "name_required"
    if not row.email_address.strip() or "@" not in row.email_address:
        return False, "email_invalid"
    if row.provider_type == PROVIDER_GOOGLE_OAUTH:
        if not _has_secret(row.google_refresh_token_ciphertext) and not _has_secret(
            row.google_access_token_ciphertext
        ):
            return False, "google_not_connected"
        return True, None
    if not row.smtp_host or not row.smtp_port:
        return False, "smtp_required"
    if not row.smtp_username:
        return False, "smtp_username_required"
    if not _has_secret(row.smtp_password_ciphertext):
        return False, "smtp_password_required"
    if row.is_send_only:
        return True, None
    if not row.imap_host or not row.imap_port:
        return False, "imap_required"
    if not row.imap_username:
        return False, "imap_username_required"
    if not _has_secret(row.imap_password_ciphertext):
        return False, "imap_password_required"
    return True, None
