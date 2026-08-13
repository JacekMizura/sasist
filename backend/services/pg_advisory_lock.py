"""Stable PostgreSQL advisory-lock keys (process-independent).

Python's built-in ``hash()`` is salted per process — using it for
``pg_advisory_xact_lock`` breaks cross-replica serialization on Railway.
"""

from __future__ import annotations

import zlib
from typing import Iterable


def stable_advisory_lock_key(*parts: object) -> int:
    """Return a signed 31-bit key stable across processes and deploys."""
    payload = "|".join(str(p) for p in parts).encode("utf-8")
    # crc32 is stable; mask to positive signed int4 range used by pg_advisory_xact_lock.
    return int(zlib.crc32(payload) & 0x7FFFFFFF)
