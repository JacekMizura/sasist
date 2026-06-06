"""POST /direct-sales/session/{id}/add-product — canonical request body."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AddDirectSalesProductRequest(BaseModel):
    """Mutation uses product_id only — search/scan resolves catalog identifiers."""

    product_id: int = Field(..., ge=1)
    quantity: int = Field(1, ge=1)
