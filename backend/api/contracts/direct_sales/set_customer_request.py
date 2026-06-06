"""POST /direct-sales/session/{id}/set-customer — canonical request body."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SetDirectSalesCustomerRequest(BaseModel):
    """Attach customer by id only — no nested customer objects."""

    customer_id: int = Field(..., ge=1)
