"""Request-scoped complaint actor for Activity / audit dual-write."""

from __future__ import annotations

from contextvars import ContextVar
from typing import Optional

from fastapi import Depends

from ..auth.deps import get_optional_current_user
from ..models.app_user import AppUser

_complaint_actor_uid: ContextVar[Optional[int]] = ContextVar("complaint_actor_uid", default=None)
_complaint_actor_label: ContextVar[Optional[str]] = ContextVar("complaint_actor_label", default=None)


def get_complaint_actor_uid() -> Optional[int]:
    return _complaint_actor_uid.get()


def get_complaint_actor_label() -> Optional[str]:
    return _complaint_actor_label.get()


def _label_for(user: Optional[AppUser]) -> Optional[str]:
    if user is None:
        return None
    fn = str(getattr(user, "first_name", None) or "").strip()
    ln = str(getattr(user, "last_name", None) or "").strip()
    name = f"{fn} {ln}".strip()
    if name:
        return name
    return str(getattr(user, "login", None) or getattr(user, "email", None) or "").strip() or None


def bind_optional_complaint_actor(
    user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """FastAPI dependency — sets actor context for the request lifetime."""
    uid = int(user.id) if user is not None and getattr(user, "id", None) is not None else None
    t_uid = _complaint_actor_uid.set(uid)
    t_lab = _complaint_actor_label.set(_label_for(user))
    try:
        yield user
    finally:
        _complaint_actor_uid.reset(t_uid)
        _complaint_actor_label.reset(t_lab)
