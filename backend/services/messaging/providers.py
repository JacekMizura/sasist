"""Email provider protocol and registry (ENV-driven; no fake SENT)."""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
import uuid
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Optional, Protocol

logger = logging.getLogger(__name__)


class EmailProviderError(Exception):
    def __init__(self, message: str, *, code: str = "provider_error", transient: bool = False):
        super().__init__(message)
        self.code = code
        self.transient = transient


@dataclass(frozen=True)
class EmailSendRequest:
    to_address: str
    subject: str
    body_text: str
    idempotency_key: str
    from_address: Optional[str] = None
    message_id: Optional[str] = None
    in_reply_to: Optional[str] = None
    references: Optional[str] = None


@dataclass(frozen=True)
class EmailSendResult:
    provider: str
    provider_message_id: str


class EmailProvider(Protocol):
    name: str

    def is_configured(self) -> bool: ...

    def send(self, request: EmailSendRequest) -> EmailSendResult: ...


class UnconfiguredEmailProvider:
    """Used when SMTP env is missing — delivery must FAIL, never fake SENT."""

    name = "unconfigured"

    def is_configured(self) -> bool:
        return False

    def send(self, request: EmailSendRequest) -> EmailSendResult:
        raise EmailProviderError(
            "Email SMTP is not configured (set EMAIL_SMTP_HOST and EMAIL_FROM)",
            code="configuration_error",
            transient=False,
        )


class MemoryEmailProvider:
    """Test/dev provider that records sends without network I/O."""

    name = "memory"
    sent: list[EmailSendRequest]

    def __init__(self) -> None:
        self.sent = []

    def is_configured(self) -> bool:
        return True

    def send(self, request: EmailSendRequest) -> EmailSendResult:
        self.sent.append(request)
        return EmailSendResult(
            provider=self.name,
            provider_message_id=f"memory:{request.idempotency_key}",
        )


class SmtpEmailProvider:
    """Universal SMTP transport — any relay (SES/SendGrid SMTP/self-hosted) via ENV."""

    name = "smtp"

    def __init__(
        self,
        *,
        host: str,
        port: int,
        user: str,
        password: str,
        from_address: str,
        use_tls: bool = True,
        use_ssl: bool = False,
    ) -> None:
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.from_address = from_address
        self.use_tls = use_tls
        self.use_ssl = use_ssl

    def is_configured(self) -> bool:
        return bool(self.host and self.from_address)

    def send(self, request: EmailSendRequest) -> EmailSendResult:
        if not self.is_configured():
            raise EmailProviderError(
                "SMTP provider not configured",
                code="configuration_error",
                transient=False,
            )
        msg = EmailMessage()
        msg["Subject"] = request.subject
        msg["From"] = request.from_address or self.from_address
        msg["To"] = request.to_address
        if request.message_id:
            msg["Message-ID"] = request.message_id
        if request.in_reply_to:
            msg["In-Reply-To"] = request.in_reply_to
        if request.references:
            msg["References"] = request.references
        # Best-effort provider-facing idempotency (not all relays honor it).
        msg["X-Sasist-Idempotency-Key"] = request.idempotency_key
        msg.set_content(request.body_text or "")

        try:
            if self.use_ssl:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(self.host, self.port, context=context, timeout=30) as smtp:
                    if self.user:
                        smtp.login(self.user, self.password)
                    smtp.send_message(msg)
            else:
                with smtplib.SMTP(self.host, self.port, timeout=30) as smtp:
                    smtp.ehlo()
                    if self.use_tls:
                        context = ssl.create_default_context()
                        smtp.starttls(context=context)
                        smtp.ehlo()
                    if self.user:
                        smtp.login(self.user, self.password)
                    smtp.send_message(msg)
        except smtplib.SMTPRecipientsRefused as exc:
            raise EmailProviderError(str(exc), code="invalid_recipient", transient=False) from exc
        except smtplib.SMTPSenderRefused as exc:
            raise EmailProviderError(str(exc), code="invalid_sender", transient=False) from exc
        except smtplib.SMTPDataError as exc:
            # 5xx permanent-ish; 4xx often transient
            code = getattr(exc, "smtp_code", 500) or 500
            raise EmailProviderError(
                str(exc),
                code="smtp_data_error",
                transient=int(code) < 500,
            ) from exc
        except (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, TimeoutError, OSError) as exc:
            raise EmailProviderError(str(exc), code="smtp_transient", transient=True) from exc
        except smtplib.SMTPException as exc:
            raise EmailProviderError(str(exc), code="smtp_error", transient=True) from exc

        return EmailSendResult(
            provider=self.name,
            provider_message_id=f"smtp:{request.idempotency_key}:{uuid.uuid4().hex[:12]}",
        )


_memory_singleton: Optional[MemoryEmailProvider] = None


def get_email_provider() -> EmailProvider:
    """
    Resolve provider from ENV.

    EMAIL_PROVIDER=memory|smtp|auto (default auto)
    - memory: in-process recorder (tests)
    - smtp / auto: SMTP when EMAIL_SMTP_HOST + EMAIL_FROM set, else Unconfigured
    """
    global _memory_singleton
    mode = (os.environ.get("EMAIL_PROVIDER") or "auto").strip().lower()
    if mode == "memory":
        if _memory_singleton is None:
            _memory_singleton = MemoryEmailProvider()
        return _memory_singleton

    host = (os.environ.get("EMAIL_SMTP_HOST") or "").strip()
    from_addr = (os.environ.get("EMAIL_FROM") or "").strip()
    if mode in ("smtp", "auto") and host and from_addr:
        port_raw = os.environ.get("EMAIL_SMTP_PORT") or "587"
        try:
            port = int(port_raw)
        except ValueError:
            port = 587
        use_tls = (os.environ.get("EMAIL_SMTP_USE_TLS") or "true").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        use_ssl = (os.environ.get("EMAIL_SMTP_USE_SSL") or "false").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        return SmtpEmailProvider(
            host=host,
            port=port,
            user=(os.environ.get("EMAIL_SMTP_USER") or "").strip(),
            password=os.environ.get("EMAIL_SMTP_PASSWORD") or "",
            from_address=from_addr,
            use_tls=use_tls,
            use_ssl=use_ssl,
        )

    return UnconfiguredEmailProvider()


def reset_memory_provider_for_tests() -> MemoryEmailProvider:
    global _memory_singleton
    _memory_singleton = MemoryEmailProvider()
    return _memory_singleton
