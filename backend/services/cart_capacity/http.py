"""HTTP helpers for capacity errors."""

from __future__ import annotations

from fastapi import HTTPException

from .exceptions import CartCapacityExceeded


def http_exception_cart_capacity_exceeded(exc: CartCapacityExceeded) -> HTTPException:
    return HTTPException(status_code=409, detail=exc.to_detail())
