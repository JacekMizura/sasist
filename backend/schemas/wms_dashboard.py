"""WMS operational dashboard — read-only aggregates."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

OperationalHealth = Literal["nominal", "attention", "critical"]


class WmsDashboardAlert(BaseModel):
    kind: Literal["error", "warning", "info"]
    message: str


class WmsDashboardTopProduct(BaseModel):
    product_id: int
    name: str
    image_url: str | None = None
    pick_qty: float = Field(..., description="Sum of pick quantities (window)")


class WmsDashboardSummaryOut(BaseModel):
    orders_today: int = Field(..., description="Orders created or dated today (UTC day)")
    orders_to_collect: int = Field(..., description="Orders in picking source statuses")
    packing_spakowane: int
    packing_do_spakowania: int
    packing_w_trakcie: int
    packing_braki: int
    picking_collected: float = Field(..., description="Pick quantity sum today (UTC)")
    picking_to_collect: float = Field(..., description="Remaining qty on lines in source-status orders")
    packing_packed: int = Field(..., description="Packed units in packing-queue orders")
    packing_to_pack: int = Field(..., description="Remaining units to pack in packing-queue orders")
    alerts: list[WmsDashboardAlert]
    top_picked_products: list[WmsDashboardTopProduct]
    #: Orders not in panel DONE, order_date older than 48h (operational backlog / risk).
    orders_delayed: int = Field(0, ge=0)
    #: Orders in panel DONE with packed_at set today (UTC) — proxy for „zamknięte wysłane” w przepływie.
    orders_closed_packed_today: int = Field(0, ge=0)
    #: Distinct active picking sessions (WMS) — operator proxy.
    active_picking_sessions: int = Field(0, ge=0)
    #: Max(orders.created_at, picks) for this warehouse — brak dedykowanego importu: proxy ostatniej aktywności.
    last_activity_at: str | None = Field(
        None, description="ISO8601 UTC — ostatnie zdarzenie operacyjne w magazynie (heurystyka)"
    )
    operational_health: OperationalHealth = "nominal"


class WmsTenantPanelCountersOut(BaseModel):
    """Tenant-wide ERP top-bar counters (sum across all warehouses)."""

    orders_delayed: int = Field(0, ge=0)
    packing_braki: int = Field(0, ge=0)
