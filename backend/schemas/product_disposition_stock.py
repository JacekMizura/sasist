"""Read-only product stock breakdown by warehouse disposition (Etap 1 — additive API)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ProductDispositionStockOut(BaseModel):
    """
    Physical on-hand per disposition pool (SSOT for product card / list).

    - ``saleable_available_qty`` = pick-eligible A − A reservations (default ATP / marketplace)
    - ``outlet_available_qty`` = pick-eligible B − B reservations (explicit outlet only)
    - ``service_available_qty`` = pick-eligible C (never reservable)
    - ``physical_qty`` = A+B+C+… (legacy stock_quantity parity)
    """

    saleable_qty: float = Field(0, ge=0, description="On-hand SALEABLE (A)")
    outlet_qty: float = Field(0, ge=0, description="On-hand OUTLET_B (B)")
    service_qty: float = Field(0, ge=0, description="On-hand SERVICE_C (C)")
    quarantine_qty: float = Field(0, ge=0, description="On-hand QUARANTINE")
    scrap_qty: float = Field(0, ge=0, description="On-hand SCRAP — not sellable/reservable")
    rejected_qty: float = Field(0, ge=0, description="On-hand REJECTED_STOCK — separate from quarantine")
    other_qty: float = Field(0, ge=0, description="Unknown disposition codes (normalized fallback bucket)")
    physical_qty: float = Field(0, ge=0, description="Sum of all visible inventory rows (= legacy stock_quantity)")
    saleable_available_qty: float = Field(
        0,
        ge=0,
        description="max(0, pick-eligible saleable_qty - SALEABLE reserved); excludes DOCK when requires_putaway",
    )
    outlet_available_qty: float = Field(
        0,
        ge=0,
        description="max(0, pick-eligible outlet_qty - OUTLET_B reserved)",
    )
    service_available_qty: float = Field(
        0,
        ge=0,
        description="Pick-eligible SERVICE_C on-hand (not reservable)",
    )
    dock_qty: float = Field(
        0,
        ge=0,
        description="On-hand SALEABLE on DOCK-IN (physical buffer awaiting putaway)",
    )
