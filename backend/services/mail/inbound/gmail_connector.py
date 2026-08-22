"""Gmail API inbound connector — incremental history sync."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ....models.mail import MailAccount
from ..google.gmail_client import (
    GmailApiError,
    decode_gmail_raw,
    ensure_valid_access_token,
    get_gmail_message,
    get_gmail_profile,
    list_gmail_history,
    list_gmail_messages,
)
from .base_connector import FetchedInboundMessage

logger = logging.getLogger(__name__)


class GmailApiInboundConnector:
    def __init__(self, db: Session, account: MailAccount) -> None:
        self._db = db
        self._account = account
        self._access_token: str | None = None

    def _token(self) -> str:
        if self._access_token:
            return self._access_token
        self._access_token = ensure_valid_access_token(self._db, self._account)
        return self._access_token

    def fetch_batch(self, batch_size: int) -> list[FetchedInboundMessage]:
        token = self._token()
        history_id = (self._account.gmail_history_id or "").strip()
        if history_id:
            return self._fetch_incremental(token, history_id, batch_size)
        return self._fetch_initial(token, batch_size)

    def _fetch_initial(self, token: str, batch_size: int) -> list[FetchedInboundMessage]:
        listing = list_gmail_messages(access_token=token, max_results=batch_size)
        ids = [str(m.get("id")) for m in listing.get("messages") or [] if m.get("id")]
        out: list[FetchedInboundMessage] = []
        for msg_id in ids:
            item = self._fetch_one(token, msg_id)
            if item is not None:
                out.append(item)
        try:
            profile = get_gmail_profile(access_token=token)
            new_history = profile.get("historyId")
            if new_history:
                self._account.gmail_history_id = str(new_history)
        except GmailApiError:
            logger.warning("gmail profile historyId fetch failed account_id=%s", self._account.id)
        return out

    def _fetch_incremental(self, token: str, history_id: str, batch_size: int) -> list[FetchedInboundMessage]:
        try:
            history = list_gmail_history(access_token=token, start_history_id=history_id, max_results=batch_size)
        except GmailApiError as exc:
            if exc.code in ("gmail_client_error", "gmail_api_error"):
                logger.warning(
                    "gmail history expired account_id=%s — bounded resync",
                    self._account.id,
                )
                self._account.gmail_history_id = None
                return self._fetch_initial(token, batch_size)
            raise
        new_history = history.get("historyId")
        if new_history:
            self._account.gmail_history_id = str(new_history)
        message_ids: list[str] = []
        for block in history.get("history") or []:
            for added in block.get("messagesAdded") or []:
                msg = added.get("message") or {}
                mid = msg.get("id")
                if mid:
                    message_ids.append(str(mid))
        message_ids = message_ids[: max(1, int(batch_size))]
        out: list[FetchedInboundMessage] = []
        for msg_id in message_ids:
            item = self._fetch_one(token, msg_id)
            if item is not None:
                out.append(item)
        return out

    def _fetch_one(self, token: str, message_id: str) -> FetchedInboundMessage | None:
        data = get_gmail_message(access_token=token, message_id=message_id, fmt="raw")
        raw_b64 = data.get("raw")
        if not raw_b64:
            return None
        internal_ms = data.get("internalDate")
        internal_date = None
        if internal_ms:
            try:
                internal_date = datetime.fromtimestamp(int(internal_ms) / 1000.0, tz=timezone.utc).replace(
                    tzinfo=None
                )
            except (TypeError, ValueError):
                internal_date = None
        return FetchedInboundMessage(
            raw_bytes=decode_gmail_raw(str(raw_b64)),
            internal_date=internal_date,
            gmail_message_id=str(message_id),
            gmail_thread_id=str(data.get("threadId")) if data.get("threadId") else None,
        )

    def close(self) -> None:
        return None


def build_gmail_inbound_connector(db: Session, account: MailAccount) -> GmailApiInboundConnector:
    return GmailApiInboundConnector(db, account)
