"""Gmail API outbound email provider."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.mail import MailAccount
from ..mail.google.gmail_client import (
    GmailApiError,
    build_rfc822_mime,
    ensure_valid_access_token,
    send_gmail_message,
)
from .providers import EmailProviderError, EmailSendRequest, EmailSendResult


class GmailApiEmailProvider:
    name = "gmail_api"

    def __init__(self, db: Session, account: MailAccount) -> None:
        self._db = db
        self._account = account

    def is_configured(self) -> bool:
        return bool(self._account.google_refresh_token_ciphertext or self._account.google_access_token_ciphertext)

    def _authorized_from(self) -> str:
        return (self._account.google_email or self._account.email_address or "").strip().lower()

    def send(self, request: EmailSendRequest) -> EmailSendResult:
        if not self.is_configured():
            raise EmailProviderError(
                "Połączenie z Google wygasło. Połącz konto ponownie.",
                code="oauth_revoked",
                transient=False,
            )
        authorized = self._authorized_from()
        requested = (request.from_address or authorized or "").strip().lower()
        if requested and authorized and requested != authorized:
            raise EmailProviderError(
                "Nie można wysłać wiadomości z innego adresu niż połączone konto Google.",
                code="invalid_sender",
                transient=False,
            )
        from_addr = self._account.google_email or self._account.email_address
        try:
            access_token = ensure_valid_access_token(self._db, self._account)
            raw = build_rfc822_mime(
                from_address=from_addr,
                to_address=request.to_address,
                subject=request.subject,
                body_text=request.body_text,
                message_id=request.message_id,
                in_reply_to=request.in_reply_to,
                references=request.references,
            )
            provider_message_id = send_gmail_message(access_token=access_token, raw_mime=raw)
        except GmailApiError as exc:
            raise EmailProviderError(str(exc), code=exc.code, transient=exc.transient) from exc
        return EmailSendResult(provider=self.name, provider_message_id=provider_message_id)
