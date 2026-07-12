"""Simple in-memory rate limiting for API key validation."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from .errors import ApiKeyRateLimitError

_LOCK = threading.Lock()
_ATTEMPTS: dict[str, deque[float]] = defaultdict(deque)
_WINDOW_SEC = 60.0
_MAX_ATTEMPTS = 30


def check_validation_rate_limit(*, scope: str) -> None:
    now = time.monotonic()
    with _LOCK:
        bucket = _ATTEMPTS[scope]
        while bucket and now - bucket[0] > _WINDOW_SEC:
            bucket.popleft()
        if len(bucket) >= _MAX_ATTEMPTS:
            raise ApiKeyRateLimitError()
        bucket.append(now)


def reset_validation_rate_limit_for_tests() -> None:
    with _LOCK:
        _ATTEMPTS.clear()
