"""Simple in-memory rate limiting for API key validation and pairing."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from .errors import ApiKeyRateLimitError

_LOCK = threading.Lock()
_ATTEMPTS: dict[str, deque[float]] = defaultdict(deque)
_WINDOW_SEC = 60.0
_MAX_ATTEMPTS = 30
_PAIRING_MAX_ATTEMPTS = 10


def check_validation_rate_limit(*, scope: str, max_attempts: int | None = None) -> None:
    limit = _MAX_ATTEMPTS if max_attempts is None else max_attempts
    now = time.monotonic()
    with _LOCK:
        bucket = _ATTEMPTS[scope]
        while bucket and now - bucket[0] > _WINDOW_SEC:
            bucket.popleft()
        if len(bucket) >= limit:
            raise ApiKeyRateLimitError()
        bucket.append(now)


def check_pairing_rate_limit(*, client_ip: str | None) -> None:
    """Stricter limit for workstation pairing codes (brute-force protection)."""
    scope = f"pairing:{(client_ip or 'unknown').strip() or 'unknown'}"
    check_validation_rate_limit(scope=scope, max_attempts=_PAIRING_MAX_ATTEMPTS)


def reset_validation_rate_limit_for_tests() -> None:
    with _LOCK:
        _ATTEMPTS.clear()
