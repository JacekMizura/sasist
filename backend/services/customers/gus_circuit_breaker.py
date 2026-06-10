"""Prosty circuit breaker dla niestabilnego API GUS BIR."""

from __future__ import annotations

import os
import time


class GusCircuitOpenError(Exception):
    """GUS tymczasowo wyłączony po serii błędów."""


class GusCircuitBreaker:
    _failures = 0
    _opened_until: float | None = None

    THRESHOLD = int(os.getenv("GUS_CIRCUIT_FAILURE_THRESHOLD", "5") or "5")
    COOLDOWN_SEC = int(os.getenv("GUS_CIRCUIT_COOLDOWN_SEC", "120") or "120")

    @classmethod
    def allow_request(cls) -> bool:
        if cls._opened_until is not None and time.time() < cls._opened_until:
            return False
        if cls._opened_until is not None and time.time() >= cls._opened_until:
            cls._failures = 0
            cls._opened_until = None
        return True

    @classmethod
    def record_success(cls) -> None:
        cls._failures = 0
        cls._opened_until = None

    @classmethod
    def record_failure(cls) -> None:
        cls._failures += 1
        if cls._failures >= cls.THRESHOLD:
            cls._opened_until = time.time() + cls.COOLDOWN_SEC

    @classmethod
    def assert_closed(cls) -> None:
        if not cls.allow_request():
            raise GusCircuitOpenError("Usługa GUS jest chwilowo niedostępna (ochrona przed przeciążeniem).")
