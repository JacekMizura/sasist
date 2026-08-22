"""Test IMAP/SMTP connectivity for a mail account."""

from __future__ import annotations

import imaplib
import logging
import smtplib
import ssl
from dataclasses import dataclass
from typing import Optional

from ...models.mail import IMAP_SECURITY_NONE, IMAP_SECURITY_SSL, IMAP_SECURITY_TLS, MailAccount
from .account_service import get_imap_password, get_smtp_password

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ConnectionTestResult:
    ok: bool
    imap_ok: bool | None = None
    smtp_ok: bool | None = None
    message: str = ""


def _safe_error_message(exc: Exception) -> str:
    text = str(exc).strip() or exc.__class__.__name__
    if len(text) > 240:
        text = text[:237] + "..."
    return text


def test_imap_connection(
    *,
    host: str,
    port: int,
    security: str,
    username: str,
    password: str,
    timeout: int = 20,
) -> tuple[bool, str]:
    sec = (security or IMAP_SECURITY_SSL).upper()
    try:
        if sec == IMAP_SECURITY_SSL:
            client = imaplib.IMAP4_SSL(host, port, timeout=timeout)
        else:
            client = imaplib.IMAP4(host, port, timeout=timeout)
            if sec == IMAP_SECURITY_TLS:
                client.starttls(ssl_context=ssl.create_default_context())
        client.login(username, password)
        client.logout()
        return True, "OK"
    except Exception as exc:
        logger.info("mail_connection_test imap failed host=%s user=%s", host, username)
        return False, _safe_error_message(exc)


def test_smtp_connection(
    *,
    host: str,
    port: int,
    security: str,
    username: str,
    password: str,
    timeout: int = 20,
) -> tuple[bool, str]:
    sec = (security or "TLS").upper()
    try:
        if sec == "SSL":
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=timeout) as smtp:
                if username:
                    smtp.login(username, password)
        else:
            with smtplib.SMTP(host, port, timeout=timeout) as smtp:
                smtp.ehlo()
                if sec == "TLS":
                    smtp.starttls(context=ssl.create_default_context())
                    smtp.ehlo()
                if username:
                    smtp.login(username, password)
        return True, "OK"
    except Exception as exc:
        logger.info("mail_connection_test smtp failed host=%s user=%s", host, username)
        return False, _safe_error_message(exc)


def probe_account_connection(row: MailAccount) -> ConnectionTestResult:
    smtp_pw = get_smtp_password(row)
    if not row.smtp_host or not row.smtp_port or not row.smtp_username or not smtp_pw:
        return ConnectionTestResult(ok=False, smtp_ok=False, message="Brak kompletnej konfiguracji SMTP.")

    smtp_ok, smtp_msg = test_smtp_connection(
        host=str(row.smtp_host),
        port=int(row.smtp_port),
        security=str(row.smtp_security or "TLS"),
        username=str(row.smtp_username),
        password=smtp_pw,
    )
    if row.is_send_only:
        return ConnectionTestResult(
            ok=smtp_ok,
            smtp_ok=smtp_ok,
            imap_ok=None,
            message="Połączenie SMTP działa." if smtp_ok else f"SMTP: {smtp_msg}",
        )

    imap_pw = get_imap_password(row)
    if not row.imap_host or not row.imap_port or not row.imap_username or not imap_pw:
        return ConnectionTestResult(ok=False, imap_ok=False, smtp_ok=smtp_ok, message="Brak kompletnej konfiguracji IMAP.")

    imap_ok, imap_msg = test_imap_connection(
        host=str(row.imap_host),
        port=int(row.imap_port),
        security=str(row.imap_security or IMAP_SECURITY_SSL),
        username=str(row.imap_username),
        password=imap_pw,
    )
    if imap_ok and smtp_ok:
        return ConnectionTestResult(ok=True, imap_ok=True, smtp_ok=True, message="Połączenie IMAP i SMTP działa.")
    parts = []
    if not imap_ok:
        parts.append(f"IMAP: {imap_msg}")
    if not smtp_ok:
        parts.append(f"SMTP: {smtp_msg}")
    return ConnectionTestResult(ok=False, imap_ok=imap_ok, smtp_ok=smtp_ok, message=" · ".join(parts))
