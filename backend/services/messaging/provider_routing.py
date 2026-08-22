"""Route outbound delivery to the correct EmailProvider."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.mail import PROVIDER_GOOGLE_OAUTH, MailAccount
from ...models.messaging import OutboundEmailMessage
from .gmail_api_provider import GmailApiEmailProvider
from .providers import EmailProvider, get_email_provider


def resolve_outbound_email_provider(
    db: Session,
    row: OutboundEmailMessage,
) -> tuple[EmailProvider, MailAccount | None, str | None]:
    """
    mail_account_id + GOOGLE_OAUTH → GmailApiEmailProvider.
    No mail_account_id → global provider (Resend/SMTP/memory).
    MANUAL mail_account → global provider with From from account (existing behavior).
    """
    mail_account: MailAccount | None = None
    from_addr: str | None = None
    if row.mail_account_id:
        mail_account = (
            db.query(MailAccount).filter(MailAccount.id == int(row.mail_account_id)).first()
        )
        if mail_account is not None:
            from_addr = mail_account.email_address
            if mail_account.provider_type == PROVIDER_GOOGLE_OAUTH:
                return GmailApiEmailProvider(db, mail_account), mail_account, from_addr
    return get_email_provider(), mail_account, from_addr
