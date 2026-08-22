"""Select inbound connector by MailAccount.provider_type."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ....models.mail import PROVIDER_GOOGLE_OAUTH, MailAccount
from .base_connector import InboundMailConnector
from .gmail_connector import build_gmail_inbound_connector
from .imap_connector import build_imap_connector_for_account


class ImapInboundAdapter:
    def __init__(self, account: MailAccount, connector) -> None:
        self._account = account
        self._connector = connector

    def fetch_batch(self, batch_size: int):
        from .base_connector import FetchedInboundMessage

        since_uid = int(self._account.last_sync_uid or 0)
        items = self._connector.fetch_since_uid(since_uid, batch_size)
        return [
            FetchedInboundMessage(
                raw_bytes=item.raw_bytes,
                internal_date=item.internal_date,
                imap_uid=item.uid,
            )
            for item in items
        ]

    def close(self) -> None:
        self._connector.close()


def build_inbound_connector_for_account(db: Session, account: MailAccount) -> InboundMailConnector:
    if account.provider_type == PROVIDER_GOOGLE_OAUTH:
        return build_gmail_inbound_connector(db, account)
    imap = build_imap_connector_for_account(account)
    return ImapInboundAdapter(account, imap)
