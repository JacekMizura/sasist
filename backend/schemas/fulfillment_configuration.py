"""P2.5 — tenant fulfillment assignment configuration API schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

DEFAULT_FULFILLMENT_ASSIGNMENT_MODE = "DEFAULT_WAREHOUSE"


class FulfillmentConfigurationRead(BaseModel):
    tenant_id: int
    fulfillment_assignment_mode: str = Field(default=DEFAULT_FULFILLMENT_ASSIGNMENT_MODE)
    consolidation_warehouse_id: int | None = None


class FulfillmentConfigurationUpdate(BaseModel):
    fulfillment_assignment_mode: str | None = None
    consolidation_warehouse_id: int | None = None
