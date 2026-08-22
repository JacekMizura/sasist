"""Map mail connection exceptions to operator-safe messages (no credentials / tracebacks)."""

from __future__ import annotations

import errno
import logging
import socket
from enum import Enum
from typing import Any

import imaplib
import smtplib

logger = logging.getLogger(__name__)


class ProbeStatus(str, Enum):
    OK = "OK"
    AUTH_ERROR = "AUTH_ERROR"
    NETWORK_ERROR = "NETWORK_ERROR"
    TIMEOUT = "TIMEOUT"
    CONFIG_ERROR = "CONFIG_ERROR"
    SKIPPED = "SKIPPED"


USER_MESSAGES: dict[ProbeStatus, str] = {
    ProbeStatus.OK: "Połączenie poprawne.",
    ProbeStatus.AUTH_ERROR: "Nie udało się zalogować do konta. Sprawdź login i hasło aplikacji.",
    ProbeStatus.NETWORK_ERROR: "Serwer Sasist nie może połączyć się z serwerem pocztowym.",
    ProbeStatus.TIMEOUT: "Przekroczono czas połączenia z serwerem pocztowym.",
    ProbeStatus.CONFIG_ERROR: "Nieprawidłowa konfiguracja serwera.",
    ProbeStatus.SKIPPED: "Pominięto — brak konfiguracji.",
}


def _is_timeout(exc: BaseException) -> bool:
    if isinstance(exc, (TimeoutError, socket.timeout)):
        return True
    if isinstance(exc, OSError) and exc.errno in (errno.ETIMEDOUT, errno.ECONNABORTED):
        return True
    text = str(exc).lower()
    return "timed out" in text or "timeout" in text


def _is_network_unreachable(exc: BaseException) -> bool:
    if isinstance(exc, OSError):
        if exc.errno in (errno.ENETUNREACH, errno.EHOSTUNREACH, errno.ECONNREFUSED, errno.ENETDOWN):
            return True
    text = str(exc).lower()
    return (
        "network is unreachable" in text
        or "no route to host" in text
        or "connection refused" in text
        or "name or service not known" in text
        or "nodename nor servname provided" in text
        or "getaddrinfo failed" in text
    )


def _is_auth_error(exc: BaseException, *, protocol: str) -> bool:
    if protocol == "imap":
        if isinstance(exc, imaplib.IMAP4.error):
            return True
    if protocol == "smtp":
        if isinstance(exc, smtplib.SMTPAuthenticationError):
            return True
        if isinstance(exc, smtplib.SMTPNotSupportedError):
            return True
    text = str(exc).lower()
    auth_markers = (
        "authentication failed",
        "invalid credentials",
        "authorization failed",
        "application-specific password required",
        "username and password not accepted",
        "login failed",
        "auth",
    )
    return any(m in text for m in auth_markers)


def classify_connection_error(exc: BaseException, *, protocol: str) -> ProbeStatus:
    logger.info(
        "mail_connection_test %s failed class=%s errno=%s",
        protocol,
        exc.__class__.__name__,
        getattr(exc, "errno", None),
    )
    if _is_timeout(exc):
        return ProbeStatus.TIMEOUT
    if _is_auth_error(exc, protocol=protocol):
        return ProbeStatus.AUTH_ERROR
    if _is_network_unreachable(exc):
        return ProbeStatus.NETWORK_ERROR
    if isinstance(exc, (ValueError, TypeError)):
        return ProbeStatus.CONFIG_ERROR
    # Conservative default — never expose raw errno/traceback to operators.
    if isinstance(exc, (OSError, smtplib.SMTPException, imaplib.IMAP4.error)):
        return ProbeStatus.NETWORK_ERROR
    return ProbeStatus.CONFIG_ERROR


def user_message_for_status(status: ProbeStatus) -> str:
    return USER_MESSAGES[status]


def tcp_probe(host: str, port: int, *, timeout: float = 5.0) -> dict[str, Any]:
    """DNS + TCP reachability (no credentials)."""
    out: dict[str, Any] = {"host": host, "port": port, "dns_resolved": False, "tcp_reachable": False}
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        out["dns_resolved"] = bool(infos)
        if infos:
            out["resolved_addresses"] = sorted({item[4][0] for item in infos})[:5]
    except OSError as exc:
        out["dns_error"] = exc.__class__.__name__
        return out

    try:
        with socket.create_connection((host, port), timeout=timeout):
            out["tcp_reachable"] = True
    except OSError as exc:
        out["tcp_error"] = exc.__class__.__name__
        out["tcp_errno"] = getattr(exc, "errno", None)
    return out
