"""Security helpers for edge agent HTTP: replay protection, rate limits, action ACL."""

from __future__ import annotations

import json
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Header, HTTPException, Request
from sqlalchemy.orm import Session

from ...auth.deps import user_has_permission
from ...models.app_user import AppUser

ALLOWED_REMOTE_ACTIONS = frozenset(
    {
        "RefreshDevices",
        "RunDiagnostics",
        "DownloadLogs",
        "UpdateDeviceConfiguration",
        "ReloadConfiguration",
        "CheckUpdates",
        "RestartModule",
        "RestartAgent",
    }
)

PRIVILEGED_REMOTE_ACTIONS = frozenset({"RestartModule", "RestartAgent"})
REMOTE_ACTION_PERMISSIONS = ("settings.users", "settings.company")

_REPLAY_LOCK = Lock()
_NONCE_SEEN: dict[str, float] = {}
_NONCE_TTL_SEC = 300
_TIMESTAMP_SKEW_SEC = 120

_RATE_LOCK = Lock()
_RATE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_RATE_LIMIT = 120
_RATE_WINDOW_SEC = 60

MAX_ACTION_RESULT_BYTES = 5 * 1024 * 1024
MAX_CONFIG_VALUES_BYTES = 64 * 1024


def assert_user_may_enqueue_action(db: Session, user: AppUser, action: str) -> None:
    if action not in ALLOWED_REMOTE_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Action '{action}' is not allowed")
    if not any(user_has_permission(db, user, p) for p in REMOTE_ACTION_PERMISSIONS):
        raise HTTPException(status_code=403, detail="Missing permission for remote actions")
    if action in PRIVILEGED_REMOTE_ACTIONS and not user_has_permission(db, user, "settings.users"):
        raise HTTPException(status_code=403, detail="Privileged action requires settings.users")


def validate_replay_headers(
    x_sasist_timestamp: str | None = Header(default=None, alias="X-Sasist-Timestamp"),
    x_sasist_nonce: str | None = Header(default=None, alias="X-Sasist-Nonce"),
) -> None:
    if not x_sasist_timestamp or not x_sasist_nonce:
        raise HTTPException(status_code=401, detail="Missing replay protection headers")
    try:
        ts = int(x_sasist_timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid timestamp") from exc
    now = int(time.time())
    if abs(now - ts) > _TIMESTAMP_SKEW_SEC:
        raise HTTPException(status_code=401, detail="Timestamp skew too large")
    with _REPLAY_LOCK:
        _purge_nonces(now)
        if x_sasist_nonce in _NONCE_SEEN:
            raise HTTPException(status_code=401, detail="Replay detected")
        _NONCE_SEEN[x_sasist_nonce] = float(now)


def _purge_nonces(now: int) -> None:
    expired = [k for k, v in _NONCE_SEEN.items() if now - v > _NONCE_TTL_SEC]
    for k in expired:
        del _NONCE_SEEN[k]


def enforce_agent_rate_limit(request: Request, agent_key: str) -> None:
    now = time.time()
    key = f"{agent_key}:{request.url.path}"
    with _RATE_LOCK:
        bucket = _RATE_BUCKETS[key]
        while bucket and now - bucket[0] > _RATE_WINDOW_SEC:
            bucket.popleft()
        if len(bucket) >= _RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Agent rate limit exceeded")
        bucket.append(now)


def validate_action_result_payload_size(data: dict | None) -> None:
    if data is None:
        return
    raw = json.dumps(data, default=str)
    if len(raw.encode("utf-8")) > MAX_ACTION_RESULT_BYTES:
        raise HTTPException(status_code=413, detail="Action result payload too large")


def validate_configuration_payload(values: dict) -> None:
    raw = json.dumps(values, default=str)
    if len(raw.encode("utf-8")) > MAX_CONFIG_VALUES_BYTES:
        raise HTTPException(status_code=413, detail="Configuration payload too large")
