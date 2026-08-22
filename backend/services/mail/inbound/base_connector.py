"""Inbound mail connector protocol — IMAP and Gmail API."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class FetchedInboundMessage:
    raw_bytes: bytes
    internal_date: datetime | None = None
    imap_uid: int | None = None
    gmail_message_id: str | None = None
    gmail_thread_id: str | None = None


class InboundMailConnector(Protocol):
    def fetch_batch(self, batch_size: int) -> list[FetchedInboundMessage]: ...

    def close(self) -> None: ...
