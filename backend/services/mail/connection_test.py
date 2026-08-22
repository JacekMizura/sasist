"""Test IMAP/SMTP connectivity for a mail account."""

from __future__ import annotations

import imaplib
import logging
import smtplib
import ssl
from dataclasses import dataclass
from typing import Any

from ...models.mail import IMAP_SECURITY_NONE, IMAP_SECURITY_SSL, IMAP_SECURITY_TLS, MailAccount
from .account_service import get_imap_password, get_smtp_password
from .connection_errors import (
    ProbeStatus,
    classify_connection_error,
    tcp_probe,
    user_message_for_status,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProtocolProbeResult:
    status: ProbeStatus
    message: str
    diagnostics: dict[str, Any] | None = None

    def to_api_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"status": self.status.value, "message": self.message}
        if self.diagnostics:
            payload["diagnostics"] = self.diagnostics
        return payload


@dataclass(frozen=True)
class ConnectionTestResult:
    ok: bool
    imap: ProtocolProbeResult | None = None
    smtp: ProtocolProbeResult | None = None
    message: str = ""

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "imap": self.imap.to_api_dict() if self.imap else None,
            "smtp": self.smtp.to_api_dict() if self.smtp else None,
            "message": self.message,
            # Legacy flat flags for existing clients
            "imap_ok": self.imap.status == ProbeStatus.OK if self.imap else None,
            "smtp_ok": self.smtp.status == ProbeStatus.OK if self.smtp else None,
        }


def test_imap_connection(
    *,
    host: str,
    port: int,
    security: str,
    username: str,
    password: str,
    timeout: int = 20,
) -> ProtocolProbeResult:
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
        return ProtocolProbeResult(status=ProbeStatus.OK, message=user_message_for_status(ProbeStatus.OK))
    except Exception as exc:
        logger.info("mail_connection_test imap failed host=%s user=%s", host, username)
        status = classify_connection_error(exc, protocol="imap")
        diagnostics = None
        if status in (ProbeStatus.NETWORK_ERROR, ProbeStatus.TIMEOUT):
            diagnostics = {"tcp": tcp_probe(host, port, timeout=min(float(timeout), 5.0))}
        return ProtocolProbeResult(
            status=status,
            message=user_message_for_status(status),
            diagnostics=diagnostics,
        )


def test_smtp_connection(
    *,
    host: str,
    port: int,
    security: str,
    username: str,
    password: str,
    timeout: int = 20,
) -> ProtocolProbeResult:
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
        return ProtocolProbeResult(status=ProbeStatus.OK, message=user_message_for_status(ProbeStatus.OK))
    except Exception as exc:
        logger.info("mail_connection_test smtp failed host=%s user=%s", host, username)
        status = classify_connection_error(exc, protocol="smtp")
        diagnostics = None
        if status in (ProbeStatus.NETWORK_ERROR, ProbeStatus.TIMEOUT):
            diagnostics = {
                "tcp_configured_port": tcp_probe(host, port, timeout=min(float(timeout), 5.0)),
            }
            # Report common alternate port without attempting login there.
            if port == 587:
                diagnostics["tcp_465"] = tcp_probe(host, 465, timeout=min(float(timeout), 5.0))
            elif port == 465:
                diagnostics["tcp_587"] = tcp_probe(host, 587, timeout=min(float(timeout), 5.0))
        return ProtocolProbeResult(
            status=status,
            message=user_message_for_status(status),
            diagnostics=diagnostics,
        )


def _missing_config_result(label: str) -> ProtocolProbeResult:
    return ProtocolProbeResult(
        status=ProbeStatus.CONFIG_ERROR,
        message=f"Brak kompletnej konfiguracji {label}.",
    )


def probe_account_connection(row: MailAccount) -> ConnectionTestResult:
    imap_result: ProtocolProbeResult | None = None
    smtp_result: ProtocolProbeResult | None = None

    smtp_pw = get_smtp_password(row)
    if row.smtp_host and row.smtp_port and row.smtp_username and smtp_pw:
        smtp_result = test_smtp_connection(
            host=str(row.smtp_host),
            port=int(row.smtp_port),
            security=str(row.smtp_security or "TLS"),
            username=str(row.smtp_username),
            password=smtp_pw,
        )
    else:
        smtp_result = _missing_config_result("SMTP")

    if row.is_send_only:
        ok = smtp_result.status == ProbeStatus.OK
        return ConnectionTestResult(ok=ok, imap=None, smtp=smtp_result, message=smtp_result.message)

    imap_pw = get_imap_password(row)
    if row.imap_host and row.imap_port and row.imap_username and imap_pw:
        imap_result = test_imap_connection(
            host=str(row.imap_host),
            port=int(row.imap_port),
            security=str(row.imap_security or IMAP_SECURITY_SSL),
            username=str(row.imap_username),
            password=imap_pw,
        )
    else:
        imap_result = _missing_config_result("IMAP")

    ok = imap_result.status == ProbeStatus.OK and smtp_result.status == ProbeStatus.OK
    if ok:
        message = "Połączenie IMAP i SMTP działa."
    else:
        parts = []
        if imap_result.status != ProbeStatus.OK:
            parts.append(f"IMAP: {imap_result.message}")
        if smtp_result.status != ProbeStatus.OK:
            parts.append(f"SMTP: {smtp_result.message}")
        message = " · ".join(parts)

    return ConnectionTestResult(ok=ok, imap=imap_result, smtp=smtp_result, message=message)
