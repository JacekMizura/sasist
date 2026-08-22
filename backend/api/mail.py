"""Mail module API — accounts, setup status (Phase 1)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user, require_permission
from ..database import get_db
from ..models.app_user import AppUser
from ..models.mail import MailAccount, MailConversation
from ..schemas.mail import MailAccountCreate, MailAccountTestBody, MailAccountUpdate
from ..services.mail.account_service import (
    account_to_dict,
    create_account,
    deactivate_account,
    get_account_for_tenant,
    list_accounts,
    update_account,
    validate_account_config,
)
from ..services.mail.connection_test import probe_account_connection

router = APIRouter(prefix="/mail", tags=["Mail"])

_view_perm = require_permission("mail.view")
_manage_accounts_perm = require_permission("mail.manage_accounts")


@router.post("/accounts/test-config")
def test_mail_account_config(
    body: MailAccountCreate,
    _: AppUser = Depends(_manage_accounts_perm),
) -> dict[str, Any]:
    """Test connection without persisting account."""
    probe = MailAccount(
        tenant_id=body.tenant_id,
        name=body.name,
        email_address=body.email_address,
        imap_host=body.imap_host,
        imap_port=body.imap_port,
        imap_security=body.imap_security,
        imap_username=body.imap_username,
        smtp_host=body.smtp_host,
        smtp_port=body.smtp_port,
        smtp_security=body.smtp_security,
        smtp_username=body.smtp_username,
        is_send_only=body.is_send_only,
    )
    from ..services.secrets.credential_cipher import encrypt_secret

    probe.imap_password_ciphertext = encrypt_secret(body.imap_password)
    probe.smtp_password_ciphertext = encrypt_secret(body.smtp_password)
    result = probe_account_connection(probe)
    return {
        "ok": result.ok,
        "imap_ok": result.imap_ok,
        "smtp_ok": result.smtp_ok,
        "message": result.message,
    }


@router.get("/setup-status")
def mail_setup_status(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_view_perm),
) -> dict[str, Any]:
    accounts = list_accounts(db, tenant_id=tenant_id)
    active = [a for a in accounts if a.is_active]
    conv_exists = (
        db.query(MailConversation.id)
        .filter(MailConversation.tenant_id == int(tenant_id))
        .first()
        is not None
    )
    return {
        "has_accounts": len(accounts) > 0,
        "has_active_accounts": len(active) > 0,
        "has_conversations": conv_exists,
        "account_count": len(accounts),
    }


@router.get("/accounts")
def list_mail_accounts(
    tenant_id: int = Query(..., ge=1),
    active_only: bool = Query(False),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_view_perm),
) -> list[dict[str, Any]]:
    rows = list_accounts(db, tenant_id=tenant_id, active_only=active_only)
    return [account_to_dict(r) for r in rows]


@router.get("/accounts/{account_id}")
def get_mail_account(
    account_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_view_perm),
) -> dict[str, Any]:
    row = get_account_for_tenant(db, tenant_id=tenant_id, account_id=account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="account_not_found")
    return account_to_dict(row)


@router.post("/accounts")
def post_mail_account(
    body: MailAccountCreate,
    db: Session = Depends(get_db),
    _: AppUser = Depends(_manage_accounts_perm),
) -> dict[str, Any]:
    row = create_account(
        db,
        tenant_id=body.tenant_id,
        name=body.name,
        email_address=body.email_address,
        imap_host=body.imap_host,
        imap_port=body.imap_port,
        imap_security=body.imap_security,
        imap_username=body.imap_username,
        imap_password=body.imap_password,
        smtp_host=body.smtp_host,
        smtp_port=body.smtp_port,
        smtp_security=body.smtp_security,
        smtp_username=body.smtp_username,
        smtp_password=body.smtp_password,
        is_send_only=body.is_send_only,
        is_active=body.is_active,
    )
    ok, err = validate_account_config(row)
    if not ok:
        db.rollback()
        raise HTTPException(status_code=400, detail=err or "invalid_config")
    db.commit()
    db.refresh(row)
    return account_to_dict(row)


@router.patch("/accounts/{account_id}")
def patch_mail_account(
    account_id: int,
    body: MailAccountUpdate,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_manage_accounts_perm),
) -> dict[str, Any]:
    row = get_account_for_tenant(db, tenant_id=tenant_id, account_id=account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="account_not_found")
    update_account(
        db,
        row,
        name=body.name,
        email_address=body.email_address,
        imap_host=body.imap_host,
        imap_port=body.imap_port,
        imap_security=body.imap_security,
        imap_username=body.imap_username,
        imap_password=body.imap_password,
        smtp_host=body.smtp_host,
        smtp_port=body.smtp_port,
        smtp_security=body.smtp_security,
        smtp_username=body.smtp_username,
        smtp_password=body.smtp_password,
        is_send_only=body.is_send_only,
        is_active=body.is_active,
    )
    ok, err = validate_account_config(row)
    if not ok:
        db.rollback()
        raise HTTPException(status_code=400, detail=err or "invalid_config")
    db.commit()
    db.refresh(row)
    return account_to_dict(row)


@router.post("/accounts/{account_id}/deactivate")
def deactivate_mail_account(
    account_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_manage_accounts_perm),
) -> dict[str, Any]:
    row = get_account_for_tenant(db, tenant_id=tenant_id, account_id=account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="account_not_found")
    deactivate_account(db, row)
    db.commit()
    db.refresh(row)
    return account_to_dict(row)


@router.post("/accounts/{account_id}/test")
def test_mail_account_connection(
    account_id: int,
    tenant_id: int = Query(..., ge=1),
    body: MailAccountTestBody | None = None,
    db: Session = Depends(get_db),
    _: AppUser = Depends(_manage_accounts_perm),
) -> dict[str, Any]:
    row = get_account_for_tenant(db, tenant_id=tenant_id, account_id=account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="account_not_found")

    probe = MailAccount(
        tenant_id=row.tenant_id,
        name=row.name,
        email_address=row.email_address,
        imap_host=row.imap_host,
        imap_port=row.imap_port,
        imap_security=row.imap_security,
        imap_username=row.imap_username,
        imap_password_ciphertext=row.imap_password_ciphertext,
        smtp_host=row.smtp_host,
        smtp_port=row.smtp_port,
        smtp_security=row.smtp_security,
        smtp_username=row.smtp_username,
        smtp_password_ciphertext=row.smtp_password_ciphertext,
        is_send_only=row.is_send_only,
    )
    if body is not None:
        if body.imap_host is not None:
            probe.imap_host = body.imap_host
        if body.imap_port is not None:
            probe.imap_port = body.imap_port
        if body.imap_security is not None:
            probe.imap_security = body.imap_security
        if body.imap_username is not None:
            probe.imap_username = body.imap_username
        if body.imap_password:
            from ..services.secrets.credential_cipher import encrypt_secret

            probe.imap_password_ciphertext = encrypt_secret(body.imap_password)
        if body.smtp_host is not None:
            probe.smtp_host = body.smtp_host
        if body.smtp_port is not None:
            probe.smtp_port = body.smtp_port
        if body.smtp_security is not None:
            probe.smtp_security = body.smtp_security
        if body.smtp_username is not None:
            probe.smtp_username = body.smtp_username
        if body.smtp_password:
            from ..services.secrets.credential_cipher import encrypt_secret

            probe.smtp_password_ciphertext = encrypt_secret(body.smtp_password)
        if body.is_send_only is not None:
            probe.is_send_only = body.is_send_only

    result = probe_account_connection(probe)
    return {
        "ok": result.ok,
        "imap_ok": result.imap_ok,
        "smtp_ok": result.smtp_ok,
        "message": result.message,
    }
