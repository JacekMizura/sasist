"""Trwały cache zapytań GUS po NIP (PostgreSQL / ORM sync)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text

from ..database import Base


class GusLookupCache(Base):
    __tablename__ = "gus_lookup_cache"

    nip = Column(String(10), primary_key=True)
    payload_json = Column(Text, nullable=False)
    fetched_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


# Alias zgodności wstecznej
GusNipCache = GusLookupCache
