"""Map domain exceptions → WmsUserMessage HTTP responses."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from .wms_user_messages import (
    from_cart_capacity_exceeded,
    from_cart_lifecycle_error,
    http_exception_wms,
    msg_cart_not_found,
    msg_generic_error,
    msg_no_permission,
)


def raise_wms_from_lifecycle(exc: Any, *, extra: dict[str, Any] | None = None) -> None:
    """Raise HTTPException with WmsUserMessage detail (never returns)."""
    raise http_exception_wms(from_cart_lifecycle_error(exc, extra=extra), status_code=409)


def raise_wms_from_capacity(exc: Any) -> None:
    raise http_exception_wms(from_cart_capacity_exceeded(exc), status_code=409)


def raise_wms_cart_not_found() -> None:
    raise http_exception_wms(msg_cart_not_found(), status_code=404)


def raise_wms_no_permission() -> None:
    raise http_exception_wms(msg_no_permission(), status_code=403)


def raise_wms_generic(*, detail: str | None = None, status_code: int = 400) -> None:
    raise http_exception_wms(msg_generic_error(detail=detail), status_code=status_code)
