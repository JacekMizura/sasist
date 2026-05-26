from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from .config import ACCESS_TOKEN_EXPIRE_MINUTES, AUTH_SECRET_KEY, REFRESH_TOKEN_EXPIRE_DAYS


def create_access_token(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {"sub": str(user_id), "typ": "access", "exp": exp}
    return jwt.encode(payload, AUTH_SECRET_KEY, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, AUTH_SECRET_KEY, algorithms=["HS256"])


def new_refresh_token_values() -> tuple[str, str, datetime]:
    """Returns raw_token, sha256_hex, expires_at (naive UTC for SQLite)."""
    raw = secrets.token_urlsafe(48)
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    exp = (datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).replace(tzinfo=None)
    return raw, h, exp


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
