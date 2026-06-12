"""Read-only product stock breakdown by warehouse disposition (Etap 1 — additive API)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ProductDispositionStockOut(BaseModel):
    """
    Physical on-hand per disposition pool.

    ``saleable_qty`` is the primary UI "Dostępne" value (on-hand SALEABLE, not net of reservations).
    ``saleable_available_qty`` is informational until Etap 2 binds reservations to disposition.

    Future Etap 2: ``OrderItem.required_stock_disposition`` will select which pool to reserve/pick from;
    these fields are the SSOT for matching available physical qty per pool.
    """

    saleable_qty: float = Field(0, ge=0, description="On-hand SALEABLE (UI: Dostępne)")
    outlet_qty: float = Field(0, ge=0, description="On-hand OUTLET_B")
    service_qty: float = Field(0, ge=0, description="On-hand SERVICE_C")
    quarantine_qty: float = Field(0, ge=0, description="On-hand QUARANTINE")
    scrap_qty: float = Field(0, ge=0, description="On-hand SCRAP — not sellable/reservable")
    rejected_qty: float = Field(0, ge=0, description="On-hand REJECTED_STOCK — separate from quarantine")
    other_qty: float = Field(0, ge=0, description="Unknown disposition codes (normalized fallback bucket)")
    physical_qty: float = Field(0, ge=0, description="Sum of all visible inventory rows (= legacy stock_quantity)")
    saleable_available_qty: float = Field(
        0,
        ge=0,
        description="max(0, saleable_qty - global reserved); UI secondary line when reserved > 0",
    )
