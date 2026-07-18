"""Capacity Engine — SSOT for cart occupancy (independent of Cart.status lifecycle)."""

from __future__ import annotations

from .engine import (
    CartCapacityEngine,
    RejectedCandidate,
    SelectionResult,
    build_capacity_snapshot,
    select_orders_for_cart,
)
from .enums import CapacityStrategy, OccupancyState
from .exceptions import CartCapacityExceeded
from .http import http_exception_cart_capacity_exceeded
from .types import BasketSlotSnapshot, BasketSummary, CapacitySnapshot

__all__ = [
    "BasketSlotSnapshot",
    "BasketSummary",
    "CapacitySnapshot",
    "CapacityStrategy",
    "CartCapacityEngine",
    "CartCapacityExceeded",
    "OccupancyState",
    "RejectedCandidate",
    "SelectionResult",
    "build_capacity_snapshot",
    "http_exception_cart_capacity_exceeded",
    "select_orders_for_cart",
]
