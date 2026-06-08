"""Slotting module domain errors."""

from __future__ import annotations


class SlottingError(Exception):
    code: str = "slotting_error"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        if code:
            self.code = code


class LocationNotFoundError(SlottingError):
    code = "location_not_found"


class ProductNotFoundError(SlottingError):
    code = "product_not_found"


class CapacityOverflowError(SlottingError):
    code = "capacity_overflow"
