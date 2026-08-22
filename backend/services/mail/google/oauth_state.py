"""Signed OAuth state — tenant-safe, tamper-resistant."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from ....auth.config import AUTH_SECRET_KEY
from .constants import OAUTH_STATE_TTL_SEC


class OAuthStateError(Exception):
    pass


def _sign(payload_b64: str) -> str:
    return hmac.new(
        AUTH_SECRET_KEY.encode("utf-8"),
        payload_b64.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()


def create_oauth_state(
    *,
    tenant_id: int,
    user_id: int,
    account_id: int | None = None,
) -> str:
    payload: dict[str, Any] = {
        "tenant_id": int(tenant_id),
        "user_id": int(user_id),
        "account_id": int(account_id) if account_id is not None else None,
        "nonce": secrets.token_urlsafe(16),
        "exp": int(time.time()) + OAUTH_STATE_TTL_SEC,
    }
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    sig = _sign(payload_b64)
    return f"{payload_b64}.{sig}"


def verify_oauth_state(state: str) -> dict[str, Any]:
    if not state or "." not in state:
        raise OAuthStateError("invalid_state")
    payload_b64, sig = state.rsplit(".", 1)
    expected = _sign(payload_b64)
    if not hmac.compare_digest(expected, sig):
        raise OAuthStateError("state_tampered")
    padded = payload_b64 + "=" * (-len(payload_b64) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise OAuthStateError("invalid_state_payload") from exc
    exp = int(payload.get("exp") or 0)
    if exp < int(time.time()):
        raise OAuthStateError("state_expired")
    if not payload.get("tenant_id") or not payload.get("user_id"):
        raise OAuthStateError("state_missing_fields")
    return payload
