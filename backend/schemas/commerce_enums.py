"""Commerce / operational sales enums — shared API + service constants."""

from __future__ import annotations

from typing import Literal

OrderChannel = Literal[
    "ONLINE",
    "MARKETPLACE",
    "DIRECT_SALE",
    "SHOWROOM",
    "PHONE",
    "MANUAL",
]

FulfillmentMode = Literal[
    "WMS",
    "IMMEDIATE",
    "PICKUP",
    "DELIVERY",
    "RESERVATION",
]

OperationalZoneType = Literal[
    "SALES",
    "PICKUP",
    "PACKING",
    "RETURNS",
    "SHOWROOM",
    "SERVICE",
]

DirectSaleSessionStatus = Literal[
    "ACTIVE",
    "SUSPENDED",
    "CHECKOUT",
    "COMPLETED",
    "CANCELLED",
]

ReservationScope = Literal["NONE", "SESSION", "ORDER", "PICKING"]

IssueStrategy = Literal["STRICT_LOCATION", "AUTO_SPLIT", "SINGLE_LOCATION_ONLY"]

PaymentStatus = Literal[
    "PENDING",
    "AUTHORIZED",
    "PARTIALLY_PAID",
    "PAID",
    "REFUNDED",
    "PARTIALLY_REFUNDED",
    "FAILED",
    "CANCELLED",
]

InventoryMovementType = Literal[
    "RECEIPT",
    "ISSUE",
    "RESERVE",
    "RELEASE",
    "TRANSFER",
    "ADJUSTMENT",
    "RETURN",
    "DAMAGE",
    "PICK",
    "PACK",
    "SHORTAGE",
]

ORDER_CHANNEL_VALUES: tuple[str, ...] = (
    "ONLINE",
    "MARKETPLACE",
    "DIRECT_SALE",
    "SHOWROOM",
    "PHONE",
    "MANUAL",
)

FULFILLMENT_MODE_VALUES: tuple[str, ...] = (
    "WMS",
    "IMMEDIATE",
    "PICKUP",
    "DELIVERY",
    "RESERVATION",
)

WMS_ELIGIBLE_FULFILLMENT_MODES: frozenset[str] = frozenset({"WMS"})

DEFAULT_FULFILLMENT_MODE = "WMS"
DEFAULT_ORDER_CHANNEL = "MANUAL"

OPERATIONAL_ZONE_TYPES: tuple[str, ...] = (
    "SALES",
    "PICKUP",
    "PACKING",
    "RETURNS",
    "SHOWROOM",
    "SERVICE",
)
