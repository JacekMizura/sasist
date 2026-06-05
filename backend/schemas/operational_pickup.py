"""Pickup flow API schemas."""

from __future__ import annotations

from pydantic import BaseModel


class PickupPrepareResponse(BaseModel):
    order_id: int
    task_id: int
    pickup_zone_id: int | None = None


class PickupReadyResponse(BaseModel):
    order_id: int
    task_id: int
    pickup_zone_id: int | None = None


class PickupHandoffResponse(BaseModel):
    order_id: int
    task_id: int
