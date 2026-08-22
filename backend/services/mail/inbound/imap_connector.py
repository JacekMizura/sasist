"""IMAP connector protocol + implementations."""

from __future__ import annotations

import email
import imaplib
import logging
import ssl
from dataclasses import dataclass
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Protocol

from ....models.mail import IMAP_SECURITY_SSL, IMAP_SECURITY_TLS, MailAccount
from ...secrets.credential_cipher import decrypt_secret

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FetchedImapMessage:
    uid: int
    raw_bytes: bytes
    internal_date: datetime | None = None


class ImapConnector(Protocol):
    def fetch_since_uid(self, since_uid: int, batch: int) -> list[FetchedImapMessage]: ...

    def close(self) -> None: ...


class RealImapConnector:
    """Production IMAP fetch by UID range."""

    def __init__(
        self,
        *,
        host: str,
        port: int,
        security: str,
        username: str,
        password: str,
        mailbox: str = "INBOX",
    ) -> None:
        self.host = host
        self.port = port
        self.security = (security or IMAP_SECURITY_SSL).upper()
        self.username = username
        self.password = password
        self.mailbox = mailbox
        self._client: imaplib.IMAP4 | imaplib.IMAP4_SSL | None = None

    def _connect(self) -> imaplib.IMAP4 | imaplib.IMAP4_SSL:
        if self._client is not None:
            return self._client
        if self.security == IMAP_SECURITY_SSL:
            client: imaplib.IMAP4 | imaplib.IMAP4_SSL = imaplib.IMAP4_SSL(
                self.host, self.port, timeout=30
            )
        else:
            client = imaplib.IMAP4(self.host, self.port, timeout=30)
            if self.security == IMAP_SECURITY_TLS:
                client.starttls(ssl_context=ssl.create_default_context())
        client.login(self.username, self.password)
        status, _ = client.select(self.mailbox, readonly=True)
        if status != "OK":
            raise RuntimeError(f"IMAP select {self.mailbox} failed")
        self._client = client
        return client

    def fetch_since_uid(self, since_uid: int, batch: int) -> list[FetchedImapMessage]:
        client = self._connect()
        start = int(since_uid) + 1
        status, data = client.uid("search", None, f"UID {start}:*")
        if status != "OK" or not data or not data[0]:
            return []
        uids = [int(x) for x in data[0].split() if x]
        uids = sorted(uids)[: max(1, int(batch))]
        out: list[FetchedImapMessage] = []
        for uid in uids:
            st, msg_data = client.uid("fetch", str(uid), "(RFC822 INTERNALDATE)")
            if st != "OK" or not msg_data:
                continue
            raw = _extract_rfc822(msg_data)
            if raw is None:
                continue
            internal = _extract_internal_date(msg_data)
            out.append(FetchedImapMessage(uid=uid, raw_bytes=raw, internal_date=internal))
        return out

    def close(self) -> None:
        if self._client is not None:
            try:
                self._client.logout()
            except Exception:
                pass
            self._client = None


def _extract_rfc822(msg_data: list) -> bytes | None:
    for part in msg_data:
        if isinstance(part, tuple) and len(part) >= 2 and isinstance(part[1], (bytes, bytearray)):
            return bytes(part[1])
    return None


def _extract_internal_date(msg_data: list) -> datetime | None:
    for part in msg_data:
        if isinstance(part, bytes):
            text = part.decode("utf-8", errors="ignore")
            if "INTERNALDATE" in text:
                # Best-effort; parser uses Date header primarily.
                pass
    return None


class InMemoryImapConnector:
    """Test double — inject messages without network."""

    def __init__(self, messages: list[FetchedImapMessage] | None = None) -> None:
        self._messages = list(messages or [])
        self.closed = False

    def add_message(self, uid: int, raw_bytes: bytes, internal_date: datetime | None = None) -> None:
        self._messages.append(FetchedImapMessage(uid=uid, raw_bytes=raw_bytes, internal_date=internal_date))

    def fetch_since_uid(self, since_uid: int, batch: int) -> list[FetchedImapMessage]:
        eligible = [m for m in self._messages if m.uid > since_uid]
        eligible.sort(key=lambda m: m.uid)
        return eligible[: max(1, int(batch))]

    def close(self) -> None:
        self.closed = True


def build_imap_connector_for_account(row: MailAccount) -> RealImapConnector:
    password = decrypt_secret(row.imap_password_ciphertext)
    if not password:
        raise ValueError("imap_password_missing")
    return RealImapConnector(
        host=str(row.imap_host),
        port=int(row.imap_port or 993),
        security=str(row.imap_security or IMAP_SECURITY_SSL),
        username=str(row.imap_username or ""),
        password=password,
    )


def parse_raw_email(raw_bytes: bytes) -> email.message.Message:
    return email.message_from_bytes(raw_bytes)
