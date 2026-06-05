"""Direct sale operational constants."""

from __future__ import annotations

from datetime import datetime, timedelta

SESSION_RESERVATION_TTL_MINUTES = 30
SUSPEND_TTL_MINUTES = 60
SESSION_SOFT_HOLD_TTL_MINUTES = 3

RESERVATION_KIND_SESSION = "SESSION"
RESERVATION_KIND_SOFT_HOLD = "SESSION_SOFT_HOLD"

RESERVATION_STATUS_ACTIVE = "ACTIVE"
RESERVATION_STATUS_EXPIRED = "EXPIRED"
RESERVATION_STATUS_RELEASED = "RELEASED"
RESERVATION_STATUS_CONSUMED = "CONSUMED"
RESERVATION_STATUS_CANCELLED = "CANCELLED"

_LEGACY_TO_LIFECYCLE = {
    "reserved": RESERVATION_STATUS_ACTIVE,
    "released": RESERVATION_STATUS_RELEASED,
    "picked": RESERVATION_STATUS_CONSUMED,
    "expired": RESERVATION_STATUS_EXPIRED,
    "cancelled": RESERVATION_STATUS_CANCELLED,
}

_LIFECYCLE_TO_LEGACY = {
    RESERVATION_STATUS_ACTIVE: "reserved",
    RESERVATION_STATUS_EXPIRED: "expired",
    RESERVATION_STATUS_RELEASED: "released",
    RESERVATION_STATUS_CONSUMED: "picked",
    RESERVATION_STATUS_CANCELLED: "cancelled",
}


def legacy_status_to_lifecycle(status: str) -> str:
    return _LEGACY_TO_LIFECYCLE.get(str(status or "").strip().lower(), RESERVATION_STATUS_ACTIVE)


def lifecycle_to_legacy_status(lifecycle: str) -> str:
    return _LIFECYCLE_TO_LEGACY.get(str(lifecycle or "").strip().upper(), "reserved")


def reservation_expires_at(*, minutes: int = SESSION_RESERVATION_TTL_MINUTES) -> datetime:
    return datetime.utcnow() + timedelta(minutes=int(minutes))


def soft_hold_expires_at() -> datetime:
    return reservation_expires_at(minutes=SESSION_SOFT_HOLD_TTL_MINUTES)
