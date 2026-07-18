"""HTTP helpers for capacity errors — emit WmsUserMessage detail."""

from __future__ import annotations

from fastapi import HTTPException

from ..wms_user_messages import from_cart_capacity_exceeded, http_exception_wms
from .exceptions import CartCapacityExceeded


def http_exception_cart_capacity_exceeded(exc: CartCapacityExceeded) -> HTTPException:
    return http_exception_wms(from_cart_capacity_exceeded(exc), status_code=409)
